import { ethers, type BrowserProvider, type Contract, type Signer } from "ethers";

let _bananaTokenBytecode: string | null = null;

async function getBananaTokenBytecode(): Promise<string> {
  if (_bananaTokenBytecode) return _bananaTokenBytecode;
  const res = await fetch("/artifacts/BananaToken.json");
  const artifact = await res.json();
  _bananaTokenBytecode = artifact.bytecode as string;
  return _bananaTokenBytecode;
}

// ─────────────────────────────────────────────────────────────────────────────
// 链配置（BSC 主网）
// ─────────────────────────────────────────────────────────────────────────────
export const CHAIN_ID = 56;

export const RPCS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed2.bnbchain.org",
  "https://bsc.publicnode.com",
];

export const ADDRESSES = {
  router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  wbnb: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  usdt: "0x55d398326f99059fF775485246999027B3197955",
  lpBlackHole: "0x000000000000000000000000000000000000dEaD",
};

// 猴子币 $MKY 代币合约（部署时一次性销毁 30,000 枚）
export const MONKEY_TOKEN_ADDRESS = "0x0c1fa1ff27cd3dd0663a8160498dea3603c17777";
export const MONKEY_MINT_BURN_AMOUNT = 30000n; // 30,000 枚 $MKY

export const FACTORY_ADDRESS =
  import.meta.env.VITE_SNOWBALL_FACTORY_ADDRESS ||
  "0x80C0a8485F6D0a409E1e3f8f8F59Fe0508bBaB92"; // BSC 主网，2026-08-17 部署（含手动回流）

// ─────────────────────────────────────────────────────────────────────────────
// TokenFactory ABI（对齐 flap-vault-ai-coder/contracts/tokenfactory/TokenFactory.sol）
// ─────────────────────────────────────────────────────────────────────────────
const LAUNCH_PARAMS_TUPLE = "(string name,string symbol,uint256 totalSupply,address receiver,address fundAddress,address rewardToken,address currency,uint256 totalBuyTax,uint256 totalSellTax,uint256 rewardShare,uint256 liquidityShare,uint256 burnShare,uint256 fundShare,uint256 maxBuyAmount,uint256 maxSellAmount,uint256 maxWalletAmount,uint256 secondTime,uint256 killBlocks,uint256 airdropNumbs,uint256 transferFee,uint256 mushHoldNum,uint256 lpBurnFrequency,uint256 percentForLPBurn,bool enableOffTrade)";

export const FACTORY_ABI = [
  // write
  `function createToken(${LAUNCH_PARAMS_TUPLE} params, bytes32 salt) payable returns (address token)`,
  `function createTokenAndAddLiquidity(${LAUNCH_PARAMS_TUPLE} params, bytes32 salt, uint256 addLiquidityTokens, uint256 addLiquidityEth) payable returns (address token)`,
  // read / preview
  "function previewFees(uint256 totalBuyTax, uint256 totalSellTax, uint256 rewardShare, uint256 liquidityShare, uint256 burnShare, uint256 fundShare) pure returns ((uint256 platformFee,uint256 rewardFee,uint256 liquidityFee,uint256 burnFee,uint256 fundFee) buy, (uint256 platformFee,uint256 rewardFee,uint256 liquidityFee,uint256 burnFee,uint256 fundFee) sell)",
  `function buildParams(${LAUNCH_PARAMS_TUPLE} params, bool withLiquidity) view returns (string[], address[], uint256[], bool[])`,
  "function creationFee() external view returns (uint256)",
  "function DEFAULT_REWARD_TOKEN() external view returns (address)",
  "function feeRecipient() external view returns (address)",
  "function router() external view returns (address)",
  "function dividendTrackerImpl() external view returns (address)",
  "function tokenDeployer() external view returns (address)",
  "function requiredTokenSuffix() external view returns (uint256)",
  "function allTokensLength() external view returns (uint256)",
  "function allTokens(uint256 index) external view returns (address)",
  // events
  "event TokenCreated(address indexed creator, address indexed token, string name, string symbol, uint256 totalSupply, uint256 buyRewardFee, uint256 buyLiquidityFee, uint256 buyBurnFee, uint256 buyFundFee, uint256 sellRewardFee, uint256 sellLiquidityFee, uint256 sellBurnFee, uint256 sellFundFee, uint256 maxBuyAmount, uint256 maxSellAmount, uint256 maxWalletAmount, uint256 lpBurnFrequency, uint256 percentForLPBurn, bool addLiquidity)",
  "event CreationFeeUpdated(uint256 creationFee)",
  "event FeeRecipientUpdated(address indexed feeRecipient)",
  // errors
  "error InvalidParams()",
  "error InvalidFee()",
  "error InvalidTokenSuffix(address token, uint16 requiredSuffix)",
  "error ZeroAddress()",
  "error TokenTransferFailed()",
];

