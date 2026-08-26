// Flap 内盘狙击服务入口：HTTP API + 事件监听 + 策略引擎 + WS 推送 + 交易流水线
import http from "node:http";
import { isAddress, parseUnits, JsonRpcProvider, MaxUint256 } from "ethers";
import { SNIPER_PORT, CORS_ORIGIN, DRY_RUN, ENABLE_LIVE_TRADING, GAS, RISK, CHAIN_ID, RPC_HTTP_URLS, FLAP } from "./config.mjs";
import { FlapMonitor } from "./flap-monitor.mjs";
import { StrategyEngine } from "./strategy-engine.mjs";
import { SniperWsServer } from "./websocket-server.mjs";
import { PositionManager } from "./position-manager.mjs";
import { WalletVault } from "./wallet-vault.mjs";
import { NonceManager } from "./nonce-manager.mjs";
import { computeGasPrice, applySlippage, buildBuyTx, buildSellTx } from "./transaction-builder.mjs";
import { simulateBuy, simulateSell, getTokenBalance } from "./transaction-simulator.mjs";
import { runPreTradeChecks, isEmergencyStopped, setEmergencyStop } from "./risk-checker.mjs";
import { pickBuyWallet } from "./strategy-engine.mjs";
import { getProvider, getTokenContract, quoteBuy, quoteTokenLabel } from "./flap-contracts.mjs";
import { fetchOptionsFor } from "./config.mjs";
import {
  StrategyRepo, TokenRepo, EventRepo, OrderRepo, TransactionRepo,
  PositionRepo, StateRepo, Audit, closeDb,
} from "./database.mjs";

const ws = new SniperWsServer();
const nonces = new NonceManager();
const vault = new WalletVault();

// 止盈/止损/分批卖出：由持仓监控触发
const positions = new PositionManager({
  onTriggerSell: async (position, fraction, reason) => {
    await executeSellPipeline({ position, fraction, reason });
  },
});

// 现价获取（quote per token）：用 0.01 BNB 买入报价反推
async function getCurrentPrice(token) {
  try {
    const q = await quoteBuy(token, parseUnits("0.01", 18));
    if (!q.ok || q.outputAmount <= 0n) return null;
    return 0.01 / (Number(q.outputAmount) / 1e18); // BNB per token
  } catch {
    return null;
  }
}

