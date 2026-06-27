import { useMemo, useState } from "react";
import { formatEther, keccak256, stringToHex, zeroHash } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { SectionCard } from "../components/SectionCard";
import { AdminDividendClaimCard } from "../components/AdminDividendClaimCard";
import { TxStatusBanner } from "../components/TxStatusBanner";
import { accessControlAbi, gameManagerAbi, gameRegistryAbi, nftRevenueDistributorAbi } from "../abi/gamefi";
import { contracts } from "../config/contracts";
import { bscChain } from "../config/chains";
import { useGameAvailability } from "../hooks/useGameAvailability";
import { useTxFlow } from "../hooks/useTxFlow";
import { useI18n } from "../i18n/LanguageProvider";
import { shortAddress } from "../lib/format";

const roles = [
  { key: "DEFAULT_ADMIN_ROLE", hash: zeroHash },
  { key: "OPERATOR_ROLE", hash: keccak256(stringToHex("OPERATOR_ROLE")) },
  { key: "PAUSER_ROLE", hash: keccak256(stringToHex("PAUSER_ROLE")) },
  { key: "REVENUE_ROLE", hash: keccak256(stringToHex("REVENUE_ROLE")) },
  { key: "GAME_ADMIN_ROLE", hash: keccak256(stringToHex("GAME_ADMIN_ROLE")) },
  { key: "AUTOMATION_ROLE", hash: keccak256(stringToHex("AUTOMATION_ROLE")) },
] as const;

