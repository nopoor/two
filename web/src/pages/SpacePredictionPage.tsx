import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { decodeAbiParameters, encodeAbiParameters, formatEther, keccak256, parseAbiItem, parseEther, stringToHex } from "viem";
import { usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { TxStatusBanner } from "../components/TxStatusBanner";
import { erc20Abi } from "../abi/common";
import { gameManagerAbi, referralRegistryAbi } from "../abi/gamefi";
import { contracts } from "../config/contracts";
import { bscChain } from "../config/chains";
import { useDappAccess } from "../hooks/useDappAccess";
import { useReferralLanding } from "../hooks/useReferralLanding";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useTxFlow } from "../hooks/useTxFlow";
import { shortAddress } from "../lib/format";
import { zeroAddress } from "../lib/referral";

const coinFlipGameId = keccak256(stringToHex("COIN_FLIP"));
const maxAllowance = (2n ** 256n) - 1n;
const tokenDisplayName = "分红银行";
const wagerMultipliers = [1, 2, 3];
const maxWagerMultiplier = wagerMultipliers[wagerMultipliers.length - 1];

const betSettledEvent = parseAbiItem(
  "event BetSettled(uint256 indexed betId, uint256 indexed requestId, bytes32 indexed gameId, address player, bool won, uint256 grossProfit, uint256 playerPayout, uint256 burnAmount, uint256 incomeAmount, uint256 referralAmount, bytes resultData)"
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

function formatDisplayToken(value?: bigint, fractionDigits = 2) {
  if (value === undefined) return "--";
  return Number(formatEther(value)).toLocaleString("zh-CN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatBankrollUnits(units: number) {
  return (units * 1000).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function SpacePredictionPanel({ showBackLink = false }: SpacePredictionPanelProps) {
  const tx = useTxFlow();
  const sound = useSoundEffects();
  const access = useDappAccess();
  const referralLanding = useReferralLanding(access.address);
  const publicClient = usePublicClient({ chainId: bscChain.id });
  const { writeContractAsync } = useWriteContract();
  const [actionMode, setActionMode] = useState<"approve" | "bet">("bet");
  const [wagerUnits, setWagerUnits] = useState("1");
  const [guessUp, setGuessUp] = useState(true);
  const [trackedBetId, setTrackedBetId] = useState<bigint | undefined>();
  const [trackedFromBlock, setTrackedFromBlock] = useState<bigint | undefined>();
  const [resolvedRound, setResolvedRound] = useState<SpaceRound | undefined>();
  const [refundedBetId, setRefundedBetId] = useState<bigint | undefined>();

  const wagerValue = Number.parseFloat(wagerUnits);
  const normalizedWager = Number.isFinite(wagerValue) && wagerValue > 0 ? clamp(Math.round(wagerValue), 1, maxWagerMultiplier) : 0;
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
  const boundReferrer = referralStats.data?.[0] && referralStats.data[0] !== zeroAddress ? referralStats.data[0] : undefined;
  const hasReferrerConflict = Boolean(boundReferrer && referrer && boundReferrer.toLowerCase() !== referrer.toLowerCase());
  const effectiveReferrer = boundReferrer ?? referrer;
  const writeDisabled = actionLocked || normalizedWager === 0 || hasPendingBet || trackedBetId !== undefined;
  const maxPayout = wagerPreview ? (wagerPreview * 194n) / 100n : 0n;
  const isResolvingRound =
    actionMode === "bet"
    && (tx.phase === "awaiting-signature"
      || tx.phase === "sending"
      || tx.phase === "confirming"
      || (trackedBetId !== undefined && resolvedRound === undefined));

  const actionConfig =
    access.writeState === "ready" && needsApproval
      ? {
          label: "授权飞船仓位",
          hint: "首次进入经典模式，先授权金库扣款。",
          disabled: writeDisabled,
          onClick: approveToken,
        }
      : access.writeState === "ready"
        ? {
            label: guessUp ? "部署上冲仓位" : "部署下坠仓位",
            hint: "",
            disabled: writeDisabled,
            onClick: placeBet,
          }
        : {
            label: access.getActionConfig("进入飞船模式", "").label,
            hint: access.getActionConfig("进入飞船模式", "").hint,
            disabled: access.getActionConfig("进入飞船模式", "").disabled,
            onClick: access.getActionConfig("进入飞船模式", "").onClick,
          };
  const actionHint = hasReferrerConflict && boundReferrer
    ? `检测到历史邀请缓存，当前下注将按已绑定邀请人 ${shortAddress(boundReferrer)} 结算。`
    : actionConfig.hint;

  useEffect(() => {
    if (actionMode !== "bet" || tx.phase !== "success") return;
    if (tx.receipt?.blockNumber) {
      setTrackedFromBlock(tx.receipt.blockNumber);
    }
    if (pendingBetId.data && pendingBetId.data !== 0n) {
      setTrackedBetId(pendingBetId.data);
      setRefundedBetId(undefined);
    }
  }, [actionMode, pendingBetId.data, tx.phase, tx.receipt?.blockNumber]);

  useEffect(() => {
    if (!publicClient || !contracts.gameManager || trackedBetId === undefined || trackedFromBlock === undefined || resolvedRound) {
      return;
    }

    const client = publicClient;
    const gameManagerAddress = contracts.gameManager;
    const currentTrackedBetId = trackedBetId;
    let cancelled = false;

    async function pollSettlement() {
      try {
        const logs = await client.getLogs({
          address: gameManagerAddress,
          event: betSettledEvent,
          args: { betId: currentTrackedBetId },
          fromBlock: trackedFromBlock,
          toBlock: "latest",
        });

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
          }
          return;
        }

        const latestLog = logs[logs.length - 1];
        if (latestLog.args.gameId !== coinFlipGameId || !latestLog.args.resultData || latestLog.args.playerPayout === undefined || latestLog.args.grossProfit === undefined || latestLog.args.won === undefined) {
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
  }, [publicClient, resolvedRound, trackedBetId, trackedFromBlock]);

  useEffect(() => {
    if (!resolvedRound) return;
    sound.play(resolvedRound.won ? "win" : "coin");
  }, [resolvedRound, sound]);

  async function approveToken() {
    if (!contracts.flapToken || !contracts.bankrollVault) {
      tx.setError("合约地址未配置完成");
      return;
    }

    setActionMode("approve");
    tx.setAwaitingSignature();

    try {
      const hash = await writeContractAsync({
        address: contracts.flapToken,
        chainId: bscChain.id,
        abi: erc20Abi,
        functionName: "approve",
        args: [contracts.bankrollVault, maxAllowance],
      });

      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : "授权失败");
    }
  }

  async function placeBet() {
    if (!contracts.gameManager || !wagerPreview) {
      tx.setError("下注参数未准备完成");
      return;
    }

    setActionMode("bet");
    setResolvedRound(undefined);
    setRefundedBetId(undefined);
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
      tx.setError(error instanceof Error ? error.message : "部署仓位失败");
    }
  }

  return (
    <div className="space-play-page">
      <div className="space-stage-shell">
        <div className="space-stage-hero">
          <div className="space-stage-head">
            <div>
              <strong>星际预测</strong>
            </div>
            {showBackLink ? <Link to="/play" className="space-back-link">返回盲盒</Link> : null}
          </div>

          <div className={`space-ship-board ${isResolvingRound ? "resolving" : ""} ${resolvedRound ? (resolvedRound.landedUp ? "landed-up" : "landed-down") : ""}`.trim()}>
            <div className="space-ship-grid" />
            <div className={`space-ship ${guessUp ? "heading-up" : "heading-down"}`.trim()}>
              <div className="space-ship-hull" />
              <div className="space-ship-engine" />
            </div>
            <div className="space-ship-trail" />
          </div>

          <div className="space-direction-switch">
            <button
              type="button"
              className={`space-direction-button ${guessUp ? "active" : ""}`.trim()}
              onClick={() => setGuessUp(true)}
            >
              看涨飞升
            </button>
            <button
              type="button"
              className={`space-direction-button ${!guessUp ? "active" : ""}`.trim()}
              onClick={() => setGuessUp(false)}
            >
              看跌坠落
            </button>
          </div>

        </div>

        <div className="space-control-card">
          <div className="space-control-head">
            <div>
              <span>本次投入</span>
              <strong>{formatBankrollUnits(normalizedWager || 1)} {tokenDisplayName}</strong>
            </div>
            <div>
              <span>理论极奖</span>
              <strong>{wagerPreview ? `${formatDisplayToken(maxPayout)} ${tokenDisplayName}` : "--"}</strong>
            </div>
          </div>

          <div className="space-chip-row">
            {wagerMultipliers.map((value) => (
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

          <button
            type="button"
            className={`space-primary-button ${guessUp ? "up" : "down"}`.trim()}
            onClick={() => void actionConfig.onClick()}
            disabled={actionConfig.disabled}
          >
            {actionConfig.label}
          </button>
          {actionHint ? <p className="space-action-hint">{actionHint}</p> : null}
          <TxStatusBanner phase={tx.phase} hash={tx.hash} errorMessage={tx.errorMessage} />
          {refundedBetId !== undefined ? (
            <div className="status-banner status-banner-warning">
              <strong>本轮已退款</strong>
              <span>注单 #{refundedBetId.toString()} 未完成开奖，运营已退回本轮投入。</span>
            </div>
          ) : null}
        </div>

        {resolvedRound ? (
          <div className={`space-result-card ${resolvedRound.won ? "success" : "failure"}`.trim()}>
            <div>
              <span>本轮结果</span>
              <strong>{resolvedRound.landedUp ? "UP" : "DOWN"}</strong>
            </div>
            <div>
              <span>你的判断</span>
              <strong>{resolvedRound.guessUp ? "UP" : "DOWN"}</strong>
            </div>
            <div>
              <span>到账金额</span>
              <strong>{resolvedRound.won ? `${formatDisplayToken(resolvedRound.playerPayout)} ${tokenDisplayName}` : `0 ${tokenDisplayName}`}</strong>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SpacePredictionPage() {
  return <SpacePredictionPanel showBackLink />;
}
