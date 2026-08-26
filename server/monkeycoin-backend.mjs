// MonkeyCoin Launchpad Backend · 靓号挖盐 + 自动开源（BSC）
// Port 8797 · CORS allowed: https://monkeycoin.top
import "dotenv/config";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import proxyPkg from "https-proxy-agent";
import {
  AbiCoder,
  Contract,
  Interface,
  JsonRpcProvider,
  getAddress,
  getCreate2Address,
  hexlify,
  isAddress,
  keccak256,
  randomBytes,
} from "ethers";
const { HttpsProxyAgent } = proxyPkg;

const PORT = Number(process.env.SNOWBALL_PORT || 8797);
const FACTORY_ADDRESS = (process.env.SNOWBALL_FACTORY_ADDRESS || "0xD1Ce8ca63713fEc105D2a10Ff5f6DC2032a0731E").toLowerCase();
const TOKEN_DEPLOYER_ADDRESS = String(process.env.SNOWBALL_TOKEN_DEPLOYER_ADDRESS || "").trim();
const CHAIN_ID = Number(process.env.SNOWBALL_CHAIN_ID || 56);
const rpcUrl = process.env.BSC_RPC_URL || "https://bsc-dataseed1.bnbchain.org";
const API_KEY = process.env.BSCSCAN_API_KEY || "";
const VERIFY_INPUT = process.env.SNOWBALL_VERIFY_INPUT || "work/snowball-verify/BananaToken-input.json";
const ALLOWED_ORIGINS = (process.env.SNOWBALL_CORS_ORIGIN || "https://monkeycoin.top").split(",").map((s) => s.trim());

const rootDir = process.cwd();
const readJson = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, p), "utf8"));
  } catch {
    return fallback;
  }
};

const factoryArtifact = readJson("artifacts/contracts/tokenfactory/TokenFactory.sol/TokenFactory.json", null);
const bananaArtifact = readJson("artifacts/contracts/tokenfactory/BananaToken.sol/BananaToken.json", null);
if (!bananaArtifact || !bananaArtifact.bytecode) {
  throw new Error("Missing BananaToken artifact — need artifacts/contracts/tokenfactory/BananaToken.sol/BananaToken.json");
}
const bananaBytecode = bananaArtifact.bytecode;

const provider = new JsonRpcProvider(rpcUrl, CHAIN_ID, { batchMaxCount: 1 });
const factory = new Contract(FACTORY_ADDRESS, factoryArtifact.abi, provider);

// ── verify jobs（内存队列，pm2 重启即清空） ────────────────────────────────
const verifyJobs = new Map();
let jobSeq = 0;

// ── 自动开源监控（watch TokenCreated 事件 → 自动提交验证） ────────────────
const WATCH_ENABLED = process.env.SNOWBALL_AUTO_VERIFY !== "false";
const WATCH_INTERVAL_MS = Number(process.env.SNOWBALL_WATCH_INTERVAL_MS || 60000);
let watchState = { nextBlock: 0 };
const factoryIface = new Interface(factoryArtifact.abi);
const TOKEN_CREATED_TOPIC = factoryIface.getEvent("TokenCreated").topicHash;

function loadWatchState() {
  try {
    const f = path.join(rootDir, "deployments", "monkeycoin-auto-verify.json");
    if (fs.existsSync(f)) watchState = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch { /* ignore */ }
}
function saveWatchState() {
  try {
    const dir = path.join(rootDir, "deployments");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "monkeycoin-auto-verify.json"), JSON.stringify(watchState));
  } catch { /* ignore */ }
}

