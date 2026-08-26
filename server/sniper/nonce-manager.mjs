// 本地 nonce 管理：防止 nonce 重复/间隙/underpriced/pending 阻塞/重复广播
// 每个 from 地址独立跟踪；模式A（前端签名）由前端钱包管理 nonce，此处仅记录
import { getProvider } from "./flap-contracts.mjs";

export class NonceManager {
  constructor() {
    this.nonces = new Map(); // addr -> next nonce
    this.inflight = new Map(); // addr -> Set<nonce>
    this.broadcast = new Set(); // 已广播的 orderId/txHash 去重
  }

  async nextNonce(addr) {
    const key = addr.toLowerCase();
    let next = this.nonces.get(key);
    if (next == null) {
      const p = getProvider();
      next = await p.getTransactionCount(addr, "pending");
      this.nonces.set(key, next);
    }
    return next;
  }

  reserve(addr) {
    const key = addr.toLowerCase();
    const nonce = this.nonces.get(key) ?? 0;
    this.nonces.set(key, nonce + 1);
    if (!this.inflight.has(key)) this.inflight.set(key, new Set());
    this.inflight.get(key).add(nonce);
    return nonce;
  }

  release(addr, nonce) {
    const key = addr.toLowerCase();
    this.inflight.get(key)?.delete(nonce);
  }

  // 广播去重：同 orderId 只允许一次
  canBroadcast(orderId) {
    const k = `order:${orderId}`;
    if (this.broadcast.has(k)) return false;
    this.broadcast.add(k);
    return true;
  }
  markBroadcast(orderId) { this.broadcast.add(`order:${orderId}`); }

  // 链上同步（发现漂移时重置）
  async sync(addr) {
    const p = getProvider();
    const onchain = await p.getTransactionCount(addr, "pending");
    this.nonces.set(addr.toLowerCase(), onchain);
    return onchain;
  }
}
