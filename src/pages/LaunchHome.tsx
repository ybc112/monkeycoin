import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  Flame,
  Rocket,
  Droplets,
  FireExtinguisher,
  ShieldCheck,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";
import { useAppStore } from "@/store";
import LaunchpadHeader from "@/components/LaunchpadHeader";
import {
  type SnowballParams,
  type FeeBreakdown,
  previewFees,
  buildContractParams,
  FACTORY_ADDRESS,
  FACTORY_ABI,
  BANANA_TOKEN_ABI,
  getFactoryInfo,
  mineSalt,
  serverMineSalt,
  createToken,
  createTokenAndAddLiquidity,
  getReadProvider,
  ADDRESSES,
  SNOWBALL_API_BASE,
} from "@/lib/contracts/snowballFactory";

const BPS = 10000;
const DEPLOY_MODES = [
  {
    key: "deploy",
    title: "普通部署",
    desc: "仅创建代币，项目方自行加池和开盘",
  },
  {
    key: "launch",
    title: "一键发射",
    desc: "创建 + 自动加池 + LP 锁黑洞 + 开盘",
  },
] as const;

const DEFAULT_PARAMS: SnowballParams = {
  name: "",
  symbol: "",
  totalSupply: "1000000000",
  currency: ADDRESSES.wbnb,
  rewardToken: ADDRESSES.usdt,
  receiver: "",
  fundAddress: "",
  totalBuyTax: 500,
  totalSellTax: 500,
  rewardShare: 4000,
  liquidityShare: 3000,
  burnShare: 2000,
  fundShare: 1000,
  maxBuyAmount: "0",
  maxSellAmount: "0",
  maxWalletAmount: "0",
  lpBurnFrequency: 3600,
  percentForLPBurn: 50,
  secondTime: 0,
  killBlocks: 0,
  airdropNumbs: 0,
  transferFee: 0,
  mushHoldNum: "0",
  enableOffTrade: false,
};

