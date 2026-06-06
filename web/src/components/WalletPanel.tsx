import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useRef, useState } from "react";
import { bscChain } from "../config/chains";
import { useDappAccess } from "../hooks/useDappAccess";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useI18n } from "../i18n/LanguageProvider";
import { shortAddress } from "../lib/format";

export function WalletPanel() {
  const access = useDappAccess();
  const sound = useSoundEffects();
  const { t } = useI18n();
  const wasConnectedRef = useRef(access.isConnected);
  const copyResetTimerRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!wasConnectedRef.current && access.isConnected) {
      sound.play("win");
    } else if (wasConnectedRef.current && !access.isConnected) {
      sound.play("coin");
    }
    wasConnectedRef.current = access.isConnected;
  }, [access.isConnected, sound]);

  useEffect(() => {
    setCopied(false);
  }, [access.address]);

  useEffect(() => {
    if (access.isConnected) return;
    setMenuOpen(false);
  }, [access.isConnected]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  async function handleCopyAddress() {
    if (!access.address) return;

    await navigator.clipboard.writeText(access.address);
    setCopied(true);
    sound.play("coin");

    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }

    copyResetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyResetTimerRef.current = null;
    }, 1600);
  }

  return (
    <ConnectButton.Custom>
      {({ mounted, openConnectModal }) => {
        if (!mounted) {
          return (
            <div className="wallet-header-card wallet-header-card-disconnected">
              <button className="header-wallet-button muted" disabled>{t("wallet.loading")}</button>
            </div>
          );
        }

        if (!access.isConnected) {
          return (
            <div className="wallet-header-card wallet-header-card-disconnected">
              <button
                className="header-wallet-button hero"
                onClick={() => {
                  sound.play("coin");
                  openConnectModal();
                }}
              >
                <span className="wallet-connect-label-desktop">{t("wallet.connect")}</span>
                <span className="wallet-connect-label-mobile">{t("wallet.connectCompact")}</span>
              </button>
            </div>
          );
        }

        return (
          <div className="wallet-header-card" ref={menuRef}>
            <button
              className="header-wallet-button connected account-summary-button"
              onClick={() => {
                sound.play("coin");
                setMenuOpen((open) => !open);
              }}
              title={t("wallet.manage")}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <span className={`wallet-status-dot ${access.onBsc ? "good" : "warn"}`.trim()} />
              <strong>{shortAddress(access.address)}</strong>
              {!access.onBsc ? <small>{access.isSwitchingToBsc ? t("wallet.switching") : t("wallet.pendingNetwork")}</small> : null}
            </button>

            {menuOpen ? (
              <div className="wallet-menu" role="menu" aria-label={t("wallet.menu")}>
                <button
                  className="wallet-menu-button"
                  onClick={() => {
                    void handleCopyAddress();
                  }}
                >
                  {copied ? t("wallet.addressCopied") : t("wallet.copyAddress")}
                </button>
                {!access.onBsc ? (
                  <button
                    className="wallet-menu-button"
                    onClick={() => {
                      sound.play("upgrade");
                      setMenuOpen(false);
                      void access.requestSwitch();
                    }}
                    disabled={access.isSwitchingToBsc}
                  >
                    {access.isSwitchingToBsc ? t("wallet.confirmInWallet") : t("access.switchLabel", { chainName: bscChain.name })}
                  </button>
                ) : null}
                <button
                  className="wallet-menu-button danger"
                  disabled={access.isDisconnecting}
                  onClick={() => {
                    sound.play("coin");
                    setMenuOpen(false);
                    void access.requestDisconnect();
                  }}
                >
                  {access.isDisconnecting ? t("wallet.disconnecting") : t("wallet.disconnect")}
                </button>
              </div>
            ) : null}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
