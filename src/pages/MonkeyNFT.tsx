import { useEffect, useState } from "react";
import {
  CheckCircle,
  Loader2,
  Gift,
  Image,
  Flame,
  ExternalLink,
} from "lucide-react";
import {
  Contract,
  MaxUint256,
} from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";
import {
  MONKEY_TOKEN,
  MONKEY_NFT_ADDRESS,
  BURN_TO_MINT_ADDRESS,
  NFT_COST,
  NFT_MAX_SUPPLY,
  isNftConfigured,
  MINT_TOKEN_ABI,
  MONKEY_NFT_ABI,
  BURN_TO_MINT_ABI,
} from "@/lib/contracts/monkeyNFT";

function formatNumber(n: bigint): string {
  return Number(n / 10n ** 18n).toLocaleString("zh-CN");
}

export default function MonkeyNFT() {
  const { isConnected, signer, provider, account } = useWallet();
  const { showToast } = useAppStore();
  const [approving, setApproving] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [balance, setBalance] = useState<bigint>(0n);
  const [myNFTs, setMyNFTs] = useState<number[]>([]);
  const [totalMinted, setTotalMinted] = useState<number>(0);
  const [totalBurned, setTotalBurned] = useState<bigint>(0n);
  const [paused, setPaused] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);

  const enoughApproval = allowance >= NFT_COST;
  const enoughBalance = balance >= NFT_COST;
  const soldOut = totalMinted >= NFT_MAX_SUPPLY;

  async function loadData() {
    if (!isConnected || !provider || !account || !isNftConfigured) return;
    setRefreshing(true);
    try {
      const token = new Contract(MONKEY_TOKEN, MINT_TOKEN_ABI, provider);
      const [bal, allwd] = await Promise.all([
        token.balanceOf(account) as Promise<bigint>,
        token.allowance(account, BURN_TO_MINT_ADDRESS) as Promise<bigint>,
      ]);
      setBalance(bal);
      setAllowance(allwd);

      const nft = new Contract(MONKEY_NFT_ADDRESS, MONKEY_NFT_ABI, provider);
      const total = await nft.totalSupply() as Promise<bigint>;
      setTotalMinted(Number(total));

      const burn = new Contract(BURN_TO_MINT_ADDRESS, BURN_TO_MINT_ABI, provider);
      const [burned, isPaused] = await Promise.all([
        burn.totalBurned() as Promise<bigint>,
        burn.paused() as Promise<boolean>,
      ]);
      setTotalBurned(burned);
      setPaused(isPaused);

      // 离线枚举：扫描 0..totalMinted 判断归属（总量≤999，开销可接受）
      const ids: number[] = [];
      for (let i = 0n; i < Number(total); i++) {
        try {
          const owner = await (nft.ownerOf(i) as Promise<string>);
          if (owner.toLowerCase() === account.toLowerCase()) ids.push(Number(i));
        } catch {
          break;
        }
      }
      setMyNFTs(ids);
    } catch (e) {
      console.error(e);
      showToast("加载数据失败", "error");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [isConnected, account]);

  async function doApprove() {
    if (!isConnected || !signer) return;
    setApproving(true);
    try {
      const token = new Contract(MONKEY_TOKEN, MINT_TOKEN_ABI, signer);
      const tx = await token.approve(BURN_TO_MINT_ADDRESS, MaxUint256);
      showToast("授权中，请等待交易确认...", "info");
      await tx.wait();
      setAllowance(MaxUint256);
      showToast("授权成功", "success");
    } catch (e: any) {
      console.error(e);
      showToast(`授权失败: ${e.message}`, "error");
    } finally {
      setApproving(false);
    }
  }

  async function doRedeem() {
    if (!isConnected || !signer) return;
    if (!enoughApproval) {
      showToast("请先授权 MKY", "error");
      return;
    }
    if (!enoughBalance) {
      showToast("MKY 余额不足", "error");
      return;
    }
    if (soldOut) {
      showToast("NFT 已售罄", "error");
      return;
    }
    if (paused) {
      showToast("活动已暂停", "error");
      return;
    }

    setRedeeming(true);
    try {
      const burn = new Contract(BURN_TO_MINT_ADDRESS, BURN_TO_MINT_ABI, signer);
      const tx = await burn.redeem();
      showToast("兑换中，请等待交易确认...", "info");
      await tx.wait();
      showToast("兑换成功！NFT 已铸造到你的钱包", "success");
      await loadData();
    } catch (e: any) {
      console.error(e);
      showToast(`兑换失败: ${e.message}`, "error");
    } finally {
      setRedeeming(false);
    }
  }

  if (!isNftConfigured) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 pb-28">
        <div className="sb-card rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)] p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--sb-text)]">
            <Gift className="h-6 w-6" /> 猴子币 NFT 兑换
          </h2>
          <p className="mt-4 text-[var(--sb-muted)]">
            合约尚未部署，请先部署 NFT 合约并更新环境变量
            <code className="ml-1 rounded bg-[var(--sb-gold-light)]/50 px-1 py-0.5 text-xs">
              VITE_MONKEY_NFT_ADDRESS / VITE_BURN_TO_MINT_ADDRESS
            </code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 pb-28">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--sb-text)]">
          <Gift className="h-8 w-8" strokeWidth={2} />
          猴子币 NFT 兑换
        </h1>
        <p className="mt-2 text-[var(--sb-muted)]">
          销毁 {formatNumber(NFT_COST)} MKY → 限量铸造一张「猴子币 NFT」，总量{" "}
          {NFT_MAX_SUPPLY} 张
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="sb-card space-y-4 rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)] p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--sb-text)]">兑换统计</h3>
            <button
              onClick={loadData}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--sb-border)] px-3 py-1 text-xs font-medium text-[var(--sb-muted)] hover:bg-[var(--sb-gold-light)] disabled:opacity-50"
            >
              {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
              刷新
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-[var(--sb-gold-light)] p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--sb-gold)]/80">
                已铸造
              </div>
              <div className="mt-1 text-2xl font-bold text-[var(--sb-text)]">
                {totalMinted} / {NFT_MAX_SUPPLY}
              </div>
            </div>
            <div className="rounded-xl bg-[var(--sb-gold-light)] p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--sb-gold)]/80">
                累计销毁
              </div>
              <div className="mt-1 text-2xl font-bold text-[var(--sb-text)]">
                {formatNumber(totalBurned)}
                <span className="ml-1 text-sm text-[var(--sb-muted)]"> MKY</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-[var(--sb-border)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--sb-text)]">
                我的 MKY 余额
              </span>
              <span className="text-sm text-[var(--sb-muted)]">
                {formatNumber(balance)} MKY
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--sb-text)]">
                单张需要
              </span>
              <span className="text-sm text-[var(--sb-muted)]">
                {formatNumber(NFT_COST)} MKY
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--sb-text)]">
                兑换状态
              </span>
              {paused ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  已暂停
                </span>
              ) : soldOut ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  已售罄
                </span>
              ) : (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  可兑换
                </span>
              )}
            </div>
          </div>

          {isConnected ? (
            <div className="space-y-3">
              {!enoughApproval ? (
                <button
                  onClick={doApprove}
                  disabled={approving}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sb-gold)] px-4 py-3 font-bold text-white shadow-lg shadow-amber-300/50 transition hover:opacity-90 disabled:opacity-50",
                  )}
                >
                  {approving && <Loader2 className="h-5 w-5 animate-spin" />}
                  授权 MKY
                </button>
              ) : (
                <button
                  onClick={doRedeem}
                  disabled={redeeming || !enoughBalance || soldOut || paused}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sb-gold)] px-4 py-3 font-bold text-white shadow-lg shadow-amber-300/50 transition hover:opacity-90 disabled:opacity-50",
                  )}
                >
                  {redeeming && <Loader2 className="h-5 w-5 animate-spin" />}
                  <Flame className="h-5 w-5" />
                  销毁兑换 NFT
                </button>
              )}
              {enoughApproval && !enoughBalance && (
                <p className="text-center text-xs text-[var(--sb-red)]">
                  MKY 余额不足，请先购入足够代币再兑换
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--sb-border)] p-4 text-center text-[var(--sb-muted)]">
              请先连接钱包
            </div>
          )}
        </div>

        <div className="sb-card space-y-4 rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-card)] p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--sb-text)]">我的藏品</h3>
            <span className="rounded-full bg-[var(--sb-gold-light)] px-3 py-1 text-xs font-semibold text-[var(--sb-gold)]">
              {myNFTs.length} 张
            </span>
          </div>

          {myNFTs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-[var(--sb-muted)]">
              <Image className="h-10 w-10 opacity-50" />
              <p className="text-sm">还没有藏品，快来兑换第一张吧</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {myNFTs.map((id) => (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--sb-border)] bg-[var(--sb-bg)]/50 p-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sb-gold-light)] text-lg font-bold text-[var(--sb-gold)]">
                    {id + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--sb-text)]">
                      猴子币 NFT #{id + 1}
                    </p>
                    <a
                      href={`https://bscscan.com/token/${MONKEY_NFT_ADDRESS}?a=${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--sb-muted)] hover:text-[var(--sb-gold)]"
                    >
                      查看 BscScan <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <CheckCircle className="h-5 w-5 shrink-0 text-[var(--sb-success)]" />
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 space-y-2 rounded-xl border border-[var(--sb-border)] p-4 text-sm text-[var(--sb-muted)]">
            <p>
              <strong className="text-[var(--sb-text)]">兑换规则：</strong> 每销毁{" "}
              {formatNumber(NFT_COST)} MKY 获得一张限量 NFT，总量固定
              {NFT_MAX_SUPPLY} 张，烧完即止。
            </p>
            <p>
              销毁的 MKY 会永久打入黑洞地址
              <code className="mx-1 rounded bg-[var(--sb-gold-light)]/50 px-1 py-0.5 text-xs">
                0x...dEaD
              </code>
              ，永久退出流通。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}