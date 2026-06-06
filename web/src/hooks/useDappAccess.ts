import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { isAddress } from "viem";
import { useAccount, useAccountEffect, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { bscChain } from "../config/chains";
import { useI18n } from "../i18n/LanguageProvider";

type WriteState = "connect" | "switch" | "observer" | "ready";

type Options = {
  trackEvents?: boolean;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getInjectedProvider() {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { ethereum?: EthereumProvider }).ethereum;
}

function isMissingChainError(error: unknown) {
  const candidate = error as { code?: number | string; message?: string; cause?: { code?: number | string; message?: string } };
  const code = candidate.code ?? candidate.cause?.code;
  const message = `${candidate.message ?? ""} ${candidate.cause?.message ?? ""}`.toLowerCase();
  return code === 4902 || code === "4902" || message.includes("unrecognized chain") || message.includes("unknown chain");
}

async function addBscToInjectedWallet() {
  const provider = getInjectedProvider();
  if (!provider) return;

  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: `0x${bscChain.id.toString(16)}`,
        chainName: bscChain.name,
        nativeCurrency: bscChain.nativeCurrency,
        rpcUrls: bscChain.rpcUrls.default.http,
        blockExplorerUrls: [bscChain.blockExplorers.default.url],
      },
    ],
  });
}

export function useDappAccess(options: Options = {}) {
  const { t } = useI18n();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { disconnectAsync, isPending: isDisconnecting } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const [searchParams] = useSearchParams();
  const [walletEvent, setWalletEvent] = useState<"idle" | "connected" | "disconnected" | "changed">("idle");
  const [chainEvent, setChainEvent] = useState<"idle" | "changed">("idle");
  const [isAddingBscChain, setIsAddingBscChain] = useState(false);
  const autoSwitchKeyRef = useRef<string | undefined>();

  const observerParam = searchParams.get("view");
  const observerAddress = observerParam && isAddress(observerParam) ? observerParam : undefined;
  const isObserverMode = Boolean(observerAddress && observerAddress.toLowerCase() !== address?.toLowerCase());
  const activeAddress = isObserverMode ? observerAddress : address;
  const onBsc = chainId === bscChain.id;

  useAccountEffect({
    onConnect: () => {
      if (options.trackEvents) setWalletEvent("connected");
    },
    onDisconnect: () => {
      if (options.trackEvents) setWalletEvent("disconnected");
    },
  });

  useEffect(() => {
    if (!options.trackEvents) return;
    if (!isConnected) return;
    setWalletEvent("changed");
  }, [address, isConnected, options.trackEvents]);

  useEffect(() => {
    if (!options.trackEvents) return;
    if (chainId === undefined) return;
    setChainEvent("changed");
  }, [chainId, options.trackEvents]);

  useEffect(() => {
    if (!isConnected || !address || chainId === undefined || chainId === bscChain.id) return;

    const autoSwitchKey = `${address}:${chainId}`;
    if (autoSwitchKeyRef.current === autoSwitchKey) return;
    autoSwitchKeyRef.current = autoSwitchKey;

    async function switchAfterConnect() {
      try {
        await switchToBsc();
      } catch (error) {
        console.warn("Failed to auto switch to BSC", error);
      }
    }

    void switchAfterConnect();
  }, [address, chainId, isConnected, switchChainAsync]);

  const writeState: WriteState = !isConnected
    ? "connect"
    : isObserverMode
      ? "observer"
      : !onBsc
        ? "switch"
        : "ready";

  async function requestConnect() {
    openConnectModal?.();
  }

  async function switchToBsc() {
    try {
      await switchChainAsync({ chainId: bscChain.id });
    } catch (error) {
      if (!isMissingChainError(error)) throw error;

      setIsAddingBscChain(true);
      try {
        await addBscToInjectedWallet();
        await switchChainAsync({ chainId: bscChain.id });
      } finally {
        setIsAddingBscChain(false);
      }
    }
  }

  async function requestSwitch() {
    await switchToBsc();
  }

  async function requestDisconnect() {
    try {
      await disconnectAsync();
    } finally {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("wagmi.injected.connected");
        window.localStorage.removeItem("wagmi.injected.disconnected");
        window.localStorage.removeItem("rk-latest-id");
        window.localStorage.removeItem("rk-recent");
      }
    }
  }

  function getActionConfig(readyLabel: string, readyHint: string) {
    if (writeState === "connect") {
      return {
        label: t("access.connectLabel"),
        hint: t("access.connectHint"),
        variant: "secondary" as const,
        disabled: false,
        onClick: requestConnect,
      };
    }

    if (writeState === "switch") {
      return {
        label: t("access.switchLabel", { chainName: bscChain.name }),
        hint: t("access.switchHint", { chainName: bscChain.name }),
        variant: "warning" as const,
        disabled: isSwitchingChain || isAddingBscChain,
        onClick: requestSwitch,
      };
    }

    if (writeState === "observer") {
      return {
        label: t("access.observerLabel"),
        hint: t("access.observerHint"),
        variant: "ghost" as const,
        disabled: true,
        onClick: async () => undefined,
      };
    }

    return {
      label: readyLabel,
      hint: readyHint,
      variant: "primary" as const,
      disabled: false,
      onClick: async () => undefined,
    };
  }

  return {
    address,
    activeAddress,
    observerAddress,
    walletEvent,
    chainEvent,
    isConnected,
    isDisconnecting,
    isSwitchingToBsc: isSwitchingChain || isAddingBscChain,
    isObserverMode,
    onBsc,
    writeState,
    requestConnect,
    requestDisconnect,
    requestSwitch,
    getActionConfig,
  };
}
