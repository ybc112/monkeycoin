// 编译新的 BananaTokenDeployer + TokenFactory（solc 0.8.24，设置对齐 hardhat override）
import fs from "node:fs";
import crypto from "node:crypto";
import solc from "solc";

const read = (p) => fs.readFileSync(p, "utf8");
const sources = {
  "contracts/tokenfactory/BananaToken.sol": { content: read("contracts/tokenfactory/BananaToken.sol") },
  "contracts/tokenfactory/BananaTokenDeployer.sol": { content: read("contracts/tokenfactory/BananaTokenDeployer.sol") },
  "contracts/tokenfactory/TokenFactory.sol": { content: read("contracts/tokenfactory/TokenFactory.sol") },
};

function compile(inputJson) {
  const output = JSON.parse(solc.compile(JSON.stringify(inputJson)));
  const errors = output.errors?.filter((e) => e.severity === "error") ?? [];
  if (errors.length) {
    console.error(errors.map((e) => e.formattedMessage).join("\n"));
    throw new Error("solc 编译失败");
  }
  return output;
}

const selection = { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } };

// Compile A：BananaTokenDeployer（内嵌 BananaToken，runs=1 / bytecodeHash none / revertStrings strip）
const outA = compile({
  language: "Solidity",
  sources: {
    "contracts/tokenfactory/BananaToken.sol": sources["contracts/tokenfactory/BananaToken.sol"],
    "contracts/tokenfactory/BananaTokenDeployer.sol": sources["contracts/tokenfactory/BananaTokenDeployer.sol"],
  },
  settings: {
    optimizer: { enabled: true, runs: 1, details: { yul: true } },
    viaIR: true,
    evmVersion: "cancun",
    debug: { revertStrings: "strip" },
    metadata: { bytecodeHash: "none" },
    outputSelection: selection,
  },
});
const deployerArtifact = outA.contracts["contracts/tokenfactory/BananaTokenDeployer.sol"].BananaTokenDeployer;
const bananaCompiled = outA.contracts["contracts/tokenfactory/BananaToken.sol"].BananaToken;

// Compile B：TokenFactory（runs=200，不改 metadata）
const outB = compile({
  language: "Solidity",
  sources: {
    "contracts/tokenfactory/TokenFactory.sol": sources["contracts/tokenfactory/TokenFactory.sol"],
    "contracts/tokenfactory/BananaToken.sol": sources["contracts/tokenfactory/BananaToken.sol"],
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "cancun",
    outputSelection: selection,
  },
});
const factoryArtifact = outB.contracts["contracts/tokenfactory/TokenFactory.sol"].TokenFactory;

// 校验：新编译的 BananaToken creationCode 必须与前端挖盐用的 artifact 完全一致
const existing = JSON.parse(fs.readFileSync("public/artifacts/BananaToken.json", "utf8"));
const bananaCode = "0x" + bananaCompiled.evm.bytecode.object;
const match = bananaCode === existing.bytecode;
console.log("BananaToken bytecode match:", match);
if (!match) {
  const a = crypto.createHash("sha256").update(bananaCode).digest("hex");
  const b = crypto.createHash("sha256").update(existing.bytecode).digest("hex");
  console.log("  compiled sha:", a);
  console.log("  artifact sha:", b);
  throw new Error("BananaToken 字节码不一致，挖盐会失败，禁止部署");
}

const deployerCode = "0x" + deployerArtifact.evm.bytecode.object;
const factoryCode = "0x" + factoryArtifact.evm.bytecode.object;
fs.mkdirSync("build/contracts", { recursive: true });
fs.writeFileSync(
  "build/contracts/BananaTokenDeployer.json",
  JSON.stringify({ abi: deployerArtifact.abi, bytecode: deployerCode, bytecodeHash: crypto.createHash("sha256").update(deployerCode).digest("hex") }, null, 2),
);
fs.writeFileSync(
  "build/contracts/TokenFactory.json",
  JSON.stringify({ abi: factoryArtifact.abi, bytecode: factoryCode, bytecodeHash: crypto.createHash("sha256").update(factoryCode).digest("hex") }, null, 2),
);
console.log("Deployer bytecode len:", deployerCode.length);
console.log("Factory bytecode len:", factoryCode.length);
console.log("Saved to build/contracts/");
