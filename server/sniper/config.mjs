// Flap 内盘狙击 · 配置中心（唯一权威来源）
// 合约地址/ABI/事件均来自官方文档 docs.flap.sh 与主网验证实现（2026-08），禁止猜测替换
import "dotenv/config";

const env = process.env;

// ── 链与 RPC ────────────────────────────────────────────────────────────────
export const CHAIN_ID = Number(env.CHAIN_ID || 56);
export const RPC_HTTP_URLS = [
  env.RPC_HTTP_URL || "https://bsc-rpc.publicnode.com",
  env.BACKUP_RPC_HTTP_URL || "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.bnbchain.org",
].filter(Boolean);

// eth_getLogs 友好 RPC（复用 HTTP 主/备 RPC，避免额外不稳定网关）
export const LOGS_RPC_URLS = [
  env.LOGS_RPC_URL || "",
  ...RPC_HTTP_URLS,
].filter(Boolean);

// WebSocket RPC（用于 newHeads 实时推送）
export const RPC_WS_URLS = [
  env.RPC_WS_URL || "wss://bsc.publicnode.com",
  env.BACKUP_RPC_WS_URL || "wss://bsc-mainnet-rpc.allthatnode.com/ws/1r1XxrHxYYRjCUuXoNqXLDLTjZkTMLQH",
].filter(Boolean);

// ── Flap 官方部署地址（BNB 主网，docs.flap.sh/deployed-contract-addresses） ──
export const FLAP = {
  // Portal：代币创建 + bonding curve 内盘交易入口（主网实测 version=v5.16.1）
  PORTAL: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
  // Token 实现模板（CREATE2 靓号后缀）
  TOKEN_IMPL: {
    STANDARD: "0x8b4329947e34b6d56d71a3385cac122bade7d78d", // 8888
    TAX_V3: "0x024f18294970B5c76c0691b87f138A0317156422", // 7777（主网当前唯一可用的 tax 路径）
  },
  // 毕业迁移到 PancakeSwap V2
  DEX: {
    ROUTER_V2: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    FACTORY_V2: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  },
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  PROTOCOL_FEE_BPS: 100, // Flap 内盘交易固定 1% 协议费
  MAX_TX_GAS: 15_000_000n, // 公共网关原始交易 gas 上限 16,777,216
  DEFAULT_SLIPPAGE_BPS: 300,
};

// ── Token 状态枚举（IPortal.sol 精确顺序，勿改） ────────────────────────────
export const TOKEN_STATUS = {
  INVALID: 0,
  TRADABLE: 1, // bonding curve 内盘可交易
  IN_DUEL: 2,
  KILLED: 3,
  DEX: 4, // 已迁移到 DEX
  STAGED: 5,
};
export const TOKEN_STATUS_NAMES = ["无效", "内盘可交易", "对战中", "已封禁", "已上 DEX", "待激活"];

// ── 服务端口 ────────────────────────────────────────────────────────────────
export const SNIPER_PORT = Number(env.SNIPER_PORT || 3001);
export const CORS_ORIGIN = (env.SNIPER_CORS_ORIGIN || "https://monkeycoin.top").split(",").map(s => s.trim());

// ── 交易模式（安全默认：绝不自动发真交易） ───────────────────────────────────
export const DRY_RUN = env.DRY_RUN !== "false"; // 默认 true
export const ENABLE_LIVE_TRADING = env.ENABLE_LIVE_TRADING === "true"; // 默认 false

// ── Gas 策略 ────────────────────────────────────────────────────────────────
export const GAS = {
  AUTO_GAS: env.AUTO_GAS !== "false",
  GAS_MULTIPLIER: Number(env.GAS_MULTIPLIER || 1.2),
  MAX_GAS_PRICE_GWEI: Number(env.MAX_GAS_PRICE_GWEI || 8),
  BUY_GAS_LIMIT: Number(env.BUY_GAS_LIMIT || 1_200_000),
  SELL_GAS_LIMIT: Number(env.SELL_GAS_LIMIT || 1_000_000),
  TRANSACTION_DEADLINE_SECONDS: Number(env.TRANSACTION_DEADLINE_SECONDS || 30),
};

// ── 风控限额 ────────────────────────────────────────────────────────────────
export const RISK = {
  MAX_SLIPPAGE_BPS: Number(env.MAX_SLIPPAGE_BPS || 500),
  MAX_BUY_AMOUNT_BNB: Number(env.MAX_BUY_AMOUNT_BNB || 0.05),
  DAILY_BUY_LIMIT_BNB: Number(env.DAILY_BUY_LIMIT_BNB || 0.5),
  DAILY_LOSS_LIMIT_BNB: Number(env.DAILY_LOSS_LIMIT_BNB || 0.2),
  MAX_POSITIONS: Number(env.MAX_POSITIONS || 10),
  MAX_WALLETS: 10,
};

// ── 监听参数 ────────────────────────────────────────────────────────────────
export const MONITOR = {
  BLOCK_CONFIRMATIONS: Number(env.BLOCK_CONFIRMATIONS || 3), // 确认数后再入库
  POLL_INTERVAL_MS: Number(env.POLL_INTERVAL_MS || 4000), // HTTP 轮询兜底
  WS_HEARTBEAT_MS: Number(env.WS_HEARTBEAT_MS || 15_000),
  RECONNECT_DELAY_MS: Number(env.RECONNECT_DELAY_MS || 3000),
  LOG_CHUNK_SIZE: Number(env.LOG_CHUNK_SIZE || 500), // eth_getLogs 块跨度
  STATE_KEY: "flap_sniper_last_processed_block",
};

// ── 数据库 ──────────────────────────────────────────────────────────────────
export const DB_PATH = env.DATABASE_URL && env.DATABASE_URL.startsWith("file:")
  ? env.DATABASE_URL.slice("file:".length)
  : (env.DATABASE_URL || "server/sniper/data/flap-sniper.db");
export const DB_FALLBACK_JSON = "server/sniper/data/flap-sniper.json"; // 无 node:sqlite 时的回退

// ── 自动执行钱包（模式 B，默认关闭） ────────────────────────────────────────
export const WALLET_VAULT = {
  ENABLED: env.ENABLE_AUTO_WALLETS === "true", // 默认 false
  // 主密钥仅从操作系统级来源读取，绝不与密文同库；加密算法 AES-256-GCM
  MASTER_KEY_HEX: env.WALLET_VAULT_MASTER_KEY_HEX || "",
  MAX_BALANCE_BNB: Number(env.WALLET_MAX_BALANCE_BNB || 0.2), // 单钱包资金上限
};
