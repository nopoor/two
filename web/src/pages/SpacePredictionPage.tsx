import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { decodeAbiParameters, decodeEventLog, encodeAbiParameters, formatEther, maxUint256, parseAbiItem, parseEther } from "viem";
import { usePublicClient, useReadContract, useWriteContract } from "wagmi";

import { erc20Abi } from "../abi/common";
import { gameManagerAbi, referralRegistryAbi } from "../abi/gamefi";
import { TxStatusBanner } from "../components/TxStatusBanner";
import { bscChain } from "../config/chains";
import { contracts } from "../config/contracts";
import { useDappAccess } from "../hooks/useDappAccess";
import { useGameAvailability } from "../hooks/useGameAvailability";
import { useReferralLanding } from "../hooks/useReferralLanding";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useTxFlow } from "../hooks/useTxFlow";
import { useI18n } from "../i18n/LanguageProvider";
import { shortAddress } from "../lib/format";
import { coinFlipGameId } from "../lib/gameCatalog";
import { clearPendingRound, readPendingRound, savePendingRound } from "../lib/pendingRound";
import { zeroAddress } from "../lib/referral";

const recentRecoveryWindow = 2_000n;
const settlementPollChunkSize = 250n;
const staleRoundTtlMs = 2 * 60 * 1000;
const quickWagerMultipliers = [1, 5, 15];
const maxWagerMultiplier = 15;

const betSettledEvent = parseAbiItem(
  "event BetSettled(uint256 indexed betId, uint256 indexed requestId, bytes32 indexed gameId, address player, bool won, uint256 grossProfit, uint256 playerPayout, uint256 burnAmount, uint256 incomeAmount, uint256 referralAmount, bytes resultData)"
);

const betPlacedEvent = parseAbiItem(
  "event BetPlaced(uint256 indexed betId, uint256 indexed requestId, bytes32 indexed gameId, address player, uint256 wager, uint256 maxProfit, address referrer)"
);

type SpaceRound = {
  betId: bigint;
  won: boolean;
  playerPayout: bigint;
  grossProfit: bigint;
  guessUp: boolean;
  landedUp: boolean;
};

type SpacePredictionPanelProps = {
  showBackLink?: boolean;
};

type ResultRevealPhase = "idle" | "impact" | "card";

