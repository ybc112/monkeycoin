import {
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  formatEther,
  formatUnits,
  getAddress,
  hexlify,
  id,
  isAddress,
  parseEther,
  parseUnits,
  randomBytes,
  type Signer,
} from "ethers";
import { MINT_USDT_ADDRESS } from "./data";
import type {
  MintLaunchDraft,
  MintLaunchProject,
  MintTransactionResult,
  WhitelistAllowanceEntry,
} from "./types";

const configuredVanitySuffix = String(import.meta.env.VITE_MINT_VANITY_SUFFIX ?? "")
  .trim()
  .replace(/^0x/i, "")
  .toLowerCase();
const DEFAULT_APP_BACKEND_URL = "https://api.kimi-vault.com";
const configuredBackendUrl =
  String(import.meta.env.VITE_MINT_BACKEND_URL ?? "").trim() || DEFAULT_APP_BACKEND_URL;

export const DEFAULT_MINT_FACTORY_ADDRESS = "0x25f756494580274a40C60072C0302260B4ED1F08";
const RETIRED_MINT_FACTORY_ADDRESSES = new Set([
  "0x084c85f7cf1d9cf3d638ef75b1561e464884dfbc",
  "0xaa9b9c5f065fa4de891988c47b0432c8a156f3b0",
  "0x09e6c8abcdddab2677c2be8673ff31afc1e27624",
]);
export const DEFAULT_MINT_FEE_RECIPIENT = "0x436fB3245Ad8377DF443Ca1c67f997705D5843bb";
// 部署费：支付 30,000 枚猴子币（0x0c1f...7777）并销毁，不再收取 0.005 BNB
export const MINT_FEE_TOKEN_ADDRESS = "0x0c1fa1ff27cd3dd0663a8160498dea3603c17777";
export const MINT_CREATION_FEE_TOKEN = MINT_FEE_TOKEN_ADDRESS;
export const MINT_CREATION_FEE_AMOUNT = 30_000n * 10n ** 18n;
const DEFAULT_CREATION_FEE_BNB = "0";

function resolveMintFactoryAddress(value: string): string {
  const configured = value.trim();
  if (!configured || !isAddress(configured)) {
    return DEFAULT_MINT_FACTORY_ADDRESS;
  }
  const normalized = getAddress(configured);
  return RETIRED_MINT_FACTORY_ADDRESSES.has(normalized.toLowerCase())
    ? DEFAULT_MINT_FACTORY_ADDRESS
    : normalized;
}

export const mintLaunchpadConfig = {
  chainId: Number(import.meta.env.VITE_MINT_CHAIN_ID ?? 56),
  factoryAddress: resolveMintFactoryAddress(String(import.meta.env.VITE_MINT_FACTORY_ADDRESS ?? "")),
  creationFeeToken:
    String(import.meta.env.VITE_MINT_CREATION_FEE_TOKEN ?? "").trim() || MINT_CREATION_FEE_TOKEN,
  creationFeeAmount: parseEther(
    String(import.meta.env.VITE_MINT_CREATION_FEE_BNB ?? DEFAULT_CREATION_FEE_BNB),
  ),
  feeRecipient:
    String(import.meta.env.VITE_MINT_FEE_RECIPIENT ?? "").trim() || DEFAULT_MINT_FEE_RECIPIENT,
  backendUrl: normalizeBackendBaseUrl(configuredBackendUrl),
  vanitySuffix: configuredVanitySuffix || "7777",
};

const creationFeeTokenAbi = [
  "function allowance(address owner,address spender) view returns(uint256)",
  "function balanceOf(address account) view returns(uint256)",
  "function approve(address spender,uint256 amount) returns(bool)",
];

const MAX_ONCHAIN_METADATA_BYTES = 4_096;
const MAX_METADATA_TEXT_LENGTH = 480;
const MINTED_EVENT_TOPIC = id("Minted(address,uint256,uint256,uint256,uint256,uint256)");
const LAUNCH_FINALIZED_EVENT_TOPIC = id("LaunchFinalized(uint256)");
const TRADING_ENABLED_EVENT_TOPIC = id("TradingEnabled()");

export const isMintLaunchpadConfigured =
  Boolean(mintLaunchpadConfig.factoryAddress) && isAddress(mintLaunchpadConfig.factoryAddress);

const MINT_FALLBACK_RPC_URLS = [
  "https://bsc-dataseed.binance.org/",
  "https://bsc-dataseed1.defibit.io/",
  "https://bsc-dataseed1.ninicoin.io/",
  "https://rpc-bsc.48.club",
  "https://bsc-mainnet.public.blastapi.io",
];

export async function getMintReadProvider(): Promise<JsonRpcProvider> {
  const customRpc = String(import.meta.env.VITE_MINT_RPC_URL ?? "").trim();
  const urls = customRpc ? [customRpc, ...MINT_FALLBACK_RPC_URLS] : MINT_FALLBACK_RPC_URLS;
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const provider = new JsonRpcProvider(url, mintLaunchpadConfig.chainId);
      await provider.getBlockNumber();
      return provider;
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`BSC RPC 连接失败，请检查网络或配置 VITE_MINT_RPC_URL。\n${errors.join("\n")}`);
}