function formatBps(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

function shorten(addr: string) {
  if (!addr) return "--";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

function Card({ children, className, title, icon: Icon, number }: any) {
  return (
    <div className={cn("rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)] p-6 shadow-sm", className)}>
      {title && (
        <div className="mb-5 flex items-center gap-2 text-lg font-semibold text-[var(--sb-text)]">
          {Icon && <Icon className="h-5 w-5 text-[var(--sb-gold)]" />}
          {number && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-[var(--sb-gold-light)] px-1 text-xs font-bold text-[var(--sb-gold)]">
              {number}
            </span>
          )}
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

// 税费分配环形图
const RING_COLORS = {
  reward: "#F2703A",
  liquidity: "#5B8DB8",
  burn: "#D93025",
  fund: "#8E6BB3",
};

const RING_LEGEND = [
  { key: "reward", feeKey: "rewardFee", label: "分红", color: RING_COLORS.reward },
  { key: "liquidity", feeKey: "liquidityFee", label: "回流", color: RING_COLORS.liquidity },
  { key: "burn", feeKey: "burnFee", label: "燃烧", color: RING_COLORS.burn },
  { key: "fund", feeKey: "fundFee", label: "基金", color: RING_COLORS.fund },
] as const;

function feeSharePct(fee: FeeBreakdown | null | undefined, key: keyof FeeBreakdown) {
  if (!fee) return "--";
  const total = fee.platformFee + fee.rewardFee + fee.liquidityFee + fee.burnFee + fee.fundFee;
  if (total === 0) return "0.0";
  return ((fee[key] / total) * 100).toFixed(1);
}

function TaxRing({
  fee,
  label,
  totalTaxBps,
  loading,
}: {
  fee: FeeBreakdown | null;
  label: string;
  totalTaxBps: number;
  loading?: boolean;
}) {
  const taxPct = totalTaxBps / 100;
  const total =
    fee ? fee.rewardFee + fee.liquidityFee + fee.burnFee + fee.fundFee : 0;
  const items = fee && total > 0
    ? [
        { key: "reward", value: (fee.rewardFee / total) * 100, color: RING_COLORS.reward },
        { key: "liquidity", value: (fee.liquidityFee / total) * 100, color: RING_COLORS.liquidity },
        { key: "burn", value: (fee.burnFee / total) * 100, color: RING_COLORS.burn },
        { key: "fund", value: (fee.fundFee / total) * 100, color: RING_COLORS.fund },
      ].filter((i) => i.value > 0)
    : [];

  let cumulative = 0;
  const segments = items.map((item) => {
    const start = cumulative;
    cumulative += item.value;
    const end = cumulative;
    const largeArc = item.value > 50 ? 1 : 0;
    const startAngle = (start / 100) * Math.PI * 2 - Math.PI / 2;
    const endAngle = (end / 100) * Math.PI * 2 - Math.PI / 2;
    const x1 = 50 + 42 * Math.cos(startAngle);
    const y1 = 50 + 42 * Math.sin(startAngle);
    const x2 = 50 + 42 * Math.cos(endAngle);
    const y2 = 50 + 42 * Math.sin(endAngle);
    return {
      ...item,
      d: `M 50 50 L ${x1} ${y1} A 42 42 0 ${largeArc} 1 ${x2} ${y2} Z`,
    };
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          {loading || segments.length === 0 ? (
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--sb-border)" strokeWidth="16" />
          ) : (
            <>
              {segments.map((segment) => (
                <path key={segment.key} d={segment.d} fill={segment.color} stroke="var(--sb-card)" strokeWidth="2" />
              ))}
            </>
          )}
          <circle cx="50" cy="50" r="26" fill="var(--sb-card)" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-[var(--sb-text)]">
            {loading ? "--" : `${taxPct.toFixed(2)}%`}
          </span>
          <span className="text-[10px] text-[var(--sb-muted)]">{label}</span>
        </div>
      </div>
    </div>
  );
}

function InputGroup({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  suffix,
  hint,
  error,
  disabled,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  suffix?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-[var(--sb-text)]">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-xl border bg-white/80 px-4 py-2.5 text-sm outline-none transition",
            "placeholder:text-[var(--sb-muted)]/60",
            error
              ? "border-[var(--sb-red)] focus:border-[var(--sb-red)] focus:ring-2 focus:ring-[var(--sb-red)]/10"
              : "border-[var(--sb-border)] focus:border-[var(--sb-gold)] focus:ring-2 focus:ring-[var(--sb-gold)]/10"
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--sb-muted)]">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-[var(--sb-muted)]">{hint}</p>}
      {error && <p className="text-xs text-[var(--sb-red)]">{error}</p>}
    </div>
  );
}

function SliderGroup({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--sb-text)]">{label}</label>
        <span className="rounded-lg bg-[var(--sb-gold-light)] px-2 py-0.5 text-xs font-semibold text-[var(--sb-gold)]">
          {formatBps(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[var(--sb-border)] accent-[var(--sb-gold)] disabled:opacity-50"
      />
      {hint && <p className="text-xs text-[var(--sb-muted)]">{hint}</p>}
    </div>
  );
}

export default function LaunchHome() {
  const { account, isConnected, signer } = useWallet();
  const showToast = useAppStore((s) => s.showToast);
  const { copied, copy } = useCopy();

  const [deployMode, setDeployMode] = useState<"deploy" | "launch">("deploy");
  const [params, setParams] = useState<SnowballParams>(DEFAULT_PARAMS);
  const [factoryInfo, setFactoryInfo] = useState<{
    createFee: string;
    rewardToken: string;
    feeRecipient: string;
    requiredSuffix: string;
    router: string;
  } | null>(null);

  const [fees, setFees] = useState<{ buy: FeeBreakdown; sell: FeeBreakdown } | null>(null);
  const [feesLoading, setFeesLoading] = useState(false);

  const [mining, setMining] = useState(false);
  const [mineResult, setMineResult] = useState<{ salt: string; address: string; attempts: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [launching, setLaunching] = useState(false);
  const [manageToken, setManageToken] = useState("");
  const [vanitySuffix, setVanitySuffix] = useState("7777");
  const [manageInfo, setManageInfo] = useState<{ owner: string; launched: boolean } | null>(null);

  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ tokenAddress: string; txHash: string } | null>(null);

  const [liquidityBnb, setLiquidityBnb] = useState("0.1");
  const [liquidityTokenPercent, setLiquidityTokenPercent] = useState(80);

  const [factoryStatus, setFactoryStatus] = useState<"loading" | "ok" | "failed">("loading");
  useEffect(() => {
    getFactoryInfo()
      .then((info) => {
        setFactoryInfo(info);
        setFactoryStatus("ok");
      })
      .catch(() => {
        setFactoryInfo(null);
        setFactoryStatus("failed");
      });
  }, []);

  useEffect(() => {
    if (account && !params.receiver) {
      setParams((p) => ({ ...p, receiver: account, fundAddress: account }));
    }
  }, [account, params.receiver]);

  useEffect(() => {
    let cancelled = false;
    setFeesLoading(true);
    previewFees(params)
      .then((f) => {
        if (!cancelled) setFees(f);
      })
      .catch(() => {
        if (!cancelled) setFees(null);
      })
      .finally(() => setFeesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params]);

  const paramsKey = useMemo(
    () =>
      JSON.stringify({
        ...params,
        deployMode,
        liquidityBnb,
        liquidityTokenPercent,
      }),
    [params, deployMode, liquidityBnb, liquidityTokenPercent]
  );
  useEffect(() => {
    setMineResult(null);
  }, [paramsKey]);

  const shareError = useMemo(() => {
    const total = params.rewardShare + params.liquidityShare + params.burnShare + params.fundShare;
    return total !== BPS ? `四项占比之和必须为 100%，当前 ${(total / 100).toFixed(2)}%` : "";
  }, [params.rewardShare, params.liquidityShare, params.burnShare, params.fundShare]);

  const taxError = useMemo(() => {
    if (params.totalBuyTax === 0 || params.totalBuyTax > 2500) return "买税需在 0.01% ~ 25% 之间";
    if (params.totalSellTax === 0 || params.totalSellTax > 2500) return "卖税需在 0.01% ~ 25% 之间";
    return "";
  }, [params.totalBuyTax, params.totalSellTax]);

  const rewardTokenError = useMemo(() => {
    if (params.rewardShare === 0) return "";
    if (!params.rewardToken) return "启用分红时必须填写分红币合约地址";
    if (!ethers.isAddress(params.rewardToken)) return "请输入有效的分红币合约地址";
    return "";
  }, [params.rewardShare, params.rewardToken]);

  const launchParamError = useMemo(() => {
    if (deployMode !== "launch") return "";
    const bnb = Number(liquidityBnb);
    if (!bnb || bnb <= 0) return "加池 BNB 必须大于 0";
    if (liquidityTokenPercent <= 0 || liquidityTokenPercent > 100) return "加池代币比例需在 1% ~ 100% 之间";
    return "";
  }, [deployMode, liquidityBnb, liquidityTokenPercent]);

  const totalSupplyBigint = useMemo(() => {
    try {
      return ethers.parseUnits(params.totalSupply || "0", 18);
    } catch {
      return 0n;
    }
  }, [params.totalSupply]);

  const canCreate = useMemo(() => {
    if (!isConnected) return false;
    if (!params.name || !params.symbol || !params.totalSupply || !params.receiver) return false;
    if (!ethers.isAddress(params.receiver)) return false;
    if (params.fundAddress && !ethers.isAddress(params.fundAddress)) return false;
    if (rewardTokenError) return false;
    if (params.currency && !ethers.isAddress(params.currency)) return false;
    if (totalSupplyBigint <= 0n) return false;
    if (params.lpBurnFrequency < 3600 || params.percentForLPBurn < 1 || params.percentForLPBurn > 100) return false;
    if (params.killBlocks < 0 || params.killBlocks > 100 || params.airdropNumbs < 0 || params.airdropNumbs > 3) return false;
    if (shareError || taxError || rewardTokenError || launchParamError) return false;
    return true;
  }, [isConnected, params, shareError, taxError, rewardTokenError, launchParamError, totalSupplyBigint]);

  const liquidityTokens = useMemo(() => {
    if (deployMode !== "launch" || !totalSupplyBigint) return 0n;
    return (totalSupplyBigint * BigInt(liquidityTokenPercent)) / 100n;
  }, [deployMode, totalSupplyBigint, liquidityTokenPercent]);

  const remainingTokens = useMemo(() => {
    if (deployMode !== "launch") return 0n;
    return totalSupplyBigint - liquidityTokens;
  }, [deployMode, totalSupplyBigint, liquidityTokens]);

  const initialPrice = useMemo(() => {
    if (deployMode !== "launch" || !liquidityTokens || !Number(liquidityBnb)) return null;
    const bnb = ethers.parseEther(liquidityBnb);
    return Number(bnb) / Number(liquidityTokens);
  }, [deployMode, liquidityTokens, liquidityBnb]);

  const getCreateValidationError = () => {
    if (!isConnected || !signer) return "请先连接钱包";
    if (!factoryInfo) return factoryStatus === "loading" ? "Factory 信息仍在读取，请稍候" : "Factory 连接失败，请刷新后重试";
    if (!params.name.trim()) return "请填写代币名称";
    if (!params.symbol.trim()) return "请填写代币符号";
    if (totalSupplyBigint <= 0n) return "请填写有效的代币总供应量";
    if (!ethers.isAddress(params.receiver)) return "请填写有效的项目方收款地址";
    if (params.fundAddress && !ethers.isAddress(params.fundAddress)) return "请填写有效的基金/营销地址";
    if (rewardTokenError) return rewardTokenError;
    if (params.currency && !ethers.isAddress(params.currency)) return "交易对币地址无效";
    if (taxError) return taxError;
    if (shareError) return shareError;
    if (launchParamError) return launchParamError;
    if (params.lpBurnFrequency < 3600) return "燃烧间隔不能低于 3600 秒";
    if (params.percentForLPBurn < 1 || params.percentForLPBurn > 100) return "每次燃烧比例需在 0.01% ~ 1% 之间";
    if (params.killBlocks < 0 || params.killBlocks > 100) return "杀区块数需在 0 ~ 100 之间";
    if (params.airdropNumbs < 0 || params.airdropNumbs > 3) return "空投份数需在 0 ~ 3 之间";
    return "";
  };

  const handleMine = async (): Promise<{ salt: string; address: string; attempts: number } | null> => {
    const validationError = getCreateValidationError();
    if (validationError) {
      showToast(validationError, "error");
      return null;
    }
    const activeFactoryInfo = factoryInfo;
    if (!activeFactoryInfo) return null;
    setMining(true);
    setMineResult(null);
    abortRef.current = new AbortController();
    try {
      const built = await buildContractParams(params, deployMode === "launch");
      const suffix = activeFactoryInfo.requiredSuffix && activeFactoryInfo.requiredSuffix !== "0"
        ? activeFactoryInfo.requiredSuffix
        : vanitySuffix.trim().toLowerCase() || "7777";
      if (!/^[0-9a-f]{1,6}$/.test(suffix)) {
        showToast("靓号后缀需为 1-6 位十六进制字符（0-9、a-f）", "error");
        setMining(false);
        return null;
      }
      showToast(SNOWBALL_API_BASE ? "尝试服务端挖盐…" : "正在本地挖盐…", "info");
      const serverRes = await serverMineSalt(built, suffix);
      if (serverRes) {
        setMineResult(serverRes);
        showToast(`服务端靓号挖到：${shorten(serverRes.address)}（${serverRes.attempts.toLocaleString()} 次）`, "success");
        return serverRes;
      } else {
        const provider = getReadProvider();
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        showToast("服务端不可用，改用本地挖盐…", "info");
        const res = await mineSalt(
          factory,
          built,
          suffix,
          (tried, addr) => showToast(`已尝试 ${tried} 次，当前 ${shorten(addr)}`, "info"),
          abortRef.current.signal
        );
        setMineResult(res);
        showToast(`靓号挖到：${shorten(res.address)}`, "success");
        return res;
      }
    } catch (e: any) {
      showToast(e.message || "挖盐失败", "error");
      return null;
    } finally {
      setMining(false);
      abortRef.current = null;
    }
  };

  const handleCreate = async () => {
    const validationError = getCreateValidationError();
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    const activeMineResult = mineResult || await handleMine();
    if (!signer || !factoryInfo || !activeMineResult) return;
    setCreating(true);
    try {
      const requiredValue = BigInt(factoryInfo.createFee) +
        (deployMode === "launch" ? ethers.parseEther(liquidityBnb) : 0n);
      const signerProvider = signer.provider;
      if (!signerProvider) throw new Error("钱包 Provider 不可用，请重新连接钱包");
      const walletBalance = await signerProvider.getBalance(await signer.getAddress());
      if (walletBalance < requiredValue) {
        throw new Error(`余额不足：至少需要 ${ethers.formatEther(requiredValue)} BNB，另需预留 Gas`);
      }
      let res;
      if (deployMode === "launch") {
        const bnbWei = ethers.parseEther(liquidityBnb).toString();
        res = await createTokenAndAddLiquidity(
          signer,
          params,
          activeMineResult.salt,
          factoryInfo.createFee,
          liquidityTokens.toString(),
          bnbWei
        );
      } else {
        res = await createToken(signer, params, activeMineResult.salt, factoryInfo.createFee);
      }
      setResult({ tokenAddress: res.tokenAddress, txHash: res.txHash });
      showToast("代币创建成功", "success");
    } catch (e: any) {
      showToast(e.reason || e.message || "创建失败", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleLaunch = async (tokenAddress: string) => {
    if (!signer) {
      showToast("请先连接钱包（需使用项目方钱包）", "error");
      return;
    }
    setLaunching(true);
    try {
      const token = new ethers.Contract(tokenAddress, BANANA_TOKEN_ABI, signer);
      const tx = await token.launch();
      showToast("开盘交易已提交，等待确认…", "info");
      await tx.wait();
      showToast("开盘成功！交易已开放", "success");
      setManageInfo((prev) => (prev ? { ...prev, launched: true } : prev));
    } catch (e: any) {
      showToast(e.reason || e.shortMessage || e.message || "开盘失败", "error");
    } finally {
      setLaunching(false);
    }
  };

  const handleQueryToken = async () => {
    const addr = manageToken.trim();
    if (!ethers.isAddress(addr)) {
      showToast("请输入有效的代币地址", "error");
      return;
    }
    try {
      const provider = getReadProvider();
      const token = new ethers.Contract(addr, BANANA_TOKEN_ABI, provider);
      const [owner, startTime] = await Promise.all([token.owner(), token.startTradeTime()]);
      setManageInfo({ owner, launched: Number(startTime) > 0 });
    } catch (e: any) {
      setManageInfo(null);
      showToast(e.reason || e.shortMessage || "查询失败：该地址可能不是本发射台代币", "error");
    }
  };

  const feeBar = (fee: FeeBreakdown | null) => {
    if (!fee) return null;
    const total = fee.platformFee + fee.rewardFee + fee.liquidityFee + fee.burnFee + fee.fundFee;
    if (total === 0) return null;
    return (
      <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--sb-border)]">
        <div className="flex h-full w-full">
          <div style={{ width: `${(fee.platformFee / total) * 100}%` }} className="bg-[var(--sb-red)]" />
          <div style={{ width: `${(fee.rewardFee / total) * 100}%` }} className="bg-[var(--sb-gold)]" />
          <div style={{ width: `${(fee.liquidityFee / total) * 100}%` }} className="bg-blue-400" />
          <div style={{ width: `${(fee.burnFee / total) * 100}%` }} className="bg-orange-400" />
          <div style={{ width: `${(fee.fundFee / total) * 100}%` }} className="bg-emerald-400" />
        </div>
      </div>
    );
  };

  const handleShareChange = (key: keyof SnowballParams, value: number) => {
    setParams((p) => {
      if (key === "fundShare") return p;
      const adjustableKeys = ["rewardShare", "liquidityShare", "burnShare"] as const;
      const otherTotal = adjustableKeys
        .filter((item) => item !== key)
        .reduce((sum, item) => sum + p[item], 0);
      const clamped = Math.max(0, Math.min(value, BPS - otherTotal));
      const next = { ...p, [key]: clamped };
      next.fundShare = BPS - next.rewardShare - next.liquidityShare - next.burnShare;
      return next;
    });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--sb-bg)] pb-24">
      {/* 统一导航栏 */}
      <LaunchpadHeader />

      {/* Hero / status strip */}
      <section className="mx-auto max-w-6xl px-4 pb-6 pt-8">
        <div className="sb-brand-hero flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4 lg:flex-1">
            <div
              className={cn(
                "mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-[var(--sb-card)] shadow-[0_0_8px_currentColor]",
                isConnected ? "bg-[var(--sb-success)] text-[var(--sb-success)]" : "bg-[var(--sb-muted)] text-[var(--sb-muted)]"
              )}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="sb-flame-mark h-9 w-9"><Flame className="h-5 w-5" /></span>
                <h2 className="sb-hero-title text-2xl font-black tracking-tight lg:text-3xl">猴子币发射台</h2>
                <span className="rounded-md bg-orange-200/20 px-2 py-0.5 text-[10px] font-bold text-orange-200">LAUNCH / BURN / MINT</span>
              </div>
              <p className="sb-hero-copy mt-1.5 text-sm">
                一键创建带 LP 单边燃烧机制的 meme 币：自动烧池、自动回流、持币分红、Mint 募集
              </p>
              <p className="sb-hero-meta mt-1 text-xs">
                {isConnected
                  ? `${shorten(account!)} · Factory ${shorten(FACTORY_ADDRESS)}`
                  : "连接钱包后会自动填入创建者接收地址"}
              </p>
              {factoryStatus === "failed" && (
                <p className="mt-2 flex items-center gap-1 text-xs text-[var(--sb-red)]">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  无法读取 Factory 信息（{shorten(FACTORY_ADDRESS)}），连接主网节点失败，请刷新重试
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:w-[460px]">
            {[
              {
                label: "创建费",
                value: factoryInfo ? `${ethers.formatEther(factoryInfo.createFee)} BNB` : factoryStatus === "loading" ? "读取中…" : "--",
              },
              {
                label: "靓号后缀",
                value: factoryInfo ? (factoryInfo.requiredSuffix === "0" ? "无" : factoryInfo.requiredSuffix) : "--",
              },
              {
                label: "分红代币",
                value:
                  params.rewardToken.toLowerCase() === ADDRESSES.usdt.toLowerCase()
                    ? "USDT"
                    : params.rewardToken.toLowerCase() === ADDRESSES.wbnb.toLowerCase()
                      ? "WBNB"
                      : shorten(params.rewardToken),
              },
              { label: "网络", value: "BSC 主网" },
            ].map((item) => (
              <div
                key={item.label}
                className="sb-hero-stat rounded-xl border p-3 text-center transition-colors hover:border-orange-200/60"
              >
                <div className="sb-hero-stat-label text-xs">{item.label}</div>
                <div className="sb-hero-stat-value mt-1 text-sm font-bold">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 标准 Mint 发射入口在顶部导航：#/mint、#/mint-launches */}

      {/* Deploy mode */}
      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-black text-[var(--sb-text)]"><Rocket className="h-5 w-5 text-[var(--sb-gold)]" />创建你的带燃烧机制代币</h2>
          <p className="text-sm text-[var(--sb-muted)]">选择发行方式，配置税率与单边燃烧参数后一键部署。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {DEPLOY_MODES.map((mode) => (
            <button
              key={mode.key}
              onClick={() => setDeployMode(mode.key)}
              className={cn(
                "rounded-2xl border p-6 text-left transition",
                deployMode === mode.key
                  ? "border-[var(--sb-gold)] bg-[var(--sb-gold-light)]"
                  : "border-[var(--sb-border)] bg-white hover:border-[var(--sb-gold)]/50"
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border",
                    deployMode === mode.key
                      ? "border-[var(--sb-gold)] bg-[var(--sb-gold)] text-white"
                      : "border-[var(--sb-muted)]"
                  )}
                >
                  {deployMode === mode.key && <Check className="h-3 w-3" />}
                </span>
                <span className="font-bold text-[var(--sb-text)]">{mode.title}</span>
              </div>
              <p className="text-sm text-[var(--sb-muted)]">{mode.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Main form */}
      <main className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title="基础信息" icon={Rocket} number="01">
            <div className="grid gap-5 md:grid-cols-2">
              <InputGroup
                label="代币名称"
                value={params.name}
                onChange={(v) => setParams((p) => ({ ...p, name: v }))}
                placeholder="如：Monkey Token"
              />
              <InputGroup
                label="代币符号"
                value={params.symbol}
                onChange={(v) => setParams((p) => ({ ...p, symbol: v }))}
                placeholder="如：MKY"
              />
              <InputGroup
                label="总供应量"
                value={params.totalSupply}
                onChange={(v) => setParams((p) => ({ ...p, totalSupply: v }))}
                placeholder="1000000000"
                suffix="枚"
              />
              <InputGroup
                label="项目方收款地址"
                value={params.receiver}
                onChange={(v) => setParams((p) => ({ ...p, receiver: v }))}
                placeholder="0x..."
                hint="创建后代币所有权、未加池的币会归此地址"
              />
              <InputGroup
                label="基金/营销地址（可选）"
                value={params.fundAddress}
                onChange={(v) => setParams((p) => ({ ...p, fundAddress: v }))}
                placeholder="默认与收款地址相同"
                hint="用于接收 fundShare 部分的手续费"
              />
            </div>
          </Card>

          {deployMode === "launch" && (
            <Card title="一键加池设置" icon={Droplets} number="02">
              <div className="grid gap-5 md:grid-cols-2">
                <InputGroup
                  label="加池 BNB"
                  value={liquidityBnb}
                  onChange={setLiquidityBnb}
                  type="number"
                  suffix="BNB"
                  hint="创建时代币会先全部 mint 到 Factory，再用其中一部分加池"
                />
                <SliderGroup
                  label="加池代币比例"
                  value={liquidityTokenPercent}
                  onChange={setLiquidityTokenPercent}
                  min={1}
                  max={100}
                  step={1}
                  hint="剩余代币会转给项目方收款地址"
                />
              </div>
              <div className="mt-4 grid gap-2 text-sm text-[var(--sb-muted)]">
                <div className="flex justify-between">
                  <span>加池代币</span>
                  <span className="font-medium text-[var(--sb-text)]">{ethers.formatUnits(liquidityTokens, 18)} 枚</span>
                </div>
                <div className="flex justify-between">
                  <span>项目方保留</span>
                  <span className="font-medium text-[var(--sb-text)]">{ethers.formatUnits(remainingTokens, 18)} 枚</span>
                </div>
                <div className="flex justify-between">
                  <span>预估初始价格</span>
                  <span className="font-medium text-[var(--sb-text)]">
                    {initialPrice ? `${initialPrice.toExponential(6)} BNB/枚` : "--"}
                  </span>
                </div>
              </div>
            </Card>
          )}

          <Card title="交易税配置" icon={Droplets} number="03">
            {taxError && <p className="mb-4 text-sm text-[var(--sb-red)]">{taxError}</p>}
            <div className="mb-6 rounded-xl border border-[var(--sb-border)] bg-white/70 p-4">
              <InputGroup
                label="分红币合约地址"
                value={params.rewardToken}
                onChange={(v) => setParams((p) => ({ ...p, rewardToken: v.trim() }))}
                placeholder={ADDRESSES.usdt}
                error={rewardTokenError}
                hint="分红税会兑换为该 ERC-20 代币并分配给符合条件的持币地址；填写 0x 地址，不是分红追踪器地址。"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[var(--sb-muted)]">快捷选择：</span>
                <button
                  type="button"
                  onClick={() => setParams((p) => ({ ...p, rewardToken: ADDRESSES.usdt }))}
                  className="rounded-lg border border-[var(--sb-border)] px-2.5 py-1 font-medium text-[var(--sb-text)] transition hover:border-[var(--sb-gold)]"
                >
                  BSC-USDT
                </button>
                <button
                  type="button"
                  onClick={() => setParams((p) => ({ ...p, rewardToken: ADDRESSES.wbnb }))}
                  className="rounded-lg border border-[var(--sb-border)] px-2.5 py-1 font-medium text-[var(--sb-text)] transition hover:border-[var(--sb-gold)]"
                >
                  WBNB
                </button>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <SliderGroup
                label="买入税率"
                value={params.totalBuyTax}
                onChange={(v) => setParams((p) => ({ ...p, totalBuyTax: v }))}
                min={10}
                max={2500}
                step={10}
              />
              <SliderGroup
                label="卖出税率"
                value={params.totalSellTax}
                onChange={(v) => setParams((p) => ({ ...p, totalSellTax: v }))}
                min={10}
                max={2500}
                step={10}
              />
            </div>

            <div className="mt-6 border-t border-[var(--sb-border)] pt-6">
              <p className="mb-4 text-sm font-medium text-[var(--sb-text)]">
                税后分配比例（四项之和须 = 100%）
              </p>
              {shareError && <p className="mb-3 text-sm text-[var(--sb-red)]">{shareError}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <SliderGroup
                  label="持币分红 share"
                  value={params.rewardShare}
                  onChange={(v) => handleShareChange("rewardShare", v)}
                  min={0}
                  max={BPS}
                  step={100}
                  hint="持币分红占税后分配的比例"
                />
                <SliderGroup
                  label="自动回流 share"
                  value={params.liquidityShare}
                  onChange={(v) => handleShareChange("liquidityShare", v)}
                  min={0}
                  max={BPS}
                  step={100}
                />
                <SliderGroup
                  label="燃烧 share"
                  value={params.burnShare}
                  onChange={(v) => handleShareChange("burnShare", v)}
                  min={0}
                  max={BPS}
                  step={100}
                />
                <SliderGroup
                  label="基金 share"
                  value={params.fundShare}
                  onChange={(v) => handleShareChange("fundShare", v)}
                  min={0}
                  max={BPS}
                  step={100}
                  disabled
                  hint="自动承接前三项分配后的剩余比例"
                />
              </div>
            </div>
          </Card>

          <Card title="单边燃烧与风控" icon={FireExtinguisher} number="04">
            <div className="grid gap-5 md:grid-cols-2">
              <InputGroup
                label="燃烧间隔"
                value={params.lpBurnFrequency}
                onChange={(v) => setParams((p) => ({ ...p, lpBurnFrequency: Number(v) }))}
                type="number"
                suffix="秒"
                hint="默认 3600 秒 = 1 小时，最短 3600 秒"
              />
              <SliderGroup
                label="每次燃烧池子储备比例"
                value={params.percentForLPBurn}
                onChange={(v) => setParams((p) => ({ ...p, percentForLPBurn: v }))}
                min={1}
                max={100}
                step={1}
                hint="50 = 0.5%，最大 1%"
              />
              <InputGroup
                label="单钱包最大持仓"
                value={params.maxWalletAmount}
                onChange={(v) => setParams((p) => ({ ...p, maxWalletAmount: v }))}
                placeholder="0 = 无限制"
                suffix="枚"
              />
              <InputGroup
                label="单次最大卖出"
                value={params.maxSellAmount}
                onChange={(v) => setParams((p) => ({ ...p, maxSellAmount: v }))}
                placeholder="0 = 无限制"
                suffix="枚"
              />
              <InputGroup
                label="单次最大买入"
                value={params.maxBuyAmount}
                onChange={(v) => setParams((p) => ({ ...p, maxBuyAmount: v }))}
                placeholder="0 = 无限制"
                suffix="枚"
              />
              <InputGroup
                label="杀区块数（killBlocks）"
                value={params.killBlocks}
                onChange={(v) => setParams((p) => ({ ...p, killBlocks: Number(v) }))}
                type="number"
                hint="开盘后前 N 个区块限制交易，0 = 不限制，最大 100"
              />
            </div>
          </Card>

          <Card title="高级选项" icon={ShieldCheck} number="05">
            <div className="grid gap-5 md:grid-cols-2">
              <InputGroup
                label="转账手续费"
                value={params.transferFee}
                onChange={(v) => setParams((p) => ({ ...p, transferFee: Number(v) }))}
                type="number"
                suffix="bps"
                hint="钱包之间转账的额外费率"
              />
              <InputGroup
                label="持币分红门槛"
                value={params.mushHoldNum}
                onChange={(v) => setParams((p) => ({ ...p, mushHoldNum: v }))}
                placeholder="0"
                suffix="枚"
              />
              <InputGroup
                label="二级白名单保护时长"
                value={params.secondTime}
                onChange={(v) => setParams((p) => ({ ...p, secondTime: Number(v) }))}
                type="number"
                suffix="秒"
                hint="开盘后的二级白名单保护窗口，不是延迟开盘"
              />
              <InputGroup
                label="空投份数"
                value={params.airdropNumbs}
                onChange={(v) => setParams((p) => ({ ...p, airdropNumbs: Number(v) }))}
                type="number"
                hint="0 ~ 3"
              />
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--sb-border)] bg-white/80 p-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={params.enableOffTrade}
                  onChange={(e) => setParams((p) => ({ ...p, enableOffTrade: e.target.checked }))}
                  className="h-4 w-4 accent-[var(--sb-gold)]"
                />
                <span className="text-sm text-[var(--sb-text)]">启用 off-trade 控制（未 launch 前禁止交易）</span>
              </label>
            </div>
          </Card>
        </div>

        {/* Sidebar preview */}
        <div className="space-y-6">
          <Card title="费用预览" icon={Sparkles}>
            <div className="mb-5 grid grid-cols-2 gap-3">
              <TaxRing fee={fees?.buy ?? null} label="买入税" totalTaxBps={params.totalBuyTax} loading={feesLoading} />
              <TaxRing fee={fees?.sell ?? null} label="卖出税" totalTaxBps={params.totalSellTax} loading={feesLoading} />
            </div>
            <div className="mb-5 grid grid-cols-1 gap-1.5 rounded-xl bg-[var(--sb-bg)]/60 p-3 text-xs text-[var(--sb-muted)] sm:grid-cols-2">
              {RING_LEGEND.map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                  <span className="ml-auto font-medium text-[var(--sb-text)]">
                    {feeSharePct(fees?.buy, item.feeKey)}% / {feeSharePct(fees?.sell, item.feeKey)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-[var(--sb-muted)]">买入总税</span>
                  <span className="font-bold text-[var(--sb-text)]">{formatBps(params.totalBuyTax)}</span>
                </div>
                {feesLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-[var(--sb-muted)]" />
                ) : (
                  feeBar(fees?.buy || null)
                )}
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-[var(--sb-muted)]">
                  <span>分红 {formatBps(fees?.buy.rewardFee || 0)}</span>
                  <span>回流 {formatBps(fees?.buy.liquidityFee || 0)}</span>
                  <span>燃烧 {formatBps(fees?.buy.burnFee || 0)}</span>
                  <span>基金 {formatBps(fees?.buy.fundFee || 0)}</span>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-[var(--sb-muted)]">卖出总税</span>
                  <span className="font-bold text-[var(--sb-text)]">{formatBps(params.totalSellTax)}</span>
                </div>
                {feesLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-[var(--sb-muted)]" />
                ) : (
                  feeBar(fees?.sell || null)
                )}
              </div>
            </div>
          </Card>

          <Card title="LP 燃烧效果" icon={Flame}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--sb-muted)]">每次燃烧</span>
                <span className="font-bold text-[var(--sb-red)]">{(params.percentForLPBurn / 100).toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--sb-muted)]">间隔</span>
                <span className="font-medium text-[var(--sb-text)]">{(params.lpBurnFrequency / 3600).toFixed(2)} 小时</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--sb-muted)]">理论日燃烧</span>
                <span className="font-bold text-[var(--sb-red)]">
                  {Math.min((params.percentForLPBurn / 100) * (86400 / params.lpBurnFrequency), 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--sb-muted)]">复利后日减少</span>
                <span className="font-bold text-[var(--sb-gold)]">
                  {((1 - Math.pow(1 - params.percentForLPBurn / 10000, 86400 / params.lpBurnFrequency)) * 100).toFixed(2)}%
                </span>
              </div>
              <p className="text-xs text-[var(--sb-muted)]">
                实际触发条件：达到间隔后，下一笔非免税地址向主 Pair 的卖出交易才会燃烧；期间没有触发交易则不补算。
              </p>
            </div>
          </Card>

          <Card title="靓号挖盐" icon={Sparkles}>
            <div className="space-y-4">
              <p className="text-sm text-[var(--sb-muted)]">
                使用 CREATE2 离线预测地址，找到符合后缀的 salt 后再上链创建。模式或参数变化后需重新挖盐。
              </p>
              <InputGroup
                label="靓号后缀"
                value={vanitySuffix}
                onChange={setVanitySuffix}
                placeholder="如 7777 / 8888 / abcd"
                hint="1-6 位十六进制字符（0-9、a-f），留空默认 7777"
              />
              <button
                onClick={handleMine}
                disabled={mining || !canCreate || !factoryInfo}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition",
                  mining || !canCreate || !factoryInfo
                    ? "cursor-not-allowed bg-[var(--sb-muted)]"
                    : "bg-gradient-to-r from-[var(--sb-gold)] to-orange-500 hover:shadow-lg"
                )}
              >
                {mining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {mining ? "挖盐中..." : "开始挖靓号"}
              </button>
              {mineResult && (
                <div className="rounded-xl border border-[var(--sb-gold)]/30 bg-[var(--sb-gold-light)] p-3 text-sm">
                  <p className="mb-1 text-[var(--sb-muted)]">预测地址</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="break-all font-mono font-medium text-[var(--sb-text)]">{mineResult.address}</span>
                    <button onClick={() => copy(mineResult.address)} className="shrink-0 text-[var(--sb-gold)] hover:text-[var(--sb-text)]">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-[var(--sb-muted)]">尝试次数：{mineResult.attempts.toLocaleString()}</p>
                </div>
              )}
            </div>
          </Card>

          <Card title="代币管理" icon={ShieldCheck}>
            <div className="space-y-3">
              <InputGroup
                label="代币地址"
                value={manageToken}
                onChange={setManageToken}
                placeholder="0x..."
                hint="普通部署的代币需项目方手动开盘（一键发射已自动开盘）"
              />
              <button
                onClick={handleQueryToken}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--sb-gold)]/50 bg-[var(--sb-gold-light)] py-2.5 text-sm font-bold text-[var(--sb-text)] transition hover:bg-[var(--sb-gold-light)]/70"
              >
                <Search className="h-4 w-4" /> 查询状态
              </button>
              {manageInfo && (
                <div className="space-y-2 rounded-xl bg-[var(--sb-bg)] p-3 text-xs text-[var(--sb-muted)]">
                  <div className="flex items-center justify-between">
                    <span>Owner</span>
                    <span className="font-mono font-medium text-[var(--sb-text)]">{shorten(manageInfo.owner)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>开盘状态</span>
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 font-bold",
                        manageInfo.launched ? "bg-[var(--sb-success)]/10 text-[var(--sb-success)]" : "bg-[var(--sb-gold-light)] text-[var(--sb-gold)]"
                      )}
                    >
                      {manageInfo.launched ? "已开盘" : "未开盘"}
                    </span>
                  </div>
                </div>
              )}
              <button
                onClick={() => handleLaunch(manageToken.trim())}
                disabled={launching || !manageInfo || manageInfo.launched}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--sb-gold)] to-orange-500 py-2.5 text-sm font-bold text-white transition hover:shadow-lg",
                  (launching || !manageInfo || manageInfo.launched) && "cursor-not-allowed opacity-60"
                )}
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                {launching ? "开盘交易确认中…" : manageInfo?.launched ? "已开盘" : "开盘"}
              </button>
              {manageInfo && !manageInfo.launched && (
                <p className="text-center text-xs text-[var(--sb-muted)]">需使用项目方钱包（Owner）连接后执行</p>
              )}
            </div>
          </Card>

          <div className="space-y-3">
            <button
              onClick={handleCreate}
              disabled={creating || mining}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sb-text)] py-3 text-sm font-bold text-white transition hover:bg-[var(--sb-text)]/90",
                (creating || mining) && "cursor-not-allowed opacity-60"
              )}
            >
              {creating || mining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              {mining ? "正在准备靓号地址..." : creating ? "等待钱包确认..." : deployMode === "launch" ? "创建并加池开盘" : "仅创建代币"}
            </button>
            <p className="text-center text-xs text-[var(--sb-muted)]">
              {deployMode === "launch"
                ? `需支付 ${factoryInfo ? ethers.formatEther(factoryInfo.createFee) : "--"} BNB 创建费 + ${liquidityBnb} BNB 加池`
                : `需支付 ${factoryInfo ? ethers.formatEther(factoryInfo.createFee) : "--"} BNB 创建费`}
            </p>
          </div>
        </div>
      </main>

      {/* Result modal */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--sb-gold-light)] text-[var(--sb-gold)]">
              <Check className="h-7 w-7" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-[var(--sb-text)]">代币创建成功</h3>
            <div className="mb-4 space-y-2 rounded-xl bg-[var(--sb-bg)] p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--sb-muted)]">合约地址</span>
                <button onClick={() => copy(result.tokenAddress)} className="flex items-center gap-1 break-all font-mono text-[var(--sb-text)] hover:text-[var(--sb-gold)]">
                  {shorten(result.tokenAddress)}
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--sb-muted)]">交易哈希</span>
                <a
                  href={`https://bscscan.com/tx/${result.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-[var(--sb-text)] hover:text-[var(--sb-gold)]"
                >
                  {shorten(result.txHash)}
                </a>
              </div>
            </div>
            <p className="mb-4 mt-2 flex items-start gap-1.5 text-xs text-[var(--sb-muted)]">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--sb-gold)]" />
              {SNOWBALL_API_BASE
                ? "自动开源服务已配置，后端会监听创建记录并提交 BscScan 验证。"
                : "当前未配置自动开源后端；代币创建不受影响，但源码验证需单独部署后端服务。"}
            </p>
            {deployMode === "deploy" && (
              <button
                onClick={() => handleLaunch(result.tokenAddress)}
                disabled={launching}
                className={cn(
                  "mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--sb-gold)] to-orange-500 py-3 text-sm font-bold text-white transition hover:shadow-lg",
                  launching && "cursor-not-allowed opacity-60"
                )}
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                {launching ? "开盘交易确认中…" : "立即开盘"}
              </button>
            )}
            <button
              onClick={() => setResult(null)}
              className="w-full rounded-xl bg-[var(--sb-text)] py-3 text-sm font-bold text-white"
            >
              再创建一个
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