// 多 RPC 同时广播同一份已签名交易（nonce 固定，不会产生重复订单）
async function broadcastRawToMultiple(signedRaw) {
  let lastErr;
  for (const url of RPC_HTTP_URLS) {
    try {
      const p = new JsonRpcProvider(url, CHAIN_ID, { batchMaxCount: 1, ...fetchOptionsFor() });
      return await p.broadcastTransaction(signedRaw);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("广播失败");
}

// ── 事件 → 引擎 → WS ────────────────────────────────────────────────────────
const engine = new StrategyEngine({
  onMatched: async ({ strategy, token, result }) => {
    ws.emit("strategy.matched", { strategyId: strategy.id, token: token.token, symbol: token.symbol, devBuyQuote: token.devBuyQuote });
    await executeBuyPipeline({ strategy, token });
  },
  onRejected: ({ strategy, token, result }) => {
    ws.emit("strategy.rejected", { strategyId: strategy.id, token: token.token, symbol: token.symbol, reason: result.rejectReason, fails: result.fails });
  },
});

const monitor = new FlapMonitor({
  onEvents: async (events) => {
    for (const ev of events) {
      try {
        if (ev.kind === "created") {
          ws.emit("flap.token.created", { token: ev.token, name: ev.name, symbol: ev.symbol, creator: ev.creator, block: ev.blockNumber });
          const rec = await engine.onCreated(ev);
          if (rec) ws.emit("flap.pool.created", { token: ev.token, symbol: ev.symbol, quote: rec.quoteLabel, initialReserve: rec.initialReserveQuote });
        } else if (ev.kind === "bought") {
          ws.emit("flap.dev.buy", { token: ev.token, buyer: ev.buyer, quoteSpent: ev.quoteSpentLabel, block: ev.blockNumber });
          await engine.onBought(ev);
        } else if (ev.kind === "launched_dex") {
          ws.emit("flap.pool.created", { token: ev.token, pool: ev.pool, state: "DEX" });
        }
      } catch (err) {
        Audit.log("engine", `事件处理失败: ${String(err?.message || err)}`, "error");
      }
    }
  },
  onSystem: (msg) => ws.emit(msg.type, msg.data),
});

// ── 交易流水线（dry_run 只模拟；live 且 ENABLE_LIVE_TRADING 才广播） ─────────
async function executeBuyPipeline({ strategy, token }) {
  if (!strategy || !token) return;
  const orderId = OrderRepo.create({
    token: token.token, strategyId: strategy.id, side: "buy", state: "MATCHING",
    mode: strategy.mode || "dry_run", matchedReason: "策略全部条件命中",
  });
  ws.emit("transaction.simulated", { orderId, token: token.token, state: "MATCHING" });

  const buyAmount = strategy.buyAmountQuote || "0.05";
  const check = await runPreTradeChecks({
    token: token.token, strategy, quoteLabel: token.quoteLabel, buyAmountQuote: buyAmount,
    slippageBps: strategy.slippageBps || RISK.MAX_SLIPPAGE_BPS,
  });
  if (!check.ok) {
    OrderRepo.updateState(orderId, "SKIPPED", { matchedReason: check.reason });
    ws.emit("transaction.failed", { orderId, token: token.token, reason: check.reason });
    Audit.log("order", `跳过买入 ${token.token}: ${check.reason}`, "warn");
    return;
  }

  const gas = await computeGasPrice({ manualGwei: strategy.gasPriceManualGwei });
  if (gas.capped) {
    OrderRepo.updateState(orderId, "SKIPPED", { matchedReason: `Gas ${gas.gwei.toFixed(2)} 超过上限 ${gas.cap} Gwei，放弃` });
    ws.emit("transaction.failed", { orderId, token: token.token, reason: `Gas 超上限 ${gas.cap} Gwei` });
    return;
  }

  const sim = await simulateBuy({ token: token.token, buyAmountWei: check.buyWei, wallet: "0x0000000000000000000000000000000000000001" });
  if (!sim.ok) {
    OrderRepo.updateState(orderId, "FAILED", { matchedReason: `买入模拟失败: ${sim.error}` });
    ws.emit("transaction.failed", { orderId, token: token.token, reason: sim.error });
    return;
  }
  const minOut = applySlippage(sim.outputAmount, strategy.slippageBps || RISK.MAX_SLIPPAGE_BPS);
  OrderRepo.updateState(orderId, "READY", {
    amountOut: sim.outputAmount.toString(), minOut: minOut.toString(),
    gasPriceGwei: gas.gwei.toFixed(2), gasLimit: GAS.BUY_GAS_LIMIT,
  });
  ws.emit("transaction.simulated", { orderId, token: token.token, outputAmount: sim.outputAmount.toString(), minOut: minOut.toString(), gasPrice: gas.gwei });

  if (DRY_RUN && strategy.mode !== "live") return; // Dry Run 停在模拟结果
  if (!ENABLE_LIVE_TRADING) {
    OrderRepo.updateState(orderId, "SKIPPED", { matchedReason: "ENABLE_LIVE_TRADING=false，未广播" });
    return;
  }

  try {
    const tx = await buildBuyTx({ token: token.token, buyAmountWei: check.buyWei, minOut, gasPrice: gas.raw, gasLimit: GAS.BUY_GAS_LIMIT });
    OrderRepo.updateState(orderId, "SIGNING", {});
    ws.emit("transaction.pending", { orderId, token: token.token, to: tx.to, value: tx.value.toString() });

    // 模式 B（自动钱包，默认关闭）：多钱包分配 + 签名广播
    if (vault.isEnabled()) {
      const enabledWallets = vault.list().filter(w => w.enabled).map(w => w.address);
      const wallet = pickBuyWallet({ strategy, enabledWallets });
      if (wallet) {
        const signer = vault.getWallet(wallet);
        const nonce = await nonces.nextNonce(wallet);
        const signed = await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value, gasPrice: gas.raw, gasLimit: BigInt(GAS.BUY_GAS_LIMIT), nonce });
        nonces.reserve(wallet);
        OrderRepo.updateState(orderId, "BROADCASTING", { txHash: signed.hash, wallet });
        TransactionRepo.insert({ orderId, token: token.token, side: "buy", nonce, from: wallet, to: tx.to, data: tx.data, value: tx.value.toString(), gasPrice: gas.raw.toString(), gasLimit: GAS.BUY_GAS_LIMIT, txHash: signed.hash, status: "pending" });
        ws.emit("transaction.pending", { orderId, token: token.token, txHash: signed.hash, wallet });
        signed.wait().then(async (receipt) => {
          OrderRepo.updateState(orderId, "CONFIRMED", { txHash: receipt.hash });
          TransactionRepo.updateStatus(receipt.hash, "confirmed");
          // 开仓：按买入金额/成交数量记录，绑定止盈止损与分批
          const amountTokens = sim.outputAmount;
          const entryPrice = Number(tx.value) / Number(amountTokens || 1n);
          positions.open({
            token: token.token, tokenSymbol: token.symbol, wallet, orderId,
            amountTokens: amountTokens.toString(), entryPrice: String(entryPrice), entryQuote: tx.value.toString(),
            takeProfitBps: strategy.takeProfitBps, stopLossBps: strategy.stopLossBps,
            batchTotal: strategy.sellBatches || 1,
          });
          ws.emit("transaction.confirmed", { orderId, token: token.token, txHash: receipt.hash, block: receipt.blockNumber });
          ws.emit("position.updated", { orderId, token: token.token, state: "open" });
        }).catch((err) => {
          OrderRepo.updateState(orderId, "FAILED", { matchedReason: String(err?.message || err) });
          ws.emit("transaction.failed", { orderId, token: token.token, reason: String(err?.message || err) });
        });
        return;
      }
    }
    // 模式 A：返回 unsigned tx，等前端签名后广播
    OrderRepo.updateState(orderId, "SIGNING", { matchedReason: "等待用户钱包签名" });
    ws.emit("transaction.pending", {
      orderId, token: token.token, requiresSignature: true,
      unsignedTx: { to: tx.to, data: tx.data, value: tx.value.toString(), gasPrice: gas.raw.toString(), gasLimit: GAS.BUY_GAS_LIMIT },
    });
  } catch (err) {
    OrderRepo.updateState(orderId, "FAILED", { matchedReason: `构建交易失败: ${String(err?.message || err)}` });
    ws.emit("transaction.failed", { orderId, token: token.token, reason: String(err?.message || err) });
  }
}

