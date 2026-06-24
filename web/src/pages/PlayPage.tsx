import { fetchFeed } from "../lib/feedApi";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeAbiParameters, decodeEventLog, formatEther, maxUint256, parseAbiItem, parseEther } from "viem";
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
import { formatToken, shortAddress } from "../lib/format";
import { coinFlipGameId, mysteryBoxGameId, type PublicGameMode } from "../lib/gameCatalog";
import { clearPendingRound, readPendingRound, savePendingRound } from "../lib/pendingRound";
import { zeroAddress } from "../lib/referral";
import { SpacePredictionPanel } from "./SpacePredictionPage";

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

type PlayTab = "open" | "live" | "odds" | "me" | "space" | "spaceHistory" | "spaceMe";

type BoxTier = {
  index: number;
  id: "legendary" | "epic" | "rare" | "common" | "empty";
  label: string;
  teaser: string;
  icon: string;
  probabilityLabel: string;
  grossMultiplierBps: number;
  payoutMultiplierBps: number;
  accentClass: string;
};

type ResolvedRound = {
  betId: bigint;
  player: `0x${string}`;
  won: boolean;
  grossProfit: bigint;
  playerPayout: bigint;
  tier: BoxTier;
  outcome: number;
  grossMultiplierBps: number;
};

type DiscoveryFeedItem = {
  key: string;
  betId: bigint;
  player: `0x${string}`;
  playerPayout: bigint;
  outcome: number;
  won: boolean;
  tier: BoxTier;
};

type SpaceFeedItem = {
  key: string;
  betId: bigint;
  player: `0x${string}`;
  playerPayout: bigint;
  won: boolean;
  guessUp: boolean;
  landedUp: boolean;
};

function getBoxNavItems(t: (key: string) => string) {
  return [
    { key: "open", label: t("play.tab.open"), icon: "◆" },
    { key: "live", label: t("play.tab.live"), icon: "▤" },
    { key: "odds", label: t("play.tab.odds"), icon: "ⓘ" },
    { key: "me", label: t("play.tab.me"), icon: "◉" },
  ] satisfies Array<{ key: PlayTab; label: string; icon: string }>;
}

function getSpaceNavItems(t: (key: string) => string) {
  return [
    { key: "space", label: t("play.tab.space"), icon: "▲" },
    { key: "spaceHistory", label: t("play.tab.spaceHistory"), icon: "▤" },
    { key: "spaceMe", label: t("play.tab.spaceMe"), icon: "◉" },
  ] satisfies Array<{ key: PlayTab; label: string; icon: string }>;
}

function getBoxTiers(t: (key: string) => string): BoxTier[] {
  return [
    {
      index: 0,
      id: "legendary",
      label: t("play.tier.legendary.label"),
      teaser: t("play.tier.legendary.teaser"),
      icon: "✦",
      probabilityLabel: "0.04%",
      grossMultiplierBps: 500_000,
      payoutMultiplierBps: 480_000,
      accentClass: "legendary",
    },
    {
      index: 1,
      id: "epic",
      label: t("play.tier.epic.label"),
      teaser: t("play.tier.epic.teaser"),
      icon: "◆",
      probabilityLabel: "0.80%",
      grossMultiplierBps: 150_000,
      payoutMultiplierBps: 151_000,
      accentClass: "epic",
    },
    {
      index: 2,
      id: "rare",
      label: t("play.tier.rare.label"),
      teaser: t("play.tier.rare.teaser"),
      icon: "◈",
      probabilityLabel: "4.16%",
      grossMultiplierBps: 40_000,
      payoutMultiplierBps: 47_600,
      accentClass: "rare",
    },
    {
      index: 3,
      id: "common",
      label: t("play.tier.common.label"),
      teaser: t("play.tier.common.teaser"),
      icon: "□",
      probabilityLabel: "40.00%",
      grossMultiplierBps: 8_500,
      payoutMultiplierBps: 17_990,
      accentClass: "common",
    },
    {
      index: 4,
      id: "empty",
      label: t("play.tier.empty.label"),
      teaser: t("play.tier.empty.teaser"),
      icon: "?",
      probabilityLabel: "55.00%",
      grossMultiplierBps: 0,
      payoutMultiplierBps: 0,
      accentClass: "empty",
    },
  ];
}