export const BANANA_TOKEN_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function decimals() external view returns (uint8)",
  "function name() external view returns (string memory)",
  "function symbol() external view returns (string memory)",
  "function totalSupply() external view returns (uint256)",
  "function owner() external view returns (address)",
  "function _mainPair() external view returns (address)",
  "function fundAddress() external view returns (address)",
  "function _buyFundFee() external view returns (uint256)",
  "function _buyLiquidityFee() external view returns (uint256)",
  "function _buyRewardFee() external view returns (uint256)",
  "function _buyBurnFee() external view returns (uint256)",
  "function _sellFundFee() external view returns (uint256)",
  "function _sellLiquidityFee() external view returns (uint256)",
  "function _sellRewardFee() external view returns (uint256)",
  "function _sellBurnFee() external view returns (uint256)",
  "function _buyPlatformFee() external view returns (uint256)",
  "function _sellPlatformFee() external view returns (uint256)",
  "function maxBuyAmount() external view returns (uint256)",
  "function maxSellAmount() external view returns (uint256)",
  "function maxWalletAmount() external view returns (uint256)",
  "function swapAtAmount() external view returns (uint256)",
  "function mushHoldNum() external view returns (uint256)",
  "function lpBurnFrequency() external view returns (uint256)",
  "function percentForLPBurn() external view returns (uint256)",
  "function getMinimumTokenBalanceForDividends() external view returns (uint256)",
  "function getClaimWait() external view returns (uint256)",
  "function launch() external",
  "function startTradeTime() external view returns (uint256)",
  "function setTradeFee(uint256[] customs) external",
  "function setFundAddress(address wallet) external",
  "function setMaxBuyAmount(uint256 amount) external",
  "function setMaxSellAmount(uint256 amount) external",
  "function setWalletLimit(uint256 amount) external",
  "function setSwapAtAmount(uint256 amount) external",
  "function setkb(uint256 blocks_) external",
  "function setSecondTime(uint256 seconds_) external",
  "function setAirdropNumbs(uint256 count) external",
  "function setTransferFee(uint256 bps) external",
  "function setSwapAndLiquifyEnabled(bool enabled) external",
  "function manualSwapBack() external",
  "function setNumTokensSellRate(uint256 rate) external",
  "function setFeeWhiteList(address[] addresses, bool enabled) external",
  "function multi_bclist(address[] addresses, bool enabled) external",
  "function excludeFromDividends(address account) external",
  "function updateMinimumTokenBalanceForDividends(uint256 amount) external",
  "function updateClaimWait(uint256 seconds_) external",
  "function setlpBurnFrequency(uint256 seconds_) external",
  "function setpercentForLPBurn(uint256 bps) external",
  "function transferOwnership(address newOwner) external",
  "function renounceOwnership() external",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// ─────────────────────────────────────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────────────────────────────────────
export interface SnowballParams {
  name: string;
  symbol: string;
  totalSupply: string;
  currency: string;
  rewardToken: string;
  receiver: string;
  fundAddress: string;
  totalBuyTax: number;
  totalSellTax: number;
  rewardShare: number;
  liquidityShare: number;
  burnShare: number;
  fundShare: number;
  maxBuyAmount: string;
  maxSellAmount: string;
  maxWalletAmount: string;
  secondTime: number;
  killBlocks: number;
  airdropNumbs: number;
  transferFee: number;
  mushHoldNum: string;
  lpBurnFrequency: number;
  percentForLPBurn: number;
  enableOffTrade: boolean;
}

export interface FeeBreakdown {
  platformFee: number;
  rewardFee: number;
  liquidityFee: number;
  burnFee: number;
  fundFee: number;
}

export interface BuiltParams {
  stringParams: string[];
  addressParams: string[];
  numberParams: string[];
  boolParams: boolean[];
}

// ─────────────────────────────────────────────────────────────────────────────
// provider 工厂
// ─────────────────────────────────────────────────────────────────────────────
export function getReadProvider() {
  const providers = RPCS.map((url, index) => ({
    provider: new ethers.JsonRpcProvider(url, CHAIN_ID, {
      staticNetwork: true,
      batchMaxCount: 1,
    }),
    priority: index + 1,
    stallTimeout: 1500,
    weight: 1,
  }));
  return new ethers.FallbackProvider(providers, CHAIN_ID, { quorum: 1 });
}