// ── HTTP 服务器 ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    setCors(res, req);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;
    const body = req.method !== "GET" ? await readBody(req) : {};

    if (path === "/health") return json(res, 200, { ok: true, service: "flap-sniper", dryRun: DRY_RUN });

    if (path === "/api/sniper/status") return json(res, 200, {
      ok: true, running: monitor.running, connected: monitor.connected, dryRun: DRY_RUN,
      liveTradingEnabled: ENABLE_LIVE_TRADING, emergencyStopped: isEmergencyStopped(),
      lastProcessedBlock: monitor.getLastProcessed(), latestBlock: monitor.latestBlock,
      autoWallets: vault.isEnabled(), platform: "flap",
    });

    if (path === "/api/sniper/tokens") return json(res, 200, { ok: true, tokens: TokenRepo.list(Number(url.searchParams.get("limit") || 50)) });

    if (path.startsWith("/api/sniper/tokens/")) {
      const addr = path.slice("/api/sniper/tokens/".length);
      if (!isAddress(addr)) return json(res, 400, { ok: false, error: "地址无效" });
      return json(res, 200, { ok: true, token: TokenRepo.get(addr), events: EventRepo.list(addr) });
    }

    if (path === "/api/sniper/strategies" && req.method === "GET") return json(res, 200, { ok: true, strategies: StrategyRepo.list() });
    if (path === "/api/sniper/strategies" && req.method === "POST") return json(res, 201, { ok: true, id: StrategyRepo.create(normalizeStrategy(body)) });
    if (path.startsWith("/api/sniper/strategies/") && req.method === "PUT") {
      const id = Number(path.slice("/api/sniper/strategies/".length));
      StrategyRepo.update(id, normalizeStrategy(body));
      return json(res, 200, { ok: true });
    }

    if (path === "/api/sniper/start") { await monitor.start(); return json(res, 200, { ok: true }); }
    if (path === "/api/sniper/stop") { await monitor.stop(); return json(res, 200, { ok: true }); }
    if (path === "/api/sniper/emergency-stop") {
      setEmergencyStop(true);
      ws.emit("emergency.stopped", { ts: Date.now() });
      Audit.log("system", "紧急停止已触发", "warn");
      return json(res, 200, { ok: true, emergencyStopped: true });
    }

    if (path === "/api/sniper/simulate-buy") return json(res, 200, await runSimulateBuy(body));
    if (path === "/api/sniper/simulate-sell") return json(res, 200, await runSimulateSell(body));

    if (path === "/api/sniper/buy" && req.method === "POST") return handleBuy(res, body);
    if (path === "/api/sniper/sell" && req.method === "POST") return handleSell(res, body);
    if (path === "/api/sniper/broadcast" && req.method === "POST") return handleBroadcast(res, body);

    if (path === "/api/sniper/orders") return json(res, 200, { ok: true, orders: OrderRepo.list(Number(url.searchParams.get("limit") || 100)) });
    if (path === "/api/sniper/positions") return json(res, 200, { ok: true, positions: PositionRepo.all(Number(url.searchParams.get("limit") || 100)) });

    return json(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    json(res, 400, { ok: false, error: String(err?.message || err) });
  }
});

