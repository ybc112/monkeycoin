export type TrendingToken = {
  name: string;
  symbol: string;
  address: string;
  logo?: string;
  chain: "BSC";
  rank: number;
  heat: number;
  change?: number;
  tags?: string[];
};

// Tokens approved for the public ranking page are added here.
export const TRENDING_TOKENS: TrendingToken[] = [];
