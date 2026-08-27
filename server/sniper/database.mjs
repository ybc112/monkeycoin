// SQLite 持久化（Node ≥22.5 内置 node:sqlite；不可用时回退 JSON 文件）
// 私钥绝不入库：钱包表只存公钥地址与元数据
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DB_PATH, DB_FALLBACK_JSON } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ABS_DB = path.isAbsolute(DB_PATH) ? DB_PATH : path.resolve(__dirname, "..", "..", DB_PATH);
const ABS_JSON = path.isAbsolute(DB_FALLBACK_JSON)
  ? DB_FALLBACK_JSON
  : path.resolve(__dirname, "..", "..", DB_FALLBACK_JSON);

let sqlite = null;
let db = null;
try {
  fs.mkdirSync(path.dirname(ABS_DB), { recursive: true });
  sqlite = await import("node:sqlite");
  db = new sqlite.DatabaseSync(ABS_DB);
} catch (err) {
  console.warn(`[sniper] node:sqlite 不可用，回退 JSON 存储: ${err.message}`);
  db = null;
}

if (db) {
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'dry_run',        -- dry_run | live
      platform TEXT NOT NULL DEFAULT 'flap',
      quote_tokens TEXT NOT NULL DEFAULT '["BNB"]',-- 底池币种 BNB|USDT|other
      pool_min_quote TEXT,                          -- 初始底池不低于（quote 小数）
      pool_max_quote TEXT,
      dev_buy_min TEXT,                             -- Dev 首买不低于（quote 小数）
      dev_buy_max TEXT,
      max_buy_tax_bps INTEGER,
      max_sell_tax_bps INTEGER,
      buy_amount_quote TEXT,                        -- 每代币买入金额（quote 小数）
      buy_amount_per_wallet TEXT,
      allow_multi_wallet INTEGER NOT NULL DEFAULT 1,
      max_positions INTEGER,
      take_profit_bps INTEGER,
      stop_loss_bps INTEGER,
      sell_batches INTEGER,
      max_tx_bps INTEGER,
      max_wallet_bps INTEGER,
      gas_price_manual_gwei REAL,
      gas_multiplier REAL,
      max_gas_price_gwei REAL,
      slippage_bps INTEGER NOT NULL DEFAULT 500,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS strategy_conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
      cond_type TEXT NOT NULL,   -- exclude_symbol|include_symbol|dev_address|exclude_dev|factory_vault|tax
      operator TEXT,             -- eq|gt|gte|lt|lte|range|contains
      value TEXT,
      value2 TEXT
    );
    CREATE TABLE IF NOT EXISTS flap_tokens (
      address TEXT PRIMARY KEY,
      name TEXT,
      symbol TEXT,
      meta TEXT,
      creator TEXT,
      quote_token_address TEXT,
      quote_token_label TEXT DEFAULT 'BNB',
      reserve_quote TEXT,
      circulating_supply TEXT,
      price TEXT,
      status INTEGER,
      status_name TEXT,
      buy_tax_bps INTEGER,
      sell_tax_bps INTEGER,
      pool TEXT,
      progress TEXT,
      created_block INTEGER,
      created_at TEXT,
      first_seen_at TEXT
    );
    CREATE TABLE IF NOT EXISTS token_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      kind TEXT NOT NULL,        -- created|bought|sold|launched_dex|progress
      block_number INTEGER,
      tx_hash TEXT,
      log_index INTEGER,
      data TEXT,
      created_at TEXT,
      UNIQUE(token, kind, block_number, tx_hash, log_index)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      strategy_id INTEGER,
      side TEXT NOT NULL,                 -- buy|sell
      state TEXT NOT NULL,                -- 状态机
      matched_reason TEXT,
      amount_in TEXT,
      amount_out TEXT,
      min_out TEXT,
      gas_price_gwei TEXT,
      gas_limit INTEGER,
      tx_hash TEXT,
      wallet TEXT,
      mode TEXT,                          -- dry_run|live
      is_simulated INTEGER DEFAULT 0,
      sim_result TEXT,
      fee_bps INTEGER DEFAULT 0,          -- 平台手续费 bps（0=未启用/不适用）
      fee_asset TEXT DEFAULT 'BNB',
      fee_amount TEXT,                    -- 手续费金额 wei
      fee_recipient TEXT,                 -- 手续费接收地址（后端权威，前端不可改）
      gross_amount TEXT,                  -- 交易总额 wei
      net_amount TEXT,                    -- 扣除手续费后的实际成交金额 wei
      fee_tx_hash TEXT,                   -- 手续费转账交易哈希
      fee_state TEXT DEFAULT 'NONE',      -- NONE|PENDING|SENT|CONFIRMED|FAILED|RETRYING
      fee_error TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      token TEXT,
      side TEXT,
      nonce INTEGER,
      from_addr TEXT,
      to_addr TEXT,
      data TEXT,
      value TEXT,
      gas_price TEXT,
      gas_limit INTEGER,
      signed_raw TEXT,           -- 模式B签名后的 raw tx（内存/加密，非明文长期保存）
      status TEXT,               -- pending|confirmed|failed|dropped
      tx_hash TEXT,
      broadcast_at TEXT,
      confirmed_at TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      wallet TEXT,
      order_id INTEGER,
      side TEXT DEFAULT 'long',
      state TEXT DEFAULT 'open',        -- open|closed
      amount_tokens TEXT,
      entry_price TEXT,
      entry_quote TEXT,
      current_price TEXT,
      take_profit_bps INTEGER,
      stop_loss_bps INTEGER,
      batch_total INTEGER DEFAULT 1,
      batch_sold INTEGER DEFAULT 0,
      realized_pnl TEXT,
      realized_pnl_quote TEXT,
      opened_at TEXT,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS wallet_public_profiles (
      address TEXT PRIMARY KEY,
      label TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      max_balance_quote TEXT,
      last_balance TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS system_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      level TEXT,
      category TEXT,
      message TEXT
    );
  `);
  // 旧库字段迁移（幂等）
  const ensureColumn = (table, column, ddl) => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    } catch { /* ignore */ }
  };
  [
    ["strategies", "take_profit_bps", "INTEGER"],
    ["strategies", "stop_loss_bps", "INTEGER"],
    ["strategies", "sell_batches", "INTEGER"],
    ["strategies", "max_tx_bps", "INTEGER"],
    ["strategies", "max_wallet_bps", "INTEGER"],
    ["positions", "take_profit_bps", "INTEGER"],
    ["positions", "stop_loss_bps", "INTEGER"],
    ["positions", "batch_total", "INTEGER DEFAULT 1"],
    ["positions", "batch_sold", "INTEGER DEFAULT 0"],
    ["orders", "fee_bps", "INTEGER DEFAULT 0"],
    ["orders", "fee_asset", "TEXT DEFAULT 'BNB'"],
    ["orders", "fee_amount", "TEXT"],
    ["orders", "fee_recipient", "TEXT"],
    ["orders", "gross_amount", "TEXT"],
    ["orders", "net_amount", "TEXT"],
    ["orders", "fee_tx_hash", "TEXT"],
    ["orders", "fee_state", "TEXT DEFAULT 'NONE'"],
    ["orders", "fee_error", "TEXT"],
  ].forEach(([t, c, d]) => ensureColumn(t, c, d));
}

// ── JSON 回退实现 ───────────────────────────────────────────────────────────
const jsonStore = {};
function loadJson() {
  try {
    if (fs.existsSync(ABS_JSON)) return JSON.parse(fs.readFileSync(ABS_JSON, "utf8"));
  } catch { /* ignore */ }
  return { _tables: {} };
}
function saveJson() {
  try {
    fs.mkdirSync(path.dirname(ABS_JSON), { recursive: true });
    fs.writeFileSync(ABS_JSON, JSON.stringify(jsonStore, null, 2));
  } catch { /* ignore */ }
}
if (!db) Object.assign(jsonStore, loadJson());

const now = () => new Date().toISOString();

// 通用：执行 SQL 并返回结果
function run(sql, params = []) {
  if (db) return db.prepare(sql).run(...params);
  // JSON 回退：仅支持本模块内使用的少量 SQL 形态
  const m = /^INSERT INTO (\w+)/i.exec(sql);
  if (m) {
    const table = m[1];
    jsonStore._tables[table] = jsonStore._tables[table] || [];
    const row = params.reduce((acc, p, i) => { acc[`c${i}`] = p; return acc; }, {});
    jsonStore._tables[table].push(row);
    saveJson();
    return { changes: 1 };
  }
  return { changes: 0 };
}
function all(sql, params = []) {
  if (db) return db.prepare(sql).all(...params);
  const m = /FROM (\w+)/i.exec(sql);
  if (m) return jsonStore._tables[m[1]] || [];
  return [];
}
function get(sql, params = []) {
  if (db) return db.prepare(sql).get(...params);
  const rows = all(sql, params);
  return rows[0];
}

// ── 策略 ────────────────────────────────────────────────────────────────────
export const StrategyRepo = {
  create(data) {
    const r = run(
      `INSERT INTO strategies (name,enabled,mode,platform,quote_tokens,pool_min_quote,pool_max_quote,
        dev_buy_min,dev_buy_max,max_buy_tax_bps,max_sell_tax_bps,buy_amount_quote,buy_amount_per_wallet,
        allow_multi_wallet,max_positions,take_profit_bps,stop_loss_bps,sell_batches,max_tx_bps,max_wallet_bps,
        gas_price_manual_gwei,gas_multiplier,max_gas_price_gwei,slippage_bps,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [data.name, data.enabled ? 1 : 0, data.mode || "dry_run", data.platform || "flap",
        JSON.stringify(data.quoteTokens || ["BNB"]), data.poolMinQuote ?? null, data.poolMaxQuote ?? null,
        data.devBuyMin ?? null, data.devBuyMax ?? null, data.maxBuyTaxBps ?? null, data.maxSellTaxBps ?? null,
        data.buyAmountQuote ?? null, data.buyAmountPerWallet ?? null, data.allowMultiWallet === false ? 0 : 1,
        data.maxPositions ?? null, data.takeProfitBps ?? null, data.stopLossBps ?? null, data.sellBatches ?? null,
        data.maxTxBps ?? null, data.maxWalletBps ?? null,
        data.gasPriceManualGwei ?? null, data.gasMultiplier ?? null, data.maxGasPriceGwei ?? null,
        data.slippageBps || 500, now(), now()]);
    const id = db ? Number(r.lastInsertRowid) : ((jsonStore._tables.strategies || []).length);
    if (Array.isArray(data.conditions)) {
      for (const c of data.conditions) run(
        `INSERT INTO strategy_conditions (strategy_id,cond_type,operator,value,value2) VALUES (?,?,?,?,?)`,
        [id, c.type, c.operator || null, c.value ?? null, c.value2 ?? null]);
    }
    return id;
  },
  list() {
    const rows = all(`SELECT * FROM strategies ORDER BY id DESC`);
    return rows.map(r => {
      const conds = all(`SELECT * FROM strategy_conditions WHERE strategy_id=?`, [r.id])
        .map(c => ({ type: c.cond_type, operator: c.operator, value: c.value, value2: c.value2 }));
      return { ...r, quoteTokens: JSON.parse(r.quote_tokens || "[]"), conditions: conds, enabled: !!r.enabled };
    });
  },
  get(id) { return StrategyRepo.list().find(s => Number(s.id) === Number(id)); },
  update(id, data) {
    if (db) {
      db.prepare(`UPDATE strategies SET name=?,enabled=?,mode=?,quote_tokens=?,pool_min_quote=?,pool_max_quote=?,
        dev_buy_min=?,dev_buy_max=?,max_buy_tax_bps=?,max_sell_tax_bps=?,buy_amount_quote=?,buy_amount_per_wallet=?,
        allow_multi_wallet=?,max_positions=?,take_profit_bps=?,stop_loss_bps=?,sell_batches=?,max_tx_bps=?,max_wallet_bps=?,
        gas_price_manual_gwei=?,gas_multiplier=?,max_gas_price_gwei=?,slippage_bps=?,updated_at=? WHERE id=?`).run(
        data.name, data.enabled ? 1 : 0, data.mode || "dry_run", JSON.stringify(data.quoteTokens || ["BNB"]),
        data.poolMinQuote ?? null, data.poolMaxQuote ?? null, data.devBuyMin ?? null, data.devBuyMax ?? null,
        data.maxBuyTaxBps ?? null, data.maxSellTaxBps ?? null, data.buyAmountQuote ?? null,
        data.buyAmountPerWallet ?? null, data.allowMultiWallet === false ? 0 : 1, data.maxPositions ?? null,
        data.takeProfitBps ?? null, data.stopLossBps ?? null, data.sellBatches ?? null, data.maxTxBps ?? null, data.maxWalletBps ?? null,
        data.gasPriceManualGwei ?? null, data.gasMultiplier ?? null, data.maxGasPriceGwei ?? null,
        data.slippageBps || 500, now(), id);
      db.prepare(`DELETE FROM strategy_conditions WHERE strategy_id=?`).run(id);
      if (Array.isArray(data.conditions)) for (const c of data.conditions) run(
        `INSERT INTO strategy_conditions (strategy_id,cond_type,operator,value,value2) VALUES (?,?,?,?,?)`,
        [id, c.type, c.operator || null, c.value ?? null, c.value2 ?? null]);
    }
  },
  delete(id) { run(`DELETE FROM strategies WHERE id=?`, [id]); },
  enabled() { return StrategyRepo.list().filter(s => s.enabled); },
};

