// 交易构建：Gas 计算、滑点、买入/卖出 calldata（内盘 bonding curve + DEX 迁移两种）
import { ZeroAddress, parseUnits } from "ethers";
import { GAS, FLAP } from "./config.mjs";
import { getPortal, getRouter, getProvider } from "./flap-contracts.mjs";

// ── Gas：recommended = 网络当前 gas × multiplier；final = min(recommended, MAX) ──
export async function computeGasPrice({ manualGwei, provider } = {}) {
  const p = provider || getProvider();
  const maxWei = parseUnits(String(GAS.MAX_GAS_PRICE_GWEI), "gwei");
  if (manualGwei != null && manualGwei > 0) {
    const m = parseUnits(String(manualGwei), "gwei");
    return { gwei: manualGwei, raw: m, capped: m > maxWei, cap: GAS.MAX_GAS_PRICE_GWEI };
  }
  const fee = await p.getFeeData();
  const base = fee.gasPrice || parseUnits("3", "gwei");
  const recommended = (base * BigInt(Math.round(GAS.GAS_MULTIPLIER * 100))) / 100n;
  const capped = recommended > maxWei;
  const final = capped ? maxWei : recommended;
  return { gwei: Number(final) / 1e9, raw: final, capped, cap: GAS.MAX_GAS_PRICE_GWEI, baseGwei: Number(base) / 1e9 };
}

// ── 滑点 minOut ─────────────────────────────────────────────────────────────
export function applySlippage(outputAmount, slippageBps) {
  const bp = BigInt(slippageBps);
  return (outputAmount * (10000n - bp)) / 10000n;
}

// ── 构建内盘买入（swapExactInput, input=0 原生 BNB） ─────────────────────────
export async function buildBuyTx({ token, buyAmountWei, minOut, wallet, gasPrice, gasLimit }) {
  const portal = getPortal();
  const params = {
    inputToken: ZeroAddress,
    outputToken: token,
    inputAmount: buyAmountWei,
    minOutputAmount: minOut,
    permitData: "0x",
  };
  const tx = await portal.swapExactInput.populateTransaction(params, {
    value: buyAmountWei,
    gasPrice,
    gasLimit: BigInt(gasLimit || GAS.BUY_GAS_LIMIT),
  });
  return { to: FLAP.PORTAL, data: tx.data, value: buyAmountWei };
}

// ── 构建内盘卖出（swapExactInput, output=0 原生 BNB；permitData 为空需先 approve） ──
export async function buildSellTx({ token, tokenAmount, minOut, wallet, gasPrice, gasLimit }) {
  const portal = getPortal();
  const params = {
    inputToken: token,
    outputToken: ZeroAddress,
    inputAmount: tokenAmount,
    minOutputAmount: minOut,
    permitData: "0x", // 简化：走 approve 路径（后端不持私钥，由钱包签名 approve + sell）
  };
  const tx = await portal.swapExactInput.populateTransaction(params, {
    gasPrice,
    gasLimit: BigInt(gasLimit || GAS.SELL_GAS_LIMIT),
  });
  return { to: FLAP.PORTAL, data: tx.data, value: 0n };
}

// ── 构建 DEX（已迁移）买入：PancakeSwap V2 SupportingFeeOnTransfer ────────────
export async function buildDexBuyTx({ token, buyAmountWei, minOut, wallet, gasPrice, gasLimit, deadlineSec = GAS.TRANSACTION_DEADLINE_SECONDS }) {
  const router = getRouter();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSec);
  const tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens.populateTransaction(
    minOut, [FLAP.DEX.WBNB, token], wallet, deadline, { value: buyAmountWei, gasPrice, gasLimit: BigInt(gasLimit || GAS.BUY_GAS_LIMIT) });
  return { to: FLAP.DEX.ROUTER_V2, data: tx.data, value: buyAmountWei };
}

// ── 构建 DEX 卖出 ─────────────────────────────────────────────────────────────
export async function buildDexSellTx({ token, tokenAmount, minOut, wallet, gasPrice, gasLimit, deadlineSec = GAS.TRANSACTION_DEADLINE_SECONDS }) {
  const router = getRouter();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSec);
  const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens.populateTransaction(
    tokenAmount, minOut, [token, FLAP.DEX.WBNB], wallet, deadline, { gasPrice, gasLimit: BigInt(gasLimit || GAS.SELL_GAS_LIMIT) });
  return { to: FLAP.DEX.ROUTER_V2, data: tx.data, value: 0n };
}
