$path = "e:\dapp\monkeycoin\sniper.html"
$c = Get-Content -Raw $path

$old1 = @'
    } catch (e) { toast("私钥无效", "❌"); }
  });
'@

$new1 = @'
      refreshActivation();
    } catch (e) { toast("私钥无效", "❌"); }
  });

  // ── 狙击激活（销毁 50,000 $MKY 解锁；执行钱包为身份，记录钱包+交易哈希+激活时间） ──
  const SNIPER_ACCESS_CT = "0x1a8831721accc61AbEf99A9D2915b0572f92C73D";
  const MKY_TOKEN_ADDR = "0x0c1fa1ff27cd3dd0663a8160498dea3603c17777";
  const SNIPER_ACCESS_COST = 50000n * 10n ** 18n;
  let activationRefreshing = false;
  async function refreshActivation() {
    if (activationRefreshing) return;
    activationRefreshing = true;
    try {
      const t1 = $("activateTitle"), s1 = $("activateStatus"), b1 = $("activateBtn"), n1 = $("activateNote");
      if (!localWallet) {
        t1.textContent = "狙击资格：未激活";
        s1.textContent = "请先设置执行钱包";
        b1.style.display = "none";
        return;
      }
      s1.textContent = "校验中…";
      const r = await api("/api/sniper/me?address=" + encodeURIComponent(localWallet.address)).catch(() => null);
      const onChain = r && r.ok ? !!r.activated : false;
      const user = r && r.ok ? r.user : null;
      if (onChain) {
        t1.textContent = "✅ 狙击资格：已激活";
        s1.textContent = (user && user.txHash)
          ? localWallet.address.slice(0,6) + "…" + localWallet.address.slice(-4) + " · " + new Date(user.activatedAt).toLocaleString() + " · " + user.txHash.slice(0,10) + "…"
          : localWallet.address.slice(0,6) + "…" + localWallet.address.slice(-4) + " · 已销毁激活";
        b1.style.display = "none";
        n1.textContent = "已激活：可正常使用狙击（买卖/广播/策略自动执行）。";
      } else {
        t1.textContent = "狙击资格：未激活";
        s1.textContent = "该执行钱包尚未销毁 50,000 $MKY";
        b1.style.display = "inline-flex";
        n1.textContent = "点击激活：将销毁该钱包 50,000 $MKY（转入黑洞）并登记为狙击用户。需先给合约授权 $MKY。";
      }
    } catch { } finally { activationRefreshing = false; }
  }
  async function activateNow() {
    if (!localWallet) { toast("请先设置执行钱包", "⚠️"); return; }
    const b1 = $("activateBtn");
    b1.disabled = true; b1.textContent = "处理中…";
    try {
      const { Contract, MaxUint256 } = await loadEthers();
      const provider = new ethersMod.JsonRpcProvider(BSC_RPC, 56);
      const signer = localWallet.connect(provider);
      const mky = new Contract(MKY_TOKEN_ADDR, ["function allowance(address,address) view returns(uint256)", "function approve(address,uint256) returns(bool)"], provider);
      const myAddr = await signer.getAddress().catch(() => localWallet.address);
      const allowance = await mky.allowance(myAddr, SNIPER_ACCESS_CT);
      if (allowance < SNIPER_ACCESS_COST) {
        b1.textContent = "授权 $MKY 中…";
        const wk = new Contract(MKY_TOKEN_ADDR, ["function approve(address,uint256) returns(bool)"], signer);
        const apr = await wk.approve(SNIPER_ACCESS_CT, MaxUint256);
        toast("授权已提交 " + apr.hash.slice(0,10) + "…", "🔓");
        await apr.wait();
      }
      b1.textContent = "销毁 50,000 $MKY 中…";
      const ac = new Contract(SNIPER_ACCESS_CT, ["function register() returns(bool)"], signer);
      const tx = await ac.register();
      toast("销毁激活已提交 " + tx.hash.slice(0,10) + "…", "🔥");
      await tx.wait();
      const r = await api("/api/sniper/activate", { method: "POST", body: JSON.stringify({ address: localWallet.address, txHash: tx.hash }) }).catch(() => null);
      toast(r && r.ok ? "激活成功！可开始狙击" : "链上已激活，记录上报待确认", "✅");
    } catch (e) {
      toast("激活失败：" + String(e.message || e).slice(0,120), "❌");
    } finally {
      b1.disabled = false; b1.textContent = "🔥 销毁 50,000 $MKY 激活";
      refreshActivation();
    }
  }
  $("activateBtn").addEventListener("click", activateNow);
  refreshActivation();

'@

$old2 = @'
        applyWallet(localWallet.address);
      }
    } catch { /* 服务器未保存/不可用时静默忽略 */ }
'@

$new2 = @'
        applyWallet(localWallet.address);
        refreshActivation();
      }
    } catch { /* 服务器未保存/不可用时静默忽略 */ }
'@

if ($c.Contains("refreshActivation") -and -not $c.Contains("SNIPER_ACCESS_CT")) {
  Write-Output "partial state, skip JS block; only ensure load hook"
} elseif (-not $c.Contains("SNIPER_ACCESS_CT")) {
  $c = $c.Replace($old1, $new1)
}
if (-not $c.Contains("        refreshActivation();")) {
  $c = $c.Replace($old2, $new2)
}

Set-Content -Path $path -Value $c -Encoding utf8 -NoNewline
Write-Output ("SNIPER_ACCESS_CT=" + ([regex]::Matches($c, 'SNIPER_ACCESS_CT')).Count)
Write-Output ("activateNow=" + ([regex]::Matches($c, 'activateNow')).Count)
Write-Output ("refreshActivation=" + ([regex]::Matches($c, 'refreshActivation')).Count)