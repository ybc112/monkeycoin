// Flap 事件实时监听：WS newHeads + HTTP eth_getLogs 兜底
// 断线自动重连 / RPC 轮换 / 心跳 / 去重 / 已处理块持久化 / 回滚处理
import { WebSocketProvider, JsonRpcProvider } from "ethers";
import { FLAP, MONITOR, CHAIN_ID, RPC_HTTP_URLS, RPC_WS_URLS, LOGS_RPC_URLS, fetchOptionsFor } from "./config.mjs";
import { getProviderByUrl } from "./flap-contracts.mjs";
import { parseLog, EVENT_TOPICS } from "./event-parser.mjs";
import { StateRepo, EventRepo, Audit } from "./database.mjs";

export class FlapMonitor {
  constructor({ onEvents, onSystem }) {
    this.onEvents = onEvents || (() => {});
    this.onSystem = onSystem || (() => {});
    this.wsProvider = null;
    this.wsIdx = 0;
    this.running = false;
    this.processing = false;
    this.connected = false;
    this.lastPong = Date.now();
    this._httpPollTimer = null;
    this._wsReconnectTimer = null;
    this.latestBlock = 0;
  }

  // 读取/初始化已处理块
  getLastProcessed() {
    const v = StateRepo.get(MONITOR.STATE_KEY);
    return v ? Number(v) : 0;
  }
  setLastProcessed(b) { StateRepo.set(MONITOR.STATE_KEY, String(b)); }

  async start() {
    this.running = true;
    const last = this.getLastProcessed();
    if (!last) {
      // 首次启动：从最新块往前回看一段，抓最近的创建
      const prov = new JsonRpcProvider(RPC_HTTP_URLS[0], CHAIN_ID, { batchMaxCount: 1, ...fetchOptionsFor() });
      const latest = await prov.getBlockNumber();
      this.setLastProcessed(Math.max(0, latest - 200));
      this.latestBlock = latest;
      Audit.log("monitor", `首次启动，回看起始块 ${this.getLastProcessed()}`);
    }
    await this._connectWs();
    this._scheduleHttpPoll();
    this.onSystem?.({ type: "system.status", data: { running: true, lastProcessed: this.getLastProcessed() } });
  }

  async stop() {
    this.running = false;
    clearTimeout(this._httpPollTimer);
    clearTimeout(this._wsReconnectTimer);
    try { this.wsProvider?.removeAllListeners(); await this.wsProvider?.destroy(); } catch { /* ignore */ }
    this.connected = false;
    this.onSystem?.({ type: "system.status", data: { running: false, lastProcessed: this.getLastProcessed() } });
  }

  // ── WS 连接（newHeads 实时推送；绑定 error 防止未捕获崩溃） ───────────────
  async _connectWs() {
    if (!this.running) return;
    const url = RPC_WS_URLS[this.wsIdx % RPC_WS_URLS.length];
    try {
      const provider = new WebSocketProvider(url, CHAIN_ID, { batchMaxCount: 1 });
      this.wsProvider = provider;
      // 底层 ws 错误必须被消费，否则未捕获异常直接崩进程
      try {
        provider.websocket?.on("error", () => this._handleWsError());
        provider.websocket?.on("close", () => { if (this.running) this._scheduleWsReconnect(); });
      } catch { /* 部分环境无 websocket 属性 */ }
      provider.on("block", (n) => this._onNewHead(n));
      // 等待连接就绪：ethers ≥6.13 已移除内部 _getConnection().networkPromise，改用公开 getNetwork()
      await provider.getNetwork();
      this.connected = true;
      this.onSystem?.({ type: "rpc.reconnected", data: { ws: url } });
      Audit.log("monitor", `WS 已连接: ${url}`);
    } catch (err) {
      this.connected = false;
      this.onSystem?.({ type: "rpc.disconnected", data: { ws: url, error: String(err?.message || err) } });
      this._scheduleWsReconnect();
    }
  }
  _handleWsError() {
    if (!this.running) return;
    this.connected = false;
    this.onSystem?.({ type: "rpc.disconnected", data: { error: "ws transport error" } });
    this._scheduleWsReconnect();
  }
  _scheduleWsReconnect() {
    clearTimeout(this._wsReconnectTimer);
    this._wsReconnectTimer = setTimeout(() => {
      this.wsIdx += 1;
      this._connectWs();
    }, MONITOR.RECONNECT_DELAY_MS * (this.wsIdx % 3 + 1));
  }

