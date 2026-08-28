// Flap 内盘狙击服务入口：HTTP API + 事件监听 + 策略引擎 + WS 推送 + 交易流水线
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAddress, parseUnits, JsonRpcProvider, Contract, MaxUint256, Wallet } from "ethers";
import { SNIPER_PORT, CORS_ORIGIN, DRY_RUN, ENABLE_LIVE_TRADING, GAS, RISK, CHAIN_ID, RPC_HTTP_URLS, FLAP, FEES, SNIPER_ACCESS } from "./config.mjs";
import { FlapMonitor } from "./flap-monitor.mjs";
import { StrategyEngine } from "./strategy-engine.mjs";
import { SniperWsServer } from "./websocket-server.mjs";
import { PositionManager } from "./position-manager.mjs";
import { WalletVault } from "./wallet-vault.mjs";
import { NonceManager } from "./nonce-manager.mjs";
import { computeGasPrice, applySlippage, buildBuyTx, buildSellTx, buildFeeTransferTx, calcFee, feeBreakdown } from "./transaction-builder.mjs";
import { simulateBuy, simulateSell, getTokenBalance } from "./transaction-simulator.mjs";
import { runPreTradeChecks, isEmergencyStopped, setEmergencyStop, validateBroadcast } from "./risk-checker.mjs";
import { pickBuyWallet } from "./strategy-engine.mjs";
import { getProvider, getTokenContract, quoteBuy, quoteTokenLabel } from "./flap-contracts.mjs";
import { fetchOptionsFor } from "./config.mjs";
import {
  StrategyRepo, TokenRepo, EventRepo, OrderRepo, TransactionRepo,
  PositionRepo, StateRepo, Audit, closeDb, FeeRecordRepo, NotificationRepo, SniperUserRepo,
} from "./database.mjs";

const ws = new SniperWsServer();
const nonces = new NonceManager();
const vault = new WalletVault();

// ── 通知：入库 + WS 推送（前端据此 Toast/声音/浏览器通知） ──────────────────
function notify(type, data = {}) {
  const titles = {
    "token.created": "Flap 新币创建", "dev.buy": "Dev 首买", "strategy.matched": "策略命中",
    "strategy.rejected": "策略不匹配", "buy.pending": "买入待签名", "buy.broadcast": "买入已广播",
    "buy.confirmed": "买入已确认", "buy.failed": "买入失败",
    "sell.pending": "卖出待签名", "sell.broadcast": "卖出已广播", "sell.confirmed": "卖出已确认",
    "sell.failed": "卖出失败", "approve.pending": "授权待签名", "approve.confirmed": "授权已确认",
    "fee.pending": "手续费待支付", "fee.confirmed": "手续费已确认", "fee.failed": "手续费失败",
    "wallet.low_balance": "钱包余额不足", "gas.capped": "Gas 超上限", "emergency.stopped": "紧急停止",
    "rpc.disconnected": "RPC 断开", "rpc.reconnected": "RPC 重连", "take_profit": "止盈触发", "stop_loss": "止损触发",
  };
  const title = titles[type] || type;
  const message = typeof data.message === "string" ? data.message : "";
  try { NotificationRepo.insert({ type, title, message, data: { ...data, message: undefined } }); } catch { /* ignore */ }
  ws.emit(`notification.${type}`, { ...data, title, ts: Date.now() });
}
// approve 后继续卖出（模式A 顺序：approve → sell）
const pendingSellAfterApprove = new Map(); // approveOrderId -> { token, positionId, fraction, sellTx, amountToSell, quoteOut, gas }

// ── 执行钱包私钥保存（自用便利：保存到服务器 data 目录 JSON，前端静默读写） ──
// 注意：明文存服务器有风险，仅建议小额度执行钱包；文件已 gitignore，绝不打日志
const WALLET_KEY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "data", "wallet-key.json");
function readStoredKey() {
  try {
    if (!fs.existsSync(WALLET_KEY_FILE)) return null;
    return JSON.parse(fs.readFileSync(WALLET_KEY_FILE, "utf8"));
  } catch { return null; }
}
function saveStoredKey(rec) {
  fs.mkdirSync(path.dirname(WALLET_KEY_FILE), { recursive: true });
  fs.writeFileSync(WALLET_KEY_FILE, JSON.stringify(rec, null, 2), { mode: 0o600 });
  try { fs.chmodSync(WALLET_KEY_FILE, 0o600); } catch { /* windows 忽略 */ }
}

// ── 狙击激活门禁：销毁 50,000 $MKY（allowlist）或 持有 MonkeyNFT 免费 ────
async function isSniperActivated(wallet) {
  if (!SNIPER_ACCESS.ENABLED) return true;
  if (!wallet || !isAddress(wallet)) return false;
  try {
    const provider = getProvider();
    // 1) 持有 MonkeyNFT → 免费
    if (SNIPER_ACCESS.NFT_FREE) {
      const nft = new Contract(SNIPER_ACCESS.NFT_ADDRESS, SNIPER_ACCESS.NFT_ABI, provider);
      const bal = await nft.balanceOf(wallet);
      if (bal > 0n) return true;
    }
    // 2) 已销毁 50,000 $MKY → allowlist
    const c = new Contract(SNIPER_ACCESS.ADDRESS, SNIPER_ACCESS.ABI, provider);
    return Boolean(await c.allowlist(wallet));
  } catch { return false; }
}

