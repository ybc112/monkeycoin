import { useEffect, useState, useCallback } from "react";
import { ethers, type BrowserProvider, type Signer } from "ethers";
import { CHAIN_ID } from "@/lib/contracts/snowballFactory";

interface WalletState {
  account: string | null;
  chainId: number | null;
  provider: BrowserProvider | null;
  signer: Signer | null;
  connecting: boolean;
  error: string | null;
}

const initialState: WalletState = {
  account: null,
  chainId: null,
  provider: null,
  signer: null,
  connecting: false,
  error: null,
};

export function useWallet() {
  const [state, setState] = useState<WalletState>(initialState);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const ethProvider = new ethers.BrowserProvider(window.ethereum as any);
    const accounts = await ethProvider.listAccounts();
    const network = await ethProvider.getNetwork();
    const chainId = Number(network.chainId);

    if (accounts.length > 0) {
      const signer = await ethProvider.getSigner();
      setState((s) => ({
        ...s,
        account: accounts[0].address,
        chainId,
        provider: ethProvider,
        signer,
        error: null,
      }));
    } else {
      setState((s) => ({
        ...s,
        account: null,
        chainId,
        provider: ethProvider,
        signer: null,
        error: null,
      }));
    }
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setState((s) => ({ ...s, error: "请安装 MetaMask 或 Web3 钱包" }));
      return;
    }
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const ethProvider = new ethers.BrowserProvider(window.ethereum as any);
      await ethProvider.send("eth_requestAccounts", []);

      const network = await ethProvider.getNetwork();
      const chainId = Number(network.chainId);
      if (chainId !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
          });
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            setState((s) => ({ ...s, connecting: false, error: "请手动添加 BSC 主网" }));
            return;
          }
          throw switchErr;
        }
      }

      await refresh();
    } catch (err: any) {
      setState((s) => ({ ...s, error: err.message || "连接失败", connecting: false }));
    } finally {
      setState((s) => ({ ...s, connecting: false }));
    }
  }, [refresh]);

  const disconnect = useCallback(() => {
    setState(initialState);
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window !== "undefined" && window.ethereum) {
      const eth = window.ethereum as any;
      eth.on?.("accountsChanged", refresh);
      eth.on?.("chainChanged", () => window.location.reload());
      return () => {
        eth.removeListener?.("accountsChanged", refresh);
      };
    }
  }, [refresh]);

  return {
    ...state,
    isConnected: !!state.account && state.chainId === CHAIN_ID,
    connect,
    disconnect,
    refresh,
  };
}
