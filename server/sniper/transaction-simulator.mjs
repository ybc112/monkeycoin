// 交易模拟：eth_call 真实执行买入/卖出（不发交易），返回输出量与 Gas 估算
import { ZeroAddress } from "ethers";
import { getPortal, getProvider, getTokenContract, fromToken } from "./flap-contracts.mjs";
import { GAS } from "./config.mjs";

// 买入模拟：swapExactInput(inputToken=0, outputToken=token, inputAmount=buyWei, minOutput=0, permit=0x)
export async function simulateBuy({ token, buyAmountWei, wallet, provider }) {
  const p = provider || getProvider();
  const portal = getPortal(p);
  const params = {
    inputToken: ZeroAddress,
    outputToken: token,
    inputAmount: buyAmountWei,
    minOutputAmount: 0n,
    permitData: "0x",
  };
  try {
    const gas = await portal.swapExactInput.estimateGas(params, { value: buyAmountWei, from: wallet });
    const out = await portal.swapExactInput.staticCall(params, { value: buyAmountWei, from: wallet });
    return { ok: true, outputAmount: out, gasEstimate: gas, error: null };
  } catch (err) {
    return { ok: false, error: String(err?.reason || err?.message || err) };
  }
}

// 卖出模拟：swapExactInput(inputToken=token, outputToken=0, inputAmount=tokenAmt, minOutput=0, permit=0x)
export async function simulateSell({ token, tokenAmount, wallet, provider }) {
  const p = provider || getProvider();
  const portal = getPortal(p);
  const params = {
    inputToken: token,
    outputToken: ZeroAddress,
    inputAmount: tokenAmount,
    minOutputAmount: 0n,
    permitData: "0x",
  };
  try {
    const gas = await portal.swapExactInput.estimateGas(params, { from: wallet });
    const out = await portal.swapExactInput.staticCall(params, { from: wallet });
    return { ok: true, outputAmount: out, gasEstimate: gas, error: null };
  } catch (err) {
    return { ok: false, error: String(err?.reason || err?.message || err) };
  }
}

// 从链上读钱包余额（BNB）
export async function getWalletBalanceBNB(wallet, provider) {
  const p = provider || getProvider();
  const bal = await p.getBalance(wallet);
  return bal;
}

// 从链上读代币余额
export async function getTokenBalance(token, wallet, provider) {
  const p = provider || getProvider();
  const tc = getTokenContract(token, p);
  const [bal, dec] = await Promise.all([tc.balanceOf(wallet), tc.decimals().catch(() => 18n)]);
  return { raw: bal, decimals: Number(dec), label: fromToken(bal, Number(dec)) };
}
