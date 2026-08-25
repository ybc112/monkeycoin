// 续跑部署：复用已部署的 BananaTokenDeployer，部署 DividendTracker + TokenFactory + setFactory
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const TOKEN_DEPLOYER = process.env.TOKEN_DEPLOYER || "0x5C65Eae85e7E6A9060e2a729Db67ED34BB62182A"; // nonce 1999
const PLATFORM_RECEIVER = "0x436fB3245Ad8377DF443Ca1c67f997705D5843bb";
const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const CREATION_FEE_NATIVE = ethers.parseEther("0.005");
const REQUIRED_TOKEN_SUFFIX = 0x7777;

const GAS_LIMITS = {
  BABYTOKENDividendTracker: 2_200_000,
  TokenFactory: 2_800_000,
  setFactory: 1_000_000,
};
const GAS_PRICE = ethers.parseUnits(process.env.GAS_PRICE_GWEI || "1", "gwei");

const ARTIFACTS_ROOT = "E:/dapp/发射台2/flap-vault-ai-coder/artifacts/contracts/tokenfactory";
const ENV_FILE = "E:/dapp/发射台2/.env";
const OUT_DIR = path.resolve(__dirname, "../deployments");

const RPC_LIST = [
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc.drpc.org",
  "https://1rpc.io/bnb",
].filter(Boolean);

function loadEnv(file) {
  const o = {};
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
  return o;
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ARTIFACTS_ROOT, rel), "utf8"));
}

function makeProvider() {
  const providers = RPC_LIST.map((url, i) => ({
    provider: new ethers.JsonRpcProvider(url, 56, {
      staticNetwork: true,
      batchMaxCount: 1,
      pollingInterval: 4000,
    }),
    priority: i + 1,
    stallTimeout: 15000,
    weight: 1,
  }));
  return new ethers.FallbackProvider(providers, 56, { quorum: 1 });
}

async function main() {
  const env = loadEnv(ENV_FILE);
  const privateKey = env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in " + ENV_FILE);
  if (!ethers.isAddress(TOKEN_DEPLOYER)) throw new Error("invalid TOKEN_DEPLOYER");

  const provider = makeProvider();
  const signer = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);

  console.log("Continue deploying Monkey Launchpad stack");
  console.log("Deployer:", signer.address);
  console.log("TokenDeployer (reuse):", TOKEN_DEPLOYER);
  const balance = await provider.getBalance(signer.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB");
  if (balance < ethers.parseEther("0.012")) {
    console.warn("余额低于 0.012 BNB，剩余步骤可能失败");
  }
  console.log("");

  // 1. DividendTracker implementation
  console.log("1/3 Deploying BABYTOKENDividendTracker implementation...");
  const trackerArtifact = readJson("BananaToken.sol/BABYTOKENDividendTracker.json");
  const trackerImpl = await new ethers.ContractFactory(trackerArtifact.abi, trackerArtifact.bytecode, signer)
    .deploy({ gasLimit: GAS_LIMITS.BABYTOKENDividendTracker, gasPrice: GAS_PRICE });
  await trackerImpl.waitForDeployment();
  const trackerImplAddr = await trackerImpl.getAddress();
  console.log("   DividendTrackerImpl:", trackerImplAddr);

  // 2. TokenFactory
  console.log("2/3 Deploying TokenFactory...");
  const factoryArtifact = readJson("TokenFactory.sol/TokenFactory.json");
  const factory = await new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, signer)
    .deploy(
      PLATFORM_RECEIVER,
      CREATION_FEE_NATIVE,
      PANCAKE_ROUTER,
      trackerImplAddr,
      TOKEN_DEPLOYER,
      REQUIRED_TOKEN_SUFFIX,
      { gasLimit: GAS_LIMITS.TokenFactory, gasPrice: GAS_PRICE }
    );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("   Factory:", factoryAddr);

  // 3. Set factory on deployer
  console.log("3/3 Setting factory on BananaTokenDeployer...");
  const deployerArtifact = readJson("BananaTokenDeployer.sol/BananaTokenDeployer.json");
  const tokenDeployer = new ethers.Contract(TOKEN_DEPLOYER, deployerArtifact.abi, signer);
  const tx = await tokenDeployer.setFactory(factoryAddr, { gasLimit: GAS_LIMITS.setFactory, gasPrice: GAS_PRICE });
  await tx.wait();
  console.log("   TokenDeployer.setFactory done");

  console.log("");
  console.log("=".repeat(60));
  console.log("Monkey Launchpad Stack Deployment Complete");
  console.log("=".repeat(60));
  console.log("TokenDeployer:", TOKEN_DEPLOYER);
  console.log("DividendTrackerImpl:", trackerImplAddr);
  console.log("Factory:      ", factoryAddr);
  console.log("PlatformReceiver:", PLATFORM_RECEIVER);
  console.log("CreationFee:  ", ethers.formatEther(CREATION_FEE_NATIVE), "BNB");
  console.log("Router:       ", PANCAKE_ROUTER);
  console.log("Suffix:       0x" + REQUIRED_TOKEN_SUFFIX.toString(16));
  console.log("=".repeat(60));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const deployData = {
    network: "bsc",
    chainId: 56,
    factory: factoryAddr,
    tokenDeployer: TOKEN_DEPLOYER,
    dividendTrackerImpl: trackerImplAddr,
    platformReceiver: PLATFORM_RECEIVER,
    feeRecipient: PLATFORM_RECEIVER,
    creationFee: CREATION_FEE_NATIVE.toString(),
    creationFeeToken: ethers.ZeroAddress,
    liquidityRouter: PANCAKE_ROUTER,
    requiredTokenSuffix: REQUIRED_TOKEN_SUFFIX,
    deployedBy: signer.address,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT_DIR, "bsc-MonkeyTokenFactory.json"), JSON.stringify(deployData, null, 2));
  console.log("\nSaved to:", path.join(OUT_DIR, "bsc-MonkeyTokenFactory.json"));
  console.log("VITE_SNOWBALL_FACTORY_ADDRESS=" + factoryAddr);
}

main().catch((err) => {
  console.error("Deployment failed:", err && (err.shortMessage || err.message || err));
  process.exitCode = 1;
});