async function runSimulateBuy(body) {
  const { token, amount } = body;
  if (!isAddress(token)) return { ok: false, error: "token 无效" };
  const sim = await simulateBuy({ token, buyAmountWei: parseUnits(String(amount || "0.05"), 18), wallet: "0x0000000000000000000000000000000000000001" });
  return { ok: sim.ok, ...sim };
}
async function runSimulateSell(body) {
  const { token, amount } = body;
  if (!isAddress(token)) return { ok: false, error: "token 无效" };
  const sim = await simulateSell({ token, tokenAmount: parseUnits(String(amount || "1"), 18), wallet: "0x0000000000000000000000000000000000000001" });
  return { ok: sim.ok, ...sim };
}

// ── 买入/卖出/广播 ──────────────────────────────────────────────────────────
async function handleBuy(res, body) {
  const { token, strategyId, amount, wallet } = body;
  if (!isAddress(token)) return json(res, 400, { ok: false, error: "token 无效" });
  const strategy = strategyId ? StrategyRepo.get(strategyId) : null;
  if (strategyId && !strategy) return json(res, 404, { ok: false, error: "策略不存在" });
  const buyAmount = amount || strategy?.buyAmountQuote || "0.05";
  const check = await runPreTradeChecks({ token, strategy: strategy || {}, quoteLabel: null, buyAmountQuote: buyAmount, slippageBps: strategy?.slippageBps || RISK.MAX_SLIPPAGE_BPS });
  if (!check.ok) return json(res, 400, { ok: false, error: check.reason, results: check.results });
  const gas = await computeGasPrice({ manualGwei: strategy?.gasPriceManualGwei });
  if (gas.capped) return json(res, 400, { ok: false, error: `Gas ${gas.gwei.toFixed(2)} 超上限 ${gas.cap} Gwei` });
  const sim = await simulateBuy({ token, buyAmountWei: check.buyWei, wallet: wallet || "0x0000000000000000000000000000000000000001" });
  if (!sim.ok) return json(res, 400, { ok: false, error: `模拟买入失败: ${sim.error}` });
  const minOut = applySlippage(sim.outputAmount, strategy?.slippageBps || RISK.MAX_SLIPPAGE_BPS);
  const tx = await buildBuyTx({ token, buyAmountWei: check.buyWei, minOut, gasPrice: gas.raw, gasLimit: GAS.BUY_GAS_LIMIT });
  const orderId = OrderRepo.create({ token, strategyId: strategyId ?? null, side: "buy", state: "SIGNING", mode: "user", amountIn: check.buyWei.toString(), amountOut: sim.outputAmount.toString(), minOut: minOut.toString(), gasPriceGwei: gas.gwei.toFixed(2), gasLimit: GAS.BUY_GAS_LIMIT });
  ws.emit("transaction.pending", { orderId, token, requiresSignature: true });
  return json(res, 200, { ok: true, orderId, unsignedTx: { to: tx.to, data: tx.data, value: tx.value.toString(), gasPrice: gas.raw.toString(), gasLimit: GAS.BUY_GAS_LIMIT }, quote: sim.outputAmount.toString(), minOut: minOut.toString() });
}