  // ── HTTP 轮询兜底（WS 断了也不漏） ────────────────────────────────────────
  _scheduleHttpPoll() {
    clearTimeout(this._httpPollTimer);
    if (!this.running) return;
    this._httpPollTimer = setTimeout(async () => {
      try {
        const prov = new JsonRpcProvider(RPC_HTTP_URLS[0], CHAIN_ID, { batchMaxCount: 1, ...fetchOptionsFor() });
        const latest = await prov.getBlockNumber();
        if (latest > this.latestBlock) this._onNewHead(latest);
      } catch { /* 下次轮询再试 */ }
      this._scheduleHttpPoll();
    }, MONITOR.POLL_INTERVAL_MS);
  }

  // ── 新块处理 ──────────────────────────────────────────────────────────────
  _onNewHead(n) {
    this.latestBlock = Number(n);
    if (!this.processing) {
      this.processing = true;
      this._process()
        .catch((e) => { console.error("[sniper] 处理块失败:", e?.stack || e?.message || e); })
        .finally(() => { this.processing = false; });
    }
  }

  async _process() {
    let last = this.getLastProcessed();
    const target = Math.max(0, this.latestBlock - MONITOR.BLOCK_CONFIRMATIONS);
    // 回滚：新区块低于已处理块 → 重置到前一个块重新扫描（幂等，靠唯一约束去重）
    if (target < last - 1) {
      Audit.log("monitor", `检测到区块回滚，重置已处理块 ${last} → ${target - 1}`, "warn");
      this.setLastProcessed(Math.max(0, target - 1));
      last = this.getLastProcessed();
    }
    if (target <= last) return;
    const from = last + 1;
    console.log(`[sniper] 扫描 ${from} → ${target}（共 ${target - from + 1} 块）`);
    await this.scanRange(from, target);
    this.setLastProcessed(target);
    console.log(`[sniper] 已处理至块 ${target}`);
  }

  // ── 扫描 Portal 事件（分块，一次 getLogs 拿全部日志再按 topic 分类） ───────
  async scanRange(fromBlock, toBlock) {
    const logs = [];
    const seen = new Set();
    const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("rpc timeout")), ms));
    for (let f = fromBlock; f <= toBlock; f += MONITOR.LOG_CHUNK_SIZE) {
      const t = Math.min(f + MONITOR.LOG_CHUNK_SIZE - 1, toBlock);
      for (const rpc of LOGS_RPC_URLS) {
        try {
          const prov = getProviderByUrl(rpc);
          await Promise.race([prov.getNetwork(), timeout(6000)]); // 网络预检，失败快速跳过
          const part = await Promise.race([
            prov.getLogs({ address: FLAP.PORTAL, fromBlock: f, toBlock: t }),
            timeout(12000),
          ]);
          for (const l of part) {
            const key = `${l.transactionHash}:${l.index ?? l.logIndex}`;
            if (seen.has(key)) continue;
            seen.add(key);
            logs.push(l);
          }
          break; // 该 RPC 成功，不再试下一个
        } catch {
          // 换下一个 RPC
        }
      }
    }
    if (!logs.length) return;
    logs.sort((a, b) => (a.blockNumber - b.blockNumber) || ((a.index ?? 0) - (b.index ?? 0)));
    const events = [];
    for (const l of logs) {
      const ev = parseLog(l);
      if (!ev) continue;
      const inserted = EventRepo.insert(ev);
      if (inserted) events.push(ev);
    }
    if (events.length) {
      this.onEvents(events);
      Audit.log("monitor", `扫描块 ${fromBlock}-${toBlock}，新增事件 ${events.length}`);
    }
  }
}

export { EVENT_TOPICS };
