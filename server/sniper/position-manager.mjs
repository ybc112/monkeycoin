// 持仓管理：开仓/平仓/盈亏/持仓上限（与数据库 position 表对接）
import { PositionRepo, OrderRepo, Audit } from "./database.mjs";

export class PositionManager {
  // 买入确认后开仓
  async open({ token, tokenSymbol, wallet, orderId, amountTokens, entryPrice, entryQuote }) {
    PositionRepo.open({ token, wallet, orderId, amountTokens, entryPrice, entryQuote });
    Audit.log("position", `开仓 ${tokenSymbol || token} ${wallet || ""} 数量 ${amountTokens}`);
  }

  // 卖出后平仓，计算已实现盈亏
  close({ positionId, realizedPnl, realizedPnlQuote }) {
    PositionRepo.close(positionId, String(realizedPnl), String(realizedPnlQuote));
    Audit.log("position", `平仓 #${positionId} 盈亏 ${realizedPnlQuote}`);
  }

  openList() { return PositionRepo.openList(); }
  all(limit) { return PositionRepo.all(limit); }

  // 更新当前价（轮询刷新）
  updatePrice(positionId, price) { PositionRepo.updatePrice(positionId, String(price)); }
}
