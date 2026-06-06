import { useEffect, useState } from "react";
import type { TxPhase } from "../hooks/useTxFlow";
import { useI18n } from "../i18n/LanguageProvider";
import { shortAddress } from "../lib/format";

type Props = {
  phase: TxPhase;
  hash?: string;
  errorMessage?: string;
  dismissAfterMs?: number;
};

function getDefaultDismissDelay(phase: TxPhase) {
  return phase === "success" || phase === "error" ? 4500 : 0;
}

export function TxStatusBanner({ phase, hash, errorMessage, dismissAfterMs }: Props) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);
  const autoDismissDelay = dismissAfterMs ?? getDefaultDismissDelay(phase);

  useEffect(() => {
    setHidden(false);

    if (phase === "idle" || autoDismissDelay <= 0) return undefined;

    const timer = window.setTimeout(() => setHidden(true), autoDismissDelay);
    return () => window.clearTimeout(timer);
  }, [autoDismissDelay, errorMessage, hash, phase]);

  if (phase === "idle" || hidden) return null;

  const phaseText: Record<Exclude<TxPhase, "idle">, { title: string; detail: string }> = {
    "awaiting-signature": {
      title: t("tx.awaitingSignatureTitle"),
      detail: t("tx.awaitingSignatureDetail"),
    },
    sending: {
      title: t("tx.sendingTitle"),
      detail: t("tx.sendingDetail"),
    },
    confirming: {
      title: t("tx.confirmingTitle"),
      detail: t("tx.confirmingDetail"),
    },
    success: {
      title: t("tx.successTitle"),
      detail: t("tx.successDetail"),
    },
    error: {
      title: t("tx.errorTitle"),
      detail: t("tx.errorDetail"),
    },
  };

  const current = phaseText[phase];

  return (
    <div className={`tx-banner tx-${phase}`}>
      <strong>{current.title}</strong>
      <span>{errorMessage || current.detail}</span>
      {hash ? <code className="mono">{shortAddress(hash)}</code> : null}
    </div>
  );
}
