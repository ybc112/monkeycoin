// WebSocket 服务：向前端推送系统状态/代币/匹配/交易/持仓事件（支持延迟 attach）
import { WebSocketServer } from "ws";

export class SniperWsServer {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  attach(server) {
    this.wss = new WebSocketServer({ server, path: "/ws/sniper" });
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
      try { ws.send(JSON.stringify({ event: "system.status", data: { connected: true, ts: Date.now() } })); } catch { /* ignore */ }
    });
  }

  broadcast(event, data) {
    const msg = JSON.stringify({ event, data, ts: Date.now() });
    for (const ws of this.clients) {
      try { if (ws.readyState === 1) ws.send(msg); } catch { /* ignore */ }
    }
  }
  emit(event, data) { this.broadcast(event, data); }
  close() { try { this.wss?.close(); } catch { /* ignore */ } }
}
