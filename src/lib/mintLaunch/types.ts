import type { ReactNode } from "react";

export type MintTemplateId =
  | "standard"
  | "time"
  | "buyback"
  | "lp"
  | "holdLpBurn"
  | "burnOut"
  | "moduleLimit"
  | "nftReward";

export type MintFormState = {
  tokenName: string;
  symbol: string;
  description: string;
  supply: string;
  mintCount: string;
  publicMintCount: string;
  whitelistMintCount: string;
  maxMintPerWallet: string;
  mintPrice: string;
  paymentToken: string;
  rewardToken: string;
  rewardThreshold: string;
  receiverWallet: string;
  telegram: string;
  xLink: string;
  website: string;
};

export type AllocationKey = "marketing" | "liquidity" | "rewards" | "burn";

export type AllocationState = Record<AllocationKey, number>;

export type AdvancedTaxState = {
  transferTax: number;
  addLiquidityTax: number;
  removeLiquidityTax: number;
  launchProtectionTax: number;
  launchProtectionBlocks: string;
  claimWaitSeconds: string;
};

export type MintLaunchTemplate = {
  id: MintTemplateId;
  name: string;
  tag: string;
  fee: string;
  summary: string;
  bestFor: string;
  checks: string[];
};

export type MintLaunchDraft = {
  form: MintFormState;
  allocation: AllocationState;
  advancedTax: AdvancedTaxState;
  buyTax: number;
  sellTax: number;
  templateId: MintTemplateId;
  avatar: string;
  whitelistEnabled: boolean;
};

export type MintLaunchProject = {
  creator: string;
  token: string;
  vault: string;
  paymentToken: string;
  receiver: string;
  platformFeeReceiver: string;
  platformFeeBps: number;
  name: string;
  symbol: string;
  description: string;
  avatar: string;
  website: string;
  telegram: string;
  xLink: string;
  totalSupply: string;
  mintCount: string;
  mintPrice: string;
  mintPriceWei: string;
  maxMintPerWallet: string;
  paymentSymbol: string;
  mintedCount: string;
  publicMintCount: string;
  whitelistMintCount: string;
  publicMintedCount: string;
  whitelistMintedCount: string;
  refundDeadline: number;
  finalized: boolean;
  userMintedCount: string;
  refundTokenAmount: string;
  refundNeedsApproval: boolean;
  userRefundAmount: string;
  canRefund: boolean;
  whitelistRemaining: string;
  totalWhitelistAllowance: string;
  mintPaymentAllowance: string;
  rewardToken: string;
  rewardThreshold: string;
  userDividendUnpaid: string;
  userDividendUnpaidFormatted: string;
  buyTaxBps: number;
  sellTaxBps: number;
  transferTaxBps: number;
  addLiquidityTaxBps: number;
  removeLiquidityTaxBps: number;
  launchProtectionTaxBps: number;
  launchProtectionBlocks: number;
  claimWait: number;
  fundFeeBps: number;
  lpFeeBps: number;
  dividendFeeBps: number;
  burnFeeBps: number;
  vaultTokenBalance: string;
  progress: number;
  whitelistEnabled: boolean;
  createdAt: number;
};

export type MintNavItem = {
  page: string;
  label: string;
  icon: ReactNode;
};

export type WhitelistAllowanceEntry = {
  account: string;
  allowance: string;
};

export type MintTransactionResult = {
  hash: string;
  salt?: string;
  predictedTokenAddress?: string;
  vanitySuffix?: string;
  vanityAttempts?: number;
};
