import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Flame } from "lucide-react";
import { MONKEY_TOKEN_ADDRESS, MONKEY_MINT_BURN_AMOUNT } from "@/lib/contracts/snowballFactory";

function shorten(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function MintPanel() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const burnDisplay = useMemo(() => MONKEY_MINT_BURN_AMOUNT.toLocaleString("en-US"), []);

  return (
    <section className="mx-auto max-w-6xl px-4 pb-6">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--sb-gold)]/40 bg-white p-6 shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[var(--sb-gold-light)] blur-2xl" />

        <div className="relative grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--sb-gold)] to-orange-500 text-white shadow-lg shadow-orange-500/30">
                <Flame className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-black text-[var(--sb-text)] sm:text-2xl">Mint 募集发射 <span className="ml-2 rounded-md bg-[var(--sb-gold-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--sb-gold)]">MINT LAUNCH</span></h2>
                <p className="text-sm text-[var(--sb-muted)]">猴子币 $MKY · 部署即销毁 30,000 枚，创世通缩</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--sb-border)] bg-[var(--sb-bg)] px-4 py-3">
                <span className="text-sm text-[var(--sb-muted)]">代币合约</span>
                <span className="break-all font-mono text-sm font-bold text-[var(--sb-text)]">{MONKEY_TOKEN_ADDRESS}</span>
                <button
                  onClick={() => void copy(MONKEY_TOKEN_ADDRESS)}
                  className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-[var(--sb-border)] px-2.5 py-1 text-xs font-bold text-[var(--sb-text)] transition hover:border-[var(--sb-gold)]"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[var(--sb-success)]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "已复制" : shorten(MONKEY_TOKEN_ADDRESS)}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <div className="text-xs text-[var(--sb-muted)]">部署销毁</div>
                  <div className="mt-1 text-xl font-black text-[var(--sb-red)]">{burnDisplay} 枚</div>
                  <div className="text-xs font-bold text-[var(--sb-red)]">→ 黑洞 0x...dEaD</div>
                </div>
                <div className="rounded-xl border border-[var(--sb-border)] bg-[var(--sb-bg)] px-4 py-3">
                  <div className="text-xs text-[var(--sb-muted)]">销毁去向</div>
                  <div className="mt-1 text-lg font-black text-[var(--sb-text)]">永久锁定</div>
                  <div className="text-xs text-[var(--sb-muted)]">不可逆通缩</div>
                </div>
                <div className="rounded-xl border border-[var(--sb-border)] bg-[var(--sb-bg)] px-4 py-3">
                  <div className="text-xs text-[var(--sb-muted)]">Mint 方式</div>
                  <div className="mt-1 text-lg font-black text-[var(--sb-text)]">BNB 支付</div>
                  <div className="text-xs text-[var(--sb-muted)]">按兑换率获得 $MKY</div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[var(--sb-muted)]">
              <span>流程：</span>
              {["用户支付 $MKY", "支付即销毁", "部署销毁 30,000 枚", "全网持续通缩"].map((step, index) => (
                <span key={step} className="flex items-center gap-1.5 rounded-full border border-[var(--sb-border)] bg-white px-3 py-1.5 font-medium text-[var(--sb-text)]">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--sb-gold)] text-[10px] font-black text-white">{index + 1}</span>
                  {step}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-center gap-4 rounded-2xl border border-[var(--sb-border)] bg-gradient-to-br from-[var(--sb-bg)] to-[var(--sb-gold-light)]/60 p-6">
            <div className="text-center">
              <div className="text-sm font-bold text-[var(--sb-text)]">立即参与 Mint</div>
              <p className="mt-1 text-xs text-[var(--sb-muted)]">进入 Mint 页查看进度、兑换率与募集倒计时</p>
            </div>
            <a
              href="#/mint"
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--sb-gold)] to-orange-500 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:shadow-xl"
            >
              进入 Mint 发射台 <ChevronRight className="h-4 w-4" />
            </a>
            <a
              href="/"
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--sb-border)] bg-white py-3 text-sm font-bold text-[var(--sb-text)] transition hover:border-[var(--sb-gold)]"
            >
              返回官网（托底池 &amp; 自动回购）
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
