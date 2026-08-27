// 部署 猴子币销毁兑换 NFT（BSC）
// 顺序：部署 MonkeyNFT(999) → 部署 BurnToMint(MKY, nft, 10000e18) → NFT.setMintAuthority(兑换合约) → 写部署记录
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ethers } = require("ethers");

const ROOT = path.resolve(__dirname, "..");

const BSC_RPCS = [
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc.drpc.org",
];

const MONKEY_TOKEN = process.env.MONKEY_TOKEN_ADDRESS || "0x0c1fa1ff27cd3dd0663a8160498dea3603c17777";
const MAX_SUPPLY = Number(process.env.NFT_MAX_SUPPLY || 999);
const COST_MKY = BigInt(process.env.NFT_COST_MKY || 10000) * 10n ** 18n;
const GAS_PRICE = ethers.parseUnits(process.env.GAS_PRICE_GWEI || "1", "gwei");
const GAS_LIMIT_NFT = 3_000_000;
const GAS_LIMIT_BURN = 3_000_000;

function loadEnv(file) {
  const o = {};
  try {
    const t = fs.readFileSync(file, "utf8");
    t.split(/\r?\n/).forEach((l) => {
      l = l.trim();
      if (!l || l.startsWith("#")) return;
      const i = l.indexOf("=");
      if (i < 0) return;
      const k = l.slice(0, i).trim();
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      o[k] = v;
    });
  } catch { /* ignore */ }
  return o;
}

function readArtifact(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "build", "contracts", name), "utf8"));
}

function makeProvider() {
  const providers = BSC_RPCS.map((url) => new ethers.JsonRpcProvider(url, 56, { staticNetwork: true, batchMaxCount: 1, pollingInterval: 4000 }));
  return new ethers.FallbackProvider(providers, 56, { quorum: 1 });
}

async function main() {
  const env = loadEnv(path.join(ROOT, "server", ".env"));
  const privateKey = process.env.PRIVATE_KEY || env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found (server/.env or PRIVATE_KEY env)");

  const provider = makeProvider();
  const signer = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
  const deployer = await signer.getAddress();
  const bal = await provider.getBalance(deployer);
  console.log("Deployer:", deployer);
  console.log("BNB:", ethers.formatEther(bal));
  if (bal < (await provider.getFeeData()).gasPrice * 10n) {
    console.warn("警告：余额可能不足以覆盖 gas");
  }

  const nftArtifact = readArtifact("MonkeyNFT.json");
  const burnArtifact = readArtifact("BurnToMint.json");

  // 1. 部署 NFT
  console.log("\n[1/4] Deploying MonkeyNFT maxSupply=" + MAX_SUPPLY);
  const nftIf = new ethers.Interface(nftArtifact.abi);
  const nftDeployData = nftArtifact.bytecode + nftIf.encodeDeploy([MAX_SUPPLY]).slice(2);
  const nftTx = await signer.sendTransaction({ data: nftDeployData, gasLimit: GAS_LIMIT_NFT, gasPrice: GAS_PRICE });
  const nftReceipt = await nftTx.wait();
  const nftAddress = nftReceipt.contractAddress;
  console.log("  NFT:", nftAddress, "tx:", nftTx.hash);
  console.log("  ABI sha256:", crypto.createHash("sha256").update(nftArtifact.abi.map((s) => JSON.stringify(s)).join("")).digest("hex"));

  // 2. 部署 BurnToMint
  console.log("\n[2/4] Deploying BurnToMint cost=" + ethers.formatUnits(COST_MKY, 18) + " MKY");
  const burnIf = new ethers.Interface(burnArtifact.abi);
  const burnDeployData = burnArtifact.bytecode + burnIf.encodeDeploy([MONKEY_TOKEN, nftAddress, COST_MKY]).slice(2);
  const burnTx = await signer.sendTransaction({ data: burnDeployData, gasLimit: GAS_LIMIT_BURN, gasPrice: GAS_PRICE });
  const burnReceipt = await burnTx.wait();
  const burnAddress = burnReceipt.contractAddress;
  console.log("  Exchange:", burnAddress, "tx:", burnTx.hash);

  // 3. NFT 授予兑换合约 mint 权限
  console.log("\n[3/4] Setting mintAuthority on NFT ->", burnAddress);
  const nft = new ethers.Contract(nftAddress, nftArtifact.abi, signer);
  const authTx = await nft.setMintAuthority(burnAddress, { gasPrice: GAS_PRICE });
  await authTx.wait();
  console.log("  auth tx:", authTx.hash);

  // 4. 写部署记录
  const rec = {
    network: "bsc",
    chainId: 56,
    name: "猴子币销毁兑换 NFT",
    nft: nftAddress,
    nftName: "Monkey NFT",
    nftSymbol: "MKY-NFT",
    nftMaxSupply: MAX_SUPPLY,
    exchange: burnAddress,
    burnToken: MONKEY_TOKEN,
    burnAmount: COST_MKY.toString(),
    burnAmountLabel: ethers.formatUnits(COST_MKY, 18) + " MKY",
    burnTarget: "0x000000000000000000000000000000000000dEaD",
    metadataUri: "",
    deployedBy: deployer,
    nftDeployTx: nftTx.hash,
    exchangeDeployTx: burnTx.hash,
    authorityTx: authTx.hash,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.join(ROOT, "deployments"), { recursive: true });
  const out = path.join(ROOT, "deployments", "bsc-MonkeyNFT.json");
  fs.writeFileSync(out, JSON.stringify(rec, null, 2));
  console.log("\n[4/4] Saved to:", out);

  console.log("\n" + "=".repeat(56));
  console.log("MonkeyNFT Burn-to-Mint Deploy Complete");
  console.log("=".repeat(56));
}

main().catch((err) => {
  console.error("Failed:", err?.shortMessage || err?.message || err);
  process.exitCode = 1;
});