export const launchFactoryAbi = [
  "function createLaunch((string name,string symbol,string metadataUri,uint256 totalSupply,uint256 mintCount,uint256 mintPrice,uint256 maxMintPerWallet,address paymentToken,address rewardToken,uint256 rewardThreshold,address receiver,bytes32 templateId,uint16 buyTaxBps,uint16 sellTaxBps,uint16 transferTaxBps,uint16 addLiquidityTaxBps,uint16 removeLiquidityTaxBps,uint16 launchProtectionTaxBps,uint16 launchProtectionBlocks,uint32 claimWait,uint16 fundFeeBps,uint16 lpFeeBps,uint16 dividendFeeBps,uint16 burnFeeBps,uint256 whitelistMintCount,bool whitelistEnabled) params, bytes32 salt) payable returns (address token, address vault)",
  "function allTokensLength() view returns (uint256)",
  "function allTokens(uint256) view returns (address)",
  "function getProject(address token) view returns ((address creator,address token,address vault,address paymentToken,address receiver,address platformFeeReceiver,bytes32 templateId,uint256 totalSupply,uint256 mintCount,uint256 whitelistMintCount,uint256 publicMintCount,uint256 mintPrice,uint256 maxMintPerWallet,bool whitelistEnabled,string metadataUri,uint64 createdAt,address rewardToken,uint256 rewardThreshold,uint16 buyTaxBps,uint16 sellTaxBps,uint16 transferTaxBps,uint16 addLiquidityTaxBps,uint16 removeLiquidityTaxBps,uint16 launchProtectionTaxBps,uint16 launchProtectionBlocks,uint32 claimWait,uint16 fundFeeBps,uint16 lpFeeBps,uint16 dividendFeeBps,uint16 burnFeeBps))",
  "function projects(address) view returns (address creator,address token,address vault,address paymentToken,address receiver,address platformFeeReceiver,bytes32 templateId,uint256 totalSupply,uint256 mintCount,uint256 whitelistMintCount,uint256 publicMintCount,uint256 mintPrice,uint256 maxMintPerWallet,bool whitelistEnabled,string metadataUri,uint64 createdAt,address rewardToken,uint256 rewardThreshold,uint16 buyTaxBps,uint16 sellTaxBps,uint16 transferTaxBps,uint16 addLiquidityTaxBps,uint16 removeLiquidityTaxBps,uint16 launchProtectionTaxBps,uint16 launchProtectionBlocks,uint32 claimWait,uint16 fundFeeBps,uint16 lpFeeBps,uint16 dividendFeeBps,uint16 burnFeeBps)",
  "event LaunchCreated(address indexed creator,address indexed token,address indexed vault,bytes32 templateId,string name,string symbol,uint256 totalSupply,uint256 mintCount,uint256 mintPrice,address paymentToken,bool whitelistEnabled,string metadataUri)",
  "error InvalidParams()",
  "error InvalidFee()",
  "error InvalidTokenSuffix(address token,uint16 requiredSuffix)",
  "error ZeroAddress()",
] as const;

const tokenAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function unpaidDividend(address account) view returns (uint256)",
] as const;

const mintVaultAbi = [
  "function mintedCount() view returns (uint256)",
  "function totalMints() view returns (uint256)",
  "function whitelistMintLimit() view returns (uint256)",
  "function publicMintLimit() view returns (uint256)",
  "function whitelistMintedCount() view returns (uint256)",
  "function publicMintedCount() view returns (uint256)",
  "function refundDeadline() view returns (uint256)",
  "function finalized() view returns (bool)",
  "function tokensPerMint() view returns (uint256)",
  "function mintedByWallet(address account) view returns (uint256)",
  "function paidByWallet(address account) view returns (uint256)",
  "function whitelistList(address account) view returns (bool)",
  "function whitelistRemaining(address account) view returns (uint256)",
  "function totalWhitelistAllowance() view returns (uint256)",
] as const;

const mintVaultWriteAbi = [
  "function setWhitelistAccount(address account,bool listed)",
  "function setWhitelistAccounts(address[] accounts,bool listed)",
  "function setWhitelistAllowance(address account,uint256 allowance)",
  "function setWhitelistAllowances(address[] accounts,uint256[] allowances)",
  "function setWhitelistEnabled(bool enabled)",
  "function claimRefund()",
  "function mint(uint256 quantity) payable",
] as const;

type FactoryLaunchParams = {
  name: string;
  symbol: string;
  metadataUri: string;
  totalSupply: bigint;
  mintCount: bigint;
  mintPrice: bigint;
  maxMintPerWallet: bigint;
  paymentToken: string;
  rewardToken: string;
  rewardThreshold: bigint;
  receiver: string;
  templateId: string;
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
  whitelistMintCount: bigint;
  whitelistEnabled: boolean;
};

type ProjectMetadata = {
  description?: string;
  avatar?: string;
  website?: string;
  telegram?: string;
  x?: string;
  xLink?: string;
};

type TransactionReceipt = {
  status?: string | null;
  logs?: Array<{
    address?: string;
    data: string;
    topics: string[];
  }>;
};

