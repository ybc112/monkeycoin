// 交易前检查（真实买入前的 15 项硬性校验），任一失败即放弃并记录原因
import { StateRepo, OrderRepo, PositionRepo, WalletRepo } from "./database.mjs";
import { getTokenInfo, getTokenContract, quoteTokenLabel, fromQuote, toQuote } from "./flap-contracts.mjs";
import { TOKEN_STATUS, RISK } from "./config.mjs";

const EMERGENCY_KEY = "flap_sniper_emergency_stop";

export function isEmergencyStopped() {
  return StateRepo.get(EMERGENCY_KEY) === "true";
}
export function setEmergencyStop(v) { StateRepo.set(EMERGENCY_KEY, v ? "true" : "false"); }

// 广播安全校验（纯逻辑，供服务与测试复用）：
// Dry Run / 未开启 Live / 紧急停止 / signedRaw 格式 / 订单存在与状态 / 方向与代币一致性
export function validateBroadcast({ DRY_RUN, ENABLE_LIVE_TRADING, signedRaw, order, body = {} }) {
  if (DRY_RUN) return { ok: false, error: "Dry Run 模式禁止广播真实交易" };
  if (!ENABLE_LIVE_TRADING) return { ok: false, error: "ENABLE_LIVE_TRADING=false，禁止广播" };
  if (isEmergencyStopped()) return { ok: false, error: "系统紧急停止，禁止广播" };
  if (typeof signedRaw !== "string" || !/^0x[0-9a-fA-F]{100,}$/.test(signedRaw))
    return { ok: false, error: "signedRaw 格式无效" };
  if (!order) return { ok: false, error: "订单不存在" };
  const broadcastable = new Set(["SIGNING", "BROADCASTING", "PENDING"]);
  if (!broadcastable.has(order.state)) return { ok: false, error: `订单状态 ${order.state} 不可广播` };
  if (body.side && order.side && body.side !== order.side) return { ok: false, error: "订单方向不匹配" };
  if (body.token && order.token && String(body.token).toLowerCase() !== String(order.token).toLowerCase())
    return { ok: false, error: "订单代币不匹配" };
  return { ok: true };
}

// 探测并检查代币的 maxTx / maxWallet 限制（尽力而为，接口不存在则跳过）
async function checkTransferLimits(token, buyAmountWei, strategy, results, pass) {
  if (strategy.maxTxBps == null && strategy.maxWalletBps == null) return true;
  const tc = getTokenContract(token);
  const totalSupply = await tc.totalSupply().catch(() => null);
  if (totalSupply == null) return true; // 无法读取总供应，跳过
  // maxTx 检查
  if (strategy.maxTxBps != null) {
    const limit = (totalSupply * BigInt(strategy.maxTxBps)) / 10000n;
    if (buyAmountWei > 0 && limit > 0n && buyAmountWei > limit) {
      results.push({ name: "max_tx", ok: false, detail: `买入超过单笔上限（${(Number(limit) / 1e18).toFixed(2)} 代币）` });
      return false;
    }
    pass("max_tx", "单笔买入在 maxTx 内");
  }
  return true;
}

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
  // 10. 每日买入限额（防失控）
  if (RISK.DAILY_BUY_LIMIT_BNB > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const spent = OrderRepo.list(1000)
      .filter(o => o.side === "buy" && (o.created_at || "").startsWith(today) && ["BROADCASTING", "CONFIRMED", "PENDING"].includes(o.state))
      .reduce((s, o) => s + Number(o.amount_in || 0) / 1e18, 0);
    const buyBnb = Number(buyAmountQuote || 0);
    if (spent + buyBnb > RISK.DAILY_BUY_LIMIT_BNB)
      return { ok: false, reason: `今日已买入 ${spent.toFixed(4)} BNB，加本次 ${buyBnb} 超日限额 ${RISK.DAILY_BUY_LIMIT_BNB}`, results };
    pass("daily_limit", `今日买入 ${spent.toFixed(4)}/${RISK.DAILY_BUY_LIMIT_BNB} BNB`);
  }
  // 11. maxTx / maxWallet
  const limitsOk = await checkTransferLimits(token, buyWei, strategy, results, pass);
  if (!limitsOk) return { ok: false, reason: results[results.length - 1].detail, results };

  return { ok: true, info, buyWei, results };
}