// ── 代币 ────────────────────────────────────────────────────────────────────
export const TokenRepo = {
  upsert(t) {
    const r = get(`SELECT * FROM flap_tokens WHERE address=?`, [t.address]);
    if (r) run(
      `UPDATE flap_tokens SET name=?,symbol=?,meta=?,creator=?,quote_token_address=?,quote_token_label=?,
        reserve_quote=?,circulating_supply=?,price=?,status=?,status_name=?,buy_tax_bps=?,sell_tax_bps=?,
        pool=?,progress=?,created_block=? WHERE address=?`,
      [t.name, t.symbol, t.meta ?? "", t.creator, t.quoteTokenAddress, t.quoteTokenLabel || "BNB",
        t.reserveQuote, t.circulatingSupply, t.price, t.status, t.statusName, t.buyTaxBps, t.sellTaxBps,
        t.pool ?? "", t.progress, t.createdBlock, t.address]);
    else run(
      `INSERT INTO flap_tokens (address,name,symbol,meta,creator,quote_token_address,quote_token_label,
        reserve_quote,circulating_supply,price,status,status_name,buy_tax_bps,sell_tax_bps,pool,progress,
        created_block,created_at,first_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [t.address, t.name, t.symbol, t.meta ?? "", t.creator, t.quoteTokenAddress, t.quoteTokenLabel || "BNB",
        t.reserveQuote, t.circulatingSupply, t.price, t.status, t.statusName, t.buyTaxBps, t.sellTaxBps,
        t.pool ?? "", t.progress, t.createdBlock, now(), now()]);
  },
  list(limit = 50) { return all(`SELECT * FROM flap_tokens ORDER BY created_block DESC LIMIT ?`, [limit]); },
  get(address) { return get(`SELECT * FROM flap_tokens WHERE lower(address)=lower(?)`, [address]); },
};

// ── 事件（去重） ────────────────────────────────────────────────────────────
export const EventRepo = {
  insert(ev) {
    if (get(`SELECT id FROM token_events WHERE token=? AND kind=? AND block_number=? AND tx_hash=? AND log_index=?`,
      [ev.token, ev.kind, ev.blockNumber, ev.txHash, ev.logIndex])) return false;
    run(`INSERT INTO token_events (token,kind,block_number,tx_hash,log_index,data,created_at) VALUES (?,?,?,?,?,?,?)`,
      [ev.token, ev.kind, ev.blockNumber, ev.txHash, ev.logIndex, JSON.stringify(ev.data || {}), now()]);
    return true;
  },
  list(token, limit = 100) { return all(`SELECT * FROM token_events WHERE lower(token)=lower(?) ORDER BY id DESC LIMIT ?`, [token, limit]); },
};

// ── 订单 / 交易 / 持仓 ──────────────────────────────────────────────────────
export const OrderRepo = {
  create(o) {
    const r = run(`INSERT INTO orders (token,strategy_id,side,state,matched_reason,amount_in,amount_out,min_out,
      gas_price_gwei,gas_limit,tx_hash,wallet,mode,is_simulated,sim_result,
      fee_bps,fee_asset,fee_amount,fee_recipient,gross_amount,net_amount,fee_tx_hash,fee_state,fee_error,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [o.token, o.strategyId ?? null, o.side, o.state, o.matchedReason ?? "", o.amountIn ?? null, o.amountOut ?? null,
        o.minOut ?? null, o.gasPriceGwei ?? null, o.gasLimit ?? null, o.txHash ?? null, o.wallet ?? null,
        o.mode || "dry_run", o.isSimulated ? 1 : 0, o.simResult ? JSON.stringify(o.simResult) : null,
        o.feeBps ?? 0, o.feeAsset || "BNB", o.feeAmount ?? null, o.feeRecipient ?? null,
        o.grossAmount ?? null, o.netAmount ?? null, o.feeTxHash ?? null, o.feeState || "NONE", o.feeError ?? null,
        now(), now()]);
    return db ? Number(r.lastInsertRowid) : 0;
  },
  updateState(id, state, extra = {}) {
    const sets = ["state=?", "updated_at=?"];
    const vals = [state, now()];
    if (extra.txHash) { sets.push("tx_hash=?"); vals.push(extra.txHash); }
    if (extra.amountOut) { sets.push("amount_out=?"); vals.push(extra.amountOut); }
    if (extra.gasPriceGwei) { sets.push("gas_price_gwei=?"); vals.push(extra.gasPriceGwei); }
    if (extra.gasLimit) { sets.push("gas_limit=?"); vals.push(extra.gasLimit); }
    if (extra.matchedReason !== undefined) { sets.push("matched_reason=?"); vals.push(extra.matchedReason); }
    if (extra.amountIn) { sets.push("amount_in=?"); vals.push(extra.amountIn); }
    if (extra.minOut) { sets.push("min_out=?"); vals.push(extra.minOut); }
    if (extra.wallet) { sets.push("wallet=?"); vals.push(extra.wallet); }
    if (extra.feeAmount) { sets.push("fee_amount=?"); vals.push(extra.feeAmount); }
    if (extra.netAmount) { sets.push("net_amount=?"); vals.push(extra.netAmount); }
    if (extra.grossAmount) { sets.push("gross_amount=?"); vals.push(extra.grossAmount); }
    if (extra.feeError !== undefined) { sets.push("fee_error=?"); vals.push(extra.feeError); }
    vals.push(id);
    run(`UPDATE orders SET ${sets.join(",")} WHERE id=?`, vals);
  },
  // 记录手续费转账交易哈希（幂等：已 CONFIRMED 则拒绝覆盖，杜绝重复扣费）
  setFeeTxHash(id, txHash) {
    const row = get(`SELECT fee_state FROM orders WHERE id=?`, [id]);
    if (row && ["CONFIRMED"].includes(row.fee_state)) return false;
    run(`UPDATE orders SET fee_tx_hash=?, fee_state='SENT', updated_at=? WHERE id=?`, [txHash, now(), id]);
    return true;
  },
  setFeeState(id, state, error = "") {
    run(`UPDATE orders SET fee_state=?, fee_error=?, updated_at=? WHERE id=?`, [state, error, now(), id]);
  },
  get(id) { return get(`SELECT * FROM orders WHERE id=?`, [id]); },
  list(limit = 100) { return all(`SELECT * FROM orders ORDER BY id DESC LIMIT ?`, [limit]); },
  // 待补手续费（失败/重试中，未确认扣费）——幂等重试队列
  listPendingFee(limit = 20) {
    return all(`SELECT * FROM orders WHERE fee_state IN ('PENDING','FAILED','RETRYING') AND fee_amount IS NOT NULL
      AND (fee_tx_hash IS NULL OR fee_state != 'CONFIRMED') ORDER BY id ASC LIMIT ?`, [limit]);
  },
};

export const TransactionRepo = {
  insert(t) { run(
    `INSERT INTO transactions (order_id,token,side,nonce,from_addr,to_addr,data,value,gas_price,gas_limit,
      signed_raw,status,tx_hash,broadcast_at,error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [t.orderId ?? null, t.token, t.side, t.nonce ?? null, t.from ?? null, t.to ?? null, t.data ?? null,
      t.value ?? null, t.gasPrice ?? null, t.gasLimit ?? null, t.signedRaw ?? null, t.status || "pending",
      t.txHash ?? null, now(), t.error ?? null]); },
  updateStatus(txHash, status, err = "") {
    run(`UPDATE transactions SET status=?, error=?, ${status === "confirmed" ? "confirmed_at=?" : "broadcast_at=broadcast_at"} WHERE tx_hash=?`,
      [status, err, now(), txHash]);
  },
};

export const PositionRepo = {
  open(p) {
    run(`INSERT INTO positions (token,wallet,order_id,state,amount_tokens,entry_price,entry_quote,
      take_profit_bps,stop_loss_bps,batch_total,batch_sold,opened_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.token, p.wallet ?? null, p.orderId ?? null, "open", p.amountTokens, p.entryPrice, p.entryQuote,
        p.takeProfitBps ?? null, p.stopLossBps ?? null, p.batchTotal ?? 1, p.batchSold ?? 0, now()]);
  },
  close(id, realizedPnl, realizedPnlQuote) {
    run(`UPDATE positions SET state='closed', realized_pnl=?, realized_pnl_quote=?, closed_at=? WHERE id=?`,
      [realizedPnl, realizedPnlQuote, now(), id]);
  },
  updatePrice(id, price) { run(`UPDATE positions SET current_price=? WHERE id=?`, [price, id]); },
  // 记录已卖出批次
  markBatchSold(id, sold, realizedPnlQuote) {
    run(`UPDATE positions SET batch_sold=batch_sold+?, realized_pnl_quote=COALESCE(realized_pnl_quote,0)+? WHERE id=?`,
      [sold, realizedPnlQuote ?? 0, id]);
  },
  openList() { return all(`SELECT * FROM positions WHERE state='open'`); },
  all(limit = 100) { return all(`SELECT * FROM positions ORDER BY id DESC LIMIT ?`, [limit]); },
};

// ── 系统状态 / 审计 ─────────────────────────────────────────────────────────
export const StateRepo = {
  get(key) { const r = get(`SELECT value FROM system_state WHERE key=?`, [key]); return r ? r.value : null; },
  set(key, value) {
    if (get(`SELECT key FROM system_state WHERE key=?`, [key])) run(`UPDATE system_state SET value=? WHERE key=?`, [value, key]);
    else run(`INSERT INTO system_state (key,value) VALUES (?,?)`, [key, value]);
  },
};
export const Audit = {
  log(category, message, level = "info") { run(`INSERT INTO audit_logs (ts,level,category,message) VALUES (?,?,?,?)`, [now(), level, category, String(message)]); },
};

// ── 钱包（只存公钥） ────────────────────────────────────────────────────────
export const WalletRepo = {
  upsert(w) {
    if (get(`SELECT address FROM wallet_public_profiles WHERE lower(address)=lower(?)`, [w.address]))
      run(`UPDATE wallet_public_profiles SET label=?,enabled=?,max_balance_quote=?,last_balance=?,updated_at=? WHERE lower(address)=lower(?)`,
        [w.label ?? "", w.enabled ? 1 : 0, w.maxBalanceQuote ?? null, w.lastBalance ?? null, now(), w.address]);
    else run(`INSERT INTO wallet_public_profiles (address,label,enabled,max_balance_quote,last_balance,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`, [w.address, w.label ?? "", w.enabled ? 1 : 0, w.maxBalanceQuote ?? null, w.lastBalance ?? null, now(), now()]);
  },
  list() { return all(`SELECT * FROM wallet_public_profiles ORDER BY created_at`); },
  enabled() { return all(`SELECT * FROM wallet_public_profiles WHERE enabled=1`); },
  setEnabled(address, enabled) { run(`UPDATE wallet_public_profiles SET enabled=?,updated_at=? WHERE lower(address)=lower(?)`, [enabled ? 1 : 0, now(), address]); },
};

export function closeDb() { try { db?.close(); } catch { /* ignore */ } }