export function getFactoryContract(signerOrProvider: BrowserProvider | Signer | ethers.Provider = getReadProvider()) {
  if (!FACTORY_ADDRESS) throw new Error("VITE_SNOWBALL_FACTORY_ADDRESS 未配置");
  return new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signerOrProvider);
}

// ─────────────────────────────────────────────────────────────────────────────
// 参数构建（完全对齐合约 LaunchParams）
// ─────────────────────────────────────────────────────────────────────────────
function unlimitedIfZero(value: string): bigint {
  const v = value.trim();
  if (!v || v === "0") return ethers.MaxUint256;
  return ethers.parseUnits(v, 18);
}

export function buildLaunchParams(p: SnowballParams): any {
  return {
    name: p.name,
    symbol: p.symbol,
    totalSupply: ethers.parseUnits(p.totalSupply || "0", 18),
    receiver: p.receiver,
    fundAddress: p.fundAddress || p.receiver,
    rewardToken: p.rewardToken || ADDRESSES.usdt,
    currency: p.currency || ADDRESSES.wbnb,
    totalBuyTax: BigInt(p.totalBuyTax),
    totalSellTax: BigInt(p.totalSellTax),
    rewardShare: BigInt(p.rewardShare),
    liquidityShare: BigInt(p.liquidityShare),
    burnShare: BigInt(p.burnShare),
    fundShare: BigInt(p.fundShare),
    maxBuyAmount: unlimitedIfZero(p.maxBuyAmount),
    maxSellAmount: unlimitedIfZero(p.maxSellAmount),
    maxWalletAmount: unlimitedIfZero(p.maxWalletAmount),
    secondTime: BigInt(p.secondTime || 0),
    killBlocks: BigInt(p.killBlocks || 0),
    airdropNumbs: BigInt(p.airdropNumbs || 0),
    transferFee: BigInt(p.transferFee || 0),
    mushHoldNum: ethers.parseUnits(p.mushHoldNum || "0", 18),
    lpBurnFrequency: BigInt(p.lpBurnFrequency || 3600),
    percentForLPBurn: BigInt(p.percentForLPBurn || 50),
    enableOffTrade: p.enableOffTrade,
  };
}

export async function previewFees(p: SnowballParams): Promise<{ buy: FeeBreakdown; sell: FeeBreakdown }> {
  const split = (totalTax: number): FeeBreakdown => {
    const platformFee = Math.floor((totalTax * 2000) / 10000);
    const leftTax = totalTax - platformFee;
    const rewardFee = Math.floor((leftTax * p.rewardShare) / 10000);
    const liquidityFee = Math.floor((leftTax * p.liquidityShare) / 10000);
    const burnFee = Math.floor((leftTax * p.burnShare) / 10000);
    const fundFee = leftTax - rewardFee - liquidityFee - burnFee;
    return { platformFee, rewardFee, liquidityFee, burnFee, fundFee };
  };
  return {
    buy: split(p.totalBuyTax),
    sell: split(p.totalSellTax),
  };
}

