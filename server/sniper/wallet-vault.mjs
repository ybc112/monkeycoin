// 钱包保险库：模式A（用户钱包签名，后端不接触私钥）优先；模式B（自动执行钱包）默认关闭
// 安全约束：私钥绝不入库/不出 API/不打日志；模式B 私钥 AES-256-GCM 加密，主密钥来自环境变量（与密文分离存储）
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Wallet, getAddress } from "ethers";
import { WALLET_VAULT } from "./config.mjs";
import { WalletRepo, Audit } from "./database.mjs";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const VAULT_FILE = path.resolve(__dirname, "..", "..", "server/sniper/data/encrypted-wallets.json");

export class WalletVault {
  constructor() {
    this.enabled = WALLET_VAULT.ENABLED;
    this.masterKey = this.enabled ? Buffer.from(WALLET_VAULT.MASTER_KEY_HEX || "", "hex") : null;
  }

  // ── 模式 A：组装 unsigned tx 交给前端钱包签名（后端零私钥） ────────────────
  async prepareUserSignature(tx) {
    return { unsignedTx: tx, mode: "user-wallet" };
  }

  // ── 模式 B：加密存储私钥 ──────────────────────────────────────────────────
  isEnabled() { return this.enabled; }
  assertEnabled() {
    if (!this.enabled) throw new Error("自动执行钱包模式未启用（ENABLE_AUTO_WALLETS=true 且需配置主密钥）");
    if (!this.masterKey || this.masterKey.length !== 32) throw new Error("WALLET_VAULT_MASTER_KEY_HEX 必须是 64 位 hex");
  }

  _load() {
    try {
      if (!fs.existsSync(VAULT_FILE)) return [];
      const raw = JSON.parse(fs.readFileSync(VAULT_FILE, "utf8"));
      return Array.isArray(raw.wallets) ? raw.wallets : [];
    } catch { return []; }
  }
  _save(list) {
    fs.mkdirSync(path.dirname(VAULT_FILE), { recursive: true });
    fs.writeFileSync(VAULT_FILE, JSON.stringify({ wallets: list }, null, 2));
    // 密文文件权限收紧（Unix）
    try { fs.chmodSync(VAULT_FILE, 0o600); } catch { /* windows 忽略 */ }
  }

  _encrypt(privKey) {
    this.assertEnabled();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
    const enc = Buffer.concat([cipher.update(privKey, "utf8"), cipher.final()]);
    return { iv: iv.toString("hex"), ct: enc.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
  }
  _decrypt(rec) {
    this.assertEnabled();
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.masterKey, Buffer.from(rec.iv, "hex"));
    decipher.setAuthTag(Buffer.from(rec.tag, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(rec.ct, "hex")), decipher.final()]).toString("utf8");
  }

  // 添加自动执行钱包（仅启用模式B时可用）
  addAutoWallet(privKey, label = "") {
    this.assertEnabled();
    const w = new Wallet(privKey.startsWith("0x") ? privKey : `0x${privKey}`);
    const list = this._load();
    const existing = list.find(x => x.address.toLowerCase() === w.address.toLowerCase());
    if (existing) return { ok: false, error: "钱包已存在" };
    const rec = { address: w.address, label, enabled: true, encrypted: this._encrypt(w.privateKey), createdAt: new Date().toISOString() };
    list.push(rec);
    this._save(list);
    WalletRepo.upsert({ address: w.address, label, enabled: true, maxBalanceQuote: String(WALLET_VAULT.MAX_BALANCE_BNB) });
    Audit.log("vault", `添加自动执行钱包 ${w.address}`);
    return { ok: true, address: w.address };
  }

  list() {
    const list = this._load();
    return list.map(({ encrypted: _e, ...pub }) => pub); // 永不出密文/私钥
  }
  getWallet(address) {
    const rec = this._load().find(x => x.address.toLowerCase() === address.toLowerCase());
    if (!rec || !rec.enabled) return null;
    try { return new Wallet(this._decrypt(rec)); } catch { return null; }
  }
  setEnabled(address, enabled) {
    const list = this._load();
    const rec = list.find(x => x.address.toLowerCase() === address.toLowerCase());
    if (!rec) return { ok: false, error: "钱包不存在" };
    rec.enabled = enabled;
    this._save(list);
    WalletRepo.setEnabled(address, enabled);
    Audit.log("vault", `${enabled ? "启用" : "停用"}执行钱包 ${address}`);
    return { ok: true };
  }
  remove(address) {
    this._save(this._load().filter(x => x.address.toLowerCase() !== address.toLowerCase()));
    WalletRepo.setEnabled(address, false);
    Audit.log("vault", `移除执行钱包 ${address}`);
  }
  rotate(address, newPrivKey) {
    this.assertEnabled();
    const list = this._load();
    const idx = list.findIndex(x => x.address.toLowerCase() === address.toLowerCase());
    if (idx < 0) return { ok: false, error: "钱包不存在" };
    const w = new Wallet(newPrivKey.startsWith("0x") ? newPrivKey : `0x${newPrivKey}`);
    list[idx] = { address: w.address, label: list[idx].label, enabled: list[idx].enabled, encrypted: this._encrypt(w.privateKey), createdAt: new Date().toISOString() };
    this._save(list);
    Audit.log("vault", `轮换执行钱包 ${address} → ${w.address}`);
    return { ok: true, address: w.address };
  }
}