// 查询持有 NFT 数量（0 = 无）
async function nftBalance(wallet) {
  if (!SNIPER_ACCESS.NFT_FREE || !wallet || !isAddress(wallet)) return 0;
  try {
    const provider = getProvider();
    const nft = new Contract(SNIPER_ACCESS.NFT_ADDRESS, SNIPER_ACCESS.NFT_ABI, provider);
    const bal = await nft.balanceOf(wallet);
    return Number(bal) || 0;
  } catch { return 0; }
}
const ACTIVATION_REQUIRED_MSG = `未激活：当前执行钱包未持有 MonkeyNFT，也未销毁 ${Number(SNIPER_ACCESS.COST / 10n ** 18n).toLocaleString("en-US")} $MKY。持有 NFT 可免费使用，或前往 #/nft 销毁 $MKY 兑换 NFT / 销毁激活。`;

// 构建代币 → Flap Portal 授权交易（卖出必需）
function buildApproveTx(token, gasPrice) {
  const tc = getTokenContract(token);
  const data = tc.interface.encodeFunctionData("approve", [FLAP.PORTAL, MaxUint256]);
  return { to: token, data, value: "0", gasPrice, gasLimit: 60000 };
}

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

// ── 平台手续费（后端唯一权威；前端不可覆盖地址/比例/金额） ─────────────────
// 模式A 下：买入先推送手续费待签 → 前端确认广播 → 后端再推送买入待签（保证顺序）
const pendingBuyAfterFee = new Map(); // feeOrderId -> { token, gas, buyTx, tradeWei, sim, strategy }

// 手续费转账执行（卖后扣费 / 买前扣费通用；幂等防重复）
async function sendFeeTransfer({ orderId, feeWei, fromWallet, side = "" }) {
  const order = OrderRepo.get(orderId);
  if (!order) return;
  if (!feeWei || BigInt(feeWei) <= 0n) { OrderRepo.setFeeState(orderId, "NONE"); return; }
  // 幂等：已确认扣费 / 已广播待确认 → 绝不重复
  if (order.fee_state === "CONFIRMED" || (order.fee_tx_hash && order.fee_state === "SENT")) return;
  if (DRY_RUN || !ENABLE_LIVE_TRADING) { OrderRepo.setFeeState(orderId, "NONE", "DryRun 不发送手续费转账"); return; }
  try {
    const gas = await computeGasPrice({});
    const tx = buildFeeTransferTx({ feeWei, gasPrice: gas.raw, gasLimit: 21000 });
    // 首次扣费时建立台账
    const isFirst = order.fee_state === "PENDING" || order.fee_state === "NONE";
    if (isFirst) FeeRecordRepo.insert({ orderId, token: order.token, side: side || order.side, bps: order.fee_bps || FEES.BPS, amount: feeWei.toString(), recipient: FEES.RECIPIENT });
    if (vault.isEnabled() && fromWallet) {
      const signer = vault.getWallet(fromWallet);
      if (!signer) throw new Error("自动钱包不可用或已停用");
      const nonce = await nonces.nextNonce(fromWallet);
      const signed = await signer.sendTransaction({ to: tx.to, value: tx.value, gasPrice: gas.raw, gasLimit: 21000n, nonce });
      nonces.reserve(fromWallet);
      if (!OrderRepo.setFeeTxHash(orderId, signed.hash)) return;
      FeeRecordRepo.updateState(orderId, "SENT", signed.hash);
      Audit.log("fee", `手续费转账已广播 order=${orderId} hash=${signed.hash.slice(0, 10)}… amount=${feeWei.toString()}`);
      ws.emit("fee.transfer.pending", { orderId, txHash: signed.hash, amount: feeWei.toString(), recipient: FEES.RECIPIENT, side: side || order.side });
      notify("fee.pending", { orderId, amount: feeWei.toString(), message: `手续费转账已广播 ${feeWei.toString()} wei` });
      signed.wait().then(() => {
        OrderRepo.setFeeState(orderId, "CONFIRMED");
        TransactionRepo.updateStatus(signed.hash, "confirmed");
        FeeRecordRepo.confirmByOrder(orderId, signed.hash);
        ws.emit("fee.transfer.confirmed", { orderId, txHash: signed.hash });
        notify("fee.confirmed", { orderId, txHash: signed.hash, amount: feeWei.toString() });
      }).catch((e) => {
        OrderRepo.setFeeState(orderId, "RETRYING", String(e?.message || e));
        FeeRecordRepo.updateState(orderId, "FAILED", null, String(e?.message || e));
        ws.emit("fee.transfer.failed", { orderId, txHash: signed.hash, reason: String(e?.message || e) });
        notify("fee.failed", { orderId, reason: String(e?.message || e) });
      });
    } else {
      // 模式A：推送手续费转账待用户签名（不发真实交易）
      OrderRepo.setFeeState(orderId, "PENDING");
      ws.emit("fee.transfer.pending", {
        orderId, requiresSignature: true, side: side || order.side, amount: feeWei.toString(),
        recipient: FEES.RECIPIENT, bps: FEES.BPS,
        unsignedTx: { to: tx.to, data: tx.data, value: tx.value.toString(), gasPrice: gas.raw.toString(), gasLimit: 21000, isFee: true },
      });
      notify("fee.pending", { orderId, amount: feeWei.toString(), message: `平台手续费待签名 ${feeWei.toString()} wei` });
    }
  } catch (err) {
    OrderRepo.setFeeState(orderId, "RETRYING", String(err?.message || err));
    FeeRecordRepo.updateState(orderId, "FAILED", null, String(err?.message || err));
    ws.emit("fee.transfer.failed", { orderId, reason: String(err?.message || err) });
    Audit.log("fee", `手续费转账失败 order=${orderId}: ${String(err?.message || err)}`, "warn");
  }
}

