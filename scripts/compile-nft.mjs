// 编译 MonkeyNFT + BurnToMint（solc 0.8.24）
import fs from "node:fs";
import solc from "solc";

const read = (p) => fs.readFileSync(p, "utf8");
const sources = {
  "contracts/nft/MonkeyNFT.sol": { content: read("contracts/nft/MonkeyNFT.sol") },
  "contracts/nft/BurnToMint.sol": { content: read("contracts/nft/BurnToMint.sol") },
};

const output = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
})));

const errors = output.errors?.filter((e) => e.severity === "error") ?? [];
if (errors.length) {
  console.error(errors.map((e) => e.formattedMessage).join("\n"));
  process.exitCode = 1;
  process.exit(1);
}
for (const w of output.errors?.filter((e) => e.severity === "warning") ?? []) {
  console.warn("[warn]", w.formattedMessage);
}

const nft = output.contracts["contracts/nft/MonkeyNFT.sol"].MonkeyNFT;
const burn = output.contracts["contracts/nft/BurnToMint.sol"].BurnToMint;

fs.mkdirSync("build/contracts", { recursive: true });
const nftCode = "0x" + nft.evm.bytecode.object;
const burnCode = "0x" + burn.evm.bytecode.object;
fs.writeFileSync("build/contracts/MonkeyNFT.json", JSON.stringify({ abi: nft.abi, bytecode: nftCode }, null, 2));
fs.writeFileSync("build/contracts/BurnToMint.json", JSON.stringify({ abi: burn.abi, bytecode: burnCode }, null, 2));

console.log("MonkeyNFT  bytecode len:", nftCode.length);
console.log("BurnToMint bytecode len:", burnCode.length);
console.log("Saved to build/contracts/");