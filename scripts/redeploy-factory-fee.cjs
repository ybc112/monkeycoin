// 重部署发射台栈：新 BananaTokenDeployer + 新 TokenFactory
// 创建费 = 30,000 × 0x0c1f...7777（部署时转黑洞销毁），BNB 创建费 = 0
// 平台税 feeRecipient = 0x436fB3245Ad8377DF443Ca1c67f997705D5843bb
// 复用已部署的 DividendTrackerImpl 0xb05Ca1221F6F7A037115EE29a1f6B4a42b3F1b79
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const FEE_RECIPIENT = "0x436fB3245Ad8377DF443Ca1c67f997705D5843bb";
const FEE_TOKEN = "0x0c1fa1ff27cd3dd0663a8160498dea3603c17777"; // 猴子币
const FEE_TOKEN_AMOUNT = 10_000n * 10n ** 18n; // 10,000 枚，销毁
const CREATION_FEE_BNB = 0n; // 不再收 BNB
const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const TRACKER_IMPL = "0xb05Ca1221F6F7A037115EE29a1f6B4a42b3F1b79"; // 复用已部署
const REQUIRED_TOKEN_SUFFIX = 0x7777;

const GAS_LIMITS = { Deployer: 6_500_000, Factory: 3_000_000, setFactory: 1_000_000 };
const GAS_PRICE = ethers.parseUnits(process.env.GAS_PRICE_GWEI || "1", "gwei");
const ENV_FILE = "E:/dapp/发射台2/.env";
const OUT_DIR = path.resolve(__dirname, "../deployments");
const BUILD_DIR = path.resolve(__dirname, "../build/contracts");

const RPC_LIST = [
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc.drpc.org",
  "https://1rpc.io/bnb",
];

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

function makeProvider() {
  const providers = RPC_LIST.map((url, i) => ({
    provider: new ethers.JsonRpcProvider(url, 56, { staticNetwork: true, batchMaxCount: 1, pollingInterval: 4000 }),
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

  const deployerArtifact = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, "BananaTokenDeployer.json"), "utf8"));
  const factoryArtifact = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, "TokenFactory.json"), "utf8"));

  const provider = makeProvider();
  const signer = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);

  const balance = await provider.getBalance(signer.address);
  console.log("Deployer:", signer.address, "| Balance:", ethers.formatEther(balance), "BNB");
  console.log("Estimated gas: ~10.5M @", ethers.formatUnits(GAS_PRICE, "gwei"), "gwei =", ethers.formatEther(10_500_000n * GAS_PRICE));
  if (balance < ethers.parseEther("0.003")) {
    throw new Error("余额不足：至少需要约 0.003 BNB 才能部署");
  }

  console.log("\n1/3 Deploying BananaTokenDeployer...");
  const deployer = await new ethers.ContractFactory(deployerArtifact.abi, deployerArtifact.bytecode, signer)
    .deploy({ gasLimit: GAS_LIMITS.Deployer, gasPrice: GAS_PRICE });
  await deployer.waitForDeployment();
  const deployerAddr = await deployer.getAddress();
  console.log("   TokenDeployer:", deployerAddr);

  console.log("2/3 Deploying TokenFactory (creation fee = 30,000 $MKY burned)...");
  const factory = await new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, signer)
    .deploy(
      FEE_RECIPIENT,
      CREATION_FEE_BNB,
      PANCAKE_ROUTER,
      TRACKER_IMPL,
      deployerAddr,
      REQUIRED_TOKEN_SUFFIX,
      FEE_TOKEN,
      FEE_TOKEN_AMOUNT,
      { gasLimit: GAS_LIMITS.Factory, gasPrice: GAS_PRICE }
    );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("   Factory:", factoryAddr);

  console.log("3/3 Setting factory on deployer...");
  const tx = await deployer.setFactory(factoryAddr, { gasLimit: GAS_LIMITS.setFactory, gasPrice: GAS_PRICE });
  await tx.wait();
  console.log("   setFactory done");

  console.log("");
  console.log("=".repeat(60));
  console.log("Redeploy Complete");
  console.log("=".repeat(60));
  console.log("TokenDeployer:", deployerAddr);
  console.log("Factory:      ", factoryAddr);
  console.log("FeeRecipient: ", FEE_RECIPIENT);
  console.log("CreationFee:  BNB=0, token=30,000 $MKY (0x0c1f...7777) burned");
  console.log("TrackerImpl:  ", TRACKER_IMPL);
  console.log("Suffix:       0x" + REQUIRED_TOKEN_SUFFIX.toString(16));
  console.log("=".repeat(60));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "bsc-MonkeyTokenFactory.json"),
    JSON.stringify({
      network: "bsc",
      chainId: 56,
      factory: factoryAddr,
      tokenDeployer: deployerAddr,
      dividendTrackerImpl: TRACKER_IMPL,
      platformReceiver: FEE_RECIPIENT,
      feeRecipient: FEE_RECIPIENT,
      creationFee: "0",
      creationFeeToken: FEE_TOKEN,
      creationFeeTokenAmount: FEE_TOKEN_AMOUNT.toString(),
      liquidityRouter: PANCAKE_ROUTER,
      requiredTokenSuffix: REQUIRED_TOKEN_SUFFIX,
      deployedBy: signer.address,
      deployedAt: new Date().toISOString(),
    }, null, 2)
  );
  console.log("\nSaved to:", path.join(OUT_DIR, "bsc-MonkeyTokenFactory.json"));
  console.log("VITE_SNOWBALL_FACTORY_ADDRESS=" + factoryAddr);
}

main().catch((err) => {
  console.error("Deployment failed:", err && (err.shortMessage || err.message || err));
  process.exitCode = 1;
});
