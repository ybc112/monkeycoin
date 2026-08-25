// 通过新 Factory 部署猴子币代币（BNB 交易对，CREATE2 挖 7777 靓号），部署后销毁 30,000 枚
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const FACTORY_ADDRESS = "0x519EA9f5eBaFA813903F165eA2601965aEd0F3e5"; // 猴子币发射台新 Factory
const TOKEN_DEPLOYER = "0x5C65Eae85e7E6A9060e2a729Db67ED34BB62182A";
const PLATFORM_RECEIVER = "0x436fB3245Ad8377DF443Ca1c67f997705D5843bb";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const BURN_AMOUNT = 30000n; // 部署时销毁 30,000 枚

const SUFFIX = (process.env.SUFFIX || "7777").toLowerCase();
const GAS_PRICE = ethers.parseUnits(process.env.GAS_PRICE_GWEI || "1", "gwei");
const TOKEN_GAS_LIMIT = 9_000_000; // estimateGas ≈ 8.53M，留余量
const BURN_GAS_LIMIT = 200_000;

const ARTIFACTS_ROOT = "E:/dapp/发射台2/flap-vault-ai-coder/artifacts/contracts/tokenfactory";
const ENV_FILE = "E:/dapp/发射台2/.env";
const OUT_DIR = path.resolve(__dirname, "../deployments");

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

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ARTIFACTS_ROOT, rel), "utf8"));
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

// LaunchParams（对齐 TokenFactory 结构）
function launchParams(receiver) {
  return {
    name: "猴子币",
    symbol: "MKY",
    totalSupply: ethers.parseUnits("1000000000", 18),
    receiver,
    fundAddress: "0x0000000000000000000000000000000000000000", // 0 → 默认 feeRecipient(平台地址)
    rewardToken: "0x0000000000000000000000000000000000000000", // 0 → USDT 默认
    currency: "0x0000000000000000000000000000000000000000",   // 0 → WBNB（BNB 交易对）
    totalBuyTax: 500,       // 5%
    totalSellTax: 500,      // 5%
    rewardShare: 4000,      // 分红 40%
    liquidityShare: 3000,   // 回流 30%
    burnShare: 2000,        // 燃烧 20%
    fundShare: 1000,        // fund 10%
    maxBuyAmount: 0,
    maxSellAmount: 0,
    maxWalletAmount: 0,
    secondTime: 0,
    killBlocks: 0,
    airdropNumbs: 0,
    transferFee: 0,
    mushHoldNum: 0,
    lpBurnFrequency: 3600,  // 单边燃烧间隔 1 小时
    percentForLPBurn: 50,   // 每次 0.5%
    enableOffTrade: false,
  };
}

