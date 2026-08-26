import { Flame, Home, Loader2, Rocket, TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";
import { useHashPath } from "@/lib/hashRouter";

const NAV_ITEMS = [
  { path: "", label: "发射台", icon: Home, short: "发射" },
  { path: "mint", label: "Mint", icon: Flame, short: "Mint" },
  { path: "mint-launches", label: "已发射", icon: Rocket, short: "已发" },
  { path: "trending", label: "热搜榜", icon: TrendingUp, short: "热搜" },
];

const shorten = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export default function LaunchpadHeader() {
  const { account, isConnected, connect, connecting } = useWallet();
  const route = useHashPath();

  return (
    <header className="sb-brand-header sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <a href="/" className="flex min-w-0 items-center gap-3">
          <img
            src="/0ee769b5412dfd0f4d0a14349ca7307e.jpg"
            alt="Monkey logo"
            className="h-11 w-11 shrink-0 rounded-xl border border-amber-400/40 object-cover shadow-lg shadow-amber-950/40"
          />
          <div className="min-w-0 shrink">
            <h1 className="sb-brand-title flex items-baseline gap-1 text-base font-bold leading-tight md:text-lg">
              <span className="whitespace-nowrap">猴子币发射台</span>
              <span className="hidden text-[10px] font-black tracking-[0.22em] text-amber-300 sm:inline">
                MONKEY LAUNCHPAD
              </span>
            </h1>
            <p className="sb-brand-subtitle hidden text-xs sm:block">LP 单边燃烧 · Mint 募集 · 自动回购</p>
          </div>
        </a>

        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = route === item.path || (item.path === "" && route === "");
              return (
                <a
                  key={item.path}
                  href={`#/${item.path}`}
                  className={cn(
                    "sb-wallet flex h-9 items-center gap-1 rounded-lg border px-1.5 text-[10px] font-bold sm:h-10 sm:gap-1.5 sm:rounded-xl sm:px-2 lg:gap-2 lg:px-3 lg:text-sm",
                    active && "border-amber-400/40",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap text-[10px] lg:text-xs">
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </span>
                </a>
              );
            })}
          </nav>
          <button
            onClick={connect}
            disabled={connecting || isConnected}
            className={cn(
              "sb-wallet flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition md:px-4",
              isConnected ? "" : "sb-wallet-idle hover:bg-amber-600",
            )}
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            <span className="hidden sm:inline">{isConnected ? shorten(account!) : "连接钱包"}</span>
            <span className="sm:hidden">{isConnected ? shorten(account!) : "连接"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
