import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  Users,
  Save,
  Power,
  ArrowUpDown,
} from "lucide-react";
import {
  fetchMintLaunchProjects,
  mintLaunchProject,
  setMintProjectWhitelistAllowances,
  setMintProjectWhitelistEnabled,
} from "@/lib/mintLaunch/launchpad";
import type { MintLaunchProject } from "@/lib/mintLaunch/types";
import { useWallet } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";
import { goBack } from "@/lib/hashRouter";

function shortAddress(address: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function isSameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

export default function MintProjectDetail({ token }: { token: string }) {
  const wallet = useWallet();
  const [project, setProject] = useState<MintLaunchProject | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [mintQuantity, setMintQuantity] = useState("1");
  const [minting, setMinting] = useState(false);

  const [whitelistInput, setWhitelistInput] = useState("");
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [whitelistModeLoading, setWhitelistModeLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isCreator = useMemo(
    () => Boolean(wallet.account) && Boolean(project) && isSameAddress(wallet.account || "", project?.creator || ""),
    [wallet.account, project],
  );

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setStatus("error");
      setError("缺少代币地址参数");
      return;
    }

    setStatus("loading");
    setRefreshing(refreshKey > 0);
    setError("");
    fetchMintLaunchProjects(wallet.account || "")
      .then((data) => {
        if (!mounted) return;
        const found = data.find((p) => p.token.toLowerCase() === token.toLowerCase());
        if (found) {
          setProject(found);
          setStatus("ready");
        } else {
          setStatus("error");
          setError("未找到该发射项目");
        }
        setRefreshing(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "加载失败");
        setStatus("error");
        setRefreshing(false);
      });

    return () => {
      mounted = false;
    };
  }, [token, wallet.account, refreshKey]);

  const handleMint = async () => {
    if (!project || !wallet.signer) return;
    setMinting(true);
    try {
      await mintLaunchProject(wallet.signer, project, mintQuantity);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mint 失败");
    } finally {
      setMinting(false);
    }
  };

  const parseWhitelistAddresses = (text: string): string[] => {
    const raw = text
      .replace(/[\s,;]+/g, " ")
      .trim()
      .split(" ");
    return raw.filter((item) => item.length > 0);
  };

  const handleSaveWhitelist = async () => {
    if (!project || !wallet.signer || !isCreator) return;
    const addresses = parseWhitelistAddresses(whitelistInput);
    if (addresses.length === 0) {
      setError("请至少输入一个白名单地址");
      return;
    }
    if (addresses.length > 200) {
      setError("单次最多 200 个地址");
      return;
    }

    setWhitelistLoading(true);
    try {
      await setMintProjectWhitelistAllowances(
        wallet.signer,
        project.vault,
        addresses.map((account) => ({ account, allowance: "1" })),
      );
      setWhitelistInput("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存白名单失败");
    } finally {
      setWhitelistLoading(false);
    }
  };

  const handleToggleWhitelist = async () => {
    if (!project || !wallet.signer || !isCreator) return;
    setWhitelistModeLoading(true);
    try {
      await setMintProjectWhitelistEnabled(wallet.signer, project.vault, !project.whitelistEnabled);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换白名单模式失败");
    } finally {
      setWhitelistModeLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="page-fade-in world-empty">
        <Loader2 className="h-8 w-8 animate-spin text-[#FFD700]" />
        <p className="text-sm text-[#64748B]">正在加载项目详情…</p>
      </div>
    );
  }

  if (status === "error" || !project) {
    return (
      <div className="page-fade-in mx-auto max-w-3xl px-4 py-8 pb-28">
        <button onClick={goBack} className="world-btn-secondary mb-4">
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <div className="rounded-2xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 p-5 text-sm text-[#FF6B6B]">
          {error || "加载失败"}
        </div>
      </div>
    );
  }

  const mintCost = (BigInt(project.mintPriceWei || "0") * BigInt(mintQuantity || "0")).toString();

  return (
    <div className="page-fade-in mx-auto max-w-3xl px-4 py-6 pb-28 lg:py-8">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={goBack} className="world-btn-secondary">
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={refreshing}
          className="world-btn-secondary"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          刷新
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 p-4 text-sm text-[#FF6B6B]">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)]/80 p-5 lg:p-6">
        <div className="flex items-start gap-4">
          {project.avatar ? (
            <img
              src={project.avatar}
              alt={project.name}
              className="h-16 w-16 rounded-2xl object-cover ring-1 ring-[#E2E8F0]"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFD700]/20 to-[#00B4D8]/10 text-xl font-black text-[#FFD700]">
              {project.symbol.slice(0, 2) || "MK"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black tracking-tight text-[#0F172A]">{project.name}</h1>
            <p className="text-sm text-[#64748B]">
              {project.symbol} · {project.whitelistEnabled ? "白名单模式" : "公开模式"}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#94A3B8]">铸造进度</span>
            <span className="text-sm font-bold text-[#0F172A]">{project.progress.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FFD700] to-[#00B4D8]"
              style={{ width: `${Math.min(100, project.progress)}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-[#64748B]">
            <span>
              {project.mintedCount} / {project.mintCount} 份
            </span>
            <span>{project.finalized ? "已结束" : "进行中"}</span>
          </div>
        </div>

        {project.whitelistEnabled && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/80 p-3 text-sm text-[#64748B]">
            <Users className="h-4 w-4 text-[#FFD700]" />
            白名单 {project.whitelistMintedCount}/{project.whitelistMintCount} · 公开{" "}
            {project.publicMintedCount}/{project.publicMintCount}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/80 p-3">
            <div className="text-[#94A3B8]">单次价格</div>
            <div className="mt-1 text-[#0F172A]">
              {project.mintPrice} {project.paymentSymbol}
            </div>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/80 p-3">
            <div className="text-[#94A3B8]">单钱包上限</div>
            <div className="mt-1 text-[#0F172A]">
              {project.maxMintPerWallet === "0" ? "不限制" : `${project.maxMintPerWallet} 份`}
            </div>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/80 p-3">
            <div className="text-[#94A3B8]">代币合约</div>
            <a
              href={`https://bscscan.com/token/${project.token}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-mono text-[#B8860B] hover:underline"
            >
              {shortAddress(project.token)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/80 p-3">
            <div className="text-[#94A3B8]">金库合约</div>
            <a
              href={`https://bscscan.com/address/${project.vault}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-mono text-[#B8860B] hover:underline"
            >
              {shortAddress(project.vault)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {project.finalized && (
          <a
            href={`https://pancakeswap.finance/swap?outputCurrency=${project.token}`}
            target="_blank"
            rel="noreferrer"
            className="world-btn-primary mt-4 flex w-full items-center justify-center gap-2"
          >
            <ArrowUpDown className="h-4 w-4" />
            去 PancakeSwap 交易
          </a>
        )}
      </section>

      {!project.finalized && (
        <section className="mt-6 rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)]/80 p-5 lg:p-6">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-[#FFD700]" />
            <h2 className="text-lg font-bold text-[#0F172A]">参与 Mint</h2>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="number"
              min={1}
              value={mintQuantity}
              onChange={(e) => setMintQuantity(e.target.value)}
              className="world-input"
              placeholder="Mint 数量"
            />
            <button
              onClick={handleMint}
              disabled={minting || !wallet.signer}
              className="world-btn-primary whitespace-nowrap"
            >
              {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mint"}
              {Number(mintCost) > 0 && ` · ${mintCost} ${project.paymentSymbol}`}
            </button>
          </div>
          {project.whitelistEnabled && wallet.account && (
            <p className="mt-3 text-xs text-[#64748B]">
              白名单剩余份额：{project.whitelistRemaining} 份
            </p>
          )}
        </section>
      )}

      {isCreator && !project.finalized && (
        <section className="mt-6 rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)]/80 p-5 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#FFD700]" />
              <h2 className="text-lg font-bold text-[#0F172A]">白名单管理</h2>
            </div>
            <button
              onClick={handleToggleWhitelist}
              disabled={whitelistModeLoading}
              className={cn(
                "world-btn-secondary text-xs",
                project.whitelistEnabled ? "text-[#FF6B6B]" : "text-[#FFD700]",
              )}
            >
              <Power className="h-3.5 w-3.5" />
              {whitelistModeLoading
                ? "切换中"
                : project.whitelistEnabled
                  ? "关闭白名单"
                  : "开启白名单"}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/80 p-3 text-xs text-[#64748B]">
            已添加白名单地址数：{project.totalWhitelistAllowance}
          </div>

          <textarea
            value={whitelistInput}
            onChange={(e) => setWhitelistInput(e.target.value)}
            placeholder="批量粘贴白名单地址，每行一个，支持空格、逗号分隔"
            className="world-input mt-4 min-h-[120px] resize-y"
          />
          <p className="mt-2 text-xs text-[#94A3B8]">单次最多 200 个地址</p>

          <button
            onClick={handleSaveWhitelist}
            disabled={whitelistLoading || !whitelistInput.trim()}
            className="world-btn-primary mt-4 w-full"
          >
            {whitelistLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存白名单
          </button>
        </section>
      )}
    </div>
  );
}
