// Flap Portal 合约封装：ABI、代币状态读取、报价（所有签名来自官方文档，主网验证）
import { Contract, Interface, JsonRpcProvider, ZeroAddress, getAddress, formatUnits, parseUnits } from "ethers";
import { FLAP, CHAIN_ID, RPC_HTTP_URLS, fetchOptionsFor } from "./config.mjs";

// ── ABI（精确字段顺序，见 docs.flap.sh + IPortal.sol） ─────────────────────
export const PORTAL_ABI = [
  "function version() view returns (string)",
  "function quoteExactInput((address inputToken,address outputToken,uint256 inputAmount)) external returns (uint256)",
  "function swapExactInput((address inputToken,address outputToken,uint256 inputAmount,uint256 minOutputAmount,bytes permitData)) external payable returns (uint256)",
  "function getTokenV8Safe(address token) view returns (uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId)",
  "function getTokenV6(address token) view returns (uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 taxRate,address pool,uint256 progress)",
  "event TokenCreated(uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta)",
  "event TokenBought(uint256 ts,address token,address buyer,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)",
  "event TokenSold(uint256 ts,address token,address seller,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)",
  "event LaunchedToDEX(address token,address pool,uint256 amount,uint256 eth)",
  "event FlapTokenProgressChanged(address token,uint256 newProgress)",
  "event FlapTokenTaxSet(address token,uint256 buyTax,uint256 sellTax)",
];

export const PCS_V2_ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[] amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
];
export const PCS_V2_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function factory() view returns (address)",
];
export const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// ── 代币创建入口 ABI（用于从创建交易 calldata 解码营销/分红/销毁/LP 占比） ──
// 主网当前只走 TaxV3 的 newTokenV6（struct 参数）；旧协议仍可能用 createToken（扁平参数）。
// 字段名/顺序精确来自 docs.flap.sh 的 IPortalTypes.NewTokenV6Params 与 legacy createToken ABI。
const LAUNCH_FRAGMENTS = [
  "function newTokenV6((string _name,string _symbol,string _meta,uint8 _dexThresh,bytes32 _salt,uint8 _migratorType,address _quoteToken,uint256 _quoteAmt,address _beneficiary,bytes _permitData,bytes32 _extensionID,bytes _extensionData,uint8 _dexId,uint8 _lpFeeProfile,uint16 _buyTaxRate,uint16 _sellTaxRate,uint64 _taxDuration,uint64 _antiFarmerDuration,uint16 _mktBps,uint16 _deflationBps,uint16 _dividendBps,uint16 _lpBps,uint256 _minimumShareBalance,address _dividendToken,address _commissionReceiver,uint8 _tokenVersion)) external payable returns (address)",
  "function createToken(string _name,string _symbol,string _meta,address _feeTo,bytes32 _salt,uint16 _taxRate,uint16 _mktBps,uint16 _dividendBps,uint16 _deflationBps,uint16 _lpBps,uint256 _minimumShareBalance) external returns (address)",
];
const launchIfaces = LAUNCH_FRAGMENTS.map((frag) => ({ name: /function (\w+)/.exec(frag)[1], iface: new Interface([frag]) }));
// 稳健读取不同 ABI 命名下的占比字段
function pickBps(obj, keys) {
  for (const k of keys) if (obj && obj[k] != null) return Number(obj[k]);
  return null;
}

// 从创建交易的 calldata 解码营销占比等分配（多入口防御式尝试；解码失败返回 null 不阻断）
export async function decodeLaunchBill(txHash, p = getProvider()) {
  if (!txHash) return null;
  let tx;
  try { tx = await p.getTransaction(txHash); } catch { return null; }
  if (!tx?.data || tx.data.length < 10) return null;
  for (const { name, iface } of launchIfaces) {
    try {
      const r = iface.decodeFunctionData(name, tx.data);
      // newTokenV6 是单 struct 参数；createToken 是扁平参数 → 统一归一为字段对象
      const a = (r.length === 1 && typeof r[0] === "object" && r[0] !== null) ? r[0] : r;
      const mktBps = pickBps(a, ["_mktBps", "mktBps"]);
      if (mktBps === null) return null;
      return {
        mktBps, // 营销占比（基点，100=1%）
        deflationBps: pickBps(a, ["_deflationBps", "deflationBps"]) ?? 0,
        dividendBps: pickBps(a, ["_dividendBps", "dividendBps"]) ?? 0,
        lpBps: pickBps(a, ["_lpBps", "lpBps"]) ?? 0,
      };
    } catch { /* 换下一个入口尝试 */ }
  }
  return null;
}