export function AdminPage() {
  const { numberLocale, t } = useI18n();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const tx = useTxFlow();
  const gameAvailability = useGameAvailability();
  const [refundBetIdInput, setRefundBetIdInput] = useState("");
  const roleQueryConfig = {
    address: contracts.accessControl,
    chainId: bscChain.id,
    abi: accessControlAbi,
    query: {
      enabled: Boolean(contracts.accessControl && address),
    },
  } as const;

  const adminCheck = useReadContract({
    ...roleQueryConfig,
    functionName: "hasRole",
    args: [roles[0].hash, address!],
  });

  const operatorCheck = useReadContract({
    ...roleQueryConfig,
    functionName: "hasRole",
    args: [roles[1].hash, address!],
  });

  const pauserCheck = useReadContract({
    ...roleQueryConfig,
    functionName: "hasRole",
    args: [roles[2].hash, address!],
  });

  const revenueCheck = useReadContract({
    ...roleQueryConfig,
    functionName: "hasRole",
    args: [roles[3].hash, address!],
  });

  const gameAdminCheck = useReadContract({
    ...roleQueryConfig,
    functionName: "hasRole",
    args: [roles[4].hash, address!],
  });

  const automationCheck = useReadContract({
    ...roleQueryConfig,
    functionName: "hasRole",
    args: [roles[5].hash, address!],
  });

  const roleChecks = [adminCheck, operatorCheck, pauserCheck, revenueCheck, gameAdminCheck, automationCheck];

  const paused = useReadContract({
    address: contracts.accessControl,
    chainId: bscChain.id,
    abi: accessControlAbi,
    functionName: "paused",
    query: {
      enabled: Boolean(contracts.accessControl),
    },
  });

  const currentDay = useReadContract({
    address: contracts.nftRevenueDistributor,
    chainId: bscChain.id,
    abi: nftRevenueDistributorAbi,
    functionName: "currentUtc8DayId",
    query: {
      enabled: Boolean(contracts.nftRevenueDistributor),
    },
  });

  const todaySnapshot = useReadContract({
    address: contracts.nftRevenueDistributor,
    chainId: bscChain.id,
    abi: nftRevenueDistributorAbi,
    functionName: "snapshots",
    args: [currentDay.data || 0n],
    query: {
      enabled: Boolean(contracts.nftRevenueDistributor && currentDay.data !== undefined),
    },
  });

  const refundBetId = refundBetIdInput.trim() !== "" ? BigInt(refundBetIdInput) : undefined;
  const pendingBet = useReadContract({
    address: contracts.gameManager,
    chainId: bscChain.id,
    abi: gameManagerAbi,
    functionName: "pendingBets",
    args: refundBetId !== undefined ? [refundBetId] : undefined,
    query: {
      enabled: Boolean(contracts.gameManager && refundBetId !== undefined),
    },
  });

  const hasAnyRole = roleChecks.some((item) => Boolean(item.data));
  const isAdmin = Boolean(roleChecks[0].data);
  const isOperator = Boolean(roleChecks[1].data);
  const isPauser = Boolean(roleChecks[2].data);
  const isGameAdmin = Boolean(roleChecks[4].data);
  const isAutomation = Boolean(roleChecks[5].data);
  const actionLocked = tx.phase === "awaiting-signature" || tx.phase === "sending" || tx.phase === "confirming";
  const hasTodaySnapshot = todaySnapshot.data !== undefined && todaySnapshot.data[0] > 0n;
  const refundStatus = pendingBet.data ? Number(pendingBet.data[7]) : 0;
  const betStatusText = [
    t("admin.betStatus.missing"),
    t("admin.betStatus.pending"),
    t("admin.betStatus.settled"),
    t("admin.betStatus.refunded"),
  ] as const;
  const canPause = isPauser && paused.data === false;
  const canUnpause = isAdmin && paused.data === true;
  const canManageGames = isAdmin || isGameAdmin;
  const canRunSnapshot = (isAutomation || isAdmin) && currentDay.data !== undefined && !hasTodaySnapshot;
  const canRefundPendingBet = (isOperator || isAdmin) && refundBetId !== undefined && refundStatus === 1;
  const refundPlayer = pendingBet.data?.[0];
  const refundWager = pendingBet.data?.[3];

  const snapshotSummary = useMemo(() => {
    if (todaySnapshot.data === undefined) return t("admin.loading");
    if (todaySnapshot.data[0] === 0n) return t("admin.noSnapshotToday");
    return t("admin.snapshotSummary", {
      block: todaySnapshot.data[0].toString(),
      amount: Number(formatEther(todaySnapshot.data[1])).toLocaleString(numberLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      tokenName: t("common.tokenName"),
    });
  }, [numberLocale, t, todaySnapshot.data]);

  async function handlePauseToggle(nextAction: "pause" | "unpause") {
    if (!contracts.accessControl) {
      tx.setError(t("admin.accessControlMissing"));
      return;
    }

    try {
      tx.setAwaitingSignature();
      const hash = await writeContractAsync({
        address: contracts.accessControl,
        chainId: bscChain.id,
        abi: accessControlAbi,
        functionName: nextAction,
      });
      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("admin.updateStatusFailed"));
    }
  }

  async function handleRunSnapshot() {
    if (!contracts.nftRevenueDistributor || currentDay.data === undefined) {
      tx.setError(t("admin.snapshotParamsMissing"));
      return;
    }

    try {
      tx.setAwaitingSignature();
      const hash = await writeContractAsync({
        address: contracts.nftRevenueDistributor,
        chainId: bscChain.id,
        abi: nftRevenueDistributorAbi,
        functionName: "snapshotAndPull",
        args: [currentDay.data],
      });
      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("admin.runSnapshotFailed"));
    }
  }

  async function handleRefundBet() {
    if (!contracts.gameManager || refundBetId === undefined) {
      tx.setError(t("admin.invalidBetId"));
      return;
    }

    try {
      tx.setAwaitingSignature();
      const hash = await writeContractAsync({
        address: contracts.gameManager,
        chainId: bscChain.id,
        abi: gameManagerAbi,
        functionName: "refundPendingBet",
        args: [refundBetId],
      });
      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("admin.refundFailed"));
    }
  }

  async function handleToggleGame(gameId: `0x${string}`, enabled: boolean) {
    if (!contracts.gameRegistry) {
      tx.setError(t("admin.registryMissing"));
      return;
    }

    try {
      tx.setAwaitingSignature();
      const hash = await writeContractAsync({
        address: contracts.gameRegistry,
        chainId: bscChain.id,
        abi: gameRegistryAbi,
        functionName: "setGameEnabled",
        args: [gameId, enabled],
      });
      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("admin.updateGameFailed"));
    }
  }

  return (
    <div className="vault-page-stack">
      <TxStatusBanner phase={tx.phase} hash={tx.hash} errorMessage={tx.errorMessage} />

      <SectionCard title={t("admin.pauseTitle")} description={t("admin.pauseDesc")}>
        <div className="claim-action-row">
          <div className="claim-action-copy">
            <strong>{paused.data ? t("admin.paused") : t("admin.running")}</strong>
            <span>{paused.data ? t("admin.onlyAdminCanResume") : t("admin.canPauseHere")}</span>
          </div>
          <div className="claim-action-buttons">
            <button className="warning-button" disabled={actionLocked || !canPause} onClick={() => void handlePauseToggle("pause")}>
              {t("admin.pause")}
            </button>
            <button className="primary-button" disabled={actionLocked || !canUnpause} onClick={() => void handlePauseToggle("unpause")}>
              {t("admin.resume")}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("admin.gamesTitle")}>
        <div className="form-shell">
          {gameAvailability.isLoading ? (
            <div className="empty-state">{t("admin.loadingGameStates")}</div>
          ) : (
            <div className="portfolio-grid">
              {Object.values(gameAvailability.games).map((game) => (
                <div key={game.key} className="portfolio-card">
                  <span>{game.label}</span>
                  <strong>{game.enabled ? t("admin.online") : t("admin.offline")}</strong>
                  <div className="claim-action-buttons">
                    <button
                      className={game.enabled ? "warning-button" : "primary-button"}
                      disabled={actionLocked || !canManageGames}
                      onClick={() => void handleToggleGame(game.gameId, !game.enabled)}
                    >
                      {game.enabled ? t("admin.disableGame") : t("admin.enableGame")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!canManageGames ? (
            <div className="status-banner">
              <strong>{t("admin.noGamePermissionTitle")}</strong>
              <span>{t("admin.noGamePermissionDesc")}</span>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title={t("admin.snapshotTitle")} description={t("admin.snapshotDesc")}>
        <div className="claim-action-row">
          <div className="claim-action-copy">
            <strong>UTC+8 Day #{currentDay.data?.toString() || "--"}</strong>
            <span>{snapshotSummary}</span>
          </div>
          <div className="claim-action-buttons">
            <button className="primary-button" disabled={actionLocked || !canRunSnapshot} onClick={() => void handleRunSnapshot()}>
              {t("admin.runSnapshot")}
            </button>
          </div>
        </div>
        {hasTodaySnapshot ? (
          <div className="status-banner">
            <strong>{t("admin.snapshotExistsTitle")}</strong>
            <span>{t("admin.snapshotExistsDesc")}</span>
          </div>
        ) : null}
      </SectionCard>

      <AdminDividendClaimCard address={address} currentDay={currentDay.data} />

      <SectionCard title={t("admin.refundTitle")} description={t("admin.refundDesc")}>
        <div className="form-shell">
          <label>
            <span>{t("admin.betId")}</span>
            <input
              inputMode="numeric"
              placeholder={t("admin.betIdPlaceholder")}
              value={refundBetIdInput}
              onChange={(event) => {
                const nextValue = event.target.value.replace(/[^\d]/g, "");
                setRefundBetIdInput(nextValue);
              }}
            />
          </label>

          {pendingBet.data ? (
            <div className="status-rail">
              <div className="summary-row">
                <span>{t("admin.player")}</span>
                <strong>{refundPlayer && refundPlayer !== "0x0000000000000000000000000000000000000000" ? shortAddress(refundPlayer) : "--"}</strong>
              </div>
              <div className="summary-row">
                <span>{t("admin.status")}</span>
                <strong>{betStatusText[refundStatus] ?? t("admin.statusUnknown")}</strong>
              </div>
              <div className="summary-row">
                <span>{t("admin.wager")}</span>
                <strong>{refundWager ? `${Number(formatEther(refundWager)).toLocaleString(numberLocale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} ${t("common.tokenName")}` : "--"}</strong>
              </div>
            </div>
          ) : null}

          <div className="claim-action-buttons">
            <button className="warning-button" disabled={actionLocked || !canRefundPendingBet} onClick={() => void handleRefundBet()}>
              {t("admin.refundBet")}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