function getTierByIndex(index: number, tiers: BoxTier[]) {
  return tiers.find((tier) => tier.index === index) ?? tiers[tiers.length - 1];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeWagerUnits(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return clamp(parsed, 1, maxWagerMultiplier);
}

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

function formatMultiplier(bps: number) {
  return `${(bps / 10_000).toFixed(bps % 10_000 === 0 ? 0 : 2)}x`;
}

function formatOutcome(outcome: number) {
  return outcome.toString().padStart(4, "0");
}

function toDiscoveryItem(round: ResolvedRound): DiscoveryFeedItem {
  return {
    key: round.betId.toString(),
    betId: round.betId,
    player: round.player,
    playerPayout: round.playerPayout,
    outcome: round.outcome,
    won: round.won,
    tier: round.tier,
  };
}

function prependUnique(items: DiscoveryFeedItem[], nextItem: DiscoveryFeedItem, limit: number) {
  const deduped = [nextItem, ...items.filter((item) => item.key !== nextItem.key)];
  return deduped.slice(0, limit);
}


function decodeMysteryBoxResult(resultData: `0x${string}`, tiers: BoxTier[]) {
  const [tierIndex, outcome, grossMultiplierBps] = decodeAbiParameters(
    [
      { name: "tierId", type: "uint8" },
      { name: "outcome", type: "uint16" },
      { name: "grossMultiplierBps", type: "uint32" },
    ],
    resultData
  );

  return {
    tier: getTierByIndex(Number(tierIndex), tiers),
    outcome: Number(outcome),
    grossMultiplierBps: Number(grossMultiplierBps),
  };
}

export function PlayPage() {
  const tx = useTxFlow();
  const sound = useSoundEffects();
  const access = useDappAccess();
  const { numberLocale, t } = useI18n();
  const gameAvailability = useGameAvailability();
  const referralLanding = useReferralLanding(access.address);
  const publicClient = usePublicClient({ chainId: bscChain.id });
  const { writeContractAsync } = useWriteContract();
  const lastResolvedBetRef = useRef<bigint | undefined>();

  const [actionMode, setActionMode] = useState<"approve" | "bet">("bet");
  const [activeTab, setActiveTab] = useState<PlayTab>("open");
  const [activeMode, setActiveMode] = useState<PublicGameMode>("space");
  const [wagerUnits, setWagerUnits] = useState("1");
  const [trackedBetId, setTrackedBetId] = useState<bigint | undefined>();
  const [trackedFromBlock, setTrackedFromBlock] = useState<bigint | undefined>();
  const [resolvedRound, setResolvedRound] = useState<ResolvedRound | undefined>();
  const [recentDiscoveries, setRecentDiscoveries] = useState<DiscoveryFeedItem[]>([]);
  const [myDiscoveries, setMyDiscoveries] = useState<DiscoveryFeedItem[]>([]);
  const [spaceDiscoveries, setSpaceDiscoveries] = useState<SpaceFeedItem[]>([]);
  const [mySpaceDiscoveries, setMySpaceDiscoveries] = useState<SpaceFeedItem[]>([]);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [refundedBetId, setRefundedBetId] = useState<bigint | undefined>();

  const tokenDisplayName = t("common.tokenName");
  const mysteryBoxShareTitle = t("play.shareTitle");
  const livePoolLabel = t("play.livePoolLabel");
  const boxNavItems = getBoxNavItems(t);
  const spaceNavItems = getSpaceNavItems(t);
  const boxTiers = useMemo(() => getBoxTiers(t), [t]);
  const tierById = useMemo(
    () => Object.fromEntries(boxTiers.map((tier) => [tier.id, tier])) as Record<BoxTier["id"], BoxTier>,
    [boxTiers]
  );

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

  const rewardPool = useReadContract({
    address: contracts.flapToken,
    chainId: bscChain.id,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: contracts.bankrollVault ? [contracts.bankrollVault] : undefined,
    query: {
      enabled: Boolean(contracts.flapToken && contracts.bankrollVault),
    },
  });

  const walletBalance = useReadContract({
    address: contracts.flapToken,
    chainId: bscChain.id,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: access.activeAddress ? [access.activeAddress] : undefined,
    query: {
      enabled: Boolean(contracts.flapToken && access.activeAddress),
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
  const referrerLabel = boundReferrer
    ? shortAddress(boundReferrer)
    : referrer
      ? t("play.referrerPending", { referrer: shortAddress(referrer) })
      : t("play.none");

  const isBoxEnabled = gameAvailability.games.box.enabled;
  const isSpaceEnabled = gameAvailability.games.space.enabled;
  const writeDisabled = actionLocked || normalizedWager === 0 || hasPendingBet || trackedBetId !== undefined;
  const navItems = activeMode === "box" ? boxNavItems : spaceNavItems;
  const primaryTab: PlayTab = activeMode === "box" ? "open" : "space";
  const isSheetOpen = activeTab !== primaryTab;

  const isResolvingRound =
    actionMode === "bet"
    && (
      tx.phase === "awaiting-signature"
      || tx.phase === "sending"
      || tx.phase === "confirming"
      || (trackedBetId !== undefined && resolvedRound === undefined)
    );

  const jackpotPayout = wagerPreview ? (wagerPreview * BigInt(boxTiers[0].payoutMultiplierBps)) / 10_000n : 0n;
  const baseAction = access.getActionConfig(t("play.openBoxLabel"), t("play.openBoxHint"));

  const actionConfig =
    access.writeState === "ready" && needsApproval
      ? {
          label: t("play.approveLabel"),
          hint: t("play.approveHint"),
          disabled: writeDisabled,
          onClick: approveToken,
        }
      : access.writeState === "ready"
        ? {
            label: t("play.openBoxLabel"),
            hint: t("play.openBoxHint"),
            disabled: writeDisabled,
            onClick: placeBet,
          }
        : {
            label: baseAction.label,
            hint: baseAction.hint,
            disabled: baseAction.disabled,
            onClick: baseAction.onClick,
          };

  const stageCaption = isResolvingRound
    ? t("play.stageResolving")
    : resolvedRound
      ? `${resolvedRound.tier.label} · ${resolvedRound.tier.teaser}`
      : t("play.stageDefault");

  const actionHint = hasReferrerConflict && boundReferrer
    ? t("play.referrerConflict", { referrer: shortAddress(boundReferrer) })
    : actionConfig.hint;

  const hasStalePendingRound =
    trackedBetId !== undefined
    && !hasPendingBet
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

  function clearStalePendingRound() {
    if (access.activeAddress) {
      clearPendingRound(access.activeAddress, "mystery-box");
    }
    setTrackedBetId(undefined);
    setTrackedFromBlock(undefined);
    setResolvedRound(undefined);
    setRefundedBetId(undefined);
  }

  const shareLink = typeof window !== "undefined" && access.activeAddress
    ? `${window.location.origin}/play?ref=${access.activeAddress}`
    : "";

  useEffect(() => {
    if (gameAvailability.firstEnabledMode === undefined) return;

    const activeModeEnabled = activeMode === "box" ? isBoxEnabled : isSpaceEnabled;
    if (activeModeEnabled) return;

    setActiveMode(gameAvailability.firstEnabledMode);
    setActiveTab(gameAvailability.firstEnabledMode === "box" ? "open" : "space");
  }, [activeMode, gameAvailability.firstEnabledMode, isBoxEnabled, isSpaceEnabled]);

  useEffect(() => {
    if (navItems.some((item) => item.key === activeTab)) return;
    setActiveTab(primaryTab);
  }, [activeTab, navItems, primaryTab]);

  useEffect(() => {
    if (!copiedShareLink) return undefined;
    const timer = window.setTimeout(() => setCopiedShareLink(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedShareLink]);

  useEffect(() => {
    if (!access.activeAddress || !hasStalePendingRound) return;

    const stored = readPendingRound(access.activeAddress, "mystery-box");
    if (!stored) return;

    const clearRound = () => {
      clearPendingRound(access.activeAddress!, "mystery-box");
      setTrackedBetId(undefined);
      setTrackedFromBlock(undefined);
      setResolvedRound(undefined);
      setRefundedBetId(undefined);
    };

    const ageMs = Date.now() - stored.createdAt;
    if (ageMs >= staleRoundTtlMs) {
      clearRound();
      return;
    }

    const timer = window.setTimeout(clearRound, staleRoundTtlMs - ageMs);
    return () => window.clearTimeout(timer);
  }, [access.activeAddress, hasStalePendingRound]);

  useEffect(() => {
    if (actionMode !== "bet" || tx.phase !== "success") return;
    if (!tx.receipt?.blockNumber || !access.activeAddress) return;

    const fromBlock = tx.receipt.blockNumber;
    setTrackedFromBlock(fromBlock);

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
          && decoded.args.gameId === mysteryBoxGameId
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
        game: "mystery-box",
        betId: placedBetId.toString(),
        fromBlock: fromBlock.toString(),
        txHash: tx.hash,
        createdAt: Date.now(),
      });

      return;
    }

    if (pendingBetId.data && pendingBetId.data !== 0n) {
      setTrackedBetId(pendingBetId.data);
      setRefundedBetId(undefined);

      savePendingRound({
        wallet: access.activeAddress as `0x${string}`,
        game: "mystery-box",
        betId: pendingBetId.data.toString(),
        fromBlock: fromBlock.toString(),
        txHash: tx.hash,
        createdAt: Date.now(),
      });
    }
  }, [access.activeAddress, actionMode, pendingBetId.data, tx.hash, tx.phase, tx.receipt]);

  useEffect(() => {
    if (!publicClient || !access.activeAddress || trackedBetId !== undefined || resolvedRound) return;

    const client = publicClient;
    const stored = readPendingRound(access.activeAddress, "mystery-box");
    let cancelled = false;

    async function recoverPendingRound() {
      if (pendingBetId.data && pendingBetId.data !== 0n) {
        const latestBlock = await client.getBlockNumber();
        if (cancelled) return;

        const storedFromBlock = stored ? BigInt(stored.fromBlock) : undefined;
        const fallbackFromBlock = latestBlock > recentRecoveryWindow ? latestBlock - recentRecoveryWindow : 0n;

        setTrackedBetId(pendingBetId.data);
        setTrackedFromBlock(storedFromBlock ?? fallbackFromBlock);
        return;
        }

        if (!stored) return;

        const latestBlock = await client.getBlockNumber();
        if (cancelled) return;

        const storedFromBlock = BigInt(stored.fromBlock);
        const minFromBlock = latestBlock > recentRecoveryWindow ? latestBlock - recentRecoveryWindow : 0n;

        setTrackedBetId(BigInt(stored.betId));
        setTrackedFromBlock(storedFromBlock > minFromBlock ? storedFromBlock : minFromBlock);
    }

    void recoverPendingRound();

    return () => {
      cancelled = true;
    };
  }, [access.activeAddress, pendingBetId.data, publicClient, resolvedRound, trackedBetId]);

  useEffect(() => {
    if (!publicClient || !contracts.gameManager || trackedBetId === undefined || trackedFromBlock === undefined || resolvedRound) {
      return;
    }

    const client = publicClient;
    const gameManagerAddress = contracts.gameManager;
    let cancelled = false;
    let nextFromBlock = trackedFromBlock;

    const pollSettlement = async () => {
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
          args: { betId: trackedBetId },
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
            args: [trackedBetId],
          });

          if (cancelled) return;

          if (pendingBet[7] === 3) {
            setResolvedRound(undefined);
            setTrackedBetId(undefined);
            setTrackedFromBlock(undefined);
            setRefundedBetId(trackedBetId);

            if (access.activeAddress) {
              clearPendingRound(access.activeAddress, "mystery-box");
            }
          }

          return;
        }

        const latestLog = logs[logs.length - 1];
        if (
          latestLog.args.gameId !== mysteryBoxGameId
          || !latestLog.args.resultData
          || latestLog.args.grossProfit === undefined
          || latestLog.args.playerPayout === undefined
          || latestLog.args.player === undefined
          || latestLog.args.won === undefined
        ) {
          return;
        }

        const decoded = decodeMysteryBoxResult(latestLog.args.resultData, boxTiers);

        setResolvedRound({
          betId: trackedBetId,
          player: latestLog.args.player,
          won: latestLog.args.won,
          grossProfit: latestLog.args.grossProfit,
          playerPayout: latestLog.args.playerPayout,
          tier: decoded.tier,
          outcome: decoded.outcome,
          grossMultiplierBps: decoded.grossMultiplierBps,
        });
        setTrackedBetId(undefined);
        setTrackedFromBlock(undefined);
        setRefundedBetId(undefined);

        if (access.activeAddress) {
          clearPendingRound(access.activeAddress, "mystery-box");
        }
      } catch (error) {
        console.warn("Failed to poll mystery box settlement", error);
      }
    };

    void pollSettlement();
    const intervalId = window.setInterval(() => {
      void pollSettlement();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [access.activeAddress, boxTiers, publicClient, resolvedRound, trackedBetId, trackedFromBlock]);

  useEffect(() => {
    if (!resolvedRound || lastResolvedBetRef.current === resolvedRound.betId) return;

    lastResolvedBetRef.current = resolvedRound.betId;
    const nextItem = toDiscoveryItem(resolvedRound);

    if (resolvedRound.won && resolvedRound.tier.id === "legendary") {
      sound.play("upgrade");
    } else if (resolvedRound.won) {
      sound.play("win");
    } else {
      sound.play("coin");
    }

    setRecentDiscoveries((current) => prependUnique(current, nextItem, 8));

    if (access.activeAddress && resolvedRound.player.toLowerCase() === access.activeAddress.toLowerCase()) {
      setMyDiscoveries((current) => prependUnique(current, nextItem, 8));
    }

    setActiveTab("open");
  }, [access.activeAddress, resolvedRound, sound]);

  useEffect(() => {
    if (!isResolvingRound) return;
    sound.play("spin");
  }, [isResolvingRound, sound]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeedSnapshot() {
      try {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          return;
        }

        const data = await fetchFeed(8);
        if (cancelled) return;

        const nextRecent = data.box.map((item) => ({
          key: item.key,
          betId: BigInt(item.betId),
          player: item.player,
          playerPayout: BigInt(item.playerPayout),
          outcome: item.outcome,
          won: item.won,
          tier: tierById[item.tierId] ?? boxTiers[boxTiers.length - 1],
        }));

        const nextSpace = data.space.map((item) => ({
          key: item.key,
          betId: BigInt(item.betId),
          player: item.player,
          playerPayout: BigInt(item.playerPayout),
          won: item.won,
          guessUp: item.guessUp,
          landedUp: item.landedUp,
        }));

        setRecentDiscoveries(nextRecent);
        setSpaceDiscoveries(nextSpace);

        const activeAddress = access.activeAddress?.toLowerCase();
        if (activeAddress) {
          setMyDiscoveries(nextRecent.filter((item) => item.player.toLowerCase() === activeAddress));
          setMySpaceDiscoveries(nextSpace.filter((item) => item.player.toLowerCase() === activeAddress));
        } else {
          setMyDiscoveries([]);
          setMySpaceDiscoveries([]);
        }
      } catch (error) {
        console.warn("Failed to load feed API", error);
      }
    }

    void loadFeedSnapshot();

    const intervalId = window.setInterval(() => {
      void loadFeedSnapshot();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [access.activeAddress, boxTiers, tierById]);

  async function approveToken() {
    if (!contracts.flapToken || !contracts.bankrollVault || !wagerPreview) {
      tx.setError(t("play.contractMissing"));
      return;
    }

    const approvalAmount = wagerPreview;

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
      tx.setError(error instanceof Error ? error.message : t("play.approveFailed"));
    }
  }

  async function placeBet() {
    if (!contracts.gameManager || !wagerPreview) {
      tx.setError(t("play.betParamsMissing"));
      return;
    }

    setActiveTab("open");
    setActionMode("bet");
    setResolvedRound(undefined);
    setRefundedBetId(undefined);
    setTrackedBetId(undefined);
    setTrackedFromBlock(undefined);
    tx.setAwaitingSignature();

    try {
      const hash = await writeContractAsync({
        address: contracts.gameManager,
        chainId: bscChain.id,
        abi: gameManagerAbi,
        functionName: "placeBet",
        args: [mysteryBoxGameId, wagerPreview, effectiveReferrer ?? zeroAddress, "0x"],
      });

      tx.setHashAndSending(hash);
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : t("play.openFailed"));
    }
  }

  async function copyInviteLink() {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopiedShareLink(true);
    sound.play("coin");
  }

  async function shareInviteLink() {
    if (!shareLink) return;

    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title: mysteryBoxShareTitle,
        text: t("play.shareText"),
        url: shareLink,
      });
      return;
    }

    await copyInviteLink();
  }

  if (gameAvailability.isLoading) {
    return <div className="section-card compact">{t("play.gamesLoading")}</div>;
  }

  if (gameAvailability.hasNoEnabledGames) {
    return (
      <div className="section-card compact">
        <strong>{t("play.gamesClosedTitle")}</strong>
        <p>{t("play.gamesClosedDesc")}</p>
      </div>
    );
  }

  return (
    <div className="capsule-play-page">
      <div className="capsule-stage-shell">
        <div className="capsule-stage-frame">
          <div className="capsule-pool-card">
            <div className="capsule-pool-head">
              <span>{t("play.rewardPool")}</span>
              <span>{livePoolLabel}</span>
            </div>
            <strong>
              {rewardPool.data ? `${formatDisplayToken(rewardPool.data, numberLocale)} ${tokenDisplayName}` : "---"}
            </strong>
            <p>{t("play.rewardPoolDesc")}</p>
          </div>

          <div className="capsule-feed-strip">
            <span className="capsule-feed-dot" />
            <div className="capsule-feed-copy">
              {activeMode === "box"
                ? recentDiscoveries.length > 0
                  ? t("play.feedRecentDiscovery", {
                      tier: recentDiscoveries[0].tier.label,
                      player: shortAddress(recentDiscoveries[0].player),
                    })
                  : t("play.feedRecentDiscoveryWait")
                : spaceDiscoveries.length > 0
                  ? t("play.feedSpaceTrail", {
                      direction: spaceDiscoveries[0].landedUp ? t("common.up") : t("common.down"),
                      player: shortAddress(spaceDiscoveries[0].player),
                    })
                  : t("play.feedSpaceTrailWait")}
            </div>
            <button
              type="button"
              className="capsule-feed-button"
              onClick={() => setActiveTab(activeMode === "box" ? "live" : "spaceHistory")}
            >
              {activeMode === "box" ? t("common.live") : t("common.record")}
            </button>
          </div>

          <div className="play-mode-switch">
            {isSpaceEnabled ? (
              <button
                type="button"
                className={`play-mode-button ${activeMode === "space" ? "active" : ""}`.trim()}
                onClick={() => {
                  setActiveMode("space");
                  setActiveTab("space");
                }}
              >
                <strong>{t("game.mode.space")}</strong>
              </button>
            ) : null}

            {isBoxEnabled ? (
              <button
                type="button"
                className={`play-mode-button ${activeMode === "box" ? "active" : ""}`.trim()}
                onClick={() => {
                  setActiveMode("box");
                  setActiveTab("open");
                }}
              >
                <strong>{t("game.mode.box")}</strong>
              </button>
            ) : null}
          </div>

          {activeMode === "box" ? (
            <>
              <div className="capsule-machine-stage">
                <div
                  className={`capsule-machine ${isResolvingRound ? "opening" : ""} ${
                    resolvedRound ? `revealed ${resolvedRound.tier.accentClass}` : ""
                  }`.trim()}
                >
                  <div className="capsule-machine-glow" />
                  <div className="capsule-machine-core">
                    <div className="capsule-machine-lid">
                      <span>{t("play.modeSeal")}</span>
                    </div>
                    <div className="capsule-machine-window">
                      <span>{resolvedRound ? resolvedRound.tier.icon : "?"}</span>
                    </div>
                    <div className="capsule-machine-corners">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                </div>

                <div className="capsule-machine-caption">
                  <strong>{resolvedRound ? resolvedRound.tier.label : t("play.waitingOpen")}</strong>
                  <span>{stageCaption}</span>
                </div>
              </div>

              <div className="capsule-control-panel">
                <div className="capsule-control-head">
                  <div>
                    <span>{t("play.currentBox")}</span>
                    <strong>
                      {formatBankrollUnits(normalizedWager || 1, numberLocale)} {tokenDisplayName}
                    </strong>
                  </div>
                  <div>
                    <span>{t("play.jackpot")}</span>
                    <strong>
                      {wagerPreview ? `${formatDisplayToken(jackpotPayout, numberLocale)} ${tokenDisplayName}` : "--"}
                    </strong>
                  </div>
                </div>

                <div className="wager-control-stack">
                  <span className="wager-input-label">{t("common.quickPicks")}</span>
                  <div className="capsule-chip-row">
                    {quickWagerMultipliers.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`capsule-chip ${normalizedWager === value ? "active" : ""}`.trim()}
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
                  className={`capsule-primary-button ${needsApproval ? "alt" : ""}`.trim()}
                  onClick={() => void actionConfig.onClick()}
                  disabled={actionConfig.disabled}
                >
                  {actionConfig.label}
                </button>

                <p className="capsule-action-hint">{actionHint}</p>

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
                    <span>{t("play.roundRefundedDetail", { betId: refundedBetId.toString() })}</span>
                  </div>
                ) : null}
              </div>

              {resolvedRound ? (
                <div className={`capsule-result-card ${resolvedRound.tier.accentClass}`.trim()}>
                  <div className="capsule-result-head">
                    <span>{t("play.currentRound")}</span>
                    <strong>{resolvedRound.tier.label}</strong>
                  </div>

                  <div className="capsule-result-grid">
                    <div>
                      <span>{t("play.drawId")}</span>
                      <strong>#{resolvedRound.betId.toString()}</strong>
                    </div>
                    <div>
                      <span>{t("play.randomHit")}</span>
                      <strong>{formatOutcome(resolvedRound.outcome)}</strong>
                    </div>
                    <div>
                      <span>{t("play.multiplier")}</span>
                      <strong>{formatMultiplier(resolvedRound.tier.payoutMultiplierBps)}</strong>
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
                </div>
              ) : null}
            </>
          ) : (
            <div className="inline-space-panel">
              <SpacePredictionPanel />
            </div>
          )}

          <div className="capsule-bottom-nav">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`capsule-nav-button ${activeTab === item.key ? "active" : ""}`.trim()}
                onClick={() => setActiveTab(item.key)}
              >
                <span>{item.icon}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
        </div>

        {isSheetOpen ? (
          <div className="capsule-sheet-backdrop" onClick={() => setActiveTab(primaryTab)}>
            <div className="capsule-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="capsule-sheet-head">
                <strong>
                  {activeTab === "live"
                    ? t("play.sheet.live")
                    : activeTab === "odds"
                      ? t("play.sheet.odds")
                      : activeTab === "spaceHistory"
                        ? t("play.sheet.spaceHistory")
                        : t("play.sheet.me")}
                </strong>
                <button type="button" onClick={() => setActiveTab(primaryTab)}>
                  ✕
                </button>
              </div>

              <div className="capsule-sheet-body">
                {activeTab === "live" ? (
                  <div className="capsule-feed-list">
                    {recentDiscoveries.length > 0 ? recentDiscoveries.map((item) => (
                      <div key={item.key} className={`capsule-feed-card ${item.tier.accentClass}`.trim()}>
                        <div>
                          <span>{item.tier.label}</span>
                          <strong>{shortAddress(item.player)}</strong>
                        </div>
                        <div>
                          <span>{`${t("play.drawId")} ${formatOutcome(item.outcome)}`}</span>
                          <strong>
                            {item.won
                              ? `${formatDisplayToken(item.playerPayout, numberLocale)} ${tokenDisplayName}`
                              : t("play.miss")}
                          </strong>
                        </div>
                      </div>
                    )) : (
                      <div className="capsule-empty-state">{t("play.liveEmpty")}</div>
                    )}
                  </div>
                ) : null}

                {activeTab === "odds" ? (
                  <div className="capsule-odds-list">
                    {boxTiers.map((tier) => (
                      <div key={tier.id} className={`capsule-odds-card ${tier.accentClass}`.trim()}>
                        <div>
                          <span>{tier.label}</span>
                          <strong>{tier.id === "empty" ? "—" : formatMultiplier(tier.payoutMultiplierBps)}</strong>
                        </div>
                        <div>
                          <span>{tier.teaser}</span>
                          <strong>{tier.probabilityLabel}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {activeTab === "spaceHistory" ? (
                  <div className="capsule-feed-list">
                    {spaceDiscoveries.length > 0 ? spaceDiscoveries.map((item) => (
                      <div key={item.key} className={`capsule-feed-card ${item.won ? "success" : "failure"}`.trim()}>
                        <div>
                          <span>{shortAddress(item.player)}</span>
                          <strong>{item.guessUp ? t("space.guessUp") : t("space.guessDown")}</strong>
                        </div>
                        <div>
                          <span>{`${t("common.roundResult")} ${item.landedUp ? t("common.up") : t("common.down")}`}</span>
                          <strong>
                            {item.won
                              ? `${formatDisplayToken(item.playerPayout, numberLocale)} ${tokenDisplayName}`
                              : t("play.miss")}
                          </strong>
                        </div>
                      </div>
                    )) : (
                      <div className="capsule-empty-state">{t("play.spaceEmpty")}</div>
                    )}
                  </div>
                ) : null}

                {activeTab === "me" ? (
                  <div className="capsule-me-panel">
                    <div className="capsule-wallet-card">
                      <span>{t("common.currentWallet")}</span>
                      <strong>{access.activeAddress ? shortAddress(access.activeAddress) : t("common.connectWalletShort")}</strong>
                      <div className="capsule-wallet-balance">
                        <span>{t("common.walletBalance", { tokenName: tokenDisplayName })}</span>
                        <strong>{access.activeAddress ? `${formatToken(walletBalance.data, 18, 2)} ${tokenDisplayName}` : "--"}</strong>
                      </div>
                    </div>

                    <div className="capsule-referral-stats">
                      <div>
                        <span>{t("common.boundReferrer")}</span>
                        <strong>{referrerLabel}</strong>
                      </div>
                      <div>
                        <span>{t("common.invitees")}</span>
                        <strong>{referralStats.data?.[1]?.toString() ?? "0"}</strong>
                      </div>
                      <div>
                        <span>{t("common.totalRewards")}</span>
                        <strong>
                          {referralStats.data?.[2]
                            ? `${formatToken(referralStats.data[2], 18, 2)} ${tokenDisplayName}`
                            : `0.00 ${tokenDisplayName}`}
                        </strong>
                      </div>
                    </div>

                    {hasReferrerConflict && boundReferrer ? (
                      <div className="status-banner status-banner-warning">
                        <strong>{t("play.referrerCorrected")}</strong>
                        <span>{t("play.referrerCorrectedDesc", { referrer: shortAddress(boundReferrer) })}</span>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            referralLanding.clearCachedReferrer();
                            sound.play("coin");
                          }}
                        >
                          {t("play.clearOldCache")}
                        </button>
                      </div>
                    ) : null}

                    <div className="capsule-share-card">
                      <span>{t("play.inviteLink")}</span>
                      <code>{shareLink || t("play.generateLinkAfterConnect")}</code>
                      <div className="capsule-share-actions">
                        <button type="button" onClick={() => void copyInviteLink()} disabled={!shareLink}>
                          {copiedShareLink ? t("common.copied") : t("common.copy")}
                        </button>
                        <button type="button" onClick={() => void shareInviteLink()} disabled={!shareLink}>
                          {t("referral.share")}
                        </button>
                      </div>
                    </div>

                    <div className="capsule-history-panel">
                      <div className="capsule-history-head">
                        <span>{t("play.myHistory")}</span>
                        <strong>{`${myDiscoveries.length} ${t("common.timesSuffix")}`}</strong>
                      </div>

                      {myDiscoveries.length > 0 ? myDiscoveries.map((item) => (
                        <div key={item.key} className={`capsule-history-row ${item.tier.accentClass}`.trim()}>
                          <span>{item.tier.label}</span>
                          <strong>
                            {item.won
                              ? `${formatDisplayToken(item.playerPayout, numberLocale)} ${tokenDisplayName}`
                              : t("play.miss")}
                          </strong>
                        </div>
                      )) : (
                        <div className="capsule-empty-state">{t("play.noMyHistory")}</div>
                      )}
                    </div>
                  </div>
                ) : null}

                {activeTab === "spaceMe" ? (
                  <div className="capsule-me-panel">
                    <div className="capsule-wallet-card">
                      <span>{t("common.currentWallet")}</span>
                      <strong>{access.activeAddress ? shortAddress(access.activeAddress) : t("common.connectWalletShort")}</strong>
                      <div className="capsule-wallet-balance">
                        <span>{t("common.walletBalance", { tokenName: tokenDisplayName })}</span>
                        <strong>{access.activeAddress ? `${formatToken(walletBalance.data, 18, 2)} ${tokenDisplayName}` : "--"}</strong>
                      </div>
                    </div>

                    <div className="capsule-referral-stats">
                      <div>
                        <span>{t("common.boundReferrer")}</span>
                        <strong>{referrerLabel}</strong>
                      </div>
                      <div>
                        <span>{t("common.invitees")}</span>
                        <strong>{referralStats.data?.[1]?.toString() ?? "0"}</strong>
                      </div>
                      <div>
                        <span>{t("common.totalRewards")}</span>
                        <strong>
                          {referralStats.data?.[2]
                            ? `${formatToken(referralStats.data[2], 18, 2)} ${tokenDisplayName}`
                            : `0.00 ${tokenDisplayName}`}
                        </strong>
                      </div>
                    </div>

                    <div className="capsule-history-panel">
                      <div className="capsule-history-head">
                        <span>{t("play.mySpaceHistory")}</span>
                        <strong>{`${mySpaceDiscoveries.length} ${t("common.timesSuffix")}`}</strong>
                      </div>

                      {mySpaceDiscoveries.length > 0 ? mySpaceDiscoveries.map((item) => (
                        <div key={item.key} className={`capsule-history-row ${item.won ? "success" : "failure"}`.trim()}>
                          <span>
                            {`${item.guessUp ? t("space.guessUp") : t("space.guessDown")} · ${t("common.roundResult")} ${
                              item.landedUp ? t("common.up") : t("common.down")
                            }`}
                          </span>
                          <strong>
                            {item.won
                              ? `${formatDisplayToken(item.playerPayout, numberLocale)} ${tokenDisplayName}`
                              : t("play.miss")}
                          </strong>
                        </div>
                      )) : (
                        <div className="capsule-empty-state">{t("play.noMySpaceHistory")}</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