async function runAutoVerifyTick() {
  try {
    const latest = await provider.getBlockNumber();
    let fromBlock = watchState.nextBlock || latest - 100;
    if (fromBlock >= latest) return;
    const toBlock = Math.min(fromBlock + 499, latest);
    const logs = await provider.getLogs({
      address: FACTORY_ADDRESS,
      topics: [TOKEN_CREATED_TOPIC],
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      const parsed = factoryIface.parseLog(log);
      const tokenAddress = (parsed?.args?.token || "").toLowerCase();
      if (!isAddress(tokenAddress)) continue;
      const existing = [...verifyJobs.values()].some((j) => j.tokenAddress === tokenAddress);
      if (existing) continue;
      const jobId = `auto-${Date.now()}-${++jobSeq}`;
      verifyJobs.set(jobId, { tokenAddress, status: "pending", source: "auto-watch", createdAt: new Date().toISOString() });
      runVerificationJob(jobId, tokenAddress, log.transactionHash).catch((e) => {
        const job = verifyJobs.get(jobId);
        if (job) {
          job.status = "failed";
          job.error = e.message;
          job.updatedAt = new Date().toISOString();
        }
      });
    }
    watchState.nextBlock = toBlock + 1;
    saveWatchState();
  } catch (e) {
    console.error("[auto-verify] tick error:", e.message);
  }
}

if (WATCH_ENABLED) {
  loadWatchState();
  setInterval(runAutoVerifyTick, WATCH_INTERVAL_MS);
  setTimeout(runAutoVerifyTick, 5000);
  console.log("auto-verify watch enabled (interval", WATCH_INTERVAL_MS + "ms)");
}

// CREATE2 init-code hash is constant for one request. Computing it inside the
// salt loop hashes the full token bytecode on every attempt and is very slow.
function computeInitCodeHash(params) {
  const abiCoder = AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(
    ["string[]", "address[]", "uint256[]", "bool[]", "uint256[]"],
    [params.stringParams, params.addressParams, params.numberParams, params.boolParams, []]
  );
  const bytecode = bananaBytecode + encoded.slice(2);
  return keccak256(bytecode);
}

async function getConstructorArguments(transactionHash) {
  const tx = await provider.getTransaction(transactionHash);
  if (!tx) throw new Error(`creation transaction not found: ${transactionHash}`);
  const parsed = factoryIface.parseTransaction({ data: tx.data, value: tx.value });
  if (!parsed || (parsed.name !== "createToken" && parsed.name !== "createTokenAndAddLiquidity")) {
    throw new Error("unsupported factory creation transaction");
  }
  const launchParams = Array.from(parsed.args[0]);
  const built = await factory.buildParams(launchParams, parsed.name === "createTokenAndAddLiquidity");
  return AbiCoder.defaultAbiCoder().encode(
    ["string[]", "address[]", "uint256[]", "bool[]", "uint256[]"],
    [Array.from(built[0]), Array.from(built[1]), Array.from(built[2]), Array.from(built[3]), []]
  ).slice(2);
}

function etherscanGet(params) {
  return new Promise((resolve) => {
    const query = new URLSearchParams({ chainid: String(CHAIN_ID), apikey: API_KEY, ...params });
    const agent = process.env.HTTPS_PROXY || process.env.https_proxy
      ? new HttpsProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy)
      : undefined;
    const req = https.request(
      { host: "api.etherscan.io", path: `/v2/api?${query}`, method: "GET", agent },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ status: "0", result: `HTTP ${res.statusCode} ${data.slice(0, 120)}` }); }
        });
      }
    );
    req.on("error", (error) => resolve({ status: "0", result: error.message }));
    req.end();
  });
}

function submitVerifyToEtherscan(tokenAddress, constructorArguments) {
  return new Promise((resolve) => {
    const sourceCode = fs.readFileSync(path.join(rootDir, VERIFY_INPUT), "utf8");
    const body = new URLSearchParams({
      module: "contract",
      action: "verifysourcecode",
      apikey: API_KEY,
      contractaddress: tokenAddress,
      sourceCode,
      codeformat: "solidity-standard-json-input",
      contractname: "contracts/tokenfactory/BananaToken.sol:BananaToken",
      compilerversion: "v0.8.24+commit.e11b9ed9",
      optimizationUsed: "1",
      runs: "1",
      constructorArguements: constructorArguments,
      licenseType: "3",
    });
    const agent = process.env.HTTPS_PROXY || process.env.https_proxy
      ? new HttpsProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy)
      : undefined;
    const req = https.request(
      {
        host: "api.etherscan.io",
        path: "/v2/api?chainid=56",
        method: "POST",
        agent,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body.toString()),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            resolve(j);
          } catch {
            resolve({ status: "0", result: `HTTP ${res.statusCode} ${data.slice(0, 120)}` });
          }
        });
      }
    );
    req.on("error", (e) => resolve({ status: "0", result: e.message }));
    req.write(body.toString());
    req.end();
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runVerificationJob(jobId, tokenAddress, transactionHash) {
  const job = verifyJobs.get(jobId);
  job.status = "preparing";
  job.transactionHash = transactionHash;
  const constructorArguments = await getConstructorArguments(transactionHash);
  job.status = "submitting";
  const result = await submitVerifyToEtherscan(getAddress(tokenAddress), constructorArguments);
  if (result.status !== "1") throw new Error(result.result || "verification submission failed");

  job.guid = result.result;
  job.status = "submitted";
  job.updatedAt = new Date().toISOString();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(attempt === 0 ? 3000 : 5000);
    const status = await etherscanGet({ module: "contract", action: "checkverifystatus", guid: job.guid });
    const message = String(status.result || "");
    if (status.status === "1" || /already verified/i.test(message)) {
      job.status = "verified";
      job.error = undefined;
      job.updatedAt = new Date().toISOString();
      console.log(`[auto-verify] token ${tokenAddress} -> verified`);
      return;
    }
    if (!/pending|queue|in progress/i.test(message)) {
      throw new Error(message || "verification failed");
    }
  }
  throw new Error("verification status timeout");
}

