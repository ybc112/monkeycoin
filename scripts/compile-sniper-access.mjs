import fs from "node:fs";
import solc from "solc";

const read = (p) => fs.readFileSync(p, "utf8");
const output = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: {
    "contracts/sniper/SniperAccess.sol": { content: read("contracts/sniper/SniperAccess.sol") },
  },
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
  process.exit(1);
}
for (const w of output.errors?.filter((e) => e.severity === "warning") ?? []) {
  console.warn("[warn]", w.formattedMessage);
}

const c = output.contracts["contracts/sniper/SniperAccess.sol"].SniperAccess;
fs.mkdirSync("build/contracts", { recursive: true });
const code = "0x" + c.evm.bytecode.object;
fs.writeFileSync("build/contracts/SniperAccess.json", JSON.stringify({ abi: c.abi, bytecode: code }, null, 2));
console.log("SniperAccess bytecode len:", code.length);
console.log("ctor:", c.abi.find(x => x.type === "constructor")?.inputs.map(i => i.type).join(","));
console.log("Saved build/contracts/SniperAccess.json");