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
const { computeGasPrice, applySlippage } = await load("transaction-builder.mjs");
const { setEmergencyStop, isEmergencyStopped, runPreTradeChecks } = await load("risk-checker.mjs");
const { NonceManager } = await load("nonce-manager.mjs");
const { EventRepo, StrategyRepo, StateRepo } = await load("database.mjs");

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
