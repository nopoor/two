import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  binanceWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  tokenPocketWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { bscChain } from "./chains";

const appName = "分红银行 GameFi";
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();
const walletConnectWallets = projectId
  ? [okxWallet, binanceWallet, tokenPocketWallet, walletConnectWallet, metaMaskWallet]
  : [];
const connectors = connectorsForWallets(
  [
    {
      groupName: "推荐钱包",
      wallets: [injectedWallet, ...walletConnectWallets],
    },
  ],
  {
    appName,
    projectId: projectId ?? "",
  },
);

export const wagmiConfig = createConfig({
  chains: [bscChain],
  connectors,
  ssr: false,
  transports: {
    [bscChain.id]: http(bscChain.rpcUrls.default.http[0]),
  },
});
