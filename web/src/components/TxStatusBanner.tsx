import { useEffect, useState } from "react";
import type { TxPhase } from "../hooks/useTxFlow";
import { shortAddress } from "../lib/format";

type Props = {
  phase: TxPhase;
  hash?: string;
  errorMessage?: string;
  dismissAfterMs?: number;
};

const phaseText: Record<Exclude<TxPhase, "idle">, { title: string; detail: string }> = {
  "awaiting-signature": {
    title: "等待錢包簽署",
    detail: "請在錢包內確認本次交易。",
  },
  sending: {
    title: "交易已送出",
    detail: "交易已提交，正在等待鏈上處理。",
  },
  confirming: {
    title: "等待鏈上確認",
    detail: "交易正在等待區塊確認。",
  },
  success: {
    title: "交易已確認",
    detail: "交易已完成確認。",
  },
  error: {
    title: "交易未完成",
    detail: "請稍後重新提交。",
  },
};

function getDefaultDismissDelay(phase: TxPhase) {
  return phase === "success" || phase === "error" ? 4500 : 0;
}

export function TxStatusBanner({ phase, hash, errorMessage, dismissAfterMs }: Props) {
  const [hidden, setHidden] = useState(false);
  const autoDismissDelay = dismissAfterMs ?? getDefaultDismissDelay(phase);

  useEffect(() => {
    setHidden(false);

    if (phase === "idle" || autoDismissDelay <= 0) return undefined;

    const timer = window.setTimeout(() => setHidden(true), autoDismissDelay);
    return () => window.clearTimeout(timer);
  }, [autoDismissDelay, errorMessage, hash, phase]);

  if (phase === "idle" || hidden) return null;

  const current = phaseText[phase];

  return (
    <div className={`tx-banner tx-${phase}`}>
      <strong>{current.title}</strong>
      <span>{errorMessage || current.detail}</span>
      {hash ? <code className="mono">{shortAddress(hash)}</code> : null}
    </div>
  );
}