export async function buildContractParams(p: SnowballParams, withLiquidity: boolean): Promise<BuiltParams> {
  const factory = getFactoryContract();
  const launchParams = buildLaunchParams(p);
  const [stringParams, addressParams, numberParams, boolParams] = await factory.buildParams(launchParams, withLiquidity);
  return {
    stringParams: stringParams as string[],
    addressParams: addressParams as string[],
    numberParams: numberParams.map((n: any) => n.toString()),
    boolParams: boolParams as boolean[],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 离线地址预测 + 靓号挖盐
// ─────────────────────────────────────────────────────────────────────────────
async function getDeployerAddress(factory: Contract): Promise<string> {
  return factory.tokenDeployer();
}

function computeInitCodeHash(params: BuiltParams, bytecode: string): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(
    ["string[]", "address[]", "uint256[]", "bool[]", "uint256[]"],
    [params.stringParams, params.addressParams, params.numberParams, params.boolParams, []]
  );
  return ethers.keccak256(bytecode + encoded.slice(2));
}

async function prepareAddressMiner(factory: Contract, params: BuiltParams) {
  const [deployerAddr, bytecode] = await Promise.all([
    getDeployerAddress(factory),
    getBananaTokenBytecode(),
  ]);
  return { deployerAddr, initHash: computeInitCodeHash(params, bytecode) };
}

export async function computeTokenAddress(
  factory: Contract,
  params: BuiltParams,
  salt: string
): Promise<string> {
  const { deployerAddr, initHash } = await prepareAddressMiner(factory, params);
  return ethers.getCreate2Address(deployerAddr, salt, initHash);
}

export function addressSuffixMatches(addr: string, suffix: string): boolean {
  if (!suffix) return true;
  return addr.toLowerCase().endsWith(suffix.toLowerCase());
}

export async function mineSalt(
  factory: Contract,
  params: BuiltParams,
  targetSuffix: string,
  onProgress?: (tried: number, addr: string) => void,
  abortSignal?: AbortSignal
): Promise<{ salt: string; address: string; attempts: number }> {
  if (!targetSuffix) {
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const address = await computeTokenAddress(factory, params, salt);
    return { salt, address, attempts: 1 };
  }

  const { deployerAddr, initHash } = await prepareAddressMiner(factory, params);
  let attempts = 0;
  while (true) {
    if (abortSignal?.aborted) throw new Error("已取消挖盐");
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const address = ethers.getCreate2Address(deployerAddr, salt, initHash);
    attempts++;
    if (attempts % 2_000 === 0) {
      onProgress?.(attempts, address);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (address.toLowerCase().endsWith(targetSuffix.toLowerCase())) {
      return { salt, address, attempts };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 写操作：创建代币
// ─────────────────────────────────────────────────────────────────────────────
export async function createToken(
  signer: Signer,
  params: SnowballParams,
  salt: string,
  creationFee: string
) {
  const factory = getFactoryContract(signer);
  const launchParams = buildLaunchParams(params);
  const tx = await factory.createToken(launchParams, salt, { value: creationFee });
  const receipt = await tx.wait();
  const event = receipt?.logs
    .map((log: any) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e: any) => e?.name === "TokenCreated");
  return { receipt, tokenAddress: event?.args?.token, txHash: tx.hash };
}

export async function createTokenAndAddLiquidity(
  signer: Signer,
  params: SnowballParams,
  salt: string,
  creationFee: string,
  liquidityTokens: string,
  liquidityBnb: string
) {
  const factory = getFactoryContract(signer);
  const launchParams = buildLaunchParams(params);
  const totalValue = (BigInt(creationFee) + BigInt(liquidityBnb)).toString();
  const tx = await factory.createTokenAndAddLiquidity(
    launchParams,
    salt,
    liquidityTokens,
    liquidityBnb,
    { value: totalValue }
  );
  const receipt = await tx.wait();
  const event = receipt?.logs
    .map((log: any) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e: any) => e?.name === "TokenCreated");
  return { receipt, tokenAddress: event?.args?.token, txHash: tx.hash };
}

// ─────────────────────────────────────────────────────────────────────────────
// 读操作：Factory 信息
// ─────────────────────────────────────────────────────────────────────────────
export async function getFactoryInfo() {
  const factory = getFactoryContract();
  const [createFee, rewardToken, feeRecipient, requiredSuffix, router] = await Promise.all([
    factory.creationFee(),
    factory.DEFAULT_REWARD_TOKEN(),
    factory.feeRecipient(),
    factory.requiredTokenSuffix(),
    factory.router(),
  ]);
  return {
    createFee: createFee.toString(),
    rewardToken,
    feeRecipient,
    requiredSuffix: requiredSuffix.toString(),
    router,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 雪球后端 API（服务器挖盐 + 自动开源，/root/snowball · pm2 snowball-backend）
// ─────────────────────────────────────────────────────────────────────────────
export const SNOWBALL_API_BASE =
  (import.meta.env.VITE_SNOWBALL_API_URL || "/snowball-api").replace(/\/$/, "");

export async function serverMineSalt(
  params: BuiltParams,
  suffix: string,
  maxIterations = 300000
): Promise<{ salt: string; address: string; attempts: number } | null> {
  if (!SNOWBALL_API_BASE) return null;
  try {
    const res = await fetch(`${SNOWBALL_API_BASE}/api/vanity-salt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suffix, params, maxIterations }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    return { salt: data.salt, address: data.address, attempts: data.attempts };
  } catch {
    return null;
  }
}

export async function fetchVerifyStatus(): Promise<
  { id: string; tokenAddress: string; status: string; error?: string; guid?: string }[]
> {
  if (!SNOWBALL_API_BASE) return [];
  try {
    const res = await fetch(`${SNOWBALL_API_BASE}/api/verify-status`, { method: "GET" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  } catch {
    return [];
  }
}
