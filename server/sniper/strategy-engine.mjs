// 策略匹配引擎：所有启用的条件全部满足才触发买入
import { StrategyRepo, TokenRepo, PositionRepo } from "./database.mjs";
import { getTokenInfo, quoteTokenLabel, fromQuote, toQuote } from "./flap-contracts.mjs";

// 多钱包下单分配：优先选择持仓数量最少的启用钱包（负载均衡）
export function pickBuyWallet({ strategy, enabledWallets = [] }) {
  if (!enabledWallets.length) return null;
  if (strategy.allowMultiWallet === false) return enabledWallets[0];
  const open = PositionRepo.openList();
  const counts = new Map();
  for (const p of open) {
    const key = String(p.wallet || "").toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = [...enabledWallets].sort((a, b) => (counts.get(a.toLowerCase()) || 0) - (counts.get(b.toLowerCase()) || 0));
  return sorted[0];
}

// 判断底池币种是否匹配策略（BNB 特判：零地址或 WBNB）
function matchQuote(strategy, label, addr) {
  const want = strategy.quoteTokens || ["BNB"];
  const a = String(addr || "").toLowerCase();
  const isBnb = label === "BNB" || a === "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
  return want.some(w => {
    const wl = String(w).toLowerCase();
    return (wl === "bnb" && isBnb) || (wl === "usdt" && label === "USDT") || (a === wl.toLowerCase());
  });
}

// 数值比较
function cmp(actual, op, expected) {
  const av = Number(actual), ev = Number(expected);
  switch (op) {
    case "gte": return av >= ev;
    case "lte": return av <= ev;
    case "gt": return av > ev;
    case "lt": return av < ev;
    case "eq": return av === ev;
    case "range": return av >= ev && av <= Number(arguments[3]);
    default: return true;
  }
}

export class StrategyEngine {
  constructor({ onMatched, onRejected }) {
    this.onMatched = onMatched || (() => {});
    this.onRejected = onRejected || (() => {});
    this.pending = new Map(); // token -> {state, devBuyQuote}
  }

  // TokenCreated 后：读取状态、存储初始底池
  async onCreated(ev) {
    const info = await getTokenInfo(ev.token);
    if (!info.exists || info.status !== 1) {
      // 非内盘状态记录失败
      TokenRepo.upsert({ address: ev.token, name: ev.name, symbol: ev.symbol, meta: ev.meta, creator: ev.creator,
        status: info.status, statusName: info.exists ? "" : "无效", createdBlock: ev.blockNumber });
      return null;
    }
    const label = quoteTokenLabel(info.quoteTokenAddress);
    const rec = {
      token: ev.token,
      name: ev.name, symbol: ev.symbol, meta: ev.meta, creator: ev.creator,
      blockNumber: ev.blockNumber,
      state: info,
      quoteLabel: label,
      initialReserveQuote: fromQuote(info.reserve),
      devBuyQuote: 0,
    };
    this.pending.set(ev.token.toLowerCase(), rec);
    TokenRepo.upsert({ address: ev.token, name: ev.name, symbol: ev.symbol, meta: ev.meta, creator: ev.creator,
      quoteTokenAddress: info.quoteTokenAddress, quoteTokenLabel: label, reserveQuote: info.reserve.toString(),
      circulatingSupply: info.circulatingSupply.toString(), price: info.price.toString(), status: info.status,
      statusName: label, buyTaxBps: info.buyTaxBps, sellTaxBps: info.sellTaxBps, pool: info.pool,
      progress: info.progress.toString(), devBuyQuote: 0, createdBlock: ev.blockNumber });
    return rec;
  }

  // Dev 首买 / 任何买入：累计 dev 首买金额并评估
  async onBought(ev) {
    const rec = this.pending.get(ev.token.toLowerCase());
    if (!rec) return null;
    if (String(ev.buyer).toLowerCase() === String(rec.creator).toLowerCase()) {
      rec.devBuyQuote = Number(rec.devBuyQuote) + Number(ev.quoteSpentLabel || 0);
      // 更新代币底池
      const info = await getTokenInfo(ev.token);
      if (info.exists) {
        rec.state = info;
        rec.initialReserveQuote = fromQuote(info.reserve);
        TokenRepo.upsert({ address: ev.token, reserveQuote: info.reserve.toString(), price: info.price.toString(),
          buyTaxBps: info.buyTaxBps, sellTaxBps: info.sellTaxBps, progress: info.progress.toString(),
          devBuyQuote: rec.devBuyQuote });
      }
    }
    await this.evaluate(rec);
    return rec;
  }

  // 评估一个代币对全部启用策略
  async evaluate(rec) {
    const strategies = StrategyRepo.enabled().filter(s => s.platform === "flap" || !s.platform);
    if (!strategies.length) return;
    for (const strategy of strategies) {
      const r = this.matchOne(strategy, rec);
      if (r.matched) this.onMatched({ strategy, token: rec, result: r });
      else this.onRejected({ strategy, token: rec, result: r });
    }
  }

  matchOne(strategy, rec) {
    const fails = [];
    const ok = (cond, detail = "") => null;
    const fail = (cond, detail) => fails.push({ cond, detail });
    const symbol = String(rec.symbol || "").toLowerCase();
    const name = String(rec.name || "").toLowerCase();
    const dev = String(rec.creator || "").toLowerCase();

    // 1. Symbol 条件
    const incl = (strategy.conditions || []).filter(c => c.type === "include_symbol");
    if (incl.length && !incl.some(c => symbol.includes(String(c.value).toLowerCase()) || name.includes(String(c.value).toLowerCase())))
      fail("include_symbol", `指定 Symbol 未命中`);
    for (const c of (strategy.conditions || []).filter(c => c.type === "exclude_symbol"))
      if (symbol.includes(String(c.value).toLowerCase()) || name.includes(String(c.value).toLowerCase()))
        fail("exclude_symbol", `命中排除 Symbol「${c.value}」`);

    // 2. 底池币种
    if (!matchQuote(strategy, rec.quoteLabel, rec.state.quoteTokenAddress))
      fail("quote_token", `底池币种 ${rec.quoteLabel} 不匹配`);

    // 3. 初始底池金额
    if (strategy.poolMinQuote != null && Number(rec.initialReserveQuote) < Number(strategy.poolMinQuote))
      fail("pool_min", `初始底池 ${rec.initialReserveQuote} < ${strategy.poolMinQuote}`);
    if (strategy.poolMaxQuote != null && Number(rec.initialReserveQuote) > Number(strategy.poolMaxQuote))
      fail("pool_max", `初始底池 ${rec.initialReserveQuote} > ${strategy.poolMaxQuote}`);

    // 4. Dev 首买金额（策略字段 min/max 区间）
    if (strategy.devBuyMin != null && Number(rec.devBuyQuote) < Number(strategy.devBuyMin))
      fail("dev_buy_min", `Dev 首买 ${rec.devBuyQuote} < ${strategy.devBuyMin}（当前尚无足够 Dev 首买）`);
    if (strategy.devBuyMax != null && Number(rec.devBuyQuote) > Number(strategy.devBuyMax))
      fail("dev_buy_max", `Dev 首买 ${rec.devBuyQuote} > ${strategy.devBuyMax}`);
    // 4b. 条件式 Dev 首买区间（type=dev_buy, operator=range, value=min, value2=max）
    for (const c of (strategy.conditions || []).filter(c => c.type === "dev_buy")) {
      if (c.operator === "range") {
        if (Number(rec.devBuyQuote) < Number(c.value) || Number(rec.devBuyQuote) > Number(c.value2))
          fail("dev_buy_range", `Dev 首买 ${rec.devBuyQuote} 不在区间 [${c.value}, ${c.value2}]`);
      } else if (c.operator === "gte" && Number(rec.devBuyQuote) < Number(c.value)) {
        fail("dev_buy_gte", `Dev 首买 ${rec.devBuyQuote} < ${c.value}`);
      } else if (c.operator === "lte" && Number(rec.devBuyQuote) > Number(c.value)) {
        fail("dev_buy_lte", `Dev 首买 ${rec.devBuyQuote} > ${c.value}`);
      }
    }

    // 5. 税率
    if (strategy.maxBuyTaxBps != null && rec.state.buyTaxBps > strategy.maxBuyTaxBps)
      fail("buy_tax", `买入税 ${(rec.state.buyTaxBps / 100).toFixed(1)}% > ${(strategy.maxBuyTaxBps / 100).toFixed(1)}%`);
    if (strategy.maxSellTaxBps != null && rec.state.sellTaxBps > strategy.maxSellTaxBps)
      fail("sell_tax", `卖出税 ${(rec.state.sellTaxBps / 100).toFixed(1)}% > ${(strategy.maxSellTaxBps / 100).toFixed(1)}%`);

    // 6. Dev 地址
    for (const c of (strategy.conditions || []).filter(c => c.type === "dev_address"))
      if (String(c.value).toLowerCase() !== dev) fail("dev_address", `Dev ${rec.creator} 不匹配`);
    for (const c of (strategy.conditions || []).filter(c => c.type === "exclude_dev"))
      if (String(c.value).toLowerCase() === dev) fail("exclude_dev", `Dev ${rec.creator} 在排除列表`);

    // 7. 指定工厂/金库（本系统只从 Flap Portal 发现，天然满足；这里校验传入地址）
    for (const c of (strategy.conditions || []).filter(c => c.type === "factory_vault"))
      if (!String(c.value).toLowerCase().includes("flap")) fail("factory_vault", `工厂不在 Flap 白名单`);

    // 8. 持仓上限
    const openPositions = PositionRepo.openList().length;
    if (strategy.maxPositions && openPositions >= strategy.maxPositions)
      fail("max_positions", `已达最大持仓 ${strategy.maxPositions}`);

    if (fails.length) return { matched: false, rejectReason: fails[0].detail, fails };
    return { matched: true, fails: [] };
  }
}