type VanitySaltResult = {
  ok: boolean;
  suffix?: string;
  salt?: string;
  tokenAddress?: string;
  factory?: string;
  chainId?: number;
  attempts?: number;
};

const messages = {
  factoryMissing: "发射工厂地址无效：前端源码已内置当前 Factory 地址，请检查默认地址或覆盖配置。",
  wrongNetwork: "当前钱包网络不是 BNB Smart Chain，请先切换网络。",
  connectWallet: "请先连接钱包。",
  txFailed: "链上交易执行失败，请在区块浏览器查看失败原因。",
  txTimeout: "交易已提交，但等待确认超时。稍后刷新列表即可看到已确认项目。",
  requiredName: "请先填写代币名称和符号。",
  requiredMint: "请先填写发行量、公开份数、白名单份数和单次 mint 价格。",
  invalidSupply: "发行量必须大于 0。",
  invalidMintCount: "mint 次数必须是大于 0 的整数。",
  invalidMintQuota: "公开份数和白名单份数加起来必须大于 0。",
  whitelistNeedsQuota: "开启白名单时，白名单份数必须大于 0。",
  invalidMintPrice: "单次 mint 价格必须大于 0。",
  invalidReceiver: "请填写有效的项目接收钱包。",
  allocationOverflow: "税收分配总和不能超过 100%。",
  taxTooHigh: "当前合约限制买卖税最高 25%。",
  invalidAddress: (label: string) => `${label}无效。`,
  invalidWhitelistAccount: "请填写有效的白名单钱包。",
  invalidWhitelistAllowance: "白名单地址必须写入列表。",
  emptyWhitelistBatch: "请至少粘贴一个白名单钱包地址。",
  tooManyWhitelistAccounts: "单次最多提交 200 个白名单地址。",
  invalidVault: "Vault 地址无效。",
  invalidRefundAmount: "退款代币数量无效。",
  invalidMintQuantity: "Mint 数量必须是大于 0 的整数。",
  invalidPaymentToken: "付款代币地址无效。",
  mintEstimateFailed:
    "当前无法预估 Mint Gas。请确认当前钱包是否在白名单列表、公开阶段是否已开放、钱包余额是否足够，并刷新页面后重试。",
  insufficientNativeBalance: (required: string, balance: string) =>
    `钱包 BNB 不足：预计至少需要 ${required} BNB，当前余额 ${balance} BNB。`,
  vanityUnavailable: "本次没有匹配到 EEEE 靓号地址，请重新点击部署再试一次。",
};

export async function createMintLaunchToken(
  signer: Signer,
  draft: MintLaunchDraft,
): Promise<MintTransactionResult> {
  validateDraftForContract(draft);

  if (!isMintLaunchpadConfigured) {
    throw new Error(messages.factoryMissing);
  }

  const from = await signer.getAddress();
  if (!from || !isAddress(from)) {
    throw new Error(messages.connectWallet);
  }

  const params = await toFactoryParams(draft);
  const vanity = await resolveLaunchSalt(from, params);
  const salt = vanity.salt;

  const factory = new Contract(mintLaunchpadConfig.factoryAddress, launchFactoryAbi, signer);

  if (mintLaunchpadConfig.creationFeeToken !== ZeroAddress) {
    const token = new Contract(mintLaunchpadConfig.creationFeeToken, creationFeeTokenAbi, signer);
    const [balance, allowance] = await Promise.all([
      token.balanceOf(from) as Promise<bigint>,
      token.allowance(from, mintLaunchpadConfig.factoryAddress) as Promise<bigint>,
    ]);
    if (balance < MINT_CREATION_FEE_AMOUNT) {
      throw new Error("创建需要先持有至少 30,000 枚猴子币（0x0c1f...7777），部署时销毁。");
    }
    if (allowance < MINT_CREATION_FEE_AMOUNT) {
      const approval = await token.approve(mintLaunchpadConfig.factoryAddress, MINT_CREATION_FEE_AMOUNT);
      await approval.wait();
    }
  }

  // Check native BNB balance for creation fee before calling factory
  if (mintLaunchpadConfig.creationFeeAmount > 0n) {
    const provider = signer.provider;
    if (!provider) {
      throw new Error(messages.txFailed);
    }
    const currentBalance = await provider.getBalance(from);
    if (currentBalance < mintLaunchpadConfig.creationFeeAmount) {
      const requiredBnb = formatEther(mintLaunchpadConfig.creationFeeAmount);
      const balanceBnb = formatEther(currentBalance);
      throw new Error(messages.insufficientNativeBalance(requiredBnb, balanceBnb));
    }
  }

  const tx = await factory.createLaunch(params, salt, {
    value: mintLaunchpadConfig.creationFeeAmount,
  });
  await tx.wait();

  return {
    hash: tx.hash,
    salt,
    predictedTokenAddress: vanity.predictedTokenAddress,
    vanitySuffix: vanity.vanitySuffix,
    vanityAttempts: vanity.vanityAttempts,
  };
}