async function handleSell(res, body) {
  const { token, amount, wallet, positionId, fraction } = body;
  if (!isAddress(token)) return json(res, 400, { ok: false, error: "token 无效" });
  const tokenAmount = parseUnits(String(amount || "1"), 18);
  const sim = await simulateSell({ token, tokenAmount, wallet: wallet || "0x0000000000000000000000000000000000000001" });
  if (!sim.ok) return json(res, 400, { ok: false, error: `模拟卖出失败: ${sim.error}` });
  const gas = await computeGasPrice({});
  const minOut = applySlippage(sim.outputAmount, RISK.MAX_SLIPPAGE_BPS);
  const tx = await buildSellTx({ token, tokenAmount, minOut, gasPrice: gas.raw, gasLimit: GAS.SELL_GAS_LIMIT });
  const orderId = OrderRepo.create({ token, side: "sell", state: "SIGNING", mode: "user", amountIn: tokenAmount.toString(), amountOut: sim.outputAmount.toString(), minOut: minOut.toString(), gasPriceGwei: gas.gwei.toFixed(2), gasLimit: GAS.SELL_GAS_LIMIT });
  return json(res, 200, { ok: true, orderId, positionId: positionId ?? null, fraction: fraction ?? 1, unsignedTx: { to: tx.to, data: tx.data, value: "0", gasPrice: gas.raw.toString(), gasLimit: GAS.SELL_GAS_LIMIT }, quote: sim.outputAmount.toString(), minOut: minOut.toString() });
}

