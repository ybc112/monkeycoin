// 执行钱包管理 CLI（仅服务器本地运行，私钥不出日志）
// 用法：
//   node sniper/scripts/wallet-tool.mjs list
//   node sniper/scripts/wallet-tool.mjs stop <地址>
//   node sniper/scripts/wallet-tool.mjs enable <地址>
//   node sniper/scripts/wallet-tool.mjs remove <地址>
//   cat newkey.txt | node sniper/scripts/wallet-tool.mjs rotate <旧地址>
import { createInterface } from "node:readline";
import { WalletVault } from "../wallet-vault.mjs";

const [cmd, arg] = process.argv.slice(2);
const vault = new WalletVault();

if (cmd === "list") {
  const list = vault.list();
  if (!list.length) { console.log("（无执行钱包）"); process.exit(0); }
  for (const w of list) console.log(`${w.enabled ? "[启用]" : "[停用]"} ${w.address}  ${w.label || ""}`);
  process.exit(0);
}
if (cmd === "stop" || cmd === "enable" || cmd === "remove") {
  if (!arg) { console.error("缺少钱包地址"); process.exit(1); }
  const r = cmd === "stop" ? vault.setEnabled(arg, false)
    : cmd === "enable" ? vault.setEnabled(arg, true)
    : vault.remove(arg);
  console.log(r.ok !== false ? `✅ 已${cmd} ${arg}` : `❌ ${r.error}`);
  process.exit(r.ok === false ? 1 : 0);
}
if (cmd === "rotate") {
  if (!arg) { console.error("缺少旧钱包地址"); process.exit(1); }
  const rl = createInterface({ input: process.stdin });
  let newKey = "";
  rl.on("line", (l) => { newKey += l.trim(); });
  rl.on("close", () => {
    newKey = newKey.replace(/\s+/g, "");
    if (!newKey) { console.error("未读取到新私钥"); process.exit(1); }
    const r = vault.rotate(arg, newKey);
    newKey = "";
    console.log(r.ok ? `✅ 已轮换 ${arg} → ${r.address}` : `❌ ${r.error}`);
    process.exit(r.ok ? 0 : 1);
  });
} else {
  console.error("用法: list|stop|enable|remove|rotate");
  process.exit(1);
}