export async function waitForMintTransactionReceipt(
  provider: JsonRpcProvider,
  hash: string,
  timeoutMs = 120_000,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const receipt = (await provider.getTransactionReceipt(hash)) as unknown as TransactionReceipt | null;

    if (receipt) {
      if (receipt.status && receipt.status !== "0x1") {
        throw new Error(messages.txFailed);
      }
      return receipt;
    }

    await delay(3_000);
  }

  throw new Error(messages.txTimeout);
}

export function readMintLaunchCreatedToken(receipt: TransactionReceipt | null | undefined) {
  if (!receipt?.logs?.length || !isAddress(mintLaunchpadConfig.factoryAddress)) {
    return "";
  }

  const iface = new Interface(launchFactoryAbi);
  for (const log of receipt.logs) {
    if (log.address && log.address.toLowerCase() !== mintLaunchpadConfig.factoryAddress.toLowerCase()) {
      continue;
    }

    try {
      const parsed = iface.parseLog({ data: log.data, topics: log.topics });
      if (parsed?.name === "LaunchCreated" && isAddress(String(parsed.args.token))) {
        return String(parsed.args.token);
      }
    } catch {
      // Ignore non-Factory logs in the same receipt.
    }
  }

  return "";
}

export async function queueMintProjectVerification(tokenAddress: string) {
  if (!mintLaunchpadConfig.backendUrl || !isAddress(tokenAddress)) {
    return { ok: false, skipped: true };
  }

  const response = await fetch(buildBackendUrl("/api/verify-project"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: tokenAddress }),
  });

  if (!response.ok) {
    return { ok: false, skipped: true };
  }

  return (await response.json()) as { ok: boolean; token?: string };
}

export async function setMintProjectWhitelistAllowances(
  signer: Signer,
  vaultAddress: string,
  entries: WhitelistAllowanceEntry[],
): Promise<MintTransactionResult> {
  if (!isAddress(vaultAddress)) {
    throw new Error(messages.invalidAddress("Vault"));
  }
  if (entries.length <= 0) {
    throw new Error(messages.emptyWhitelistBatch);
  }
  if (entries.length > 200) {
    throw new Error(messages.tooManyWhitelistAccounts);
  }

  const accounts = entries.map((entry) => {
    if (!isAddress(entry.account)) {
      throw new Error(messages.invalidWhitelistAccount);
    }
    return entry.account;
  });
  const allowances = entries.map((entry) => {
    if (!/^\d+$/.test(entry.allowance.trim()) || BigInt(entry.allowance.trim()) <= 0n) {
      throw new Error(messages.invalidWhitelistAllowance);
    }
    return BigInt(entry.allowance.trim());
  });

  const vault = new Contract(vaultAddress, mintVaultWriteAbi, signer);
  const tx = await vault.setWhitelistAllowances(accounts, allowances);
  await tx.wait();

  return { hash: tx.hash };
}

export async function setMintProjectWhitelistEnabled(
  signer: Signer,
  vaultAddress: string,
  enabled: boolean,
): Promise<MintTransactionResult> {
  if (!isAddress(vaultAddress)) {
    throw new Error(messages.invalidAddress("Vault"));
  }

  const vault = new Contract(vaultAddress, mintVaultWriteAbi, signer);
  const tx = await vault.setWhitelistEnabled(enabled);
  await tx.wait();

  return { hash: tx.hash };
}

export async function mintLaunchProject(
  signer: Signer,
  project: MintLaunchProject,
  quantity: string,
): Promise<MintTransactionResult> {
  if (!isAddress(project.vault)) {
    throw new Error(messages.invalidVault);
  }
  if (!/^\d+$/.test(quantity.trim()) || BigInt(quantity.trim()) <= 0n) {
    throw new Error(messages.invalidMintQuantity);
  }

  const from = await signer.getAddress();
  if (!from || !isAddress(from)) {
    throw new Error(messages.connectWallet);
  }

  const mintQuantity = BigInt(quantity.trim());
  const cost = BigInt(project.mintPriceWei || "0") * mintQuantity;
  const isNativeMint = project.paymentToken.toLowerCase() === ZeroAddress;

  const vault = new Contract(project.vault, mintVaultWriteAbi, signer);
  const tx = await vault.mint(mintQuantity, {
    value: isNativeMint ? cost : 0n,
  });
  await tx.wait();

  return { hash: tx.hash };
}

