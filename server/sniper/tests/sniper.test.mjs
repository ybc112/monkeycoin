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
const FIXED_FEE_RECIPIENT = "0x436fB3245Ad8377DF443Ca1c67f997705D5843bb";

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

test("手续费地址固定：默认 = 0x436f…843bb，不受前端影响", () => {
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
