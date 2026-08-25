import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Flame,
  Home,
  Loader2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";
import { useAppStore } from "@/store";
import { ADDRESSES, MONKEY_TOKEN_ADDRESS, MONKEY_MINT_BURN_AMOUNT } from "@/lib/contracts/snowballFactory";

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

// 前端演示参数（合约后端开发中，最终以链上为准）
const DEMO = {
  target: "1,500,000 $MKY",
  burned: "982,400",
  burnedPct: 65.5,
  minMint: 1000,
  maxMint: 5000000,
};

const FLOW = [
  { title: "连接钱包", desc: "连接 BSC 主网钱包，准备参与 Mint" },
  { title: "支付 $MKY 参与 Mint", desc: "用猴子币 $MKY 支付，参与的代币直接转入黑洞销毁" },
  { title: "支付即销毁（通缩）", desc: "你支付的每一枚 $MKY 都被永久销毁，全网供应量下降" },
  { title: "部署额外销毁 30,000 枚", desc: "代币部署时再一次性销毁 30,000 枚 $MKY，创世通缩" },
];

export default function Mint() {
  const { account, isConnected, connect, connecting } = useWallet();
  const showToast = useAppStore((s) => s.showToast);
  const [copied, setCopied] = useState(false);
  const [mky, setMky] = useState("100000");
  const [minting, setMinting] = useState(false);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const burnDisplay = useMemo(() => (Number(mky) || 0).toLocaleString("en-US"), [mky]);

  const handleMint = async () => {
    if (!isConnected) {
      showToast("请先连接钱包", "error");
      return;
    }
    if (!Number(mky) || Number(mky) < DEMO.minMint || Number(mky) > DEMO.maxMint) {
      showToast(`单笔 Mint 需在 ${DEMO.minMint.toLocaleString("en-US")} ~ ${DEMO.maxMint.toLocaleString("en-US")} $MKY 之间`, "error");
      return;
    }
    setMinting(true);
    setTimeout(() => {
      setMinting(false);
      showToast("Mint 功能前端演示中，合约与后端开发完成后可正式参与（支付即销毁）", "info");
    }, 1200);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--sb-bg)] pb-24">
      <header className="sb-brand-header sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex min-w-0 items-center gap-3">
            <img src="/0ee769b5412dfd0f4d0a14349ca7307e.jpg" alt="Monkey logo" className="h-11 w-11 shrink-0 rounded-xl border border-orange-300/50 object-cover shadow-lg shadow-orange-950/60" />
            <div className="min-w-0">
              <h1 className="sb-brand-title text-base font-bold leading-tight md:text-lg">猴子币发射台 <span className="ml-1 text-[10px] font-black tracking-[0.22em] text-orange-300">MONKEY LAUNCHPAD</span></h1>
              <p className="sb-brand-subtitle hidden text-xs sm:block">LP 单边燃烧 · Mint 销毁 · 自动回购</p>
            </div>
          </a>

          <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-1 md:flex">
              <a href="#/" className="sb-wallet flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold" title="发射台主页"><Home className="h-4 w-4" /><span>发射台</span></a>
              <a href="#/mint" className="sb-wallet flex h-10 items-center gap-2 rounded-xl border border-orange-300/50 px-3 text-sm font-bold" title="Mint 销毁"><Flame className="h-4 w-4 text-orange-300" /><span>Mint</span></a>
              <a href="#/trending" className="sb-wallet flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold" title="热搜代币榜"><TrendingUp className="h-4 w-4" /><span>热搜榜</span></a>
            </nav>
            <button
              onClick={connect}
              disabled={connecting || isConnected}
              className={cn(
                "sb-wallet flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition md:px-4",
                isConnected ? "" : "sb-wallet-idle hover:bg-orange-600"
              )}
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              <span className="hidden sm:inline">{isConnected ? shortAddress(account!) : "连接钱包"}</span>
              <span className="sm:hidden">{isConnected ? shortAddress(account!) : "连接"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <div className="pt-6">
          <a href="#/" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--sb-muted)] transition hover:text-[var(--sb-gold)]">
            <ArrowLeft className="h-4 w-4" /> 返回发射台
          </a>
        </div>

        <section className="mt-4 overflow-hidden rounded-[28px] border border-orange-500/30 bg-[#35140c] shadow-[0_18px_48px_rgba(88,24,9,0.2)]">
          <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="sb-flame-mark h-10 w-10"><Flame className="h-5 w-5" /></span>
                <span className="rounded-md bg-orange-200/20 px-2 py-0.5 text-[10px] font-bold text-orange-200">MINT / BURN</span>
              </div>
              <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">Mint 销毁发射台</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-orange-100/80">
                猴子币 $MKY 的通缩 Mint：用 <b className="text-[#ffb38a]">$MKY</b> 支付参与，支付即销毁（转入黑洞）。部署时再一次性销毁 <b className="text-[#ffb38a]">30,000 枚</b>，全网供应持续下降。
              </p>
              <p className="mt-2 text-xs text-orange-100/60">
                {isConnected ? `已连接 ${shortAddress(account!)} · BSC 主网` : "连接钱包后可参与 Mint"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:w-[440px]">
              {[
                { label: "参与代币", value: "猴子币 $MKY" },
                { label: "部署销毁", value: "30,000 枚" },
                { label: "销毁去向", value: "黑洞 0x...dEaD" },
                { label: "支付方式", value: "$MKY 支付即销毁" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-center backdrop-blur">
                  <div className="text-xs text-orange-100/60">{item.label}</div>
                  <div className="mt-1 text-sm font-black text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--sb-border)] bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--sb-text)]"><Flame className="h-5 w-5 text-[var(--sb-gold)]" />代币信息</h3>
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <span className="text-sm text-[var(--sb-muted)]">代币合约</span>
                  <span className="break-all font-mono text-sm font-bold text-[var(--sb-text)]">{MONKEY_TOKEN_ADDRESS}</span>
                  <button onClick={() => void copy(MONKEY_TOKEN_ADDRESS)} className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-[var(--sb-border)] bg-white px-2.5 py-1 text-xs font-bold transition hover:border-[var(--sb-gold)]">
                    {copied ? <Check className="h-3.5 w-3.5 text-[var(--sb-success)]" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-[var(--sb-border)] bg-[var(--sb-bg)] px-4 py-3">
                    <div className="text-xs text-[var(--sb-muted)]">部署销毁</div>
                    <div className="mt-1 text-xl font-black text-[var(--sb-red)]">{Number(MONKEY_MINT_BURN_AMOUNT).toLocaleString("en-US")} 枚</div>
                  </div>
                  <div className="rounded-xl border border-[var(--sb-border)] bg-[var(--sb-bg)] px-4 py-3">
                    <div className="text-xs text-[var(--sb-muted)]">黑洞地址</div>
                    <div className="mt-1 text-lg font-black text-[var(--sb-text)]">{shortAddress(ADDRESSES.lpBlackHole)}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--sb-border)] bg-[var(--sb-bg)] px-4 py-3">
                    <div className="text-xs text-[var(--sb-muted)]">销毁性质</div>
                    <div className="mt-1 text-lg font-black text-[var(--sb-text)]">支付即销毁 · 永久通缩</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--sb-border)] bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--sb-text)]"><ChevronRight className="h-5 w-5 text-[var(--sb-gold)]" />Mint 完整旅程</h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {FLOW.map((step, index) => (
                  <div key={step.title} className="relative rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-bg)] p-4">
                    <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--sb-gold)] text-xs font-black text-white">{index + 1}</span>
                    <h4 className="font-bold text-[var(--sb-text)]">{step.title}</h4>
                    <p className="mt-1 text-xs leading-5 text-[var(--sb-muted)]">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--sb-border)] bg-white p-6 shadow-sm">
              <h3 className="flex items-center justify-between text-lg font-bold text-[var(--sb-text)]">累计销毁进度</h3>
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-[var(--sb-text)]">{DEMO.burned} / {DEMO.target}</span>
                  <span className="font-black text-[var(--sb-gold)]">{DEMO.burnedPct}%</span>
                </div>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[var(--sb-border)]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[var(--sb-gold)] to-orange-400" style={{ width: `${DEMO.burnedPct}%` }} />
                </div>
                <p className="mt-2 text-xs text-[var(--sb-muted)]">演示进度，链上后端开发完成后实时同步</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--sb-border)] bg-white p-6 shadow-sm">
              <h3 className="flex items-center justify-between text-lg font-bold text-[var(--sb-text)]">参与 Mint（支付即销毁）</h3>
              <div className="mt-4">
                <label className="text-sm font-bold text-[var(--sb-text)]">投入 $MKY</label>
                <div className="relative mt-1.5">
                  <input
                    type="number"
                    min={DEMO.minMint}
                    max={DEMO.maxMint}
                    step="1000"
                    value={mky}
                    onChange={(e) => setMky(e.target.value)}
                    className="w-full rounded-xl border border-[var(--sb-border)] bg-[var(--sb-bg)] px-4 py-3 text-xl font-black text-[var(--sb-text)] outline-none transition focus:border-[var(--sb-gold)]"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-[var(--sb-gold)]">$MKY</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {[100000, 500000, 1000000, 5000000].map((amount) => (
                    <button key={amount} onClick={() => setMky(String(amount))} className="rounded-lg border border-[var(--sb-border)] px-3 py-1.5 text-xs font-bold text-[var(--sb-text)] transition hover:border-[var(--sb-gold)] hover:text-[var(--sb-gold)]">
                      {amount.toLocaleString("en-US")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-[var(--sb-bg)] p-4 text-center">
                <div className="text-xs text-[var(--sb-muted)]">预计销毁（转入黑洞）</div>
                <div className="mt-1 text-2xl font-black text-[var(--sb-red)]">{burnDisplay} $MKY</div>
              </div>
              <button
                onClick={() => void handleMint()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--sb-gold)] to-orange-500 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:shadow-xl"
              >
                {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                {minting ? "Mint 确认中…" : "Mint（支付即销毁）"}
              </button>
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-[var(--sb-muted)]">
                <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--sb-gold)]" />
                你支付的 $MKY 将全部转入黑洞地址永久销毁，为全网 Holder 带来通缩。当前为前端演示，合约与后端开发完成后即可正式参与。
              </p>
            </div>

            <a
              href={`https://bscscan.com/token/${MONKEY_TOKEN_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--sb-border)] bg-white py-3 text-sm font-bold text-[var(--sb-text)] transition hover:border-[var(--sb-gold)]"
            >
              <ExternalLink className="h-4 w-4" /> BscScan 查看合约
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