export async function fetchMintLaunchProjects(account = ""): Promise<MintLaunchProject[]> {
  if (!isMintLaunchpadConfigured) {
    return [];
  }

  const provider = await getMintReadProvider();
  const factory = new Contract(mintLaunchpadConfig.factoryAddress, launchFactoryAbi, provider);
  const count = Number(await factory.allTokensLength());
  const start = Math.max(0, count - 24);
  const projects: MintLaunchProject[] = [];

  for (let index = count - 1; index >= start; index -= 1) {
    const tokenAddress = String(await factory.allTokens(index));
    const project = await factory.getProject(tokenAddress);

    const creator = String(project.creator ?? project[0]);
    const vaultAddress = String(project.vault ?? project[2]);
    const paymentToken = String(project.paymentToken ?? project[3]);
    const receiver = String(project.receiver ?? project[4]);
    const platformFeeReceiver = String(project.platformFeeReceiver ?? project[5] ?? ZeroAddress);
    const platformFeeBps = 0;
    const totalSupply = BigInt(project.totalSupply ?? project[6] ?? 0);
    const mintCount = BigInt(project.mintCount ?? project[7] ?? 0);
    const whitelistMintCount = BigInt(project.whitelistMintCount ?? project[8] ?? 0);
    const publicMintCount = BigInt(project.publicMintCount ?? project[9] ?? 0);
    const mintPrice = BigInt(project.mintPrice ?? project[10] ?? 0);
    const maxMintPerWallet = BigInt(project.maxMintPerWallet ?? project[11] ?? 0);
    const whitelistEnabled = Boolean(project.whitelistEnabled ?? project[12]);
    const metadataUri = String(project.metadataUri ?? project[13] ?? "");
    const createdAt = Number(project.createdAt ?? project[14] ?? 0);
    const rewardToken = String(project.rewardToken ?? project[15] ?? ZeroAddress);
    const rewardThreshold = BigInt(project.rewardThreshold ?? project[16] ?? 0);
    const buyTaxBps = Number(project.buyTaxBps ?? project[17] ?? 0);
    const sellTaxBps = Number(project.sellTaxBps ?? project[18] ?? 0);
    const transferTaxBps = Number(project.transferTaxBps ?? project[19] ?? 0);
    const addLiquidityTaxBps = Number(project.addLiquidityTaxBps ?? project[20] ?? 0);
    const removeLiquidityTaxBps = Number(project.removeLiquidityTaxBps ?? project[21] ?? 0);
    const launchProtectionTaxBps = Number(project.launchProtectionTaxBps ?? project[22] ?? 0);
    const launchProtectionBlocks = Number(project.launchProtectionBlocks ?? project[23] ?? 0);
    const claimWait = Number(project.claimWait ?? project[24] ?? 60);
    const fundFeeBps = Number(project.fundFeeBps ?? project[25] ?? 0);
    const lpFeeBps = Number(project.lpFeeBps ?? project[26] ?? 0);
    const dividendFeeBps = Number(project.dividendFeeBps ?? project[27] ?? 0);
    const burnFeeBps = Number(project.burnFeeBps ?? project[28] ?? 0);

    const token = new Contract(tokenAddress, tokenAbi, provider);
    const vault = new Contract(vaultAddress, mintVaultAbi, provider);

    const [
      name,
      symbol,
      mintedCount,
      whitelistMintedCount,
      publicMintedCount,
      vaultWhitelistLimit,
      vaultPublicLimit,
      refundDeadline,
      finalized,
      tokensPerMint,
      userMintedCount,
      userPaid,
      refundAllowance,
      whitelistRemaining,
      totalWhitelistAllowance,
      mintPaymentAllowance,
      vaultTokenBalance,
      userDividendUnpaid,
    ] = await Promise.all([
      token.name().catch(() => "Unknown"),
      token.symbol().catch(() => "TOKEN"),
      vault.mintedCount().catch(() => 0n),
      vault.whitelistMintedCount().catch(() => 0n),
      vault.publicMintedCount().catch(() => 0n),
      vault.whitelistMintLimit().catch(() => whitelistMintCount),
      vault.publicMintLimit().catch(() => publicMintCount),
      vault.refundDeadline().catch(() => 0n),
      vault.finalized().catch(() => false),
      vault.tokensPerMint().catch(() => (mintCount > 0n ? totalSupply / mintCount : 0n)),
      account && isAddress(account) ? vault.mintedByWallet(account).catch(() => 0n) : 0n,
      account && isAddress(account) ? vault.paidByWallet(account).catch(() => 0n) : 0n,
      account && isAddress(account) ? token.allowance(account, vaultAddress).catch(() => 0n) : 0n,
      account && isAddress(account) ? vault.whitelistRemaining(account).catch(() => 0n) : 0n,
      vault.totalWhitelistAllowance().catch(() => 0n),
      account && isAddress(account) && paymentToken.toLowerCase() !== ZeroAddress
        ? new Contract(paymentToken, tokenAbi, provider).allowance(account, vaultAddress).catch(() => 0n)
        : 0n,
      token.balanceOf(vaultAddress).catch(() => 0n),
      account && isAddress(account) ? token.unpaidDividend(account).catch(() => 0n) : 0n,
    ]);

    const mintedCountValue = BigInt(mintedCount);
    const userMintedCountValue = BigInt(userMintedCount);
    const refundTokenAmount = BigInt(tokensPerMint) * userMintedCountValue;
    const canRefund =
      !finalized &&
      Number(refundDeadline) > 0 &&
      Date.now() >= Number(refundDeadline) * 1000 &&
      BigInt(userPaid) > 0n &&
      refundTokenAmount > 0n;
    const progress = mintCount > 0n ? Math.min(100, Number((mintedCountValue * 10_000n) / mintCount) / 100) : 0;
    const metadata = parseMetadata(metadataUri);

    projects.push({
      creator,
      token: tokenAddress,
      vault: vaultAddress,
      paymentToken,
      receiver,
      platformFeeReceiver,
      platformFeeBps,
      name: String(name),
      symbol: String(symbol),
      description: metadata.description || "链上发射项目",
      avatar: metadata.avatar || "",
      website: metadata.website || "",
      telegram: metadata.telegram || "",
      xLink: metadata.x || metadata.xLink || "",
      totalSupply: formatUnits(totalSupply, 18),
      mintCount: mintCount.toString(),
      whitelistMintCount: BigInt(vaultWhitelistLimit).toString(),
      publicMintCount: BigInt(vaultPublicLimit).toString(),
      mintPrice: formatMintPrice(mintPrice, paymentToken),
      mintPriceWei: mintPrice.toString(),
      maxMintPerWallet: maxMintPerWallet.toString(),
      paymentSymbol: getPaymentSymbol(paymentToken),
      mintedCount: mintedCountValue.toString(),
      whitelistMintedCount: BigInt(whitelistMintedCount).toString(),
      publicMintedCount: BigInt(publicMintedCount).toString(),
      refundDeadline: Number(refundDeadline),
      finalized: Boolean(finalized),
      userMintedCount: userMintedCountValue.toString(),
      refundTokenAmount: refundTokenAmount.toString(),
      refundNeedsApproval: canRefund && BigInt(refundAllowance) < refundTokenAmount,
      userRefundAmount: formatRefundAmount(BigInt(userPaid), paymentToken),
      canRefund,
      whitelistRemaining: BigInt(whitelistRemaining).toString(),
      totalWhitelistAllowance: BigInt(totalWhitelistAllowance).toString(),
      mintPaymentAllowance: BigInt(mintPaymentAllowance).toString(),
      rewardToken,
      rewardThreshold: formatUnits(rewardThreshold, 18),
      userDividendUnpaid: BigInt(userDividendUnpaid).toString(),
      userDividendUnpaidFormatted: formatUnits(BigInt(userDividendUnpaid), 18),
      buyTaxBps,
      sellTaxBps,
      transferTaxBps,
      addLiquidityTaxBps,
      removeLiquidityTaxBps,
      launchProtectionTaxBps,
      launchProtectionBlocks,
      claimWait,
      fundFeeBps,
      lpFeeBps,
      dividendFeeBps,
      burnFeeBps,
      vaultTokenBalance: formatUnits(BigInt(vaultTokenBalance), 18),
      progress,
      whitelistEnabled,
      createdAt,
    });
  }

  return projects;
}