// ── 交易流水线（dry_run 只模拟；live 且 ENABLE_LIVE_TRADING 才广播） ─────────
// 重复买入检查：同代币已有进行中/已确认的买入订单则拒绝（大小写统一）
function hasActiveBuyOrder(tokenAddress) {
  const t = (tokenAddress || "").toLowerCase();
  const active = new Set(["MATCHING", "CHECKING", "SIMULATING", "READY", "SIGNING", "BROADCASTING", "PENDING"]);
  return OrderRepo.list(300).some(o =>
    o.side === "buy" && (o.token || "").toLowerCase() === t && active.has(o.state));
}

async function executeBuyPipeline({ strategy, token }) {
  if (!strategy || !token) return;
  const tokenLower = (token.token || "").toLowerCase();
  // 同一代币禁止重复下单
  if (hasActiveBuyOrder(tokenLower)) {
    Audit.log("order", `跳过买入 ${token.token}: 已有进行中的买入订单（防重复）`, "warn");
    return;
  }
  const orderId = OrderRepo.create({
    token: token.token, strategyId: strategy.id, side: "buy", state: "MATCHING",
    mode: strategy.mode || "dry_run", matchedReason: "策略全部条件命中",
    feeBps: FEES.BPS, feeAsset: FEES.ASSET, feeRecipient: FEES.RECIPIENT, feeState: "PENDING",
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

  // 手续费（总额 → fee + 实际成交金额）；fee 为 0 时拒绝（防止被绕过）
  const { fee: feeWei, trade: tradeWei } = calcFee(check.buyWei);
  if (feeWei === 0n) {
    OrderRepo.updateState(orderId, "FAILED", { matchedReason: "手续费为 0，拒绝下单" });
    return;
  }
  const gas = await computeGasPrice({ manualGwei: strategy.gasPriceManualGwei });
  if (gas.capped) {
    OrderRepo.updateState(orderId, "SKIPPED", { matchedReason: `Gas ${gas.gwei.toFixed(2)} 超过上限 ${gas.cap} Gwei，放弃` });
    ws.emit("transaction.failed", { orderId, token: token.token, reason: `Gas 超上限 ${gas.cap} Gwei` });
    return;
  }

  const sim = await simulateBuy({ token: token.token, buyAmountWei: tradeWei, wallet: "0x0000000000000000000000000000000000000001" });
  if (!sim.ok) {
    OrderRepo.updateState(orderId, "FAILED", { matchedReason: `买入模拟失败: ${sim.error}` });
    ws.emit("transaction.failed", { orderId, token: token.token, reason: sim.error });
    return;
  }
  const minOut = applySlippage(sim.outputAmount, strategy.slippageBps || RISK.MAX_SLIPPAGE_BPS);
  OrderRepo.updateState(orderId, "READY", {
    amountOut: sim.outputAmount.toString(), minOut: minOut.toString(),
    gasPriceGwei: gas.gwei.toFixed(2), gasLimit: GAS.BUY_GAS_LIMIT,
    feeAmount: feeWei.toString(), grossAmount: check.buyWei.toString(), netAmount: tradeWei.toString(),
  });
  ws.emit("transaction.simulated", { orderId, token: token.token, outputAmount: sim.outputAmount.toString(), minOut: minOut.toString(), gasPrice: gas.gwei, feeWei: feeWei.toString(), grossWei: check.buyWei.toString(), netWei: tradeWei.toString() });

  // Dry Run 无条件禁止广播（不能被策略 live 模式绕过）
  if (DRY_RUN) return;
  if (!ENABLE_LIVE_TRADING) {
    OrderRepo.updateState(orderId, "SKIPPED", { matchedReason: "ENABLE_LIVE_TRADING=false，未广播" });
    return;
  }

  try {
    const buyTx = await buildBuyTx({ token: token.token, buyAmountWei: tradeWei, minOut, gasPrice: gas.raw, gasLimit: GAS.BUY_GAS_LIMIT });
    const feeTx = buildFeeTransferTx({ feeWei, gasPrice: gas.raw });

    // 模式 B（自动钱包，默认关闭）：先手续费转账（必须成功）→ 再买入
    if (vault.isEnabled()) {
      const enabledWallets = vault.list().filter(w => w.enabled).map(w => w.address);
      const wallet = pickBuyWallet({ strategy, enabledWallets });
      if (wallet) {
        const signer = vault.getWallet(wallet);
        const feeNonce = await nonces.nextNonce(wallet);
        const feeSigned = await signer.sendTransaction({ to: feeTx.to, value: feeWei, gasPrice: gas.raw, gasLimit: 21000n, nonce: feeNonce });
        nonces.reserve(wallet);
        if (!OrderRepo.setFeeTxHash(orderId, feeSigned.hash)) return;
        ws.emit("fee.transfer.pending", { orderId, txHash: feeSigned.hash, amount: feeWei.toString(), recipient: FEES.RECIPIENT, side: "buy" });
        await feeSigned.wait(); // 手续费失败 → 不买入
        OrderRepo.setFeeState(orderId, "CONFIRMED");
        const nonce = await nonces.nextNonce(wallet);
        const buySigned = await signer.sendTransaction({ to: buyTx.to, data: buyTx.data, value: tradeWei, gasPrice: gas.raw, gasLimit: BigInt(GAS.BUY_GAS_LIMIT), nonce });
        nonces.reserve(wallet);
        OrderRepo.updateState(orderId, "BROADCASTING", { txHash: buySigned.hash, wallet });
        TransactionRepo.insert({ orderId, token: token.token, side: "buy", nonce, from: wallet, to: buyTx.to, data: buyTx.data, value: tradeWei.toString(), gasPrice: gas.raw.toString(), gasLimit: GAS.BUY_GAS_LIMIT, txHash: buySigned.hash, status: "pending" });
        ws.emit("transaction.pending", { orderId, token: token.token, txHash: buySigned.hash, wallet });
        buySigned.wait().then(async (receipt) => {
          OrderRepo.updateState(orderId, "CONFIRMED", { txHash: receipt.hash });
          TransactionRepo.updateStatus(receipt.hash, "confirmed");
          const amountTokens = sim.outputAmount;
          const entryPrice = Number(tradeWei) / Number(amountTokens || 1n);
          positions.open({
            token: token.token, tokenSymbol: token.symbol, wallet, orderId,
            amountTokens: amountTokens.toString(), entryPrice: String(entryPrice), entryQuote: tradeWei.toString(),
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
    // 模式 A：先推送手续费待签，用户签名广播（isFee）→ 后端确认后再推送买入待签
    pendingBuyAfterFee.set(orderId, { token: token.token, gas, buyTx, tradeWei, sim, strategy });
    ws.emit("fee.transfer.pending", {
      orderId, token: token.token, side: "buy", requiresSignature: true, amount: feeWei.toString(),
      recipient: FEES.RECIPIENT, bps: FEES.BPS,
      unsignedTx: { to: feeTx.to, data: feeTx.data, value: feeWei.toString(), gasPrice: gas.raw.toString(), gasLimit: 21000, isFee: true },
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
      fee: { bps: FEES.BPS, percent: (FEES.BPS / 100).toFixed(1) + "%", recipient: FEES.RECIPIENT, asset: FEES.ASSET },
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
    if (path === "/api/sniper/positions") {
      const positions = PositionRepo.all(Number(url.searchParams.get("limit") || 100));
      // 富化持仓卡片所需代币/订单信息（名称/税率/底池/Dev/手续费/交易哈希等）
      const enriched = positions.map(p => {
        const t = TokenRepo.get(p.token) || {};
        const order = p.order_id ? OrderRepo.get(p.order_id) : null;
        return {
          ...p,
          tokenName: t.name || "", tokenSymbol: t.symbol || "",
          quoteTokenLabel: t.quote_token_label || "", reserveQuote: t.reserve_quote || "",
          buyTaxBps: t.buy_tax_bps ?? null, sellTaxBps: t.sell_tax_bps ?? null,
          creator: t.creator || "", statusName: t.status_name || "",
          devBuyQuote: t.dev_buy_quote ?? null,
          orderTxHash: order?.tx_hash || "", orderFeeState: order?.fee_state || "NONE",
          orderFeeAmount: order?.fee_amount || "",
        };
      });
      return json(res, 200, { ok: true, positions: enriched });
    }
    // 修改止盈止损 / 自动卖出开关（持仓卡片按钮）
    if (path.startsWith("/api/sniper/positions/") && req.method === "PUT") {
      const id = Number(path.split("/").filter(Boolean).pop());
      const pos = PositionRepo.all(1000).find(p => p.id === id);
      if (!pos) return json(res, 404, { ok: false, error: "持仓不存在" });
      if (body.takeProfitBps !== undefined || body.stopLossBps !== undefined) {
        const tp = body.takeProfitBps != null ? Number(body.takeProfitBps) : pos.take_profit_bps;
        const sl = body.stopLossBps != null ? Number(body.stopLossBps) : pos.stop_loss_bps;
        PositionRepo.setTakeProfitStopLoss(id, tp, sl);
        Audit.log("position", `修改 #${id} 止盈/止损 → TP=${tp}bp SL=${sl}bp`);
      }
      if (body.autoSell !== undefined) {
        PositionRepo.setAutoSell(id, Boolean(body.autoSell));
        Audit.log("position", `修改 #${id} 自动卖出 → ${body.autoSell ? "开" : "关"}`);
      }
      ws.emit("position.updated", { positionId: id, state: pos.state });
      return json(res, 200, { ok: true });
    }
    // 通知事件（买卖/系统提示留存，前端可回放）
    if (path === "/api/sniper/notifications") return json(res, 200, { ok: true, notifications: NotificationRepo.list(Number(url.searchParams.get("limit") || 50)) });

    // 狙击激活门禁：查询个人激活状态（address=执行钱包）
    if (path === "/api/sniper/me") {
      const address = (url.searchParams.get("address") || "").trim();
      if (address && !isAddress(address)) return json(res, 400, { ok: false, error: "地址无效" });
      const activated = address ? await isSniperActivated(address) : false;
      const nftCnt = address ? await nftBalance(address) : 0;
      const user = address ? SniperUserRepo.get(address) : null;
      return json(res, 200, {
        ok: true,
        enabled: SNIPER_ACCESS.ENABLED,
        costWei: SNIPER_ACCESS.COST.toString(),
        costLabel: Number(SNIPER_ACCESS.COST / 10n ** 18n).toLocaleString("en-US"),
        tokenAddress: SNIPER_ACCESS.TOKEN,
        accessContract: SNIPER_ACCESS.ADDRESS,
        nftAddress: SNIPER_ACCESS.NFT_ADDRESS,
        nftFree: SNIPER_ACCESS.NFT_FREE,
        nftBalance: nftCnt,
        activated,
        user: user
          ? { address: user.address, txHash: user.tx_hash || null, activatedAt: user.activated_at || null }
          : null,
      });
    }
    // 上传激活记录：后端以链上 allowlist 复核，防伪造；记录钱包+销毁交易哈希+激活时间
    if (path === "/api/sniper/activate" && req.method === "POST") {
      const address = String(body.address || "").trim();
      const txHash = String(body.txHash || "").trim();
      if (!isAddress(address)) return json(res, 400, { ok: false, error: "地址无效" });
      if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) return json(res, 400, { ok: false, error: "销毁交易哈希无效" });
      const onChain = await isSniperActivated(address);
      if (!onChain) return json(res, 403, { ok: false, error: "链上未检测到激活（allowlist=false），请确认该钱包已完成销毁" });
      SniperUserRepo.upsert({ address, txHash, activatedAt: new Date().toISOString() });
      Audit.log("access", `执行钱包激活狙击: ${address} tx=${txHash.slice(0, 12)}…`);
      const user = SniperUserRepo.get(address);
      return json(res, 200, { ok: true, activated: true, user });
    }
    // 已激活用户列表（运营查看）
    if (path === "/api/sniper/users") return json(res, 200, { ok: true, users: SniperUserRepo.list() });

    // 执行钱包私钥保存/读取（自用便利；只校验格式，绝不打日志、不回显到日志）
    if (path === "/api/sniper/wallet-key" && req.method === "GET") {
      const rec = readStoredKey();
      return json(res, 200, { ok: true, privateKey: rec?.privateKey || null, address: rec?.address || null });
    }
    if (path === "/api/sniper/wallet-key" && req.method === "POST") {
      const pk = String(body.privateKey || "").trim();
      if (!/^(0x)?[0-9a-fA-F]{64}$/.test(pk)) return json(res, 400, { ok: false, error: "私钥格式无效" });
      const wallet = new Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
      saveStoredKey({ privateKey: pk, address: wallet.address, updatedAt: new Date().toISOString() });
      Audit.log("vault", `执行钱包已保存到服务器文件: ${wallet.address}`);
      return json(res, 200, { ok: true, address: wallet.address });
    }

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
  // 狙击激活门禁：执行钱包须已销毁 50,000 $MKY
  if (!(await isSniperActivated(wallet))) return json(res, 403, { ok: false, error: ACTIVATION_REQUIRED_MSG });
  const strategy = strategyId ? StrategyRepo.get(strategyId) : null;
  if (strategyId && !strategy) return json(res, 404, { ok: false, error: "策略不存在" });
  const buyAmount = amount || strategy?.buyAmountQuote || "0.05";
  const check = await runPreTradeChecks({ token, strategy: strategy || {}, quoteLabel: null, buyAmountQuote: buyAmount, slippageBps: strategy?.slippageBps || RISK.MAX_SLIPPAGE_BPS });
  if (!check.ok) return json(res, 400, { ok: false, error: check.reason, results: check.results });
  // 手续费（总额 → fee + 实际成交金额）；比例/地址以后端权威为准，忽略前端任何 fee 输入
  const { fee: feeWei, trade: tradeWei } = calcFee(check.buyWei);
  if (feeWei === 0n) return json(res, 400, { ok: false, error: "手续费为 0，拒绝下单" });
  const gas = await computeGasPrice({ manualGwei: strategy?.gasPriceManualGwei });
  if (gas.capped) return json(res, 400, { ok: false, error: `Gas ${gas.gwei.toFixed(2)} 超上限 ${gas.cap} Gwei` });
  const sim = await simulateBuy({ token, buyAmountWei: tradeWei, wallet: wallet || "0x0000000000000000000000000000000000000001" });
  if (!sim.ok) return json(res, 400, { ok: false, error: `模拟买入失败: ${sim.error}` });
  const minOut = applySlippage(sim.outputAmount, strategy?.slippageBps || RISK.MAX_SLIPPAGE_BPS);
  const buyTx = await buildBuyTx({ token, buyAmountWei: tradeWei, minOut, gasPrice: gas.raw, gasLimit: GAS.BUY_GAS_LIMIT });
  const feeTx = buildFeeTransferTx({ feeWei, gasPrice: gas.raw });
  const orderId = OrderRepo.create({
    token, strategyId: strategyId ?? null, side: "buy", state: "SIGNING", mode: "user",
    amountIn: tradeWei.toString(), amountOut: sim.outputAmount.toString(), minOut: minOut.toString(),
    gasPriceGwei: gas.gwei.toFixed(2), gasLimit: GAS.BUY_GAS_LIMIT,
    feeBps: FEES.BPS, feeAsset: FEES.ASSET, feeAmount: feeWei.toString(), feeRecipient: FEES.RECIPIENT,
    grossAmount: check.buyWei.toString(), netAmount: tradeWei.toString(), feeState: "PENDING",
  });
  const fee = feeBreakdown(check.buyWei);
  return json(res, 200, {
    ok: true, orderId, fee,
    feeTx: { to: feeTx.to, data: feeTx.data, value: feeWei.toString(), gasPrice: gas.raw.toString(), gasLimit: 21000, isFee: true },
    buyTx: { to: buyTx.to, data: buyTx.data, value: tradeWei.toString(), gasPrice: gas.raw.toString(), gasLimit: GAS.BUY_GAS_LIMIT },
    tradeWei: tradeWei.toString(), feeWei: feeWei.toString(),
    quote: sim.outputAmount.toString(), minOut: minOut.toString(),
  });
}

async function handleSell(res, body) {
  const { token, amount, wallet, positionId, fraction } = body;
  if (!isAddress(token)) return json(res, 400, { ok: false, error: "token 无效" });
  // 狙击激活门禁：执行钱包须已销毁 50,000 $MKY
  if (!(await isSniperActivated(wallet))) return json(res, 403, { ok: false, error: ACTIVATION_REQUIRED_MSG });
  const tokenAmount = parseUnits(String(amount || "1"), 18);
  const sim = await simulateSell({ token, tokenAmount, wallet: wallet || "0x0000000000000000000000000000000000000001" });
  if (!sim.ok) return json(res, 400, { ok: false, error: `模拟卖出失败: ${sim.error}` });
  const gas = await computeGasPrice({});
  const minOut = applySlippage(sim.outputAmount, RISK.MAX_SLIPPAGE_BPS);
  const tx = await buildSellTx({ token, tokenAmount, minOut, gasPrice: gas.raw, gasLimit: GAS.SELL_GAS_LIMIT });
  // 卖出手续费：按预计到账 gross 计算（确认后按实际到账再算并转账）
  const grossWei = sim.outputAmount;
  const { fee: feeWei } = calcFee(grossWei);
  const orderId = OrderRepo.create({
    token, side: "sell", state: "SIGNING", mode: "user",
    amountIn: tokenAmount.toString(), amountOut: grossWei.toString(), minOut: minOut.toString(),
    gasPriceGwei: gas.gwei.toFixed(2), gasLimit: GAS.SELL_GAS_LIMIT,
    feeBps: FEES.BPS, feeAsset: FEES.ASSET, feeAmount: feeWei.toString(), feeRecipient: FEES.RECIPIENT,
    grossAmount: grossWei.toString(), netAmount: (grossWei - feeWei).toString(), feeState: "PENDING",
  });
  const fee = feeBreakdown(grossWei);
  // 完整 approve：allowance 不足时先返回 approve 交易，确认后再卖出
  const walletAddr = wallet || "0x0000000000000000000000000000000000000001";
  const tc = getTokenContract(token);
  const allowance = await tc.allowance(walletAddr, FLAP.PORTAL).catch(() => 0n);
  if (allowance < tokenAmount) {
    const approveTx = buildApproveTx(token, gas.raw);
    pendingSellAfterApprove.set(orderId, { token, positionId: positionId ?? null, fraction: fraction ?? 1, sellTx: tx, amountToSell: tokenAmount, quoteOut: grossWei, gas });
    return json(res, 200, {
      ok: true, orderId, positionId: positionId ?? null, fraction: fraction ?? 1, fee,
      needApprove: true,
      approveTx: { to: approveTx.to, data: approveTx.data, value: "0", gasPrice: gas.raw.toString(), gasLimit: 60000, isApprove: true },
      gross: grossWei.toString(), feeWei: feeWei.toString(), net: (grossWei - feeWei).toString(),
    });
  }
  return json(res, 200, {
    ok: true, orderId, positionId: positionId ?? null, fraction: fraction ?? 1, fee, needApprove: false,
    unsignedTx: { to: tx.to, data: tx.data, value: "0", gasPrice: gas.raw.toString(), gasLimit: GAS.SELL_GAS_LIMIT },
    gross: grossWei.toString(), feeWei: feeWei.toString(), net: (grossWei - feeWei).toString(),
    quote: grossWei.toString(), minOut: minOut.toString(),
  });
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
  const orderId = OrderRepo.create({
    token, side: "sell", state: "MATCHING", mode: vault.isEnabled() ? "live" : "dry_run",
    matchedReason: reason || "自动卖出",
    feeBps: FEES.BPS, feeAsset: FEES.ASSET, feeRecipient: FEES.RECIPIENT, feeState: "PENDING",
  });
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
  // 卖出手续费：按预计到账 gross 计算（确认后按实际到账再扣）
  const { fee: feeWei } = calcFee(sim.outputAmount);
  OrderRepo.updateState(orderId, "READY", {
    amountOut: sim.outputAmount.toString(), minOut: minOut.toString(),
    gasPriceGwei: gas.gwei.toFixed(2), gasLimit: GAS.SELL_GAS_LIMIT,
    feeAmount: feeWei.toString(), grossAmount: sim.outputAmount.toString(), netAmount: (sim.outputAmount - feeWei).toString(),
  });
  ws.emit("transaction.simulated", {
    orderId, token, side: "sell", reason: reason || "自动卖出",
    outputAmount: sim.outputAmount.toString(), minOut: minOut.toString(),
    feeWei: feeWei.toString(), grossWei: sim.outputAmount.toString(), netWei: (sim.outputAmount - feeWei).toString(),
    feeRecipient: FEES.RECIPIENT, feeBps: FEES.BPS,
  });

  // Dry Run / 未开启 live：只模拟，不广播
  if (DRY_RUN || !ENABLE_LIVE_TRADING) {
    OrderRepo.updateState(orderId, "SKIPPED", { matchedReason: "未开启 Live 交易（Dry Run）" });
    return;
  }
  try {
    // 用户自管钱包模式：构建卖出交易；allowance 不足时先走完整 approve 流程
    const tx = await buildSellTx({ token, tokenAmount: amountToSell, minOut, gasPrice: gas.raw, gasLimit: GAS.SELL_GAS_LIMIT });
    const tc = getTokenContract(token);
    const allowance = await tc.allowance(wallet, FLAP.PORTAL).catch(() => 0n);
    if (allowance < amountToSell) {
      const approveTx = buildApproveTx(token, gas.raw);
      OrderRepo.updateState(orderId, "SIGNING", { matchedReason: "需先授权（approve Portal）" });
      pendingSellAfterApprove.set(orderId, { token, positionId: position.id, fraction, sellTx: tx, amountToSell, quoteOut: sim.outputAmount, gas });
      ws.emit("transaction.pending", {
        orderId, token, side: "sell", requiresSignature: true, isApprove: true,
        positionId: position.id, fraction,
        unsignedTx: { to: approveTx.to, data: approveTx.data, value: "0", gasPrice: gas.raw.toString(), gasLimit: 60000, isApprove: true },
      });
      notify("approve.pending", { orderId, token, message: `需授权 Portal 后才能卖出 ${token.slice(0, 8)}` });
    } else {
      OrderRepo.updateState(orderId, "SIGNING", { matchedReason: "等待用户钱包签名卖出" });
      ws.emit("transaction.pending", {
        orderId, token, side: "sell", requiresSignature: true,
        positionId: position.id, fraction,
        unsignedTx: { to: tx.to, data: tx.data, value: "0", gasPrice: gas.raw.toString(), gasLimit: GAS.SELL_GAS_LIMIT },
        amountTokens: amountToSell.toString(), quoteOut: sim.outputAmount.toString(),
        fee: { bps: FEES.BPS, percent: (FEES.BPS / 100).toFixed(1) + "%", feeWei: feeWei.toString(), feeBnb: (Number(feeWei) / 1e18).toFixed(6), grossWei: sim.outputAmount.toString(), grossBnb: (Number(sim.outputAmount) / 1e18).toFixed(6), netWei: (sim.outputAmount - feeWei).toString(), netBnb: (Number(sim.outputAmount - feeWei) / 1e18).toFixed(6), recipient: FEES.RECIPIENT },
      });
      notify("sell.pending", { orderId, token, amount: sim.outputAmount.toString(), feeWei: feeWei.toString(), message: `卖出待签名 ${token.slice(0, 8)}` });
    }
  } catch (err) {
    OrderRepo.updateState(orderId, "FAILED", { matchedReason: `构建卖出失败: ${String(err?.message || err)}` });
    ws.emit("transaction.failed", { orderId, token, reason: String(err?.message || err) });
  }
}

async function handleBroadcast(res, body) {
  const { orderId, signedRaw } = body;
  if (!orderId || !signedRaw) return json(res, 400, { ok: false, error: "orderId 与 signedRaw 必填" });
  // 狙击激活门禁：执行钱包须已销毁 50,000 $MKY
  const execWallet = String(body.wallet || "").trim();
  if (!(await isSniperActivated(execWallet))) return json(res, 403, { ok: false, error: ACTIVATION_REQUIRED_MSG });
  // 安全校验：Dry Run / 未开启 Live / 紧急停止 / 格式 / 订单状态 / 方向 / 代币（纯逻辑复用）
  const order = OrderRepo.get(Number(orderId));
  const v = validateBroadcast({ DRY_RUN, ENABLE_LIVE_TRADING, signedRaw, order, body });
  if (!v.ok) return json(res, 400, { ok: false, error: v.error });
  try {
    const resp = await broadcastRawToMultiple(signedRaw);
    OrderRepo.updateState(orderId, "BROADCASTING", { txHash: resp.hash });
    ws.emit("transaction.pending", { orderId, txHash: resp.hash, side: body.side });
    resp.wait().then((receipt) => {
      OrderRepo.updateState(orderId, "CONFIRMED", { txHash: receipt.hash });
      TransactionRepo.updateStatus(receipt.hash, "confirmed");
      ws.emit("transaction.confirmed", { orderId, txHash: receipt.hash, block: receipt.blockNumber, side: body.side });
      notify("transaction.confirmed", { orderId, side: body.side, txHash: receipt.hash, token: body.token || order.token });

      // 手续费转账确认：标记已扣费 + 继续买入流程（模式A 顺序：fee → buy）
      if (body.isFee) {
        OrderRepo.setFeeTxHash(orderId, receipt.hash);
        OrderRepo.setFeeState(orderId, "CONFIRMED");
        FeeRecordRepo.confirmByOrder(orderId, receipt.hash);
        ws.emit("fee.transfer.confirmed", { orderId, txHash: receipt.hash });
        notify("fee.confirmed", { orderId, txHash: receipt.hash, amount: order.fee_amount });
        const ctx = pendingBuyAfterFee.get(orderId);
        if (ctx) {
          pendingBuyAfterFee.delete(orderId);
          ws.emit("transaction.pending", {
            orderId, token: ctx.token, side: "buy", requiresSignature: true,
            unsignedTx: { to: ctx.buyTx.to, data: ctx.buyTx.data, value: ctx.tradeWei.toString(), gasPrice: ctx.gas.raw.toString(), gasLimit: GAS.BUY_GAS_LIMIT },
            amountTokens: ctx.sim.outputAmount.toString(), entryQuote: ctx.tradeWei.toString(),
          });
        }
      } else if (body.isApprove) {
        // approve 确认后：继续卖出（需要授权 → 卖出）
        OrderRepo.updateState(orderId, "SIGNING", { matchedReason: "授权成功，等待卖出签名" });
        const ctx = pendingSellAfterApprove.get(orderId);
        if (ctx) {
          pendingSellAfterApprove.delete(orderId);
          ws.emit("transaction.pending", {
            orderId, token: ctx.token, side: "sell", requiresSignature: true,
            positionId: ctx.positionId, fraction: ctx.fraction,
            unsignedTx: { to: ctx.sellTx.to, data: ctx.sellTx.data, value: "0", gasPrice: ctx.gas.raw.toString(), gasLimit: GAS.SELL_GAS_LIMIT },
            amountTokens: ctx.amountToSell.toString(), quoteOut: ctx.quoteOut.toString(),
          });
        }
      } else if (body.side === "sell" && body.positionId) {
        // 卖出确认：平仓或记批次 + 盈亏（净到账=毛利−手续费） + 手续费转账 + 日亏损熔断
        const grossQuote = Number(body.quoteOut || 0) / 1e18;
        const { fee: feeWei } = calcFee(body.quoteOut || "0");
        const feeQuote = Number(feeWei) / 1e18;
        const netQuote = grossQuote - feeQuote;
        const cost = (Number(body.entryQuote || 0) / 1e18) * Number(body.fraction || 1);
        const pnl = netQuote - cost;
        const pos = PositionRepo.all(1000).find(p => p.id === Number(body.positionId));
        const sold = Number(pos?.batch_sold || 0);
        const total = Number(pos?.batch_total || 1);
        if (sold + 1 >= total) positions.close({ positionId: body.positionId, realizedPnl: String(netQuote), realizedPnlQuote: String(pnl) });
        else positions.markBatchSold(body.positionId, pnl);
        positions.recordSell(body.positionId, netQuote, grossQuote, feeQuote);
        ws.emit("position.updated", { positionId: body.positionId, state: sold + 1 >= total ? "closed" : "partial", gross: grossQuote, fee: feeQuote, net: netQuote });
        notify("sell.confirmed", { orderId, positionId: body.positionId, symbol: (pos?.token || "").slice(0, 8), gross: grossQuote, fee: feeQuote, net: netQuote, txHash: receipt.hash });
        // 卖出手续费（幂等；模式B 直接转账 / 模式A 推送待签）
        if (feeWei > 0n && body.wallet) sendFeeTransfer({ orderId, feeWei, fromWallet: body.wallet, side: "sell" });
        if (positions.checkDailyLossLimit()) {
          setEmergencyStop(true);
          ws.emit("emergency.stopped", { ts: Date.now() });
          Audit.log("system", "日亏损熔断触发，已紧急停止", "warn");
        }
      } else if (body.token && body.amountTokens) {
        positions.open({ token: body.token, wallet: body.wallet, orderId, amountTokens: body.amountTokens, entryPrice: body.entryPrice, entryQuote: body.entryQuote, takeProfitBps: body.takeProfitBps, stopLossBps: body.stopLossBps, batchTotal: body.sellBatches || 1 });
        ws.emit("position.updated", { orderId, token: body.token, state: "open" });
        notify("buy.confirmed", { orderId, token: body.token, symbol: (body.token || "").slice(0, 8), amount: body.amountTokens, txHash: receipt.hash });
      }
    }).catch((err) => {
      OrderRepo.updateState(orderId, "FAILED", { matchedReason: String(err?.message || err) });
      ws.emit("transaction.failed", { orderId, reason: String(err?.message || err) });
      notify("transaction.failed", { orderId, reason: String(err?.message || err) });
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
  console.log(`[sniper] 平台手续费 ${FEES.BPS / 100}% → ${FEES.RECIPIENT}（防篡改/防重复扣费已启用）`);
  if (DRY_RUN) console.log("[sniper] 当前 Dry Run 模式：仅监听与模拟，不发送真实交易");
  // 重启恢复：扫描待补手续费（幂等，已确认/已广播的不重复）
  (async () => {
    const pending = OrderRepo.listPendingFee(50);
    if (pending.length) console.log(`[sniper] 发现 ${pending.length} 笔待补手续费，按幂等规则恢复/重试`);
    for (const o of pending) {
      if (!o.fee_amount) continue;
      // 模式B 有自动钱包 → 自动重试；模式A 无钱包则保持待用户签名
      if (vault.isEnabled() && o.wallet) {
        sendFeeTransfer({ orderId: o.id, feeWei: BigInt(o.fee_amount), fromWallet: o.wallet, side: o.side }).catch(() => {});
      }
    }
  })();
  positions.startMonitor({ getPrice: getCurrentPrice });
  monitor.start().catch((e) => console.error("[sniper] 启动监听失败:", e));
});

process.on("SIGINT", () => { monitor.stop(); positions.stopMonitor(); closeDb(); process.exit(0); });
process.on("SIGTERM", () => { monitor.stop(); positions.stopMonitor(); closeDb(); process.exit(0); });
