import LaunchHome from "@/pages/LaunchHome";
import MintLaunch from "@/pages/MintLaunch";
import MintLaunches from "@/pages/MintLaunches";
import MintProjectDetail from "@/pages/MintProjectDetail";
import TrendingTokens from "@/pages/TrendingTokens";
import TokenManager from "@/components/TokenManager";
import LaunchpadHeader from "@/components/LaunchpadHeader";
import MonkeyNFT from "@/pages/MonkeyNFT";
import { useAppStore } from "@/store";
import { useHashPath } from "@/lib/hashRouter";
import { X } from "lucide-react";

function Toast() {
  const { toast, hideToast } = useAppStore();
  if (!toast.visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2">
      <div
        className={`
          flex items-start gap-3 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur
          ${toast.type === "success" ? "border-emerald-200 bg-emerald-50/95 text-emerald-900" : ""}
          ${toast.type === "error" ? "border-[var(--sb-red)]/20 bg-[var(--sb-red)]/10 text-[var(--sb-red)]" : ""}
          ${toast.type === "info" ? "border-[var(--sb-border)] bg-white/95 text-[var(--sb-text)]" : ""}
        `}
      >
        <p className="flex-1 text-sm font-medium">{toast.message}</p>
        <button onClick={hideToast} className="shrink-0 opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const route = useHashPath();

  if (route.startsWith("mint-project/")) {
    return (
      <>
        <LaunchpadHeader />
        <MintProjectDetail token={route.slice("mint-project/".length)} />
      </>
    );
  }
  if (route === "mint") {
    return (
      <>
        <LaunchpadHeader />
        <MintLaunch />
      </>
    );
  }
  if (route === "mint-launches") {
    return (
      <>
        <LaunchpadHeader />
        <MintLaunches />
      </>
    );
  }
  if (route === "trending") {
    return <TrendingTokens />;
  }
  if (route === "nft") {
    return (
      <>
        <LaunchpadHeader />
        <MonkeyNFT />
      </>
    );
  }
  return (
    <>
      <LaunchHome />
      <TokenManager />
      <Toast />
    </>
  );
}
