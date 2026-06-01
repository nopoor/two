import type { Address } from "viem";

function asAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  return value as Address;
}

export const contracts = {
  flapToken: asAddress(import.meta.env.VITE_FLAP_TOKEN_ADDRESS),
  flapDividend: asAddress(import.meta.env.VITE_FLAP_DIVIDEND_ADDRESS),
  accessControl: asAddress(import.meta.env.VITE_SYSTEM_ACCESS_CONTROL_ADDRESS),
  referralRegistry: asAddress(import.meta.env.VITE_REFERRAL_REGISTRY_ADDRESS),
  gameRegistry: asAddress(import.meta.env.VITE_GAME_REGISTRY_ADDRESS),
  gameManager: asAddress(import.meta.env.VITE_GAME_MANAGER_ADDRESS),
  bankrollVault: asAddress(import.meta.env.VITE_BANKROLL_VAULT_ADDRESS),
  incomePool: asAddress(import.meta.env.VITE_INCOME_POOL_ADDRESS),
  dividendBankNft: asAddress(import.meta.env.VITE_DIVIDEND_BANK_NFT_ADDRESS),
  nftRevenueDistributor: asAddress(import.meta.env.VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS),
};
