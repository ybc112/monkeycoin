import { isAddress } from "ethers";

// 猴子币兑换 NFT 前端配置（BSC）
export const MONKEY_TOKEN = "0x0c1fa1ff27cd3dd0663a8160498dea3603c17777"; // $MKY
export const NFT_COST = 80_000n * 10n ** 18n; // 80,000 MKY = 1 张 NFT
export const NFT_MAX_SUPPLY = 300;
export const RECEIVER_ADDRESS = "0x681E3ffCD487BE8C4BD39d1831fdE4d2dD0Df79A"; // 收款地址（生态白名单基金，不销毁）

// 部署后回填（从 deployments/bsc-MonkeyNFT.json）
export const MONKEY_NFT_ADDRESS = String(
  (import.meta.env.VITE_MONKEY_NFT_ADDRESS ?? "") || "0x8c6932FC68727C35eCb224F47230f17cC1341EA6"
).trim();
export const BURN_TO_MINT_ADDRESS = String(
  (import.meta.env.VITE_BURN_TO_MINT_ADDRESS ?? "") || "0x5B196D2604037a1fDa33e321Ed4b4e22644835eE"
).trim();

export const isNftConfigured = isAddress(MONKEY_NFT_ADDRESS) && isAddress(BURN_TO_MINT_ADDRESS);

export const MONKEY_NFT_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
] as const;

export const BURN_TO_MINT_ABI = [
  "function redeem() external returns (uint256 tokenId)",
  "function cost() view returns (uint256)",
  "function totalBurned() view returns (uint256)",
  "function paused() view returns (bool)",
  "function claimed(address) view returns (bool)",
  "function nft() view returns (address)",
  "function mky() view returns (address)",
] as const;

export const MINT_TOKEN_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
] as const;