import { useState } from "react";
import { ethers } from "ethers";
import { AlertTriangle, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useAppStore } from "@/store";
import { BANANA_TOKEN_ABI, getReadProvider } from "@/lib/contracts/snowballFactory";

type TokenInfo = {
  owner: string;
  pair: string;
  fundAddress: string;
  launched: boolean;
  buyPlatformFee: bigint;
  sellPlatformFee: bigint;
  fees: bigint[];
  lpBurnFrequency: bigint;
  percentForLPBurn: bigint;
  minimumDividend: bigint;
};

const FIELD_CLASS =
  "w-full rounded-lg border border-[var(--sb-border)] bg-white px-3 py-2 text-sm text-[var(--sb-text)] outline-none transition focus:border-[var(--sb-gold)]";

function parseAddresses(value: string) {
  const addresses = value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  if (!addresses.length || addresses.some((item) => !ethers.isAddress(item))) {
    throw new Error("请输入有效地址，多个地址可用逗号或换行分隔");
  }
  return addresses;
}

function parsePercentBps(value: string): bigint {
  const raw = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("百分比格式无效，最多保留两位小数");
  }
  const [whole, fraction = ""] = raw.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

export default function TokenManager() {
  const { signer, account, isConnected } = useWallet();
  const showToast = useAppStore((state) => state.showToast);
  const [tokenAddress, setTokenAddress] = useState("");
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [fees, setFees] = useState<string[]>(Array(8).fill("0"));
  const [fundAddress, setFundAddress] = useState("");
  const [limits, setLimits] = useState({ buy: "0", sell: "0", wallet: "0", swap: "0" });
  const [lpBurn, setLpBurn] = useState({ frequency: "3600", percent: "50" });
  const [tradeProtection, setTradeProtection] = useState({ killBlocks: "0", secondTime: "0", airdropNumbs: "0", transferFee: "0", sellRate: "10" });
  const [minimumDividend, setMinimumDividend] = useState("0");
  const [listAddresses, setListAddresses] = useState("");
  const [ownershipAddress, setOwnershipAddress] = useState("");
  const [busy, setBusy] = useState("");

  const query = async () => {
    if (!ethers.isAddress(tokenAddress)) return showToast("请输入有效代币地址", "error");
    setBusy("query");
    try {
      const token = new ethers.Contract(tokenAddress, BANANA_TOKEN_ABI, getReadProvider());
      const values = await Promise.all([
        token.owner(), token._mainPair(), token.fundAddress(), token.startTradeTime(),
        token._buyPlatformFee(), token._sellPlatformFee(),
        token._buyFundFee(), token._buyLiquidityFee(), token._buyRewardFee(), token._buyBurnFee(),
        token._sellFundFee(), token._sellLiquidityFee(), token._sellRewardFee(), token._sellBurnFee(),
        token.lpBurnFrequency(), token.percentForLPBurn(), token.getMinimumTokenBalanceForDividends(),
      ]);
      const next: TokenInfo = {
        owner: values[0], pair: values[1], fundAddress: values[2], launched: values[3] > 0n,
        buyPlatformFee: values[4], sellPlatformFee: values[5], fees: values.slice(6, 14),
        lpBurnFrequency: values[14], percentForLPBurn: values[15], minimumDividend: values[16],
      };
      setInfo(next);
      setFees(next.fees.map((value) => (Number(value) / 100).toFixed(2)));
      setFundAddress(next.fundAddress);
      setLpBurn({ frequency: String(next.lpBurnFrequency), percent: (Number(next.percentForLPBurn) / 100).toFixed(2) });
      setMinimumDividend(ethers.formatUnits(next.minimumDividend, 18));
      showToast("代币配置读取成功", "success");
    } catch (error: any) {
      setInfo(null);
      showToast(error.shortMessage || error.message || "读取失败", "error");
    } finally {
      setBusy("");
    }
  };

  const execute = async (key: string, label: string, action: (token: ethers.Contract) => Promise<any>) => {
    if (!isConnected || !signer) return showToast("请连接项目方 Owner 钱包", "error");
    if (!ethers.isAddress(tokenAddress)) return showToast("请输入有效代币地址", "error");
    if (info && account?.toLowerCase() !== info.owner.toLowerCase()) {
      return showToast("当前钱包不是该代币 Owner", "error");
    }
    setBusy(key);
    try {
      const token = new ethers.Contract(tokenAddress, BANANA_TOKEN_ABI, signer);
      const tx = await action(token);
      showToast(`${label}已提交，等待链上确认`, "info");
      await tx.wait();
      showToast(`${label}成功`, "success");
      await query();
    } catch (error: any) {
      showToast(error.reason || error.shortMessage || error.message || `${label}失败`, "error");
    } finally {
      setBusy("");
    }
  };

  const updateFees = () => {
    let values: bigint[];
    try {
      values = fees.map((value) => parsePercentBps(value || "0"));
    } catch (error: any) {
      return showToast(error.message, "error");
    }
    const buyTotal = values.slice(0, 4).reduce((sum, value) => sum + value, 0n);
    const sellTotal = values.slice(4).reduce((sum, value) => sum + value, 0n);
    if (!info || values[0] < info.buyPlatformFee || values[4] < info.sellPlatformFee) {
      return showToast("Fund 税中包含固定平台税，不能低于当前平台税", "error");
    }
    if (buyTotal > 2500n || sellTotal > 2500n) return showToast("买税和卖税均不能超过 25%", "error");
    void execute("fees", "更新税率", (token) => token.setTradeFee(values));
  };

  const percent = (value: string | bigint) => `${(Number(value) / 100).toFixed(2)}%`;

  return (
    <section className="mx-auto mt-6 max-w-6xl px-4">
      <div className="rounded-2xl border border-[var(--sb-border)] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[var(--sb-gold)]" /><h2 className="text-lg font-bold">TokenTool 管理台</h2></div>
            <p className="mt-1 text-xs text-[var(--sb-muted)]">仅代币 Owner 可修改。固定平台税不能删除或绕过。</p>
          </div>
          <div className="flex min-w-0 gap-2 sm:w-[460px]">
            <input className={FIELD_CLASS} value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value.trim())} placeholder="输入本发射台代币地址" />
            <button onClick={query} disabled={busy === "query"} className="flex shrink-0 items-center gap-2 rounded-lg bg-[var(--sb-text)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {busy === "query" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}读取
            </button>
          </div>
        </div>

        {info && (
          <div className="space-y-6">
            <div className="grid gap-3 rounded-xl bg-[var(--sb-bg)] p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div><span className="text-[var(--sb-muted)]">Owner</span><p className="break-all font-mono">{info.owner}</p></div>
              <div><span className="text-[var(--sb-muted)]">主交易对</span><p className="break-all font-mono">{info.pair}</p></div>
              <div><span className="text-[var(--sb-muted)]">开盘状态</span><p className="font-bold">{info.launched ? "已开盘" : "未开盘"}</p></div>
              <div><span className="text-[var(--sb-muted)]">固定平台税下限</span><p className="font-bold">买 {percent(info.buyPlatformFee)} / 卖 {percent(info.sellPlatformFee)}</p></div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-bold">买卖税设置（百分比）</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {["买 Fund", "买回流", "买分红", "买燃烧", "卖 Fund", "卖回流", "卖分红", "卖燃烧"].map((label, index) => (
                  <label key={label} className="text-xs text-[var(--sb-muted)]">{label}
                    <input className={`${FIELD_CLASS} mt-1`} type="number" min="0" step="0.01" value={fees[index]} onChange={(event) => setFees((current) => current.map((item, i) => i === index ? event.target.value : item))} />
                  </label>
                ))}
              </div>
              <button onClick={updateFees} disabled={!!busy} className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--sb-gold)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />保存税率</button>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2"><h3 className="text-sm font-bold">收款与限制</h3>
                <input className={FIELD_CLASS} value={fundAddress} onChange={(e) => setFundAddress(e.target.value)} placeholder="Fund 地址" />
                <button onClick={() => ethers.isAddress(fundAddress) ? void execute("fund", "更新 Fund 地址", (t) => t.setFundAddress(fundAddress)) : showToast("Fund 地址无效", "error")} className="rounded-lg border px-3 py-2 text-xs font-bold">更新 Fund 地址</button>
                {(["buy", "sell", "wallet", "swap"] as const).map((key) => <input key={key} className={FIELD_CLASS} value={limits[key]} onChange={(e) => setLimits((v) => ({ ...v, [key]: e.target.value }))} placeholder={{buy:"最大买入枚数",sell:"最大卖出枚数",wallet:"最大钱包枚数",swap:"Swap 触发枚数"}[key]} />)}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void execute("buy", "更新限买", (t) => t.setMaxBuyAmount(ethers.parseUnits(limits.buy || "0", 18)))} className="rounded-lg border px-3 py-2 text-xs font-bold">限买</button>
                  <button onClick={() => void execute("sell", "更新限卖", (t) => t.setMaxSellAmount(ethers.parseUnits(limits.sell || "0", 18)))} className="rounded-lg border px-3 py-2 text-xs font-bold">限卖</button>
                  <button onClick={() => void execute("wallet", "更新限钱包", (t) => t.setWalletLimit(ethers.parseUnits(limits.wallet || "0", 18)))} className="rounded-lg border px-3 py-2 text-xs font-bold">限钱包</button>
                  <button onClick={() => void execute("swap", "更新兑换阈值", (t) => t.setSwapAtAmount(ethers.parseUnits(limits.swap || "0", 18)))} className="rounded-lg border px-3 py-2 text-xs font-bold">兑换阈值</button>
                </div>
              </div>

              <div className="space-y-2"><h3 className="text-sm font-bold">名单管理</h3>
                <textarea className={`${FIELD_CLASS} min-h-24 resize-y`} value={listAddresses} onChange={(e) => setListAddresses(e.target.value)} placeholder="一个或多个地址" />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { try { const a = parseAddresses(listAddresses); void execute("white", "加入免税名单", (t) => t.setFeeWhiteList(a, true)); } catch (e: any) { showToast(e.message, "error"); } }} className="rounded-lg border px-3 py-2 text-xs font-bold">加入免税</button>
                  <button onClick={() => { try { const a = parseAddresses(listAddresses); void execute("unwhite", "移出免税名单", (t) => t.setFeeWhiteList(a, false)); } catch (e: any) { showToast(e.message, "error"); } }} className="rounded-lg border px-3 py-2 text-xs font-bold">移出免税</button>
                  <button onClick={() => { try { const a = parseAddresses(listAddresses); void execute("black", "加入黑名单", (t) => t.multi_bclist(a, true)); } catch (e: any) { showToast(e.message, "error"); } }} className="rounded-lg border px-3 py-2 text-xs font-bold">加入黑名单</button>
                  <button onClick={() => { try { const a = parseAddresses(listAddresses); void execute("unblack", "移出黑名单", (t) => t.multi_bclist(a, false)); } catch (e: any) { showToast(e.message, "error"); } }} className="rounded-lg border px-3 py-2 text-xs font-bold">移出黑名单</button>
                  <button onClick={() => { try { const [a] = parseAddresses(listAddresses); void execute("dividend", "排除分红", (t) => t.excludeFromDividends(a)); } catch (e: any) { showToast(e.message, "error"); } }} className="rounded-lg border px-3 py-2 text-xs font-bold">排除分红</button>
                </div>
                <p className="text-xs text-[var(--sb-muted)]">合约会拒绝将主 Pair 加入免税名单，避免平台税被绕过。</p>
              </div>

              <div className="space-y-2"><h3 className="text-sm font-bold">分红与底池燃烧</h3>
                <input className={FIELD_CLASS} value={minimumDividend} onChange={(e) => setMinimumDividend(e.target.value)} placeholder="最低持仓分红枚数" />
                <button onClick={() => void execute("minimum", "更新分红门槛", (t) => t.updateMinimumTokenBalanceForDividends(ethers.parseUnits(minimumDividend || "0", 18)))} className="rounded-lg border px-3 py-2 text-xs font-bold">更新分红门槛</button>
                <input className={FIELD_CLASS} type="number" value={lpBurn.frequency} onChange={(e) => setLpBurn((v) => ({ ...v, frequency: e.target.value }))} placeholder="燃烧间隔秒数（最少 3600）" />
                <input className={FIELD_CLASS} type="number" min="0" max="1" step="0.01" value={lpBurn.percent} onChange={(e) => setLpBurn((v) => ({ ...v, percent: e.target.value }))} placeholder="每次燃烧百分比（最大 1%）" />
                <div className="flex gap-2"><button onClick={() => void execute("frequency", "更新燃烧间隔", (t) => t.setlpBurnFrequency(BigInt(lpBurn.frequency)))} className="rounded-lg border px-3 py-2 text-xs font-bold">保存间隔</button><button onClick={() => { try { const value = parsePercentBps(lpBurn.percent); if (value > 100n) throw new Error("每次 LP 燃烧最多 1%"); void execute("percent", "更新燃烧比例", (t) => t.setpercentForLPBurn(value)); } catch (error: any) { showToast(error.message, "error"); } }} className="rounded-lg border px-3 py-2 text-xs font-bold">保存比例</button></div>
              </div>

              <div className="space-y-2"><h3 className="text-sm font-bold">开盘保护与交易参数</h3>
                <input className={FIELD_CLASS} type="number" min="0" max="100" value={tradeProtection.killBlocks} onChange={(e) => setTradeProtection((v) => ({ ...v, killBlocks: e.target.value }))} placeholder="杀区块 0-100" />
                <button onClick={() => void execute("kill", "更新杀区块", (t) => t.setkb(BigInt(tradeProtection.killBlocks || "0")))} className="rounded-lg border px-3 py-2 text-xs font-bold">保存杀区块</button>
                <input className={FIELD_CLASS} type="number" min="0" value={tradeProtection.secondTime} onChange={(e) => setTradeProtection((v) => ({ ...v, secondTime: e.target.value }))} placeholder="二级白名单窗口（秒）" />
                <button onClick={() => void execute("second", "更新保护窗口", (t) => t.setSecondTime(BigInt(tradeProtection.secondTime || "0")))} className="rounded-lg border px-3 py-2 text-xs font-bold">保存保护窗口</button>
                <input className={FIELD_CLASS} type="number" min="0" max="3" value={tradeProtection.airdropNumbs} onChange={(e) => setTradeProtection((v) => ({ ...v, airdropNumbs: e.target.value }))} placeholder="地址裂变/空投份数 0-3" />
                <button onClick={() => void execute("airdrop", "更新地址裂变", (t) => t.setAirdropNumbs(BigInt(tradeProtection.airdropNumbs || "0")))} className="rounded-lg border px-3 py-2 text-xs font-bold">保存地址裂变</button>
                <input className={FIELD_CLASS} type="number" min="0" max="2500" value={tradeProtection.transferFee} onChange={(e) => setTradeProtection((v) => ({ ...v, transferFee: e.target.value }))} placeholder="普通转账税 bps" />
                <button onClick={() => void execute("transferFee", "更新转账税", (t) => t.setTransferFee(BigInt(tradeProtection.transferFee || "0")))} className="rounded-lg border px-3 py-2 text-xs font-bold">保存转账税</button>
                <input className={FIELD_CLASS} type="number" min="1" max="100" value={tradeProtection.sellRate} onChange={(e) => setTradeProtection((v) => ({ ...v, sellRate: e.target.value }))} placeholder="单次兑换比例 1-100" />
                <button onClick={() => void execute("sellRate", "更新兑换比例", (t) => t.setNumTokensSellRate(BigInt(tradeProtection.sellRate || "1")))} className="rounded-lg border px-3 py-2 text-xs font-bold">保存兑换比例</button>
                <div className="flex flex-wrap gap-2"><button onClick={() => void execute("swapOn", "开启自动回流", (t) => t.setSwapAndLiquifyEnabled(true))} className="rounded-lg border px-3 py-2 text-xs font-bold">开启自动回流</button><button onClick={() => void execute("swapOff", "关闭自动回流", (t) => t.setSwapAndLiquifyEnabled(false))} className="rounded-lg border px-3 py-2 text-xs font-bold">关闭</button><button onClick={() => void execute("manualSwap", "手动回流", (t) => t.manualSwapBack())} className="rounded-lg bg-[var(--sb-gold)] px-3 py-2 text-xs font-bold text-white">手动回流</button></div>
              </div>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-red-800"><AlertTriangle className="h-4 w-4" />所有权与开盘</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {!info.launched && <button onClick={() => void execute("launch", "开盘", (t) => t.launch())} className="rounded-lg bg-[var(--sb-gold)] px-4 py-2 text-sm font-bold text-white">一键开盘</button>}
                <input className={FIELD_CLASS} value={ownershipAddress} onChange={(e) => setOwnershipAddress(e.target.value)} placeholder="新 Owner 地址" />
                <button onClick={() => ethers.isAddress(ownershipAddress) ? void execute("owner", "转移所有权", (t) => t.transferOwnership(ownershipAddress)) : showToast("新 Owner 地址无效", "error")} className="shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-800">转移所有权</button>
                <button onClick={() => window.confirm("放弃所有权后无法再修改税率、名单和参数，确定继续？") && void execute("renounce", "放弃所有权", (t) => t.renounceOwnership())} className="shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">永久丢权限</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