export async function watchMintLaunchProjectEvents(projects: MintLaunchProject[], onUpdate: () => void) {
  const watchableProjects = projects.filter(
    (project) => !project.finalized && isAddress(project.vault) && isAddress(project.token),
  );

  if (!watchableProjects.length) {
    return () => {};
  }

  const provider = await getMintReadProvider();
  provider.pollingInterval = 3_000;
  const listeners: Array<{ filter: { address: string; topics: string[] }; handler: () => void }> = [];
  let refreshTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const scheduleUpdate = () => {
    if (refreshTimer) {
      return;
    }

    refreshTimer = globalThis.setTimeout(() => {
      refreshTimer = null;
      onUpdate();
    }, 600);
  };

  const addListener = (address: string, topic: string) => {
    const filter = { address, topics: [topic] };
    provider.on(filter, scheduleUpdate);
    listeners.push({ filter, handler: scheduleUpdate });
  };

  for (const project of watchableProjects) {
    addListener(project.vault, MINTED_EVENT_TOPIC);
    addListener(project.vault, LAUNCH_FINALIZED_EVENT_TOPIC);
    addListener(project.token, TRADING_ENABLED_EVENT_TOPIC);
  }

  return () => {
    if (refreshTimer) {
      globalThis.clearTimeout(refreshTimer);
    }
    for (const listener of listeners) {
      provider.off(listener.filter, listener.handler);
    }
    provider.destroy();
  };
}

async function toFactoryParams(draft: MintLaunchDraft): Promise<FactoryLaunchParams> {
  const form = draft.form;
  const advancedTax = draft.advancedTax;
  const paymentToken = normalizeAddress(form.paymentToken || ZeroAddress, "付款代币地址");
  const rewardToken = normalizeAddress(form.rewardToken || MINT_USDT_ADDRESS, "分红代币地址");
  const receiver = normalizeAddress(form.receiverWallet, "接收钱包");
  const mintPrice =
    paymentToken.toLowerCase() === ZeroAddress ? parseEther(form.mintPrice) : parseUnits(form.mintPrice, 18);
  const mintQuota = readMintQuota(draft);

  return {
    name: form.tokenName.trim(),
    symbol: form.symbol.trim(),
    metadataUri: await buildMetadata(draft),
    totalSupply: parseUnits(form.supply, 18),
    mintCount: mintQuota.total,
    mintPrice,
    maxMintPerWallet: parseMintCountAllowZero(form.maxMintPerWallet || "0"),
    paymentToken,
    rewardToken,
    rewardThreshold: parseUnits(form.rewardThreshold || "0", 18),
    receiver,
    templateId: id(draft.templateId),
    buyTaxBps: percentToBps(draft.buyTax),
    sellTaxBps: percentToBps(draft.sellTax),
    transferTaxBps: percentToBps(advancedTax.transferTax),
    addLiquidityTaxBps: percentToBps(advancedTax.addLiquidityTax),
    removeLiquidityTaxBps: percentToBps(advancedTax.removeLiquidityTax),
    launchProtectionTaxBps: percentToBps(advancedTax.launchProtectionTax),
    launchProtectionBlocks: parseUintNumber(advancedTax.launchProtectionBlocks || "0"),
    claimWait: parseUintNumber(advancedTax.claimWaitSeconds || "0"),
    fundFeeBps: percentToBps(draft.allocation.marketing),
    lpFeeBps: percentToBps(draft.allocation.liquidity),
    dividendFeeBps: percentToBps(draft.allocation.rewards),
    burnFeeBps: percentToBps(draft.allocation.burn),
    whitelistMintCount: mintQuota.whitelist,
    whitelistEnabled: draft.whitelistEnabled || mintQuota.whitelist > 0n,
  };
}