function formatDisplayToken(value: bigint | undefined, numberLocale: string, fractionDigits = 2) {
  if (value === undefined) return "--";
  return Number(formatEther(value)).toLocaleString(numberLocale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatBankrollUnits(units: number, numberLocale: string) {
  return (units * 1000).toLocaleString(numberLocale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeWagerUnits(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return clamp(parsed, 1, maxWagerMultiplier);
}

export function SpacePredictionPanel({ showBackLink = false }: SpacePredictionPanelProps) {
  const tx = useTxFlow();
  const sound = useSoundEffects();
  const access = useDappAccess();
  const { numberLocale, t } = useI18n();
  const referralLanding = useReferralLanding(access.address);
  const publicClient = usePublicClient({ chainId: bscChain.id });
  const { writeContractAsync } = useWriteContract();
  const lastApprovalHashRef = useRef<`0x${string}` | undefined>();

  const [actionMode, setActionMode] = useState<"approve" | "bet">("bet");
  const [wagerUnits, setWagerUnits] = useState("1");
  const [guessUp, setGuessUp] = useState(true);
  const [submittedGuessUp, setSubmittedGuessUp] = useState<boolean | undefined>();
  const [trackedBetId, setTrackedBetId] = useState<bigint | undefined>();
  const [trackedFromBlock, setTrackedFromBlock] = useState<bigint | undefined>();
  const [resolvedRound, setResolvedRound] = useState<SpaceRound | undefined>();
  const [refundedBetId, setRefundedBetId] = useState<bigint | undefined>();
  const [revealPhase, setRevealPhase] = useState<ResultRevealPhase>("idle");

  const normalizedWager = normalizeWagerUnits(wagerUnits);
  const wagerPreview = normalizedWager > 0 ? parseEther(String(normalizedWager * 1000)) : undefined;
  const referrer = referralLanding.cachedReferrer as `0x${string}` | undefined;
  const actionLocked = tx.phase === "awaiting-signature" || tx.phase === "sending" || tx.phase === "confirming";

  const allowance = useReadContract({
    address: contracts.flapToken,
    chainId: bscChain.id,
    abi: erc20Abi,
    functionName: "allowance",
    args: access.address && contracts.bankrollVault ? [access.address, contracts.bankrollVault] : undefined,
    query: {
      enabled: Boolean(contracts.flapToken && contracts.bankrollVault && access.address),
    },
  });

  const pendingBetId = useReadContract({
    address: contracts.gameManager,
    chainId: bscChain.id,
    abi: gameManagerAbi,
    functionName: "pendingBetOf",
    args: access.activeAddress ? [access.activeAddress] : undefined,
    query: {
      enabled: Boolean(contracts.gameManager && access.activeAddress),
    },
  });

  const referralStats = useReadContract({
    address: contracts.referralRegistry,
    chainId: bscChain.id,
    abi: referralRegistryAbi,
    functionName: "getReferralStats",
    args: access.activeAddress ? [access.activeAddress] : undefined,
    query: {
      enabled: Boolean(contracts.referralRegistry && access.activeAddress),
    },
  });

  const needsApproval = Boolean(wagerPreview && allowance.data !== undefined && allowance.data < wagerPreview);
  const hasPendingBet = pendingBetId.data !== undefined && pendingBetId.data !== 0n;
  const isPendingBetLookupSettled = pendingBetId.data !== undefined && !pendingBetId.isFetching;
  const boundReferrer = referralStats.data?.[0] && referralStats.data[0] !== zeroAddress ? referralStats.data[0] : undefined;
  const hasReferrerConflict = Boolean(boundReferrer && referrer && boundReferrer.toLowerCase() !== referrer.toLowerCase());
  const effectiveReferrer = boundReferrer ?? referrer;
  const writeDisabled = actionLocked || normalizedWager === 0 || hasPendingBet || trackedBetId !== undefined;
  const maxPayout = wagerPreview ? (wagerPreview * 194n) / 100n : 0n;
  const tokenDisplayName = t("common.tokenName");

  const isResolvingRound =
    actionMode === "bet"
    && (
      tx.phase === "awaiting-signature"
      || tx.phase === "sending"
      || tx.phase === "confirming"
      || (trackedBetId !== undefined && resolvedRound === undefined)
    );
  const displayedGuessUp = isResolvingRound ? (submittedGuessUp ?? guessUp) : guessUp;

  const showResultCard = resolvedRound !== undefined && revealPhase === "card";

  const boardOverlayTitle = isResolvingRound
    ? t("space.locking")
    : resolvedRound
      ? (resolvedRound.landedUp ? t("common.up") : t("common.down"))
      : (displayedGuessUp ? `${t("common.up")} ROUTE` : `${t("common.down")} ROUTE`);

  const boardOverlaySubtitle = isResolvingRound
    ? t("space.waitingStarMap")
    : resolvedRound
      ? (resolvedRound.won ? t("space.hitRoute") : t("space.missedRoute"))
      : (displayedGuessUp ? t("space.guessUp") : t("space.guessDown"));

  const boardClassName = [
    "space-ship-board",
    isResolvingRound ? "resolving" : "",
    resolvedRound ? `outcome-${resolvedRound.landedUp ? "up" : "down"}` : "",
    resolvedRound ? `outcome-${resolvedRound.won ? "win" : "loss"}` : "",
    resolvedRound && revealPhase === "impact" ? "result-impact" : "",
    resolvedRound && revealPhase === "card" ? "result-settled" : "",
  ].filter(Boolean).join(" ");

  const shipClassName = [
    "space-ship",
    displayedGuessUp ? "heading-up" : "heading-down",
    isResolvingRound ? "charging" : "",
    resolvedRound && revealPhase === "impact"
      ? (resolvedRound.landedUp ? "burst-up" : "burst-down")
      : "",
  ].filter(Boolean).join(" ");

  const actionConfig =
    access.writeState === "ready" && needsApproval
      ? {
          label: t("space.approveLabel"),
          hint: t("space.approveHint"),
          disabled: writeDisabled,
          onClick: approveToken,
        }
      : access.writeState === "ready"
        ? {
            label: guessUp ? t("space.placeUpLabel") : t("space.placeDownLabel"),
            hint: "",
            disabled: writeDisabled,
            onClick: placeBet,
          }
        : {
            label: access.getActionConfig(t("game.mode.space"), "").label,
            hint: access.getActionConfig(t("game.mode.space"), "").hint,
            disabled: access.getActionConfig(t("game.mode.space"), "").disabled,
            onClick: access.getActionConfig(t("game.mode.space"), "").onClick,
          };

  const actionHint = hasReferrerConflict && boundReferrer
    ? t("space.referrerConflict", { referrer: shortAddress(boundReferrer) })
    : actionConfig.hint;
  
  const hasStalePendingRound =
    trackedBetId !== undefined
    && !hasPendingBet
    && isPendingBetLookupSettled
    && resolvedRound === undefined
    && refundedBetId === undefined
    && tx.phase !== "sending"
    && tx.phase !== "confirming";  

  function handleWagerInputChange(value: string) {
    const digitsOnly = value.replace(/[^\d]/g, "").slice(0, 2);
    setWagerUnits(digitsOnly);
  }

  function handleWagerInputBlur() {
    setWagerUnits(String(normalizedWager || 1));
  }
  useEffect(() => {
    if (actionMode !== "approve" || tx.phase !== "success" || !tx.hash) return;
    if (lastApprovalHashRef.current === tx.hash) return;

    lastApprovalHashRef.current = tx.hash;
    setActionMode("bet");
    void allowance.refetch();
  }, [actionMode, allowance.refetch, tx.hash, tx.phase]);
  
  useEffect(() => {
  const activeAddress = access.activeAddress;
  if (!activeAddress || !hasStalePendingRound) return;

  const stored = readPendingRound(activeAddress, "coin-flip");
  if (!stored) return;

  const clearRound = () => {
    clearPendingRound(activeAddress, "coin-flip");
    setTrackedBetId(undefined);
    setTrackedFromBlock(undefined);
    setResolvedRound(undefined);
    setRefundedBetId(undefined);
    setRevealPhase("idle");
    setSubmittedGuessUp(undefined);
  };

  const ageMs = Date.now() - stored.createdAt;
  if (ageMs >= staleRoundTtlMs) {
    clearRound();
    return;
  }

  const timer = window.setTimeout(clearRound, staleRoundTtlMs - ageMs);
  return () => window.clearTimeout(timer);
}, [access.activeAddress, hasStalePendingRound]);

  function clearStalePendingRound() {
  if (access.activeAddress) {
    clearPendingRound(access.activeAddress, "coin-flip");
  }
  setTrackedBetId(undefined);
  setTrackedFromBlock(undefined);
  setResolvedRound(undefined);
  setRefundedBetId(undefined);
  setRevealPhase("idle");
  setSubmittedGuessUp(undefined);
  }

  useEffect(() => {
    if (actionMode !== "bet" || tx.phase !== "success") return;
    if (!tx.receipt?.blockNumber || !access.activeAddress) return;

    const fromBlock = tx.receipt.blockNumber;
    setTrackedFromBlock(fromBlock);
    void pendingBetId.refetch();

    let placedBetId: bigint | undefined;

    for (const log of tx.receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: [betPlacedEvent],
          data: log.data,
          topics: log.topics,
        });

        if (
          decoded.eventName === "BetPlaced"
          && decoded.args.gameId === coinFlipGameId
          && decoded.args.player
          && decoded.args.player.toLowerCase() === access.activeAddress.toLowerCase()
        ) {
          placedBetId = decoded.args.betId;
        }
      } catch {
        continue;
      }
    }

    if (placedBetId !== undefined) {
      setTrackedBetId(placedBetId);
      setRefundedBetId(undefined);

      savePendingRound({
        wallet: access.activeAddress as `0x${string}`,
        game: "coin-flip",
        betId: placedBetId.toString(),
        fromBlock: fromBlock.toString(),
        txHash: tx.hash,
        createdAt: Date.now(),
        guessUp,
      });

      return;
    }

    if (pendingBetId.data && pendingBetId.data !== 0n) {
      setTrackedBetId(pendingBetId.data);
      setRefundedBetId(undefined);

      savePendingRound({
        wallet: access.activeAddress as `0x${string}`,
        game: "coin-flip",
        betId: pendingBetId.data.toString(),
        fromBlock: fromBlock.toString(),
        txHash: tx.hash,
        createdAt: Date.now(),
        guessUp,
      });
    }
  }, [access.activeAddress, actionMode, guessUp, pendingBetId.data, pendingBetId.refetch, tx.hash, tx.phase, tx.receipt]);

  useEffect(() => {
    if (!publicClient || !access.activeAddress || resolvedRound) return;
    if (trackedBetId !== undefined) return;
    const client = publicClient;
    const stored = readPendingRound(access.activeAddress, "coin-flip");
    let cancelled = false;

    async function recoverPendingRound() {
      if (pendingBetId.data && pendingBetId.data !== 0n) {
        const latestBlock = await client.getBlockNumber();
        if (cancelled) return;

        const storedFromBlock = stored ? BigInt(stored.fromBlock) : undefined;
        const fallbackFromBlock = latestBlock > recentRecoveryWindow ? latestBlock - recentRecoveryWindow : 0n;

        setTrackedBetId(pendingBetId.data);
        setTrackedFromBlock(storedFromBlock ?? fallbackFromBlock);
        setSubmittedGuessUp(stored?.guessUp);
        return;
      }

      if (!stored) return;

      const latestBlock = await client.getBlockNumber();
      if (cancelled) return;

      const storedFromBlock = BigInt(stored.fromBlock);
      const minFromBlock = latestBlock > recentRecoveryWindow ? latestBlock - recentRecoveryWindow : 0n;

      setTrackedBetId(BigInt(stored.betId));
      setTrackedFromBlock(storedFromBlock > minFromBlock ? storedFromBlock : minFromBlock);
      setSubmittedGuessUp(stored.guessUp);
    }

    void recoverPendingRound();

    return () => {
      cancelled = true;
    };
  }, [access.activeAddress, pendingBetId.data, publicClient, resolvedRound, trackedBetId]);

  useEffect(() => {
    if (!resolvedRound) return;

    setRevealPhase("impact");
    const timer = window.setTimeout(() => {
      setRevealPhase("card");
    }, 650);

    return () => window.clearTimeout(timer);
  }, [resolvedRound]);

  useEffect(() => {
    if (!publicClient || !contracts.gameManager || trackedBetId === undefined || trackedFromBlock === undefined || resolvedRound) {
      return;
    }

    const client = publicClient;
    const gameManagerAddress = contracts.gameManager;
    const currentTrackedBetId = trackedBetId;
    let cancelled = false;
    let nextFromBlock = trackedFromBlock;

    async function pollSettlement() {
      try {
        const latestBlock = await client.getBlockNumber();
        if (cancelled || latestBlock < nextFromBlock) return;

        const toBlock =
          nextFromBlock + settlementPollChunkSize < latestBlock
            ? nextFromBlock + settlementPollChunkSize
            : latestBlock;

        const logs = await client.getLogs({
          address: gameManagerAddress,
          event: betSettledEvent,
          args: { betId: currentTrackedBetId },
          fromBlock: nextFromBlock,
          toBlock,
        });

        nextFromBlock = toBlock + 1n;

        if (cancelled) return;

        if (logs.length === 0) {
          const pendingBet = await client.readContract({
            address: gameManagerAddress,
            abi: gameManagerAbi,
            functionName: "pendingBets",
            args: [currentTrackedBetId],
          });

          if (cancelled) return;

          if (pendingBet[7] === 3) {
            setResolvedRound(undefined);
            setTrackedBetId(undefined);
            setTrackedFromBlock(undefined);
            setRefundedBetId(currentTrackedBetId);
            setRevealPhase("idle");
            setSubmittedGuessUp(undefined);

            if (access.activeAddress) {
              clearPendingRound(access.activeAddress, "coin-flip");
            }
            void pendingBetId.refetch();
            void allowance.refetch();
          }

          return;
        }

        const latestLog = logs[logs.length - 1];
        if (
          latestLog.args.gameId !== coinFlipGameId
          || !latestLog.args.resultData
          || latestLog.args.playerPayout === undefined
          || latestLog.args.grossProfit === undefined
          || latestLog.args.won === undefined
        ) {
          return;
        }

        const [loggedGuessHeads, landedHeads] = decodeAbiParameters(
          [
            { name: "guessHeads", type: "bool" },
            { name: "landedHeads", type: "bool" },
          ],
          latestLog.args.resultData
        );

        setResolvedRound({
          betId: currentTrackedBetId,
          won: latestLog.args.won,
          playerPayout: latestLog.args.playerPayout,
          grossProfit: latestLog.args.grossProfit,
          guessUp: loggedGuessHeads,
          landedUp: landedHeads,
        });
        setTrackedBetId(undefined);
        setTrackedFromBlock(undefined);
        setRefundedBetId(undefined);

        if (access.activeAddress) {
          clearPendingRound(access.activeAddress, "coin-flip");
        }
        void pendingBetId.refetch();
        void allowance.refetch();
      } catch (error) {
        console.warn("Failed to poll coin flip settlement", error);
      }
    }

    void pollSettlement();
    const intervalId = window.setInterval(() => {
      void pollSettlement();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [access.activeAddress, publicClient, resolvedRound, trackedBetId, trackedFromBlock]);

  useEffect(() => {
    if (!resolvedRound) return;
    sound.play(resolvedRound.won ? "win" : "coin");
  }, [resolvedRound, sound]);

  async function approveToken() {
    if (!contracts.flapToken || !contracts.bankrollVault || !wagerPreview) {
      tx.setError(t("space.contractMissing"));
      return;
    }

    const approvalAmount = maxUint256;

    setActionMode("approve");
    tx.setAwaitingSignature();

    try {
      const hash = await writeContractAsync({
        address: contracts.flapToken,
        chainId: bscChain.id,
        abi: erc20Abi,
        functionName: "approve",
        args: [contracts.bankrollVault, approvalAmount],
      });

      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("space.approveFailed"));
    }
  }

  async function placeBet() {
    if (!contracts.gameManager || !wagerPreview) {
      tx.setError(t("space.betParamsMissing"));
      return;
    }

    setActionMode("bet");
    setResolvedRound(undefined);
    setRefundedBetId(undefined);
    setRevealPhase("idle");
    setSubmittedGuessUp(guessUp);
    tx.setAwaitingSignature();

    try {
      const hash = await writeContractAsync({
        address: contracts.gameManager,
        chainId: bscChain.id,
        abi: gameManagerAbi,
        functionName: "placeBet",
        args: [
          coinFlipGameId,
          wagerPreview,
          effectiveReferrer ?? zeroAddress,
          encodeAbiParameters([{ name: "guessHeads", type: "bool" }], [guessUp]),
        ],
      });

      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("space.placeBetFailed"));
    }
  }

  return (
    <div className="space-play-page">
      <div className="space-stage-shell">
        <div className="space-stage-hero">
          <div className="space-stage-head">
            <div>
              <strong>{t("space.pageTitle")}</strong>
            </div>
            {showBackLink ? (
              <Link to="/play" className="space-back-link">
                {t("space.backToLobby")}
              </Link>
            ) : null}
          </div>

          <div className={boardClassName}>
            <div className="space-ship-grid" />
            <div className={shipClassName}>
              <div className="space-ship-hull" />
              <div className="space-ship-engine" />
            </div>
            <div className="space-ship-trail" />
            <div
              className={`space-board-overlay ${(isResolvingRound || resolvedRound) ? "visible" : ""} ${
                resolvedRound ? (resolvedRound.won ? "success" : "failure") : ""
              }`.trim()}
            >
              <span className="space-board-overlay-badge">{boardOverlayTitle}</span>
              <strong>{boardOverlaySubtitle}</strong>
            </div>
          </div>

          <div className="space-direction-switch">
            <button
              type="button"
              className={`space-direction-button ${displayedGuessUp ? "active" : ""}`.trim()}
              onClick={() => setGuessUp(true)}
              disabled={isResolvingRound}
            >
              {t("space.guessUp")}
            </button>
            <button
              type="button"
              className={`space-direction-button ${!displayedGuessUp ? "active" : ""}`.trim()}
              onClick={() => setGuessUp(false)}
              disabled={isResolvingRound}
            >
              {t("space.guessDown")}
            </button>
          </div>
        </div>

        <div className="space-control-card">
          <div className="space-control-head">
            <div>
              <span>{t("space.currentStake")}</span>
              <strong>{formatBankrollUnits(normalizedWager || 1, numberLocale)} {tokenDisplayName}</strong>
            </div>
            <div>
              <span>{t("space.maxPayout")}</span>
              <strong>
                {wagerPreview ? `${formatDisplayToken(maxPayout, numberLocale)} ${tokenDisplayName}` : "--"}
              </strong>
            </div>
          </div>

          <div className="wager-control-stack">
            <span className="wager-input-label">{t("common.quickPicks")}</span>
            <div className="space-chip-row">
              {quickWagerMultipliers.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`space-chip ${normalizedWager === value ? "active" : ""}`.trim()}
                  onClick={() => setWagerUnits(String(value))}
                >
                  x{value}
                </button>
              ))}
            </div>

            <div className="wager-input-row">
              <span className="wager-input-label">{t("common.customMultiplier")}</span>
              <label className="wager-input-shell">
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={wagerUnits}
                  onChange={(event) => handleWagerInputChange(event.target.value)}
                  onBlur={handleWagerInputBlur}
                  placeholder="1-15"
                  aria-label={t("common.customMultiplier")}
                />
                <strong>{t("common.multiplierHint")}</strong>
              </label>
            </div>
          </div>

          <button
            type="button"
            className={`space-primary-button ${displayedGuessUp ? "up" : "down"}`.trim()}
            onClick={() => void actionConfig.onClick()}
            disabled={actionConfig.disabled}
          >
            {actionConfig.label}
          </button>

          {actionHint ? <p className="space-action-hint">{actionHint}</p> : null}

          <TxStatusBanner phase={tx.phase} hash={tx.hash} errorMessage={tx.errorMessage} />
          {hasStalePendingRound ? (
            <div className="status-banner status-banner-warning">
              <strong>状态同步中断</strong>
              <span>链上已无待开奖注单，但前端仍保留了上一局状态。可清除本地状态后继续。</span>
              <button type="button" className="ghost-button" onClick={clearStalePendingRound}>
                清除卡住状态
              </button>
            </div>
          ) : null}

          {refundedBetId !== undefined ? (
            <div className="status-banner status-banner-warning">
              <strong>{t("common.roundRefunded")}</strong>
              <span>{t("space.roundRefundedDetail", { betId: refundedBetId.toString() })}</span>
            </div>
          ) : null}
        </div>

        {showResultCard && resolvedRound ? (
          <div className={`space-result-card ${resolvedRound.won ? "success" : "failure"}`.trim()}>
            <div>
              <span>{t("common.roundResult")}</span>
              <strong>{resolvedRound.landedUp ? t("common.up") : t("common.down")}</strong>
            </div>
            <div>
              <span>{t("space.yourGuess")}</span>
              <strong>{resolvedRound.guessUp ? t("common.up") : t("common.down")}</strong>
            </div>
            <div>
              <span>{t("common.payout")}</span>
              <strong>
                {resolvedRound.won
                  ? `${formatDisplayToken(resolvedRound.playerPayout, numberLocale)} ${tokenDisplayName}`
                  : `0 ${tokenDisplayName}`}
              </strong>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SpacePredictionPage() {
  const gameAvailability = useGameAvailability();
  const { t } = useI18n();

  if (gameAvailability.isLoading) {
    return <div className="section-card compact">{t("common.loadingGameStatus")}</div>;
  }

  if (!gameAvailability.games.space.enabled) {
    return <Navigate to="/play" replace />;
  }

  return <SpacePredictionPanel showBackLink />;
}
