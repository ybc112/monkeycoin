// Flap 内盘狙击核心逻辑单元测试（node:test）
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import { Interface } from "ethers";

// 先指定临时数据库再加载模块
const tmpDb = path.join(os.tmpdir(), `flap-sniper-test-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${tmpDb}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(__dirname, "..", rel)).href);
const { parseLog } = await load("event-parser.mjs");
const { StrategyEngine } = await load("strategy-engine.mjs");
const { computeGasPrice, applySlippage, calcFee, buildFeeTransferTx, feeBreakdown } = await load("transaction-builder.mjs");
const { setEmergencyStop, isEmergencyStopped, runPreTradeChecks } = await load("risk-checker.mjs");
const { NonceManager } = await load("nonce-manager.mjs");
const { EventRepo, StrategyRepo, StateRepo, PositionRepo, OrderRepo } = await load("database.mjs");
const { pickBuyWallet } = await load("strategy-engine.mjs");
const { PositionManager } = await load("position-manager.mjs");
const cfg = await load("config.mjs");
const { FEES, DRY_RUN } = cfg;
const FIXED_FEE_RECIPIENT = "0x39bB78BAdEC9d906CA77aF6b0882D0114263544F";

test("事件解析：5 类事件 topic hash 存在", () => {
  const iface = new Interface([
    "event TokenCreated(uint256,address,uint256,address,string,string,string)",
    "event TokenBought(uint256,address,address,uint256,uint256,uint256,uint256)",
    "event TokenSold(uint256,address,address,uint256,uint256,uint256,uint256)",
    "event LaunchedToDEX(address,address,uint256,uint256)",
  ]);
  assert.equal(iface.getEvent("TokenCreated").topicHash.length, 66);
  assert.equal(iface.getEvent("TokenBought").topicHash.length, 66);
  assert.equal(iface.getEvent("TokenSold").topicHash.length, 66);
  assert.equal(iface.getEvent("LaunchedToDEX").topicHash.length, 66);
});

test("事件去重：同一日志只插入一次", () => {
  const ev = { token: "0x" + "11".repeat(20), kind: "created", blockNumber: 1, txHash: "0x" + "22".repeat(32), logIndex: 0, data: {} };
  assert.equal(EventRepo.insert(ev), true);
  assert.equal(EventRepo.insert(ev), false);
});

test("策略匹配：全部条件命中", () => {
  const engine = new StrategyEngine({});
  const strategy = {
    id: 1, platform: "flap", quoteTokens: ["BNB"], poolMinQuote: "5", poolMaxQuote: null,
    devBuyMin: "2", devBuyMax: null, maxBuyTaxBps: 1000, maxSellTaxBps: 1000,
    conditions: [{ type: "include_symbol", value: "$MK" }], maxPositions: null,
  };
  const rec = {
    symbol: "$MK", name: "Monkey King", creator: "0x" + "33".repeat(20), quoteLabel: "BNB",
    initialReserveQuote: "6", devBuyQuote: 3,
    state: { quoteTokenAddress: "0x0000000000000000000000000000000000000000", buyTaxBps: 500, sellTaxBps: 500 },
  };
  const r = engine.matchOne(strategy, rec);
  assert.equal(r.matched, true, JSON.stringify(r));
});

test("策略拒绝：底池不足/税率超限/Symbol 排除", () => {
  const engine = new StrategyEngine({});
  const strategy = {
    id: 2, platform: "flap", quoteTokens: ["BNB"], poolMinQuote: "5", maxBuyTaxBps: 1000, maxSellTaxBps: 1000,
    conditions: [{ type: "exclude_symbol", value: "scam" }], maxPositions: null,
  };
  const rec = {
    symbol: "$SCAM", name: "Scam Coin", creator: "0x" + "44".repeat(20), quoteLabel: "BNB",
    initialReserveQuote: "1", devBuyQuote: 0,
    state: { quoteTokenAddress: "0x0000000000000000000000000000000000000000", buyTaxBps: 500, sellTaxBps: 500 },
  };
  const r = engine.matchOne(strategy, rec);
  assert.equal(r.matched, false);
  assert.ok(r.fails.length >= 1);
});

test("过滤单税(无机制)币：买/卖税为0且无任何机制 → 拒绝；有税或有营销机制 → 通过", () => {
  const engine = new StrategyEngine({});
  const strategy = {
    id: 9, platform: "flap", quoteTokens: ["BNB"], maxBuyTaxBps: 1000, maxSellTaxBps: 1000,
    conditions: [{ type: "single_tax_only", operator: "eq", value: "true" }], maxPositions: null,
  };
  const ZER = "0x0000000000000000000000000000000000000000";
  const base = { symbol: "T", name: "T Coin", creator: "0x" + "66".repeat(20), quoteLabel: "BNB",
    initialReserveQuote: "6", devBuyQuote: 1 };
  // 无机制裸币：买卖税 0，且 mkt/dividend/deflation/lp 全 0 → 拒绝
  const bare = { ...base, state: { quoteTokenAddress: ZER, buyTaxBps: 0, sellTaxBps: 0 }, mktBps: 0, dividendBps: 0, deflationBps: 0, lpBps: 0 };
  assert.equal(engine.matchOne(strategy, bare).matched, false, JSON.stringify(engine.matchOne(strategy, bare)));
  // 有税收机制：买卖税>0 → 通过
  const taxy = { ...base, state: { quoteTokenAddress: ZER, buyTaxBps: 400, sellTaxBps: 400 }, mktBps: 300, dividendBps: 100, deflationBps: 0, lpBps: 0 };
  assert.equal(engine.matchOne(strategy, taxy).matched, true);
  // 买卖税 0，但有营销/分红机制 → 通过
  const mktOnly = { ...base, state: { quoteTokenAddress: ZER, buyTaxBps: 0, sellTaxBps: 0 }, mktBps: 500, dividendBps: 0, deflationBps: 0, lpBps: 0 };
  assert.equal(engine.matchOne(strategy, mktOnly).matched, true);
});

test("滑点计算：minOut = amount * (1 - slippage)", () => {
  assert.equal(applySlippage(1000n, 500), 950n); // 5%
  assert.equal(applySlippage(10000n, 100), 9900n); // 1%
});

test("Gas 上限：recommended = 网络 × multiplier，最终不超 MAX", async () => {
  const { parseUnits } = await import("ethers");
  // 模拟：手动 gas 超上限被 cap
  const gas = await computeGasPrice({ manualGwei: 50 });
  assert.equal(gas.capped, true);
  assert.equal(gas.cap, 8);
  // 手动 gas 在上限内不被 cap
  const gas2 = await computeGasPrice({ manualGwei: 3 });
  assert.equal(gas2.capped, false);
});

test("nonce 管理：连续分配且可释放", async () => {
  const nm = new NonceManager();
  nm.nonces.set("0xa1", 10);
  const n1 = nm.reserve("0xa1");
  const n2 = nm.reserve("0xa1");
  assert.equal(n1, 10);
  assert.equal(n2, 11);
  nm.release("0xa1", 10);
  assert.equal(nm.inflight.get("0xa1").has(10), false);
});

test("广播去重：同一订单只广播一次", () => {
  const nm = new NonceManager();
  assert.equal(nm.canBroadcast(1), true);
  assert.equal(nm.canBroadcast(1), false);
});

test("紧急停止状态", () => {
  setEmergencyStop(true);
  assert.equal(isEmergencyStopped(), true);
  setEmergencyStop(false);
  assert.equal(isEmergencyStopped(), false);
});

test("策略 CRUD 持久化", () => {
  const id = StrategyRepo.create({
    name: "测试策略", enabled: true, mode: "dry_run", platform: "flap", quoteTokens: ["BNB"],
    poolMinQuote: "5", buyAmountQuote: "0.05", slippageBps: 500,
    conditions: [{ type: "include_symbol", value: "$MK" }],
  });
  const list = StrategyRepo.list();
  assert.ok(list.some(s => s.id === id));
  const saved = StrategyRepo.get(id);
  assert.equal(saved.name, "测试策略");
  assert.equal(saved.enabled, true);
  assert.equal(saved.conditions.length, 1);
  StrategyRepo.delete(id);
  assert.equal(StrategyRepo.get(id), undefined);
});

// 清理
process.on("exit", () => {
  try { fs.rmSync(tmpDb, { force: true }); } catch { /* ignore */ }
});

// ── 补充测试：多钱包分配 / 止盈止损 / 日亏损 ────────────────────────────────
test("多钱包分配：优先持仓最少的钱包", () => {
  const strategy = { allowMultiWallet: true };
  const wallets = ["0xA1", "0xB2", "0xC3"];
  // 无持仓：取第一个
  assert.equal(pickBuyWallet({ strategy, enabledWallets: wallets }), "0xA1");
  // 模拟 A1 已有 1 个持仓
  PositionRepo.open({ token: "0x" + "AA".repeat(20), wallet: "0xA1", amountTokens: "1", entryPrice: "1", entryQuote: "1" });
  assert.equal(pickBuyWallet({ strategy, enabledWallets: wallets }), "0xB2");
});

test("止盈/止损：价格达标触发卖出回调", async () => {
  let triggered = null;
  const pm = new PositionManager({ onTriggerSell: async (p, fraction, reason) => { triggered = { p, fraction, reason }; } });
  PositionRepo.open({
    token: "0x" + "BB".repeat(20), wallet: "0xA1", orderId: 1,
    amountTokens: "1000000", entryPrice: "0.00001", entryQuote: "10",
    takeProfitBps: 2000, stopLossBps: 1500, batchTotal: 2,
  });
  const open = PositionRepo.openList().find(x => x.token.startsWith("0x" + "BB"));
  // 止盈：价格 +50% → 触发
  await pm.checkTriggerForPosition(open, "0.000015");
  assert.ok(triggered, "应触发卖出");
  assert.ok(triggered.reason.includes("止盈"));
  triggered = null;
  // 止损：价格 -20% → 触发
  const open2 = PositionRepo.openList().find(x => x.token.startsWith("0x" + "BB"));
  await pm.checkTriggerForPosition(open2, "0.000008");
  assert.ok(triggered, "应触发止损");
  assert.ok(triggered.reason.includes("止损"));
  pm.stopMonitor();
});

test("日亏损熔断统计", () => {
  const pm = new PositionManager({});
  PositionRepo.close(1, "1", "-0.3"); // 今日已实现 -0.3 BNB
  const todayPnl = pm.dailyRealizedPnl();
  assert.ok(todayPnl <= -0.3);
  assert.equal(pm.checkDailyLossLimit(0.2), true); // 超 -0.2 熔断
});

// ── 平台手续费（0.5% / 固定地址 / BigInt / 幂等防重复 / DryRun） ────────────
test("手续费计算：买入 0.05 BNB 收取 0.5%（BigInt）", () => {
  const amt = 50_000n * 10n ** 12n; // 0.05 BNB = 5e16 wei
  const { fee, trade } = calcFee(amt);
  assert.equal(fee, amt * 50n / 10000n); // 0.00025 BNB
  assert.equal(trade + fee, amt);        // 总额守恒
  assert.equal(fee, 250_000_000_000_000n); // 0.00025 BNB
  assert.equal(trade, 49_750_000_000_000_000n); // 0.04975 BNB
});

test("手续费精度：BigInt 整除截断，无浮点误差", () => {
  const odd = 999_999n * 10n ** 12n; // 任意非整数值
  const { fee, trade } = calcFee(odd);
  assert.equal(typeof fee, "bigint");
  assert.equal(trade + fee, odd);
  assert.ok(fee <= odd * 50n / 10000n); // 向下取整
});

test("手续费地址固定：默认 EOA 0x39bB…444F，不受前端影响", () => {
  assert.equal(FEES.RECIPIENT.toLowerCase(), FIXED_FEE_RECIPIENT.toLowerCase());
  // 前端即使传其它地址也被忽略（后端只用 FEES.RECIPIENT 构建转账）
  const tx = buildFeeTransferTx({ feeWei: 1000n, gasPrice: 1n });
  assert.equal(tx.to.toLowerCase(), FIXED_FEE_RECIPIENT.toLowerCase());
  assert.equal(tx.data, "0x");
  assert.equal(tx.value, 1000n);
});

test("手续费比例：默认 50 bps（0.5%），feeBreakdown 明细正确", () => {
  assert.equal(FEES.BPS, 50);
  const bd = feeBreakdown(50_000n * 10n ** 12n); // 0.05 BNB
  assert.equal(bd.percent, "0.5%");
  assert.equal(bd.feeBnb, "0.000250");
  assert.equal(bd.netBnb, "0.049750");
  assert.equal(bd.recipient.toLowerCase(), FIXED_FEE_RECIPIENT.toLowerCase());
});

test("手续费重复扣除保护：已 CONFIRMED 后拒绝覆盖 fee_tx_hash", () => {
  const id = OrderRepo.create({
    token: "0x" + "DD".repeat(20), side: "buy", state: "SIGNING",
    feeBps: 50, feeAmount: "250000000000000", feeRecipient: FIXED_FEE_RECIPIENT, feeState: "PENDING",
  });
  // 第一次设置允许
  assert.equal(OrderRepo.setFeeTxHash(id, "0x" + "E1".repeat(32)), true);
  assert.equal(OrderRepo.get(id).fee_state, "SENT");
  // 标记确认
  OrderRepo.setFeeState(id, "CONFIRMED");
  // 已确认 → 拒绝再次扣费（幂等）
  assert.equal(OrderRepo.setFeeTxHash(id, "0x" + "E2".repeat(32)), false);
  const row = OrderRepo.get(id);
  assert.equal(row.fee_tx_hash, "0x" + "E1".repeat(32)); // 哈希未被覆盖
  assert.equal(row.fee_state, "CONFIRMED");
  // 待补队列不含已确认订单
  assert.ok(!OrderRepo.listPendingFee(20).some(o => o.id === id));
});

test("Dry Run：默认开启且不广播真实交易", () => {
  assert.equal(DRY_RUN, true);
});

// ── 补充：approve / 广播校验 / 通知 / 手续费台账 / 持仓盈亏 / 状态机 ──────────
test("approve：Portal 授权 calldata 正确（ERC-20 approve 签名）", async () => {
  const { MaxUint256 } = await import("ethers");
  const { getTokenContract } = await load("flap-contracts.mjs");
  const { FLAP } = cfg;
  const token = "0x" + "AB".repeat(20);
  const tc = getTokenContract(token);
  const data = tc.interface.encodeFunctionData("approve", [FLAP.PORTAL, MaxUint256]);
  // approve 函数选择器 0x095ea7b3，参数为 (spender, amount)
  assert.ok(data.startsWith("0x095ea7b3"), data);
  const decoded = tc.interface.decodeFunctionData("approve", data);
  assert.equal(decoded[0].toLowerCase(), FLAP.PORTAL.toLowerCase());
  assert.equal(decoded[1], MaxUint256);
});

test("广播校验：Dry Run / 未开启 Live / 订单状态 / 方向 / 代币全部拦截", async () => {
  const { validateBroadcast } = await load("risk-checker.mjs");
  const order = { id: 1, side: "buy", token: "0x" + "AB".repeat(20), state: "SIGNING" };
  const signedRaw = "0x" + "f0".repeat(150);
  // Dry Run 无条件禁止
  assert.equal(validateBroadcast({ DRY_RUN: true, ENABLE_LIVE_TRADING: true, signedRaw, order, body: {} }).ok, false);
  // 未开启 Live 禁止
  assert.equal(validateBroadcast({ DRY_RUN: false, ENABLE_LIVE_TRADING: false, signedRaw, order, body: {} }).ok, false);
  // 正常放行
  assert.equal(validateBroadcast({ DRY_RUN: false, ENABLE_LIVE_TRADING: true, signedRaw, order, body: {} }).ok, true);
  // 订单不存在
  assert.equal(validateBroadcast({ DRY_RUN: false, ENABLE_LIVE_TRADING: true, signedRaw, order: null, body: {} }).ok, false);
  // 已确认订单不可再广播
  assert.equal(validateBroadcast({ DRY_RUN: false, ENABLE_LIVE_TRADING: true, signedRaw, order: { ...order, state: "CONFIRMED" }, body: {} }).ok, false);
  // 方向不匹配
  assert.equal(validateBroadcast({ DRY_RUN: false, ENABLE_LIVE_TRADING: true, signedRaw, order, body: { side: "sell" } }).ok, false);
  // 代币不匹配（大小写无关，但不同地址拒绝）
  assert.equal(validateBroadcast({ DRY_RUN: false, ENABLE_LIVE_TRADING: true, signedRaw, order, body: { token: "0x" + "CD".repeat(20) } }).ok, false);
  // signedRaw 格式无效
  assert.equal(validateBroadcast({ DRY_RUN: false, ENABLE_LIVE_TRADING: true, signedRaw: "bad", order, body: {} }).ok, false);
});

test("通知事件：入库并可查询", async () => {
  const { NotificationRepo } = await load("database.mjs");
  NotificationRepo.insert({ type: "buy.confirmed", title: "买入已确认", message: "测试", data: { token: "0x" + "AB".repeat(20) } });
  const list = NotificationRepo.list(10);
  assert.ok(list.some(n => n.type === "buy.confirmed" && n.title === "买入已确认"));
});

test("手续费台账：fee_records 从 PENDING → SENT → CONFIRMED 幂等", async () => {
  const { FeeRecordRepo, OrderRepo } = await load("database.mjs");
  const id = OrderRepo.create({
    token: "0x" + "EF".repeat(20), side: "buy", state: "SIGNING",
    feeBps: 50, feeAmount: "250000000000000", feeRecipient: FIXED_FEE_RECIPIENT, feeState: "PENDING",
  });
  FeeRecordRepo.insert({ orderId: id, token: "0x" + "EF".repeat(20), side: "buy", bps: 50, amount: "250000000000000", recipient: FIXED_FEE_RECIPIENT });
  FeeRecordRepo.updateState(id, "SENT", "0x" + "F1".repeat(32));
  FeeRecordRepo.confirmByOrder(id, "0x" + "F2".repeat(32));
  const rec = FeeRecordRepo.list(50).find(r => r.order_id === id);
  assert.equal(rec.state, "CONFIRMED");
  assert.equal(rec.tx_hash, "0x" + "F2".repeat(32));
  assert.ok(rec.confirmed_at);
});

test("持仓统计：卖出次数/毛收入/手续费/净盈亏累计 + 平仓时间", async () => {
  const { PositionRepo } = await load("database.mjs");
  const id = PositionRepo.open({
    token: "0x" + "11".repeat(20), wallet: "0xA1", orderId: 99,
    amountTokens: "1000000000000000000", entryPrice: "1", entryQuote: "50000000000000000", // 0.05 BNB
  });
  assert.ok(id > 0, "open 应返回持仓 id");
  // 第一次卖出 0.03 BNB 毛收入，手续费 0.5% = 0.00015 BNB，净 0.02985 BNB
  PositionRepo.recordSell(id, 0.02985, 0.03, 0.00015);
  PositionRepo.recordSell(id, 0.04975, 0.05, 0.00025);
  const pos = PositionRepo.all(100).find(p => p.id === id);
  assert.equal(Number(pos.sell_count), 2);
  assert.ok(Math.abs(Number(pos.gross_sold) - 0.08) < 1e-9);
  assert.ok(Math.abs(Number(pos.fee_total) - 0.0004) < 1e-9);
  // 平仓：记录 realized_pnl + closed_at
  PositionRepo.close(id, "0.01985", "0.01985");
  const closed = PositionRepo.all(100).find(p => p.id === id);
  assert.equal(closed.state, "closed");
  assert.ok(closed.closed_at);
  assert.ok(closed.closed_at >= closed.opened_at);
});

test("买入/卖出订单状态机：状态可逐步更新并持久化", async () => {
  const { OrderRepo } = await load("database.mjs");
  const id = OrderRepo.create({ token: "0x" + "22".repeat(20), side: "buy", state: "DISCOVERED", feeBps: 50, feeRecipient: FIXED_FEE_RECIPIENT });
  OrderRepo.updateState(id, "MATCHING");
  OrderRepo.updateState(id, "CHECKING");
  OrderRepo.updateState(id, "SIMULATING");
  OrderRepo.updateState(id, "READY", { amountOut: "1000", minOut: "950", gasPriceGwei: "3.0", gasLimit: 1200000 });
  OrderRepo.updateState(id, "SIGNING");
  OrderRepo.updateState(id, "BROADCASTING", { txHash: "0x" + "33".repeat(32) });
  OrderRepo.updateState(id, "CONFIRMED", { txHash: "0x" + "33".repeat(32) });
  const o = OrderRepo.get(id);
  assert.equal(o.state, "CONFIRMED");
  assert.equal(o.tx_hash, "0x" + "33".repeat(32));
  assert.equal(o.amount_out, "1000");
  assert.equal(o.min_out, "950");
  assert.equal(o.gas_price_gwei, "3.0");
});
