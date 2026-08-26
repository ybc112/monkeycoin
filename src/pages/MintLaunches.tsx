import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Rocket,
  Search,
  RefreshCw,
  ArrowRight,
  Clock,
  Users,
  Copy,
  Check,
  ArrowUpDown,
} from "lucide-react";
import { fetchMintLaunchProjects } from "@/lib/mintLaunch/launchpad";
import type { MintLaunchProject } from "@/lib/mintLaunch/types";
import { useWallet } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";
import { navigateTo } from "@/lib/hashRouter";

function shortAddress(address: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center rounded p-0.5 text-[#94A3B8] transition-colors hover:bg-[#E2E8F0] hover:text-[#B8860B]"
      title="复制地址"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MintLaunches() {
  const wallet = useWallet();
  const [projects, setProjects] = useState<MintLaunchProject[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.symbol.toLowerCase().includes(q) ||
        p.token.toLowerCase().includes(q),
    );
  }, [projects, query]);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setError("");
    fetchMintLaunchProjects(wallet.account || "")
      .then((data) => {
        if (!mounted) return;
        setProjects(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "加载失败");
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [wallet.account, refreshKey]);

  return (
    <div className="page-fade-in mx-auto max-w-7xl px-4 py-6 lg:py-8">
      <section className="rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)]/80 p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-[#B8860B]" />
              <h1 className="text-2xl font-black tracking-tight text-[#0F172A]">猴子币 Mint 已发射</h1>
            </div>
            <p className="mt-1 text-sm text-[#64748B]">
              展示通过 猴子币 Mint 发射台部署到 BNB Smart Chain 的代币与金库。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={status === "loading"}
              className="world-btn-secondary"
            >
              <RefreshCw className={cn("h-4 w-4", status === "loading" && "animate-spin")} />
              刷新
            </button>
            <button onClick={() => navigateTo("mint")} className="world-btn-primary">
              去发射
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            className="world-input pl-9"
            placeholder="搜索代币名称、符号或合约地址"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {status === "loading" && (
        <div className="world-empty">
          <Loader2 className="h-8 w-8 animate-spin text-[#B8860B]" />
          <p className="text-sm text-[#64748B]">正在加载链上发射列表…</p>
        </div>
      )}

      {status === "error" && (
        <div className="mt-6 rounded-2xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 p-5 text-sm text-[#FF6B6B]">
          {error || "加载失败，请检查网络或 Factory 配置。"}
        </div>
      )}

      {status === "ready" && filtered.length === 0 && (
        <div className="world-empty">
          <div className="world-empty-icon">
            <Rocket className="h-7 w-7" />
          </div>
          <p className="text-base font-medium text-[#0F172A]">
            {query ? "没有匹配的发射项目" : "暂无发射项目"}
          </p>
          <p className="text-sm text-[#64748B]">
            {query ? "尝试更换搜索关键词" : "去发射台创建第一个 猴子币 Mint 项目吧"}
          </p>
        </div>
      )}

      {status === "ready" && filtered.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <div
              key={project.token}
              className="group relative overflow-hidden rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)]/80 p-5 transition-all hover:border-amber-400/30 hover:shadow-[0_0_24px_rgba(212,168,67,0.08)]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--sb-gold)]/8 via-transparent to-amber-500/8 opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <div className="flex items-start gap-3">
                  {project.avatar ? (
                    <img
                      src={project.avatar}
                      alt={project.name}
                      className="h-12 w-12 rounded-xl object-cover ring-1 ring-[#E2E8F0]"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFD700]/20 to-[#00B4D8]/10 text-lg font-black text-[#B8860B]">
                      {project.symbol.slice(0, 2) || "MK"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold text-[#0F172A]">{project.name}</h3>
                    <p className="text-xs text-[#64748B]">
                      {project.symbol} · {formatTime(project.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">进度</span>
                    <span className="text-[#0F172A]">{project.progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#FFD700] to-[#00B4D8]"
                      style={{ width: `${Math.min(100, project.progress)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#94A3B8]">Minted</span>
                    <span className="text-[#0F172A]">
                      {project.mintedCount} / {project.mintCount}
                    </span>
                  </div>
                  {project.whitelistEnabled && (
                    <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                      <Users className="h-3 w-3" />
                      白名单 {project.whitelistMintedCount}/{project.whitelistMintCount} · 公开{" "}
                      {project.publicMintedCount}/{project.publicMintCount}
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]/80 p-2">
                    <div className="text-[#94A3B8]">代币</div>
                    <div className="mt-0.5 flex items-center font-mono text-[#0F172A]">
                      {shortAddress(project.token)}
                      <CopyButton text={project.token} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]/80 p-2">
                    <div className="text-[#94A3B8]">金库</div>
                    <div className="mt-0.5 flex items-center font-mono text-[#0F172A]">
                      {shortAddress(project.vault)}
                      <CopyButton text={project.vault} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Clock className="h-3.5 w-3.5 text-[#94A3B8]" />
                    <span className={project.finalized ? "text-[#FF6B6B]" : "text-[#B8860B]"}>
                      {project.finalized ? "已结束" : "进行中"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {project.finalized && (
                      <a
                        href={`https://pancakeswap.finance/swap?outputCurrency=${project.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#00B4D8] hover:underline"
                      >
                        交易
                        <ArrowUpDown className="h-3 w-3" />
                      </a>
                    )}
                    <a
                      href={`#/mint-project/${project.token}`}
                      className="inline-flex items-center gap-1 text-xs text-[#B8860B] hover:underline"
                    >
                      详情
                      <ArrowRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
