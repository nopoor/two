import { useEffect, useRef } from "react";
import { useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { SectionCard } from "../components/SectionCard";
import { TxStatusBanner } from "../components/TxStatusBanner";
import { incomePoolAbi, nftRevenueDistributorAbi } from "../abi/gamefi";
import { contracts } from "../config/contracts";
import { bscChain } from "../config/chains";
import { useDappAccess } from "../hooks/useDappAccess";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useTxFlow } from "../hooks/useTxFlow";
import { useI18n } from "../i18n/LanguageProvider";
import { formatToken } from "../lib/format";

export function RevenuePage() {
  const access = useDappAccess();
  const sound = useSoundEffects();
  const tx = useTxFlow();
  const { t } = useI18n();
  const { writeContractAsync } = useWriteContract();
  const claimLocked = tx.phase === "awaiting-signature" || tx.phase === "sending" || tx.phase === "confirming";
  const previousPhaseRef = useRef(tx.phase);
  const historyWindow = 7n;

  const currentDay = useReadContract({
    address: contracts.nftRevenueDistributor,
    chainId: bscChain.id,
    abi: nftRevenueDistributorAbi,
    functionName: "currentUtc8DayId",
    query: {
      enabled: Boolean(contracts.nftRevenueDistributor),
    },
  });

  const currentSnapshot = useReadContract({
    address: contracts.nftRevenueDistributor,
    chainId: bscChain.id,
    abi: nftRevenueDistributorAbi,
    functionName: "snapshots",
    args: [currentDay.data || 0n],
    query: {
      enabled: Boolean(contracts.nftRevenueDistributor && currentDay.data !== undefined),
    },
  });

  const hasTodaySnapshot = currentSnapshot.data !== undefined && currentSnapshot.data[0] > 0n;

  const claimPreview = useReadContract({
    address: contracts.nftRevenueDistributor,
    chainId: bscChain.id,
    abi: nftRevenueDistributorAbi,
    functionName: "previewClaim",
    args: [currentDay.data || 0n, access.activeAddress!],
    query: {
      enabled: Boolean(contracts.nftRevenueDistributor && access.activeAddress && currentDay.data !== undefined && hasTodaySnapshot),
    },
  });

  const incomePoolBalance = useReadContract({
    address: contracts.incomePool,
    chainId: bscChain.id,
    abi: incomePoolAbi,
    functionName: "availableFlap",
    query: {
      enabled: Boolean(contracts.incomePool),
    },
  });

  const historicalDayIds =
    currentDay.data && currentDay.data > 0n
      ? Array.from(
          { length: Number(currentDay.data > historyWindow ? historyWindow : currentDay.data) },
          (_, index) => currentDay.data! - BigInt(index + 1),
        )
      : [];

  const historicalClaims = useReadContracts({
    allowFailure: true,
    contracts: historicalDayIds.map((dayId) => ({
      address: contracts.nftRevenueDistributor!,
      chainId: bscChain.id,
      abi: nftRevenueDistributorAbi,
      functionName: "previewClaim",
      args: [dayId, access.activeAddress!],
    })),
    query: {
      enabled: Boolean(contracts.nftRevenueDistributor && access.activeAddress && historicalDayIds.length > 0),
    },
  });

  const historicalEntries = historicalDayIds
    .map((dayId, index) => {
      const item = historicalClaims.data?.[index];
      const amount = item?.status === "success" ? item.result : 0n;
      return {
        dayId,
        amount,
      };
    })
    .filter((entry) => entry.amount > 0n);

  const historicalTotal = historicalEntries.reduce((sum, entry) => sum + entry.amount, 0n);
  const hasHistoricalClaims = historicalEntries.length > 0;

  const actionConfig =
    access.writeState === "ready"
      ? {
          ...access.getActionConfig(t("revenue.claimReadyLabel"), t("revenue.claimReadyHint")),
          disabled: claimLocked || !hasTodaySnapshot,
          onClick: claim,
        }
      : access.getActionConfig(t("revenue.claimReadyLabel"), t("revenue.claimReadyHint"));

  const currentActionLabel =
    access.writeState === "connect"
      ? t("common.connectWallet")
      : access.writeState === "switch"
        ? t("access.switchLabel", { chainName: bscChain.name })
        : access.writeState === "observer"
          ? t("revenue.readOnly")
          : hasTodaySnapshot
            ? t("revenue.claimToday")
            : t("revenue.waitSnapshot");

  const historyActionConfig =
    access.writeState === "ready"
      ? {
          ...access.getActionConfig(t("revenue.batchClaimReadyLabel"), t("revenue.batchClaimReadyHint")),
          disabled: claimLocked || !hasHistoricalClaims,
          onClick: claimHistoryBatch,
        }
      : access.getActionConfig(t("revenue.batchClaimReadyLabel"), t("revenue.batchClaimReadyHint"));

  useEffect(() => {
    if (previousPhaseRef.current !== tx.phase && tx.phase === "success") {
      sound.play("win");
    }
    previousPhaseRef.current = tx.phase;
  }, [sound, tx.phase]);

  async function claim() {
    if (!contracts.nftRevenueDistributor || currentDay.data === undefined) {
      tx.setError(t("common.serviceUnavailable"));
      return;
    }

    if (!hasTodaySnapshot) {
      tx.setError(t("revenue.snapshotNotReadyError"));
      return;
    }

    try {
      sound.play("upgrade");
      tx.setAwaitingSignature();
      const hash = await writeContractAsync({
        address: contracts.nftRevenueDistributor,
        abi: nftRevenueDistributorAbi,
        functionName: "claim",
        args: [currentDay.data],
      });
      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("revenue.claimFailed"));
    }
  }

  async function claimHistoryBatch() {
    if (!contracts.nftRevenueDistributor || historicalEntries.length === 0) {
      tx.setError(t("revenue.noHistoricalClaims"));
      return;
    }

    try {
      sound.play("upgrade");
      tx.setAwaitingSignature();
      const hash = await writeContractAsync({
        address: contracts.nftRevenueDistributor,
        abi: nftRevenueDistributorAbi,
        functionName: "claimBatch",
        args: [historicalEntries.map((entry) => entry.dayId)],
      });
      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("revenue.batchClaimFailed"));
    }
  }

  function handleClaimAction() {
    if (access.writeState === "connect") {
      sound.play("coin");
    } else if (access.writeState === "switch") {
      sound.play("upgrade");
    }
    void actionConfig.onClick();
  }

  return (
    <div className="vault-page-stack">
      <SectionCard
        title={t("revenue.claimTitle")}
        description={access.isConnected ? undefined : t("revenue.readChainData")}
        className={access.writeState !== "ready" ? "readonly-state" : undefined}
      >
        <div className="yield-overview-grid">
          <div className="yield-stat-box yield-stat-box-primary">
            <span>{t("revenue.dailyClaimable")}</span>
            <strong>{access.activeAddress ? `${formatToken(claimPreview.data)} ${t("common.tokenName")}` : "--"}</strong>
          </div>
          <div className="yield-stat-box">
            <span>{t("revenue.snapshotDay")}</span>
            <strong>{currentDay.data?.toString() || "--"}</strong>
          </div>
          <div className="yield-stat-box">
            <span>{t("revenue.pool")}</span>
            <strong>{formatToken(incomePoolBalance.data)} {t("common.tokenName")}</strong>
          </div>
        </div>

        {!hasTodaySnapshot ? (
          <div className="status-banner status-banner-warning revenue-snapshot-banner">
            <strong>{t("revenue.snapshotMissing")}</strong>
          </div>
        ) : null}

        <div className="claim-action-row">
          <div className="claim-action-copy">
            <strong>{access.activeAddress ? t("revenue.unclaimedHistory", { days: historicalEntries.length }) : t("revenue.unclaimedHistoryEmpty")}</strong>
            <span>{access.activeAddress ? `${formatToken(historicalTotal)} ${t("common.tokenName")}` : "--"}</span>
          </div>
          <div className="claim-action-buttons">
            {access.writeState === "ready" && hasHistoricalClaims ? (
              <button
                className={`${historyActionConfig.variant}-button`}
                disabled={historyActionConfig.disabled}
                onClick={() => void historyActionConfig.onClick()}
              >
                {t("revenue.batchClaimReadyLabel")}
              </button>
            ) : null}
            <button className={`${actionConfig.variant}-button`} disabled={actionConfig.disabled} onClick={handleClaimAction}>
              {currentActionLabel}
            </button>
          </div>
        </div>

        <TxStatusBanner phase={tx.phase} hash={tx.hash} errorMessage={tx.errorMessage} />
      </SectionCard>
    </div>
  );
}