// ── RPC 轮换 provider ───────────────────────────────────────────────────────
const providers = RPC_HTTP_URLS.map(u => new JsonRpcProvider(u, CHAIN_ID, { batchMaxCount: 1, ...fetchOptionsFor(u) }));
let providerIdx = 0;
export function getProvider() {
  for (let i = 0; i < providers.length; i += 1) {
    const p = providers[(providerIdx + i) % providers.length];
    if (p) return p;
  }
  return providers[0];
}
export async function rotateProvider() {
  providerIdx = (providerIdx + 1) % providers.length;
  return getProvider();
}
// 按 URL 缓存的 provider 池（供事件扫描复用，避免反复网络检测）
const providerPool = new Map();
export function getProviderByUrl(url) {
  if (!providerPool.has(url)) providerPool.set(url, new JsonRpcProvider(url, CHAIN_ID, { batchMaxCount: 1, ...fetchOptionsFor(url) }));
  return providerPool.get(url);
}
export const getPortal = (p = getProvider()) => new Contract(FLAP.PORTAL, PORTAL_ABI, p);
export const getRouter = (p = getProvider()) => new Contract(FLAP.DEX.ROUTER_V2, PCS_V2_ROUTER_ABI, p);
export const getTokenContract = (addr, p = getProvider()) => new Contract(addr, TOKEN_ABI, p);

// ── 归一化代币状态（优先 V8，回退 V6） ──────────────────────────────────────
// 代币状态短时缓存（加速 /buy 等重复读取同一代币，TTL 2.5s）
const getTokenInfoCache = new Map(); // token(lower) -> { ts, val }
const TOKEN_INFO_TTL = 2500;
export async function getTokenInfo(token, p = getProvider()) {
  const key = String(token).toLowerCase();
  const hit = getTokenInfoCache.get(key);
  if (hit && Date.now() - hit.ts < TOKEN_INFO_TTL) return hit.val;
  const portal = getPortal(p);
  let s;
  try {
    s = await portal.getTokenV8Safe(token);
  } catch {
    try {
      const v6 = await portal.getTokenV6(token);
      s = { ...v6, buyTaxRate: v6.taxRate, sellTaxRate: v6.taxRate };
    } catch (err) {
      const info = { exists: false, error: String(err?.reason || err?.message || err) };
      getTokenInfoCache.set(key, { ts: Date.now(), val: info });
      return info;
    }
  }
  const info = normalizeTokenState(s);
  getTokenInfoCache.set(key, { ts: Date.now(), val: info });
  return info;
}

function normalizeTokenState(s) {
  const zero = 0n;
  return {
    exists: true,
    status: Number(s.status),
    reserve: s.reserve ?? zero,
    circulatingSupply: s.circulatingSupply ?? zero,
    price: s.price ?? zero,
    tokenVersion: Number(s.tokenVersion ?? 0),
    r: s.r ?? zero,
    h: s.h ?? zero,
    k: s.k ?? zero,
    dexSupplyThresh: s.dexSupplyThresh ?? zero,
    quoteTokenAddress: s.quoteTokenAddress ? getAddress(s.quoteTokenAddress) : ZeroAddress,
    nativeToQuoteSwapEnabled: Boolean(s.nativeToQuoteSwapEnabled),
    extensionID: s.extensionID ?? "0x",
    buyTaxBps: Number(s.buyTaxRate ?? 0),
    sellTaxBps: Number(s.sellTaxRate ?? 0),
    pool: s.pool ? getAddress(s.pool) : ZeroAddress,
    progress: s.progress ?? zero,
    lpFeeProfile: Number(s.lpFeeProfile ?? 0),
    dexId: Number(s.dexId ?? 0),
  };
}

// ── 报价（eth_call，不发交易） ───────────────────────────────────────────────
export async function quoteBuy(token, buyAmountWei, p = getProvider()) {
  const portal = getPortal(p);
  try {
    const out = await portal.quoteExactInput.staticCall(
      { inputToken: ZeroAddress, outputToken: token, inputAmount: buyAmountWei });
    return { ok: true, outputAmount: out };
  } catch (err) {
    return { ok: false, error: String(err?.reason || err?.message || err) };
  }
}
export async function quoteSell(token, tokenAmount, p = getProvider()) {
  const portal = getPortal(p);
  try {
    const out = await portal.quoteExactInput.staticCall(
      { inputToken: token, outputToken: ZeroAddress, inputAmount: tokenAmount });
    return { ok: true, outputAmount: out };
  } catch (err) {
    return { ok: false, error: String(err?.reason || err?.message || err) };
  }
}

// ── 底池币种标签 ────────────────────────────────────────────────────────────
export function quoteTokenLabel(addr) {
  if (!addr || addr === ZeroAddress) return "BNB";
  const a = String(addr).toLowerCase();
  if (a === FLAP.USDT.toLowerCase()) return "USDT";
  if (a === FLAP.DEX.WBNB.toLowerCase()) return "WBNB";
  return getAddress(addr).slice(0, 6) + "…" + getAddress(addr).slice(-4);
}

// ── 金额工具 ────────────────────────────────────────────────────────────────
export const fromQuote = (wei) => formatUnits(wei, 18);
export const toQuote = (amountStr) => parseUnits(String(amountStr), 18);
export const fromToken = (wei, decimals = 18) => formatUnits(wei, decimals);