// ── 自动卖出流水线（止盈/止损/分批；模式B 自动签名广播） ────────────────────
async function executeSellPipeline({ position, fraction = 1, reason = "" }) {
  const token = position.token;
  const wallet = position.wallet;
  if (!token || !wallet) return;
  const { raw: balance } = await getTokenBalance(token, wallet);
  if (balance <= 0n) return;
  const amountToSell = (balance * BigInt(Math.max(1, Math.round(fraction * 100)))) / 100n;
  if (amountToSell <= 0n) return;
  const orderId = OrderRepo.create({ token, side: "sell", state: "MATCHING", mode: vault.isEnabled() ? "live" : "dry_run", matchedReason: reason || "自动卖出" });
  ws.emit("transaction.simulated", { orderId, token, side: "sell", state: "MATCHING", reason: reason || "自动卖出" });

  if (isEmergencyStopped()) {
    OrderRepo.updateState(orderId, "SKIPPED", { matchedReason: "紧急停止中" });
    return;
  }
  const sim = await simulateSell({ token, tokenAmount: amountToSell, wallet });
  if (!sim.ok) {
    OrderRepo.updateState(orderId, "FAILED", { matchedReason: `卖出模拟失败: ${sim.error}` });
    ws.emit("transaction.failed", { orderId, token, reason: sim.error });
    return;
  }
  const gas = await computeGasPrice({});
  if (gas.capped) {
    OrderRepo.updateState(orderId, "SKIPPED", { matchedReason: `Gas ${gas.gwei.toFixed(2)} 超上限 ${gas.cap}` });
    return;
  }
  const minOut = applySlippage(sim.outputAmount, RISK.MAX_SLIPPAGE_BPS);
  OrderRepo.updateState(orderId, "READY", { amountOut: sim.outputAmount.toString(), minOut: minOut.toString(), gasPriceGwei: gas.gwei.toFixed(2), gasLimit: GAS.SELL_GAS_LIMIT });
  ws.emit("transaction.simulated", { orderId, token, side: "sell", reason: reason || "自动卖出", outputAmount: sim.outputAmount.toString(), minOut: minOut.toString() });

  // Dry Run / 未开启 live：只模拟，不广播
  if (DRY_RUN || !ENABLE_LIVE_TRADING) {
    OrderRepo.updateState(orderId, "SKIPPED", { matchedReason: "未开启 Live 交易（Dry Run）" });
    return;
  }
  try {
    // 用户自管钱包模式：构建卖出交易 → WS 推送，等用户在浏览器签名后回传广播
    const tx = await buildSellTx({ token, tokenAmount: amountToSell, minOut, gasPrice: gas.raw, gasLimit: GAS.SELL_GAS_LIMIT });
    OrderRepo.updateState(orderId, "SIGNING", { matchedReason: "等待用户钱包签名卖出" });
    ws.emit("transaction.pending", {
      orderId, token, side: "sell", requiresSignature: true,
      positionId: position.id, fraction,
      unsignedTx: { to: tx.to, data: tx.data, value: "0", gasPrice: gas.raw.toString(), gasLimit: GAS.SELL_GAS_LIMIT },
      amountTokens: amountToSell.toString(), quoteOut: sim.outputAmount.toString(),
    });
  } catch (err) {
    OrderRepo.updateState(orderId, "FAILED", { matchedReason: `构建卖出失败: ${String(err?.message || err)}` });
    ws.emit("transaction.failed", { orderId, token, reason: String(err?.message || err) });
  }
}

async function handleBroadcast(res, body) {
  const { orderId, signedRaw } = body;
  if (!orderId || !signedRaw) return json(res, 400, { ok: false, error: "orderId 与 signedRaw 必填" });
  try {
    const resp = await broadcastRawToMultiple(signedRaw);
    OrderRepo.updateState(orderId, "BROADCASTING", { txHash: resp.hash });
    ws.emit("transaction.pending", { orderId, txHash: resp.hash, side: body.side });
    resp.wait().then((receipt) => {
      OrderRepo.updateState(orderId, "CONFIRMED", { txHash: receipt.hash });
      TransactionRepo.updateStatus(receipt.hash, "confirmed");
      ws.emit("transaction.confirmed", { orderId, txHash: receipt.hash, block: receipt.blockNumber, side: body.side });
      if (body.side === "sell" && body.positionId) {
        // 卖出确认：平仓或记批次 + 盈亏 + 日亏损熔断
        const soldQuote = Number(body.quoteOut || 0) / 1e18;
        const cost = (Number(body.entryQuote || 0) / 1e18) * Number(body.fraction || 1);
        const pnl = soldQuote - cost;
        const pos = PositionRepo.all(1000).find(p => p.id === Number(body.positionId));
        const sold = Number(pos?.batch_sold || 0);
        const total = Number(pos?.batch_total || 1);
        if (sold + 1 >= total) positions.close({ positionId: body.positionId, realizedPnl: String(soldQuote), realizedPnlQuote: String(pnl) });
        else positions.markBatchSold(body.positionId, pnl);
        ws.emit("position.updated", { positionId: body.positionId, state: sold + 1 >= total ? "closed" : "partial" });
        if (positions.checkDailyLossLimit()) {
          setEmergencyStop(true);
          ws.emit("emergency.stopped", { ts: Date.now() });
          Audit.log("system", "日亏损熔断触发，已紧急停止", "warn");
        }
      } else if (body.token && body.amountTokens) {
        positions.open({ token: body.token, wallet: body.wallet, orderId, amountTokens: body.amountTokens, entryPrice: body.entryPrice, entryQuote: body.entryQuote, takeProfitBps: body.takeProfitBps, stopLossBps: body.stopLossBps, batchTotal: body.sellBatches || 1 });
        ws.emit("position.updated", { orderId, token: body.token, state: "open" });
      }
    }).catch((err) => {
      OrderRepo.updateState(orderId, "FAILED", {});
      ws.emit("transaction.failed", { orderId, reason: String(err?.message || err) });
    });
    return json(res, 200, { ok: true, txHash: resp.hash });
  } catch (err) {
    return json(res, 400, { ok: false, error: `广播失败: ${String(err?.message || err)}` });
  }
}

