// 交易前检查（真实买入前的 15 项硬性校验），任一失败即放弃并记录原因
import { StateRepo, OrderRepo, PositionRepo, WalletRepo } from "./database.mjs";
import { getTokenInfo, quoteTokenLabel, fromQuote, toQuote } from "./flap-contracts.mjs";
import { TOKEN_STATUS } from "./config.mjs";

const EMERGENCY_KEY = "flap_sniper_emergency_stop";

export function isEmergencyStopped() {
  return StateRepo.get(EMERGENCY_KEY) === "true";
}
export function setEmergencyStop(v) { StateRepo.set(EMERGENCY_KEY, v ? "true" : "false"); }

export async function runPreTradeChecks({ token, tokenLabel, strategy, wallet, buyAmountQuote, slippageBps, quoteLabel }) {
  const results = [];
  const fail = (name, detail) => { results.push({ name, ok: false, detail }); return false; };
  const pass = (name, detail) => { results.push({ name, ok: true, detail }); return true; };

  // 1. 紧急停止（最先检查）
  if (isEmergencyStopped()) return { ok: false, reason: "系统处于紧急停止状态", results };
  // 2. 代币来自 Flap Portal
  const info = await getTokenInfo(token);
  if (!info.exists) return { ok: false, reason: "代币不在 Flap Portal 索引中", results };
  pass("source", "来自 Flap Portal");
  // 3. 交易已开启（内盘 TRADABLE 或 DEX）
  if (info.status !== TOKEN_STATUS.TRADABLE && info.status !== TOKEN_STATUS.DEX)
    return { ok: false, reason: `代币状态 ${info.status} 不可交易`, results };
  pass("status", `可交易(status=${info.status})`);
  // 4. 底池币种匹配
  const label = quoteTokenLabel(info.quoteTokenAddress);
  if (quoteLabel && label !== quoteLabel) return { ok: false, reason: `底池币种 ${label} 与策略不符`, results };
  pass("quote", `底池 ${label}`);
  // 5. 税率
  if (strategy.maxBuyTaxBps != null && info.buyTaxBps > strategy.maxBuyTaxBps)
    return { ok: false, reason: `买入税 ${info.buyTaxBps}bps 超限`, results };
  if (strategy.maxSellTaxBps != null && info.sellTaxBps > strategy.maxSellTaxBps)
    return { ok: false, reason: `卖出税 ${info.sellTaxBps}bps 超限`, results };
  pass("tax", `买税${info.buyTaxBps}bp/卖税${info.sellTaxBps}bp`);
  // 6. 买入金额与上限
  const buyWei = toQuote(buyAmountQuote);
  if (buyWei <= 0n) return { ok: false, reason: "买入金额必须大于 0", results };
  // 7. 是否已买过该代币（防重复）
  const bought = OrderRepo.list(500).some(o => o.token && String(o.token).toLowerCase() === String(token).toLowerCase()
    && o.side === "buy" && ["pending", "confirmed"].includes(o.state));
  if (bought && strategy.allowMultiWallet !== true) return { ok: false, reason: "该代币已下过买入单", results };
  pass("duplicate", "未重复下单");
  // 8. 持仓数量上限
  const open = PositionRepo.openList().length;
  if (strategy.maxPositions && open >= strategy.maxPositions)
    return { ok: false, reason: `已达最大持仓 ${strategy.maxPositions}`, results };
  pass("positions", `当前持仓 ${open}`);
  // 9. 钱包启用与资金上限
  const w = wallet ? WalletRepo.list().find(x => x.address && x.address.toLowerCase() === wallet.toLowerCase()) : null;
  if (wallet && w && !w.enabled) return { ok: false, reason: `执行钱包 ${wallet} 已停用`, results };
  pass("wallet", wallet ? `钱包 ${wallet} 可用` : "未指定钱包");

  return { ok: true, info, buyWei, results };
}
