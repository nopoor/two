import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { cacheReferrer, clearCachedReferrer, readCachedReferrer } from "../lib/referral";

export function useReferralLanding(activeAddress?: string) {
  const [cachedReferrer, setCachedReferrer] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return readCachedReferrer();
  });

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const ref = currentUrl.searchParams.get("ref");
    if (ref && isAddress(ref)) {
      if (activeAddress && ref.toLowerCase() === activeAddress.toLowerCase()) {
        clearCachedReferrer();
        setCachedReferrer(undefined);
      } else {
        cacheReferrer(ref);
        setCachedReferrer(ref);
      }
    }

    const sync = () => setCachedReferrer(readCachedReferrer());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [activeAddress]);

  useEffect(() => {
    if (!activeAddress || !cachedReferrer) return;
    if (cachedReferrer.toLowerCase() !== activeAddress.toLowerCase()) return;
    clearCachedReferrer();
    setCachedReferrer(undefined);
  }, [activeAddress, cachedReferrer]);

  return {
    cachedReferrer,
    clearCachedReferrer: () => {
      clearCachedReferrer();
      setCachedReferrer(undefined);
    },
  };
}