function normalizeStrategy(b) {
  return {
    name: b.name || "未命名策略",
    enabled: Boolean(b.enabled),
    mode: b.mode || "dry_run",
    platform: "flap",
    quoteTokens: Array.isArray(b.quoteTokens) ? b.quoteTokens : ["BNB"],
    poolMinQuote: b.poolMinQuote ?? null, poolMaxQuote: b.poolMaxQuote ?? null,
    devBuyMin: b.devBuyMin ?? null, devBuyMax: b.devBuyMax ?? null,
    maxBuyTaxBps: b.maxBuyTaxBps ?? null, maxSellTaxBps: b.maxSellTaxBps ?? null,
    buyAmountQuote: b.buyAmountQuote ?? null, buyAmountPerWallet: b.buyAmountPerWallet ?? null,
    allowMultiWallet: b.allowMultiWallet !== false,
    maxPositions: b.maxPositions ?? null,
    takeProfitBps: b.takeProfitBps ?? null, stopLossBps: b.stopLossBps ?? null,
    sellBatches: b.sellBatches ?? null, maxTxBps: b.maxTxBps ?? null, maxWalletBps: b.maxWalletBps ?? null,
    gasPriceManualGwei: b.gasPriceManualGwei ?? null, gasMultiplier: b.gasMultiplier ?? null,
    maxGasPriceGwei: b.maxGasPriceGwei ?? null, slippageBps: b.slippageBps || 500,
    conditions: Array.isArray(b.conditions) ? b.conditions : [],
  };
}

// ── 辅助 ────────────────────────────────────────────────────────────────────
function setCors(res, req) {
  const origin = req?.headers?.origin;
  const allowed = CORS_ORIGIN.includes("*")
    ? "*"
    : (origin && CORS_ORIGIN.includes(origin) ? origin : CORS_ORIGIN[0] || "*");
  res.setHeader("access-control-allow-origin", allowed);
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization");
}
function json(res, code, data) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

server.listen(SNIPER_PORT, () => {
  ws.attach(server);
  console.log(`[sniper] Flap 内盘狙击服务运行于 :${SNIPER_PORT}（WS /ws/sniper）`);
  console.log(`[sniper] DRY_RUN=${DRY_RUN} ENABLE_LIVE_TRADING=${ENABLE_LIVE_TRADING}`);
  if (DRY_RUN) console.log("[sniper] 当前 Dry Run 模式：仅监听与模拟，不发送真实交易");
  positions.startMonitor({ getPrice: getCurrentPrice });
  monitor.start().catch((e) => console.error("[sniper] 启动监听失败:", e));
});

process.on("SIGINT", () => { monitor.stop(); positions.stopMonitor(); closeDb(); process.exit(0); });
process.on("SIGTERM", () => { monitor.stop(); positions.stopMonitor(); closeDb(); process.exit(0); });