async function main() {
  const env = loadEnv(ENV_FILE);
  const privateKey = env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in " + ENV_FILE);

  const provider = makeProvider();
  const signer = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
  const receiver = await signer.getAddress();

  const factoryArtifact = readJson("TokenFactory.sol/TokenFactory.json");
  const bananaArtifact = readJson("BananaToken.sol/BananaToken.json");
  const factory = new ethers.Contract(FACTORY_ADDRESS, factoryArtifact.abi, signer);

  console.log("Creating Monkey token via Factory:", FACTORY_ADDRESS);
  console.log("Receiver/Owner:", receiver);
  console.log("Platform receiver:", PLATFORM_RECEIVER);
  const balance = await provider.getBalance(receiver);
  console.log("Balance:", ethers.formatEther(balance), "BNB");

  const creationFee = await factory.creationFee();
  console.log("Creation fee:", ethers.formatEther(creationFee), "BNB");
  if (balance < creationFee + ethers.parseEther("0.004")) {
    console.warn("余额可能不足：需要创建费 + 部署 gas");
  }
  console.log("");

  const params = launchParams(receiver);

  // 1. 取 buildParams 四数组
  console.log("1/5 Fetching buildParams...");
  const [stringParams, addressParams, numberParams, boolParams] = await factory.buildParams(params, false);
  console.log("   addressParams:", addressParams.join(", "));

  // 2. CREATE2 initCodeHash
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(
    ["string[]", "address[]", "uint256[]", "bool[]", "uint256[]"],
    [stringParams, addressParams, numberParams, boolParams, []]
  );
  const initHash = ethers.keccak256(bananaArtifact.bytecode + encoded.slice(2));
  console.log("   initCodeHash:", initHash);

  // 3. 挖盐（后缀 7777）
  console.log("2/5 Mining salt for suffix:", SUFFIX);
  let salt = "0x";
  let predicted = "";
  let attempts = 0;
  const t0 = Date.now();
  while (true) {
    salt = ethers.hexlify(ethers.randomBytes(32));
    predicted = ethers.getCreate2Address(TOKEN_DEPLOYER, salt, initHash);
    attempts++;
    if (predicted.toLowerCase().endsWith(SUFFIX)) break;
    if (attempts % 20000 === 0) console.log(`   ...${attempts} tries (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  console.log(`   Found after ${attempts.toLocaleString()} tries in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("   Predicted token:", predicted);

  // 4. createToken
  console.log("3/5 Submitting createToken (creation fee " + ethers.formatEther(creationFee) + " BNB)...");
  const tx = await factory.createToken(params, salt, {
    value: creationFee,
    gasLimit: TOKEN_GAS_LIMIT,
    gasPrice: GAS_PRICE,
  });
  console.log("   tx:", tx.hash);
  const receipt = await tx.wait();
  let tokenAddress = "";
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.name === "TokenCreated") {
        tokenAddress = parsed.args.token;
        break;
      }
    } catch { /* ignore */ }
  }
  if (!tokenAddress) throw new Error("TokenCreated event not found");
  console.log("4/5 Token deployed:", tokenAddress);
  console.log("   tx:", receipt.hash);

  // 5. 销毁 30,000 枚
  console.log("5/5 Burning", BURN_AMOUNT.toString(), "tokens to", DEAD, "...");
  const token = new ethers.Contract(tokenAddress, bananaArtifact.abi, signer);
  const burnTx = await token.transfer(DEAD, BURN_AMOUNT * 10n ** 18n, {
    gasLimit: BURN_GAS_LIMIT,
    gasPrice: GAS_PRICE,
  });
  await burnTx.wait();
  console.log("   Burn tx:", burnTx.hash);
  const supplyAfter = await token.totalSupply();
  console.log("   totalSupply after burn:", ethers.formatUnits(supplyAfter, 18));

  console.log("");
  console.log("=".repeat(60));
  console.log("Monkey Token Deployment Complete");
  console.log("=".repeat(60));
  console.log("Token:", tokenAddress);
  console.log("Name: 猴子币 / Symbol: MKY");
  console.log("Factory:", FACTORY_ADDRESS);
  console.log("Platform receiver:", PLATFORM_RECEIVER);
  console.log("Burn: 30,000 MKY -> dead");
  console.log("Deploy tx:", receipt.hash);
  console.log("Burn tx:", burnTx.hash);
  console.log("=".repeat(60));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "bsc-MonkeyToken.json"),
    JSON.stringify({
      network: "bsc",
      chainId: 56,
      token: tokenAddress,
      name: "猴子币",
      symbol: "MKY",
      totalSupply: params.totalSupply.toString(),
      factory: FACTORY_ADDRESS,
      tokenDeployer: TOKEN_DEPLOYER,
      platformReceiver: PLATFORM_RECEIVER,
      creationFee: creationFee.toString(),
      burnAmount: BURN_AMOUNT.toString(),
      deployTx: receipt.hash,
      burnTx: burnTx.hash,
      deployedBy: receiver,
      deployedAt: new Date().toISOString(),
    }, null, 2)
  );
  console.log("\nSaved to:", path.join(OUT_DIR, "bsc-MonkeyToken.json"));
}

main().catch((err) => {
  console.error("Failed:", err && (err.shortMessage || err.message || err));
  process.exitCode = 1;
});