async function findVanitySalt(body) {
  const requestedSuffix = String(body.suffix || "eeee").toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,6}$/.test(requestedSuffix)) {
    throw new Error("suffix must be 1-6 hex characters.");
  }
  const params = body.params || {};
  if (!Array.isArray(params.stringParams) || !Array.isArray(params.addressParams) || !Array.isArray(params.numberParams) || !Array.isArray(params.boolParams)) {
    throw new Error("params must include stringParams/addressParams/numberParams/boolParams arrays.");
  }
  const maxIterations = Math.min(Number(body.maxIterations) || 300000, 500000);

  const deployerAddr = isAddress(TOKEN_DEPLOYER_ADDRESS)
    ? getAddress(TOKEN_DEPLOYER_ADDRESS)
    : getAddress(await factory.tokenDeployer());
  const initHash = computeInitCodeHash(params);
  const startedAt = Date.now();
  for (let attempts = 1; attempts <= maxIterations; attempts += 1) {
    const salt = hexlify(randomBytes(32));
    const address = getCreate2Address(deployerAddr, salt, initHash);
    if (address.toLowerCase().endsWith(requestedSuffix)) {
      return {
        ok: true,
        suffix: requestedSuffix,
        salt,
        address,
        factory: getAddress(FACTORY_ADDRESS),
        chainId: CHAIN_ID,
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    }
  }
  return {
    ok: false,
    suffix: requestedSuffix,
    factory: getAddress(FACTORY_ADDRESS),
    chainId: CHAIN_ID,
    attempts: maxIterations,
    elapsedMs: Date.now() - startedAt,
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────
function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes("*") ? "*" : (() => {
      const origin = response.req.headers.origin || "";
      return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || "*";
    })(),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (c) => (data += c));
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

const rateBuckets = new Map();
function limitRequest(request, scope, maxPerMinute) {
  const key = (request.headers["x-forwarded-for"] || request.socket.remoteAddress || "?") + ":" + scope;
  const now = Math.floor(Date.now() / 60000);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.minute !== now) {
    rateBuckets.set(key, { minute: now, count: 1 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > maxPerMinute) {
    const err = new Error("rate limit exceeded");
    err.status = 429;
    throw err;
  }
}

// ── Server ────────────────────────────────────────────────────────────────
const server = createServer(async (request, response) => {
  response.req = request;
  try {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "OPTIONS") {
      sendJson(response, 200, {});
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "monkeycoin-backend", factory: getAddress(FACTORY_ADDRESS), chainId: CHAIN_ID });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/vanity-salt") {
      limitRequest(request, "vanity", 30);
      const body = await readBody(request);
      sendJson(response, 200, await findVanitySalt(body));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/verify-project") {
      limitRequest(request, "verify", 60);
      const body = await readBody(request);
      const tokenAddress = String(body.tokenAddress || "").toLowerCase();
      const transactionHash = String(body.transactionHash || "");
      if (!isAddress(tokenAddress)) {
        sendJson(response, 400, { ok: false, error: "invalid tokenAddress" });
        return;
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
        sendJson(response, 400, { ok: false, error: "valid transactionHash is required" });
        return;
      }
      const jobId = `v${Date.now()}-${++jobSeq}`;
      verifyJobs.set(jobId, { tokenAddress, status: "pending", createdAt: new Date().toISOString() });
      sendJson(response, 200, { ok: true, jobId });
      runVerificationJob(jobId, tokenAddress, transactionHash).catch((e) => {
        const job = verifyJobs.get(jobId);
        if (job) {
          job.status = "failed";
          job.error = e.message;
          job.updatedAt = new Date().toISOString();
        }
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/verify-status") {
      const list = [...verifyJobs.entries()]
        .map(([id, job]) => ({ id, ...job }))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
        .slice(0, 20);
      sendJson(response, 200, { ok: true, jobs: list });
      return;
    }
    sendJson(response, 404, { ok: false, error: "not found" });
  } catch (e) {
    const status = e.status || 500;
    sendJson(response, status, { ok: false, error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`monkeycoin-backend listening on :${PORT}`);
  console.log(`factory=${FACTORY_ADDRESS} chainId=${CHAIN_ID} rpc=${rpcUrl}`);
});
