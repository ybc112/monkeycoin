// 持仓管理：开仓/平仓/盈亏 + 止盈/止损/分批卖出 + 日亏损熔断
import { PositionRepo, Audit } from "./database.mjs";
import { RISK } from "./config.mjs";

export class PositionManager {
  constructor({ onTriggerSell } = {}) {
    this.onTriggerSell = onTriggerSell || (() => {}); // (position, fraction, reason) => void
    this.timer = null;
    this.getPrice = null; // async (token) => priceWei | null
  }

  // 买入确认后开仓
  open({ token, tokenSymbol, wallet, orderId, amountTokens, entryPrice, entryQuote, takeProfitBps, stopLossBps, batchTotal }) {
    PositionRepo.open({ token, wallet, orderId, amountTokens, entryPrice, entryQuote, takeProfitBps, stopLossBps, batchTotal: batchTotal || 1, batchSold: 0 });
    Audit.log("position", `开仓 ${tokenSymbol || token} 钱包=${wallet || "-"} 数量=${amountTokens} 单价=${entryPrice}`);
  }

  close({ positionId, realizedPnl, realizedPnlQuote }) {
    PositionRepo.close(positionId, String(realizedPnl), String(realizedPnlQuote));
    Audit.log("position", `平仓 #${positionId} 盈亏 ${realizedPnlQuote}`);
  }

  openList() { return PositionRepo.openList(); }
  all(limit) { return PositionRepo.all(limit); }

  // ── 止盈/止损/分批监控 ────────────────────────────────────────────────────
  startMonitor({ getPrice, pollMs = RISK.PRICE_POLL_MS }) {
    this.getPrice = getPrice;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.checkTriggers().catch((e) => {
      Audit.log("position", `监控检查异常: ${String(e?.message || e)}`, "warn");
    }), pollMs);
    Audit.log("position", "止盈/止损/分批监控已启动");
  }
  stopMonitor() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  async checkTriggers() {
    const open = PositionRepo.openList();
    if (!open.length) return;
    for (const p of open) {
      // 自动卖出开关关闭的持仓不参与止盈/止损监控
      if (Number(p.auto_sell ?? 1) === 0) continue;
      const price = this.getPrice ? await this.getPrice(p.token) : null;
      if (price == null || Number(price) <= 0) continue;
      await this.checkTriggerForPosition(p, price);
    }
  }

  // 单仓位 TP/SL 判定（供监控与测试复用）
  async checkTriggerForPosition(p, price) {
    PositionRepo.updatePrice(p.id, String(price));
    const entry = Number(p.entry_price || 0);
    if (entry <= 0) return;
    const pnlBps = Math.round((Number(price) - entry) / entry * 10000);
    const tp = Number(p.take_profit_bps || RISK.TAKE_PROFIT_BPS);
    const sl = Number(p.stop_loss_bps || RISK.STOP_LOSS_BPS);
    const batches = Number(p.batch_total || 1);
    const sold = Number(p.batch_sold || 0);
    const remaining = batches - sold;
    if (remaining <= 0) return;

    if (tp && pnlBps >= tp) {
      await this._triggerSell(p, remaining, `止盈 ${(pnlBps / 100).toFixed(1)}%`);
    } else if (sl && pnlBps <= -sl) {
      await this._triggerSell(p, remaining, `止损 ${(pnlBps / 100).toFixed(1)}%`);
    }
  }

  async _triggerSell(p, remainingBatches, reason) {
    const fraction = 1 / (Number(p.batch_total || 1)); // 每批卖出比例（最后一并全卖）
    Audit.log("position", `#${p.id} ${reason}，触发卖出 ${fraction * 100}%`);
    try { await this.onTriggerSell(p, fraction, reason); } catch (e) {
      Audit.log("position", `#${p.id} 触发卖出失败: ${String(e?.message || e)}`, "error");
    }
  }

  // 卖出完成后由调用方标记批次（成功卖出后才递增）
  markBatchSold(positionId, quotePnl = 0) {
    PositionRepo.markBatchSold(positionId, 1, quotePnl);
  }

  // ── 日亏损熔断 ────────────────────────────────────────────────────────────
  dailyRealizedPnl() {
    const today = new Date().toISOString().slice(0, 10);
    const all = PositionRepo.all(1000).filter(p => p.state === "closed" && (p.closed_at || "").startsWith(today));
    return all.reduce((sum, p) => sum + Number(p.realized_pnl_quote || 0), 0);
  }

  // 返回 true 表示已触发日亏损熔断（需紧急停止）
  checkDailyLossLimit(limitBnb = RISK.DAILY_LOSS_LIMIT_BNB) {
    const todayPnl = this.dailyRealizedPnl();
    if (limitBnb > 0 && todayPnl <= -limitBnb) {
      Audit.log("risk", `日亏损熔断触发：今日已实现盈亏 ${todayPnl.toFixed(4)} BNB ≤ ${-limitBnb}`, "warn");
      return true;
    }
    return false;
  }
}
