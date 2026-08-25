// 部署猴子币发射台完整栈（BSC 主网）
// - BananaTokenDeployer
// - BABYTOKENDividendTracker (impl)
// - TokenFactory（feeRecipient = 0x436f...5843bb，平台税收款地址）
// - BananaTokenDeployer.setFactory(factory)
//
// 私钥与 RPC 从 E:/dapp/发射台2/.env 读取（不写入本仓库）；
// 编译产物从 flap-vault-ai-coder/artifacts 读取。
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const PLATFORM_RECEIVER = "0x436fB3245Ad8377DF443Ca1c67f997705D5843bb"; // 平台税收款地址
const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const CREATION_FEE_NATIVE = ethers.parseEther("0.005");
const REQUIRED_TOKEN_SUFFIX = 0x7777;

// 显式 gasLimit：公共 RPC 的 eth_estimateGas 可能返回错误值导致部署失败。
const GAS_LIMITS = {
  BananaTokenDeployer: 6_500_000,
  BABYTOKENDividendTracker: 2_200_000,
  TokenFactory: 2_800_000,
  setFactory: 1_000_000,
};
// 节点可能返回 0.05 gwei（低于链最低），显式用 1 gwei（可用 GAS_PRICE_GWEI 覆盖）
const GAS_PRICE = ethers.parseUnits(process.env.GAS_PRICE_GWEI || "1", "gwei");

const ARTIFACTS_ROOT = "E:/dapp/发射台2/flap-vault-ai-coder/artifacts/contracts/tokenfactory";
const ENV_FILE = "E:/dapp/发射台2/.env";
const OUT_DIR = path.resolve(__dirname, "../deployments");

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

async function main() {
  const env = loadEnv(ENV_FILE);
  const privateKey = env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in " + ENV_FILE);

  const RPC_LIST = [
    env.RPC_URL,
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-dataseed1.bnbchain.org",
    "https://bsc.drpc.org",
    "https://1rpc.io/bnb",
    "https://bsc-rpc.publicnode.com",
  ].filter(Boolean);

  async function pickProvider() {
    let lastErr = "";
    for (const url of RPC_LIST) {
      try {
        const p = new ethers.JsonRpcProvider(url, 56, { staticNetwork: true, batchMaxCount: 1, pollingInterval: 4000 });
        const n = await p.getNetwork();
        if (Number(n.chainId) === 56) return { provider: p, url };
      } catch (e) {
        lastErr = e.message;
      }
    }
    throw new Error("no working RPC: " + lastErr);
  }

  const { provider, url } = await pickProvider();
  const signer = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);

  console.log("Deploying Monkey Launchpad stack");
  console.log("Deployer:", signer.address);
  console.log("RPC:", url);
  const balance = await provider.getBalance(signer.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB");
  if (balance < ethers.parseEther("0.02")) {
    console.warn("余额低于 0.02 BNB，部署可能失败");
  }
  console.log("Platform fee receiver:", PLATFORM_RECEIVER);
  console.log("Creation fee:", ethers.formatEther(CREATION_FEE_NATIVE), "BNB");
  console.log("Required suffix: 0x" + REQUIRED_TOKEN_SUFFIX.toString(16));
  console.log("");

  // 1. TokenDeployer
  console.log("1/4 Deploying BananaTokenDeployer...");
  const deployerArtifact = readJson("BananaTokenDeployer.sol/BananaTokenDeployer.json");
  const tokenDeployer = await new ethers.ContractFactory(deployerArtifact.abi, deployerArtifact.bytecode, signer)
    .deploy({ gasLimit: GAS_LIMITS.BananaTokenDeployer, gasPrice: GAS_PRICE });
  await tokenDeployer.waitForDeployment();
  const tokenDeployerAddr = await tokenDeployer.getAddress();
  console.log("   TokenDeployer:", tokenDeployerAddr);

  // 2. DividendTracker implementation
  console.log("2/4 Deploying BABYTOKENDividendTracker implementation...");
  const trackerArtifact = readJson("BananaToken.sol/BABYTOKENDividendTracker.json");
  const trackerImpl = await new ethers.ContractFactory(trackerArtifact.abi, trackerArtifact.bytecode, signer)
    .deploy({ gasLimit: GAS_LIMITS.BABYTOKENDividendTracker, gasPrice: GAS_PRICE });
  await trackerImpl.waitForDeployment();
  const trackerImplAddr = await trackerImpl.getAddress();
  console.log("   DividendTrackerImpl:", trackerImplAddr);

  // 3. TokenFactory
  console.log("3/4 Deploying TokenFactory...");
  const factoryArtifact = readJson("TokenFactory.sol/TokenFactory.json");
  const factory = await new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, signer)
    .deploy(
      PLATFORM_RECEIVER,
      CREATION_FEE_NATIVE,
      PANCAKE_ROUTER,
      trackerImplAddr,
      tokenDeployerAddr,
      REQUIRED_TOKEN_SUFFIX,
      { gasLimit: GAS_LIMITS.TokenFactory, gasPrice: GAS_PRICE }
    );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("   Factory:", factoryAddr);

  // 4. Set factory on deployer
  console.log("4/4 Setting factory on BananaTokenDeployer...");
  const tx = await tokenDeployer.setFactory(factoryAddr, { gasLimit: GAS_LIMITS.setFactory, gasPrice: GAS_PRICE });
  await tx.wait();
  console.log("   TokenDeployer.setFactory done");

  console.log("");
  console.log("=".repeat(60));
  console.log("Monkey Launchpad Stack Deployment Complete");
  console.log("=".repeat(60));
  console.log("TokenDeployer:", tokenDeployerAddr);
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
    tokenDeployer: tokenDeployerAddr,
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
