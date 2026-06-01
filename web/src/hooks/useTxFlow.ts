import { useEffect, useState } from "react";
import { useWaitForTransactionReceipt, type BaseError } from "wagmi";

export type TxPhase =
  | "idle"
  | "awaiting-signature"
  | "sending"
  | "confirming"
  | "success"
  | "error";

export function useTxFlow() {
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const receipt = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: Boolean(hash),
    },
  });

  useEffect(() => {
    if (!hash) return;
    if (receipt.isPending) {
      setPhase("confirming");
    } else if (receipt.isSuccess) {
      setPhase("success");
    } else if (receipt.isError) {
      setPhase("error");
      setErrorMessage((receipt.error as BaseError | undefined)?.shortMessage || receipt.error.message);
    }
  }, [hash, receipt.error, receipt.isError, receipt.isPending, receipt.isSuccess]);

  return {
    hash,
    phase,
    receipt: receipt.data,
    errorMessage,
    setAwaitingSignature: () => {
      setHash(undefined);
      setErrorMessage(undefined);
      setPhase("awaiting-signature");
    },
    setHashAndSending: (value: `0x${string}`) => {
      setHash(value);
      setPhase("sending");
    },
    setError: (message: string) => {
      setHash(undefined);
      setErrorMessage(message);
      setPhase("error");
    },
    reset: () => {
      setHash(undefined);
      setErrorMessage(undefined);
      setPhase("idle");
    },
  };
}
