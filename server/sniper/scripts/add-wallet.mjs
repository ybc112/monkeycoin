// 执行钱包导入 CLI（仅服务器本地运行）
// 用法：cat privkey.txt | node sniper/scripts/add-wallet.mjs 标签
// 私钥从 stdin 读取，绝不写入日志 / 命令行历史 / Git；加密后存入 encrypted-wallets.json（AES-256-GCM）
// 安全：只用独立小额执行钱包，绝不用主钱包；用完即停用/更换
import { createInterface } from "node:readline";
import { WalletVault } from "../wallet-vault.mjs";

const label = process.argv[2] || "执行钱包";
const rl = createInterface({ input: process.stdin });
let privKey = "";
rl.on("line", (l) => { privKey += l.trim(); });
rl.on("close", async () => {
  privKey = privKey.replace(/\s+/g, "").trim();
  if (!privKey) {
    console.error("未读取到私钥。用法：cat privkey.txt | node sniper/scripts/add-wallet.mjs 标签");
    process.exit(1);
  }
  const vault = new WalletVault();
  if (!vault.isEnabled()) {
    console.error("模式B 未启用：请在 .env 设置 ENABLE_AUTO_WALLETS=true 且配置 WALLET_VAULT_MASTER_KEY_HEX");
    process.exit(1);
  }
  try {
    const r = vault.addAutoWallet(privKey, label);
    privKey = ""; // 立即清空内存中的私钥
    if (r.ok) {
      console.log(`✅ 已加密导入执行钱包：${r.address}`);
      console.log("安全提醒：请只向该钱包转入少量、可承受全部损失的 BNB；使用完毕后用 stop-wallet 停用或 rotate 轮换。");
    } else {
      console.error(`❌ ${r.error}`);
      process.exit(1);
    }
  } catch (e) {
    privKey = "";
    console.error("导入失败:", e.message);
    process.exit(1);
  }
});
