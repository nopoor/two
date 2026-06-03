import { defineChain } from "viem";

function parseChainId(rawValue: string | undefined, fallback: number) {
  if (!rawValue) return fallback;
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const chainId = parseChainId(import.meta.env.VITE_CHAIN_ID, 56);
const chainName = import.meta.env.VITE_CHAIN_NAME?.trim() || (chainId === 56 ? "BNB Smart Chain" : "Local Preview Chain");
const chainCurrencySymbol = import.meta.env.VITE_CHAIN_CURRENCY_SYMBOL?.trim() || "BNB";
const chainCurrencyName = import.meta.env.VITE_CHAIN_CURRENCY_NAME?.trim() || chainCurrencySymbol;
const chainRpcUrl = import.meta.env.VITE_BSC_RPC_URL || "https://bsc-dataseed.binance.org";
const blockExplorerUrl = import.meta.env.VITE_BLOCK_EXPLORER_URL?.trim() || (chainId === 56 ? "https://bscscan.com" : "");

export const bscChain = defineChain({
  id: chainId,
  name: chainName,
  nativeCurrency: {
    name: chainCurrencyName,
    symbol: chainCurrencySymbol,
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [chainRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: blockExplorerUrl ? "Block Explorer" : "Explorer Unavailable",
      url: blockExplorerUrl,
    },
  },
});

export const hasBlockExplorer = blockExplorerUrl.length > 0;
