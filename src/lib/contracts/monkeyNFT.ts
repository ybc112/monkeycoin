import { isAddress } from "ethers";

// 猴子币销毁兑换 NFT 前端配置（BSC）
export const MONKEY_TOKEN = "0x0c1fa1ff27cd3dd0663a8160498dea3603c17777"; // $MKY
export const NFT_COST = 30_000n * 10n ** 18n; // 销毁 30,000 MKY = 1 张 NFT
export const NFT_MAX_SUPPLY = 999;
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

// 部署后回填（从 deployments/bsc-MonkeyNFT.json）
export const MONKEY_NFT_ADDRESS = String(
  (import.meta.env.VITE_MONKEY_NFT_ADDRESS ?? "") || ""
).trim();
export const BURN_TO_MINT_ADDRESS = String(
  (import.meta.env.VITE_BURN_TO_MINT_ADDRESS ?? "") || ""
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
  "function nft() view returns (address)",
  "function mky() view returns (address)",
] as const;

export const MINT_TOKEN_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
] as const;