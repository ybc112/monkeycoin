import type { AllocationState, MintFormState, MintLaunchTemplate } from "./types";

export const MINT_BNB_CHAIN = {
  chainId: "0x38",
  chainName: "BNB Smart Chain",
  nativeCurrency: {
    name: "BNB",
    symbol: "BNB",
    decimals: 18,
  },
  rpcUrls: [
    "https://bsc-rpc.publicnode.com",
    "https://bsc-dataseed.binance.org/",
    "https://bsc-dataseed1.defibit.io/",
    "https://bsc-dataseed1.ninicoin.io/",
    "https://rpc.ankr.com/bsc",
  ],
  blockExplorerUrls: ["https://bscscan.com"],
};

export const MINT_ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MINT_USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

export const initialMintForm: MintFormState = {
  tokenName: "",
  symbol: "",
  description: "",
  supply: "100000",
  mintCount: "300",
  publicMintCount: "270",
  whitelistMintCount: "30",
  maxMintPerWallet: "0",
  mintPrice: "0.01",
  paymentToken: MINT_ZERO_ADDRESS,
  rewardToken: "",
  rewardThreshold: "1",
  receiverWallet: "",
  telegram: "",
  xLink: "",
  website: "",
};

export const initialMintAllocation: AllocationState = {
  marketing: 44,
  liquidity: 18,
  rewards: 16,
  burn: 10,
};

export const initialAdvancedTax = {
  transferTax: 0,
  addLiquidityTax: 0,
  removeLiquidityTax: 0,
  launchProtectionTax: 0,
  launchProtectionBlocks: "0",
  claimWaitSeconds: "60",
};

export const mintCreationFeeLabel = "0.005 BNB";

export const mintTemplates: MintLaunchTemplate[] = [
  {
    id: "standard",
    name: "猴子币 Core",
    tag: "Core",
    fee: mintCreationFeeLabel,
    summary: "创建独立 ERC20 和独立 Vault，用户按次数公开 mint，适合快速启动社区资产。",
    bestFor: "社区首发、活动票券、轻量资产发行",
    checks: ["固定发行量", "公开 mint 次数", "独立 Vault", "创建者接收钱包"],
  },
  {
    id: "time",
    name: "猴子币 Time",
    tag: "Time",
    fee: mintCreationFeeLabel,
    summary: "为预热、排队和分批开放保留参数入口，方便后续扩展白名单和开盘时间。",
    bestFor: "预热活动、排队发射、分批开放",
    checks: ["开放时间", "冷却窗口", "进度追踪", "公开参数"],
  },
  {
    id: "buyback",
    name: "猴子币 Buyback",
    tag: "Flow",
    fee: mintCreationFeeLabel,
    summary: "税收拆分可映射到基金、回流、奖励和销毁，适合长期运营型项目。",
    bestFor: "交易税玩法、持续运营、回购叙事",
    checks: ["买卖税", "基金分配", "销毁比例", "接收钱包"],
  },
  {
    id: "nftReward",
    name: "猴子币 Reward",
    tag: "Reward",
    fee: mintCreationFeeLabel,
    summary: "记录奖励代币和持仓门槛，便于后续扩展 NFT、任务或会员奖励。",
    bestFor: "任务制社区、持仓奖励、游戏化发行",
    checks: ["奖励代币", "门槛记录", "模板 ID", "后续升级"],
  },
];

export const allocationMeta: Array<{
  key: keyof AllocationState;
  label: string;
  hint: string;
  color: string;
}> = [
  {
    key: "burn",
    label: "销毁",
    hint: "减少供应",
    color: "#ff8a9a",
  },
  {
    key: "marketing",
    label: "营销",
    hint: "进入接收钱包",
    color: "#9bf6c2",
  },
  {
    key: "liquidity",
    label: "回流",
    hint: "开盘锁 LP",
    color: "#7dd3fc",
  },
  {
    key: "rewards",
    label: "持币分红",
    hint: "进入分红池",
    color: "#b8c7ff",
  },
];

export const mintPaymentTokens = [
  {
    label: "BNB",
    symbol: "BNB",
    address: MINT_ZERO_ADDRESS,
    note: "原生 BNB mint",
  },
];