async function resolveLaunchSalt(creator: string, params: FactoryLaunchParams) {
  if (!mintLaunchpadConfig.vanitySuffix) {
    return {
      salt: hexlify(randomBytes(32)),
      predictedTokenAddress: "",
      vanitySuffix: "",
      vanityAttempts: 0,
    };
  }

  if (!mintLaunchpadConfig.backendUrl) {
    throw new Error(messages.vanityUnavailable);
  }

  try {
    const response = await fetch(buildBackendUrl("/api/vanity-salt"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        suffix: mintLaunchpadConfig.vanitySuffix,
        maxIterations: 500000,
        creator,
        params: serializeFactoryParams(params),
      }),
    });

    if (!response.ok) {
      throw new Error(messages.vanityUnavailable);
    }

    const result = (await response.json()) as VanitySaltResult;
    if (!result.ok || !result.salt || !/^0x[0-9a-fA-F]{64}$/.test(result.salt)) {
      throw new Error(messages.vanityUnavailable);
    }
    if (
      !result.factory ||
      !isAddress(result.factory) ||
      result.factory.toLowerCase() !== mintLaunchpadConfig.factoryAddress.toLowerCase() ||
      Number(result.chainId ?? 0) !== mintLaunchpadConfig.chainId
    ) {
      throw new Error(messages.vanityUnavailable);
    }

    const suffix = String(result.suffix ?? mintLaunchpadConfig.vanitySuffix).toLowerCase();
    const predictedTokenAddress =
      result.tokenAddress && isAddress(result.tokenAddress) ? result.tokenAddress : "";
    if (!predictedTokenAddress || !predictedTokenAddress.toLowerCase().endsWith(suffix)) {
      throw new Error(messages.vanityUnavailable);
    }

    return {
      salt: result.salt,
      predictedTokenAddress,
      vanitySuffix: suffix,
      vanityAttempts: Number(result.attempts ?? 0),
    };
  } catch {
    throw new Error(messages.vanityUnavailable);
  }
}

function serializeFactoryParams(params: FactoryLaunchParams) {
  return {
    ...params,
    totalSupply: params.totalSupply.toString(),
    mintCount: params.mintCount.toString(),
    mintPrice: params.mintPrice.toString(),
    maxMintPerWallet: params.maxMintPerWallet.toString(),
    rewardThreshold: params.rewardThreshold.toString(),
    whitelistMintCount: params.whitelistMintCount.toString(),
  };
}

function validateDraftForContract(draft: MintLaunchDraft) {
  const form = draft.form;

  if (!form.tokenName.trim() || !form.symbol.trim()) {
    throw new Error(messages.requiredName);
  }

  if (!form.supply || !form.mintPrice) {
    throw new Error(messages.requiredMint);
  }

  if (!Number.isFinite(Number(form.supply)) || Number(form.supply) <= 0) {
    throw new Error(messages.invalidSupply);
  }

  readMintQuota(draft);

  if (!Number.isFinite(Number(form.mintPrice)) || Number(form.mintPrice) <= 0) {
    throw new Error(messages.invalidMintPrice);
  }
  parseMintCountAllowZero(form.maxMintPerWallet || "0");

  if (!isAddress(form.receiverWallet)) {
    throw new Error(messages.invalidReceiver);
  }

  const totalAllocation =
    draft.allocation.marketing + draft.allocation.liquidity + draft.allocation.rewards + draft.allocation.burn;

  if (totalAllocation > 100) {
    throw new Error(messages.allocationOverflow);
  }

  const advancedTaxValues = [
    draft.advancedTax.transferTax,
    draft.advancedTax.addLiquidityTax,
    draft.advancedTax.removeLiquidityTax,
    draft.advancedTax.launchProtectionTax,
  ];
  if (draft.buyTax > 25 || draft.sellTax > 25 || advancedTaxValues.some((value) => value > 25)) {
    throw new Error(messages.taxTooHigh);
  }

  parseUintNumber(draft.advancedTax.launchProtectionBlocks || "0");
  const claimWait = parseUintNumber(draft.advancedTax.claimWaitSeconds || "0");
  if (claimWait > 24 * 60 * 60) {
    throw new Error(messages.taxTooHigh);
  }
}

