import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { playGeneratedSound, type SoundEffect } from "../lib/sound";

const STORAGE_KEY = "dividend-bank-muted";

type SoundContextValue = {
  muted: boolean;
  toggleMuted: () => void;
  play: (effect: SoundEffect) => void;
};

const SoundEffectsContext = createContext<SoundContextValue | null>(null);

export function SoundEffectsProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") {
      setMuted(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  }, [muted]);

  const play = useCallback((effect: SoundEffect) => {
    void playGeneratedSound(effect, muted);
  }, [muted]);

  const toggleMuted = useCallback(() => {
    setMuted((current) => !current);
  }, []);

  const value = useMemo(() => ({ muted, toggleMuted, play }), [muted, play, toggleMuted]);

  return <SoundEffectsContext.Provider value={value}>{children}</SoundEffectsContext.Provider>;
}

export function useSoundEffects() {
  const context = useContext(SoundEffectsContext);
  if (!context) {
    throw new Error("useSoundEffects must be used within SoundEffectsProvider");
  }
  return context;
}
