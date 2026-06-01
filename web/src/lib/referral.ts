import { isAddress } from "viem";

export const REFERRAL_STORAGE_KEY = "dividend-bank:cached-referrer";
export const zeroAddress = "0x0000000000000000000000000000000000000000";

export function readCachedReferrer() {
  if (typeof window === "undefined") return undefined;
  const value = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
  if (!value || !isAddress(value)) return undefined;
  return value;
}

export function cacheReferrer(value: string) {
  if (typeof window === "undefined") return;
  if (!isAddress(value)) return;
  window.localStorage.setItem(REFERRAL_STORAGE_KEY, value);
}

export function clearCachedReferrer() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
}

export function getEligibleCachedReferrer(player?: string) {
  const referrer = readCachedReferrer();
  if (!referrer) return undefined;
  if (player && referrer.toLowerCase() === player.toLowerCase()) return undefined;
  return referrer;
}