function readMintQuota(draft: MintLaunchDraft) {
  const publicCount = parseMintCount(draft.form.publicMintCount || "0");
  const whitelistCount = parseMintCount(draft.form.whitelistMintCount || "0");
  const total = publicCount + whitelistCount;

  if (total <= 0n) {
    throw new Error(messages.invalidMintQuota);
  }
  if (draft.whitelistEnabled && whitelistCount <= 0n) {
    throw new Error(messages.whitelistNeedsQuota);
  }

  return {
    public: publicCount,
    whitelist: whitelistCount,
    total,
  };
}

function parseMintCount(value: string) {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(messages.invalidMintCount);
  }
  return BigInt(value.trim());
}

function parseMintCountAllowZero(value: string) {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(messages.invalidMintCount);
  }
  return BigInt(value.trim());
}

function parseUintNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error("Invalid integer value.");
  }

  const nextValue = Number(trimmed);
  if (!Number.isSafeInteger(nextValue) || nextValue < 0) {
    throw new Error("Invalid integer value.");
  }

  return nextValue;
}

function normalizeAddress(address: string, label: string) {
  const nextAddress = address.trim();
  if (!isAddress(nextAddress)) {
    throw new Error(messages.invalidAddress(label));
  }
  return nextAddress;
}

async function buildMetadata(draft: MintLaunchDraft) {
  const metadata: ProjectMetadata = {
    description: trimMetadataText(draft.form.description),
    avatar: await resolveMetadataAvatar(draft.avatar),
    website: trimMetadataText(draft.form.website),
    telegram: trimMetadataText(draft.form.telegram),
    x: trimMetadataText(draft.form.xLink),
  };

  return compactMetadata(metadata);
}

function parseMetadata(metadataUri: string): ProjectMetadata {
  try {
    const parsed = JSON.parse(metadataUri) as ProjectMetadata;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function resolveMetadataAvatar(avatar: string) {
  const nextAvatar = String(avatar ?? "").trim();
  if (!nextAvatar) {
    return "";
  }
  if (!nextAvatar.startsWith("data:")) {
    return trimMetadataText(nextAvatar);
  }
  if (!mintLaunchpadConfig.backendUrl) {
    return "";
  }

  try {
    const response = await fetch(buildBackendUrl("/api/assets"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl: nextAvatar }),
    });
    if (!response.ok) {
      return "";
    }

    const result = (await response.json()) as { ok?: boolean; url?: string };
    return result.ok && result.url ? trimMetadataText(result.url) : "";
  } catch {
    return "";
  }
}

function compactMetadata(metadata: ProjectMetadata) {
  const cleaned = {
    description: metadata.description || "",
    avatar: metadata.avatar || "",
    website: metadata.website || "",
    telegram: metadata.telegram || "",
    x: metadata.x || "",
  };
  let output = JSON.stringify(cleaned);
  if (readMetadataBytes(output) <= MAX_ONCHAIN_METADATA_BYTES) {
    return output;
  }

  cleaned.avatar = "";
  cleaned.description = trimMetadataText(cleaned.description, 180);
  output = JSON.stringify(cleaned);
  if (readMetadataBytes(output) <= MAX_ONCHAIN_METADATA_BYTES) {
    return output;
  }

  return JSON.stringify({
    description: trimMetadataText(cleaned.description, 80),
    avatar: "",
    website: trimMetadataText(cleaned.website, 160),
    telegram: trimMetadataText(cleaned.telegram, 160),
    x: trimMetadataText(cleaned.x, 160),
  });
}

function trimMetadataText(value: unknown, maxLength = MAX_METADATA_TEXT_LENGTH) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function readMetadataBytes(value: string) {
  return new TextEncoder().encode(value).length;
}

function formatMintPrice(value: bigint, paymentToken: string) {
  return `${paymentToken.toLowerCase() === ZeroAddress ? formatEther(value) : formatUnits(value, 18)} ${getPaymentSymbol(paymentToken)}`;
}

function formatRefundAmount(value: bigint, paymentToken: string) {
  if (value <= 0n) {
    return "";
  }
  return `${paymentToken.toLowerCase() === ZeroAddress ? formatEther(value) : formatUnits(value, 18)} ${getPaymentSymbol(paymentToken)}`;
}

function getPaymentSymbol(paymentToken: string) {
  if (paymentToken.toLowerCase() === ZeroAddress) {
    return "BNB";
  }
  return paymentToken.toLowerCase() === MINT_USDT_ADDRESS.toLowerCase() ? "USDT" : "TOKEN";
}

function normalizeBackendBaseUrl(value: string) {
  const nextValue = value.trim();
  if (nextValue === "same-origin" && globalThis.location?.origin) {
    return globalThis.location.origin;
  }
  return nextValue.replace(/\/+$/, "");
}

function buildBackendUrl(path: string) {
  return `${mintLaunchpadConfig.backendUrl}${path}`;
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export function percentToBps(value: number) {
  return Math.round(value * 100);
}
