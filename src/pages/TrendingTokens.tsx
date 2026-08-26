import { useMemo, useState } from "react";
import { ExternalLink, Flame, Search, TrendingUp } from "lucide-react";
import { TRENDING_TOKENS } from "@/data/trendingTokens";
import LaunchpadHeader from "@/components/LaunchpadHeader";

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export default function TrendingTokens() {
  const [query, setQuery] = useState("");
  const tokens = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...TRENDING_TOKENS]
      .sort((a, b) => a.rank - b.rank)
      .filter((token) =>
        !normalized ||
        token.name.toLowerCase().includes(normalized) ||
        token.symbol.toLowerCase().includes(normalized) ||
        token.address.toLowerCase().includes(normalized)
      );
  }, [query]);

  return (
    <div className="min-h-screen bg-[var(--sb-bg)] pb-20">
      <LaunchpadHeader />

      <main className="mx-auto max-w-6xl px-4 pt-8">
        <section className="sb-ranking-hero relative overflow-hidden rounded-[28px] border border-blue-400/25 px-6 py-10 text-white sm:px-10">
          <div className="relative z-10 max-w-xl">
            <span className="sb-flame-mark mb-5 h-11 w-11"><TrendingUp className="h-6 w-6" /></span>
            <h1 className="text-3xl font-black sm:text-4xl">热搜代币榜</h1>
            <p className="mt-3 text-sm leading-6 text-blue-100/70">猴子币发射台社区热门代币排行</p>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex flex-col gap-3 border-b border-[var(--sb-border)] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-[var(--sb-gold)]" />
              <h2 className="text-xl font-black">实时热榜</h2>
              <span className="rounded-md bg-[var(--sb-gold-light)] px-2 py-1 text-xs font-bold text-[var(--sb-gold)]">BSC</span>
            </div>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--sb-border)] bg-[var(--sb-card)] px-3 focus-within:border-[var(--sb-gold)] sm:w-80">
              <Search className="h-4 w-4 shrink-0 text-[var(--sb-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="搜索代币或合约地址"
              />
            </label>
          </div>

          {tokens.length ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)]">
              <div className="hidden grid-cols-[70px_1.4fr_1.5fr_100px_110px_70px] gap-3 border-b border-[var(--sb-border)] bg-[var(--sb-card)] px-5 py-3 text-xs font-bold text-[var(--sb-muted)] md:grid">
                <span>排名</span><span>代币</span><span>合约地址</span><span>网络</span><span>热度</span><span />
              </div>
              {tokens.map((token) => (
                <article key={token.address} className="grid gap-3 border-b border-[var(--sb-border)] px-4 py-4 last:border-0 md:grid-cols-[70px_1.4fr_1.5fr_100px_110px_70px] md:items-center md:px-5">
                  <div className="text-lg font-black text-[var(--sb-gold)]">#{token.rank}</div>
                  <div className="flex items-center gap-3">
                    <img src={token.logo || "/0ee769b5412dfd0f4d0a14349ca7307e.jpg"} alt="" className="h-11 w-11 rounded-full border border-[var(--sb-border)] object-cover" />
                    <div><div className="font-bold">{token.name}</div><div className="text-xs text-[var(--sb-muted)]">{token.symbol}</div></div>
                  </div>
                  <div className="font-mono text-xs text-[var(--sb-muted)] md:text-sm" title={token.address}>{shortAddress(token.address)}</div>
                  <div className="text-sm font-bold">{token.chain}</div>
                  <div className="flex items-center gap-1 text-sm font-bold"><Flame className="h-4 w-4 text-blue-500" />{token.heat.toLocaleString()}</div>
                  <a href={`https://bscscan.com/token/${token.address}`} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--sb-border)] text-[var(--sb-gold)] hover:border-[var(--sb-gold)]" title="查看合约">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex min-h-72 flex-col items-center justify-center border-y border-[var(--sb-border)] bg-[var(--sb-card)]/50 px-6 text-center">
              <img src="/0ee769b5412dfd0f4d0a14349ca7307e.jpg" alt="" className="h-20 w-20 rounded-2xl object-cover shadow-lg" />
              <h3 className="mt-5 text-lg font-black">榜单正在更新</h3>
              <p className="mt-2 text-sm text-[var(--sb-muted)]">敬请关注猴子币发射台热门代币</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
