import { useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { nftRevenueDistributorAbi } from "../abi/gamefi";
import { bscChain } from "../config/chains";
import { contracts } from "../config/contracts";
import { useTxFlow } from "../hooks/useTxFlow";
import { useI18n } from "../i18n/LanguageProvider";
import { formatToken, shortAddress } from "../lib/format";
import { SectionCard } from "./SectionCard";
import { TxStatusBanner } from "./TxStatusBanner";

const initialScanDays = 30;
const scanStepDays = 30;
const maxClaimBatchSize = 10;
const secondsPerDay = 86_400n;
const utc8OffsetSeconds = 8n * 60n * 60n;

type Props = {
  address?: Address;
  currentDay?: bigint;
};

function formatUtc8Day(dayId: bigint, locale: string) {
  const timestamp = Number(dayId * secondsPerDay - utc8OffsetSeconds) * 1000;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(timestamp));
}

export function AdminDividendClaimCard({ address, currentDay }: Props) {
  const { numberLocale, t } = useI18n();
  const publicClient = usePublicClient({ chainId: bscChain.id });
  const { writeContractAsync } = useWriteContract();
  const tx = useTxFlow();
  const previousPhaseRef = useRef(tx.phase);
  const [scanDays, setScanDays] = useState(initialScanDays);

  const dayIds = useMemo(() => {
    if (currentDay === undefined) return [];

    const availableDays = currentDay + 1n;
    const requestedDays = BigInt(scanDays);
    const count = Number(availableDays < requestedDays ? availableDays : requestedDays);
    return Array.from({ length: count }, (_, index) => currentDay - BigInt(index));
  }, [currentDay, scanDays]);

  const claimPreviews = useReadContracts({
    allowFailure: true,
    contracts: dayIds.map((dayId) => ({
      address: contracts.nftRevenueDistributor!,
      chainId: bscChain.id,
      abi: nftRevenueDistributorAbi,
      functionName: "previewClaim",
      args: [dayId, address!],
    })),
    query: {
      enabled: Boolean(contracts.nftRevenueDistributor && address && dayIds.length > 0),
    },
  });

  const claimEntries = useMemo(() => dayIds
    .map((dayId, index) => {
      const result = claimPreviews.data?.[index];
      const amount = result?.status === "success" ? result.result : 0n;
      return { dayId, amount };
    })
    .filter((entry) => entry.amount > 0n), [claimPreviews.data, dayIds]);

  const totalClaimable = claimEntries.reduce((sum, entry) => sum + entry.amount, 0n);
  const nextBatch = claimEntries.slice(0, maxClaimBatchSize);
  const actionLocked = tx.phase === "awaiting-signature" || tx.phase === "sending" || tx.phase === "confirming";
  const queryLocked = claimPreviews.isPending || claimPreviews.isFetching;

  useEffect(() => {
    if (previousPhaseRef.current !== tx.phase && tx.phase === "success") {
      void claimPreviews.refetch();
    }
    previousPhaseRef.current = tx.phase;
  }, [claimPreviews, tx.phase]);

  async function claimNextBatch() {
    if (!contracts.nftRevenueDistributor || !address || !publicClient || nextBatch.length === 0) {
      tx.setError(t("admin.dividendParamsMissing"));
      return;
    }

    try {
      const latestAmounts = await Promise.all(nextBatch.map(async ({ dayId }) => {
        try {
          return await publicClient.readContract({
            address: contracts.nftRevenueDistributor!,
            abi: nftRevenueDistributorAbi,
            functionName: "previewClaim",
            args: [dayId, address],
          });
        } catch {
          return 0n;
        }
      }));
      const claimableDayIds = nextBatch
        .filter((_, index) => latestAmounts[index] > 0n)
        .map((entry) => entry.dayId);

      if (claimableDayIds.length === 0) {
        await claimPreviews.refetch();
        tx.setError(t("admin.dividendNothingAfterRefresh"));
        return;
      }

      await publicClient.simulateContract({
        account: address,
        address: contracts.nftRevenueDistributor,
        abi: nftRevenueDistributorAbi,
        functionName: "claimBatch",
        args: [claimableDayIds],
      });

      tx.setAwaitingSignature();
      const hash = await writeContractAsync({
        address: contracts.nftRevenueDistributor,
        chainId: bscChain.id,
        abi: nftRevenueDistributorAbi,
        functionName: "claimBatch",
        args: [claimableDayIds],
      });
      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("admin.dividendClaimFailed"));
    }
  }

  return (
    <SectionCard title={t("admin.dividendTitle")} description={t("admin.dividendDesc")}>
      <div className="admin-dividend-overview">
        <div>
          <span>{t("admin.dividendWallet")}</span>
          <strong>{shortAddress(address)}</strong>
        </div>
        <div>
          <span>{t("admin.dividendTotal")}</span>
          <strong>{formatToken(totalClaimable)} {t("common.tokenName")}</strong>
        </div>
        <div>
          <span>{t("admin.dividendPeriods")}</span>
          <strong>{claimEntries.length}</strong>
        </div>
      </div>

      <div className="admin-dividend-list">
        <div className="admin-dividend-list-head">
          <span>{t("admin.dividendDate")}</span>
          <span>{t("admin.dividendDayId")}</span>
          <span>{t("admin.dividendAmount")}</span>
        </div>
        {queryLocked && claimPreviews.data === undefined ? (
          <div className="empty-state">{t("admin.dividendLoading")}</div>
        ) : claimEntries.length > 0 ? claimEntries.map((entry) => (
          <div className="admin-dividend-list-row" key={entry.dayId.toString()}>
            <span>{formatUtc8Day(entry.dayId, numberLocale)}</span>
            <code>{entry.dayId.toString()}</code>
            <strong>{formatToken(entry.amount)} {t("common.tokenName")}</strong>
          </div>
        )) : (
          <div className="empty-state">{t("admin.dividendEmpty")}</div>
        )}
      </div>

      <div className="claim-action-row">
        <div className="claim-action-copy">
          <strong>{t("admin.dividendScanned", { days: scanDays })}</strong>
          <span>{t("admin.dividendBatchHint", { count: maxClaimBatchSize })}</span>
        </div>
        <div className="claim-action-buttons">
          <button
            type="button"
            className="secondary-button"
            disabled={actionLocked || queryLocked}
            onClick={() => setScanDays((value) => value + scanStepDays)}
          >
            {t("admin.dividendLoadOlder")}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={actionLocked || queryLocked || nextBatch.length === 0}
            onClick={() => void claimNextBatch()}
          >
            {t("admin.dividendClaimNext", { count: nextBatch.length })}
          </button>
        </div>
      </div>

      <TxStatusBanner phase={tx.phase} hash={tx.hash} errorMessage={tx.errorMessage} />
    </SectionCard>
  );
}
