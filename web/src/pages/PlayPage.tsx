import { useEffect, useRef, useState } from "react";
import { decodeAbiParameters, formatEther, keccak256, parseAbiItem, parseEther, stringToHex } from "viem";
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
import { formatToken, shortAddress } from "../lib/format";
import { zeroAddress } from "../lib/referral";
import { SpacePredictionPanel } from "./SpacePredictionPage";

const mysteryBoxGameId = keccak256(stringToHex("MYSTERY_BOX"));
const coinFlipGameId = keccak256(stringToHex("COIN_FLIP"));
const maxAllowance = (2n ** 256n) - 1n;
const recentLogWindow = 40_000n;
const tokenDisplayName = "分红银行";
const mysteryBoxShareTitle = "分红银行 · 神秘盲盒";
const livePoolLabel = "分红银行 · LIVE";
const wagerMultipliers = [1, 2, 3];
const maxWagerMultiplier = wagerMultipliers[wagerMultipliers.length - 1];

const betSettledEvent = parseAbiItem(
  "event BetSettled(uint256 indexed betId, uint256 indexed requestId, bytes32 indexed gameId, address player, bool won, uint256 grossProfit, uint256 playerPayout, uint256 burnAmount, uint256 incomeAmount, uint256 referralAmount, bytes resultData)"
);

type PlayTab = "open" | "live" | "odds" | "me" | "space" | "spaceHistory" | "spaceMe";
type PlayMode = "box" | "space";

const boxNavItems = [
  { key: "open", label: "开盒", icon: "◆" },
  { key: "live", label: "动态", icon: "▤" },
  { key: "odds", label: "概率", icon: "ⓘ" },
  { key: "me", label: "我的", icon: "◉" },
] satisfies Array<{ key: PlayTab; label: string; icon: string }>;

const spaceNavItems = [
  { key: "space", label: "飞船", icon: "▲" },
  { key: "spaceHistory", label: "记录", icon: "▤" },
  { key: "spaceMe", label: "我的", icon: "◉" },
] satisfies Array<{ key: PlayTab; label: string; icon: string }>;

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

const boxTiers: BoxTier[] = [
  {
    index: 0,
    id: "legendary",
    label: "传说",
    teaser: "黄金爆闪 · 稀有极奖",
    icon: "✦",
    probabilityLabel: "0.04%",
    grossMultiplierBps: 500_000,
    payoutMultiplierBps: 480_000,
    accentClass: "legendary",
  },
  {
    index: 1,
    id: "epic",
    label: "史诗",
    teaser: "紫焰开启 · 深空大奖",
    icon: "◆",
    probabilityLabel: "0.80%",
    grossMultiplierBps: 150_000,
    payoutMultiplierBps: 151_000,
    accentClass: "epic",
  },
  {
    index: 2,
    id: "rare",
    label: "稀有",
    teaser: "青色霓虹 · 高倍返奖",
    icon: "◈",
    probabilityLabel: "4.16%",
    grossMultiplierBps: 40_000,
    payoutMultiplierBps: 47_600,
    accentClass: "rare",
  },
  {
    index: 3,
    id: "common",
    label: "普通",
    teaser: "稳定出货 · 常规回血",
    icon: "□",
    probabilityLabel: "35.00%",
    grossMultiplierBps: 8_500,
    payoutMultiplierBps: 17_990,
    accentClass: "common",
  },
  {
    index: 4,
    id: "empty",
    label: "未发现",
    teaser: "本轮落空 · 继续尝试",
    icon: "?",
    probabilityLabel: "60.00%",
    grossMultiplierBps: 0,
    payoutMultiplierBps: 0,
    accentClass: "empty",
  },
];

function getTierByIndex(index: number) {
  return boxTiers.find((tier) => tier.index === index) ?? boxTiers[boxTiers.length - 1];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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

function decodeMysteryBoxResult(resultData: `0x${string}`) {
  const [tierIndex, outcome, grossMultiplierBps] = decodeAbiParameters(
    [
      { name: "tierId", type: "uint8" },
      { name: "outcome", type: "uint16" },
      { name: "grossMultiplierBps", type: "uint32" },
    ],
    resultData
  );

  return {
    tier: getTierByIndex(Number(tierIndex)),
    outcome: Number(outcome),
    grossMultiplierBps: Number(grossMultiplierBps),
  };
}

export function PlayPage() {
  const tx = useTxFlow();
  const sound = useSoundEffects();
  const access = useDappAccess();
  const referralLanding = useReferralLanding(access.address);
  const publicClient = usePublicClient({ chainId: bscChain.id });
  const { writeContractAsync } = useWriteContract();
  const lastResolvedBetRef = useRef<bigint | undefined>();
  const [actionMode, setActionMode] = useState<"approve" | "bet">("bet");
  const [activeTab, setActiveTab] = useState<PlayTab>("open");
  const [activeMode, setActiveMode] = useState<PlayMode>("box");
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

  const wagerValue = Number.parseFloat(wagerUnits);
  const normalizedWager = Number.isFinite(wagerValue) && wagerValue > 0 ? clamp(Math.round(wagerValue), 1, maxWagerMultiplier) : 0;
  const wagerPreview = normalizedWager > 0 ? parseEther(String(normalizedWager * 1000)) : undefined;
  const referrer = referralLanding.cachedReferrer as `0x${string}` | undefined;
  const pendingExists = Boolean(trackedBetId !== undefined || (access.activeAddress && resolvedRound === undefined && tx.phase === "success"));
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
      ? `待下注绑定 ${shortAddress(referrer)}`
      : "无";
  const writeDisabled = actionLocked || normalizedWager === 0 || hasPendingBet || trackedBetId !== undefined;
  const navItems = activeMode === "box" ? boxNavItems : spaceNavItems;
  const primaryTab: PlayTab = activeMode === "box" ? "open" : "space";
  const isSheetOpen = activeTab !== primaryTab;
  const isResolvingRound =
    actionMode === "bet"
    && (tx.phase === "awaiting-signature"
      || tx.phase === "sending"
      || tx.phase === "confirming"
      || (trackedBetId !== undefined && resolvedRound === undefined));

  const jackpotPayout = wagerPreview ? (wagerPreview * BigInt(boxTiers[0].payoutMultiplierBps)) / 10_000n : 0n;
  const baseAction = access.getActionConfig("OPEN CAPSULE", "完成授权后即可发起本轮开盒。");
  const actionConfig =
    access.writeState === "ready" && needsApproval
      ? {
          label: "授权分红银行代币",
          hint: "首次开启前，需要先授权金库扣取本轮开盒资金。",
          disabled: writeDisabled,
          onClick: approveToken,
        }
      : access.writeState === "ready"
        ? {
            label: "开启神秘宝箱",
            hint: "本次开启会发起一笔链上下注，并等待 VRF 揭晓结果。",
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
    ? "封印解除中 · VRF 正在返回结果"
    : resolvedRound
      ? `${resolvedRound.tier.label} · ${resolvedRound.tier.teaser}`
      : "开启神秘宝箱 · 发现你的等级";
  const actionHint = hasReferrerConflict && boundReferrer
    ? `检测到历史邀请缓存，当前下注将按已绑定邀请人 ${shortAddress(boundReferrer)} 结算。`
    : actionConfig.hint;

  const shareLink = typeof window !== "undefined" && access.activeAddress
    ? `${window.location.origin}/play?ref=${access.activeAddress}`
    : "";

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
    if (!publicClient || !access.activeAddress || trackedBetId !== undefined || resolvedRound) return;
    if (!pendingBetId.data || pendingBetId.data === 0n) return;

    const client = publicClient;
    let cancelled = false;

    async function recoverPendingRound() {
      const latestBlock = await client.getBlockNumber();
      if (cancelled) return;
      setTrackedBetId(pendingBetId.data);
      setTrackedFromBlock(latestBlock > recentLogWindow ? latestBlock - recentLogWindow : 0n);
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

    const pollSettlement = async () => {
      try {
        const logs = await client.getLogs({
          address: gameManagerAddress,
          event: betSettledEvent,
          args: { betId: trackedBetId },
          fromBlock: trackedFromBlock,
          toBlock: "latest",
        });

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
          }
          return;
        }

        const latestLog = logs[logs.length - 1];
        if (latestLog.args.gameId !== mysteryBoxGameId) return;
        if (!latestLog.args.resultData || latestLog.args.grossProfit === undefined || latestLog.args.playerPayout === undefined || latestLog.args.player === undefined || latestLog.args.won === undefined) {
          return;
        }

        const decoded = decodeMysteryBoxResult(latestLog.args.resultData);
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
  }, [publicClient, resolvedRound, trackedBetId, trackedFromBlock]);

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
    if (!publicClient || !contracts.gameManager) return;

    const client = publicClient;
    let cancelled = false;

    async function loadRecentActivity() {
      try {
        const latestBlock = await client.getBlockNumber();
        const fromBlock = latestBlock > recentLogWindow ? latestBlock - recentLogWindow : 0n;
        const logs = await client.getLogs({
          address: contracts.gameManager,
          event: betSettledEvent,
          args: { gameId: mysteryBoxGameId },
          fromBlock,
          toBlock: "latest",
        });

        if (cancelled) return;

        const nextRecent = logs
          .slice(-8)
          .reverse()
          .flatMap((log) => {
            if (!log.args.resultData || log.args.playerPayout === undefined || log.args.player === undefined || log.args.won === undefined) {
              return [];
            }

            const decoded = decodeMysteryBoxResult(log.args.resultData);
            return [{
              key: log.args.betId!.toString(),
              betId: log.args.betId!,
              player: log.args.player,
              playerPayout: log.args.playerPayout,
              outcome: decoded.outcome,
              won: log.args.won,
              tier: decoded.tier,
            } satisfies DiscoveryFeedItem];
          });

        setRecentDiscoveries(nextRecent);

        if (access.activeAddress) {
          setMyDiscoveries(nextRecent.filter((item) => item.player.toLowerCase() === access.activeAddress!.toLowerCase()));
        }
      } catch (error) {
        console.warn("Failed to load mystery box feed", error);
      }
    }

    void loadRecentActivity();

    return () => {
      cancelled = true;
    };
  }, [access.activeAddress, publicClient]);

  useEffect(() => {
    if (!publicClient || !contracts.gameManager) return;

    const client = publicClient;
    let cancelled = false;

    async function loadRecentSpaceActivity() {
      try {
        const latestBlock = await client.getBlockNumber();
        const fromBlock = latestBlock > recentLogWindow ? latestBlock - recentLogWindow : 0n;
        const logs = await client.getLogs({
          address: contracts.gameManager,
          event: betSettledEvent,
          args: { gameId: coinFlipGameId },
          fromBlock,
          toBlock: "latest",
        });

        if (cancelled) return;

        const nextRecent = logs
          .slice(-8)
          .reverse()
          .flatMap((log) => {
            if (!log.args.resultData || log.args.playerPayout === undefined || log.args.player === undefined || log.args.won === undefined || log.args.betId === undefined) {
              return [];
            }

            const [guessUp, landedUp] = decodeAbiParameters(
              [
                { name: "guessHeads", type: "bool" },
                { name: "landedHeads", type: "bool" },
              ],
              log.args.resultData
            );

            return [{
              key: log.args.betId.toString(),
              betId: log.args.betId,
              player: log.args.player,
              playerPayout: log.args.playerPayout,
              won: log.args.won,
              guessUp,
              landedUp,
            } satisfies SpaceFeedItem];
          });

        setSpaceDiscoveries(nextRecent);

        if (access.activeAddress) {
          setMySpaceDiscoveries(nextRecent.filter((item) => item.player.toLowerCase() === access.activeAddress!.toLowerCase()));
        }
      } catch (error) {
        console.warn("Failed to load space prediction feed", error);
      }
    }

    void loadRecentSpaceActivity();

    return () => {
      cancelled = true;
    };
  }, [access.activeAddress, publicClient]);

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
      tx.setError(error instanceof Error ? error.message : "开盒失败");
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
        text: "用我的邀请链接一起开盒，链上开奖直接同步。",
        url: shareLink,
      });
      return;
    }

    await copyInviteLink();
  }

  return (
    <div className="capsule-play-page">
      <div className="capsule-stage-shell">
        <div className="capsule-stage-frame">
          <div className="capsule-pool-card">
            <div className="capsule-pool-head">
              <span>奖励池</span>
              <span>{livePoolLabel}</span>
            </div>
            <strong>{rewardPool.data ? `${formatDisplayToken(rewardPool.data)} ${tokenDisplayName}` : "---"}</strong>
            <p>金库余额越厚，极奖越有气势。</p>
          </div>

          <div className="capsule-feed-strip">
            <span className="capsule-feed-dot" />
            <div className="capsule-feed-copy">
              {activeMode === "box"
                ? recentDiscoveries.length > 0
                  ? `最近发现 · ${recentDiscoveries[0].tier.label} · ${shortAddress(recentDiscoveries[0].player)}`
                  : "最近发现 · 等待第一位开盒玩家"
                : spaceDiscoveries.length > 0
                  ? `飞船航迹 · ${spaceDiscoveries[0].landedUp ? "UP" : "DOWN"} · ${shortAddress(spaceDiscoveries[0].player)}`
                  : "飞船航迹 · 等待第一位飞行玩家"}
            </div>
            <button type="button" className="capsule-feed-button" onClick={() => setActiveTab(activeMode === "box" ? "live" : "spaceHistory")}>
              {activeMode === "box" ? "LIVE" : "记录"}
            </button>
          </div>
          <div className="play-mode-switch">
            <button
              type="button"
              className={`play-mode-button ${activeMode === "box" ? "active" : ""}`.trim()}
              onClick={() => {
                setActiveMode("box");
                setActiveTab("open");
              }}
            >
              <strong>盲盒模式</strong>
            </button>
            <button
              type="button"
              className={`play-mode-button ${activeMode === "space" ? "active" : ""}`.trim()}
              onClick={() => {
                setActiveMode("space");
                setActiveTab("space");
              }}
            >
              <strong>飞船模式</strong>
            </button>
          </div>

          {activeMode === "box" ? (
            <>
              <div className="capsule-machine-stage">
                <div className={`capsule-machine ${isResolvingRound ? "opening" : ""} ${resolvedRound ? `revealed ${resolvedRound.tier.accentClass}` : ""}`.trim()}>
                  <div className="capsule-machine-glow" />
                  <div className="capsule-machine-core">
                    <div className="capsule-machine-lid">
                      <span>◆ SEAL ◆</span>
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
                  <strong>{resolvedRound ? resolvedRound.tier.label : "等待开启"}</strong>
                  <span>{stageCaption}</span>
                </div>
              </div>

              <div className="capsule-control-panel">
                <div className="capsule-control-head">
                  <div>
                    <span>本次开盒</span>
                    <strong>{formatBankrollUnits(normalizedWager || 1)} {tokenDisplayName}</strong>
                  </div>
                  <div>
                    <span>理论极奖</span>
                    <strong>{wagerPreview ? `${formatDisplayToken(jackpotPayout)} ${tokenDisplayName}` : "--"}</strong>
                  </div>
                </div>

                <div className="capsule-chip-row">
                  {wagerMultipliers.map((value) => (
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
                {refundedBetId !== undefined ? (
                  <div className="status-banner status-banner-warning">
                    <strong>本轮已退款</strong>
                    <span>注单 #{refundedBetId.toString()} 未完成开奖，运营已原路退回本轮投入。</span>
                  </div>
                ) : null}
              </div>

              {resolvedRound ? (
                <div className={`capsule-result-card ${resolvedRound.tier.accentClass}`.trim()}>
                  <div className="capsule-result-head">
                    <span>本轮结果</span>
                    <strong>{resolvedRound.tier.label}</strong>
                  </div>
                  <div className="capsule-result-grid">
                    <div>
                      <span>开奖编号</span>
                      <strong>#{resolvedRound.betId.toString()}</strong>
                    </div>
                    <div>
                      <span>随机命中</span>
                      <strong>{formatOutcome(resolvedRound.outcome)}</strong>
                    </div>
                    <div>
                      <span>返奖倍率</span>
                      <strong>{formatMultiplier(resolvedRound.tier.payoutMultiplierBps)}</strong>
                    </div>
                    <div>
                      <span>到账金额</span>
                      <strong>{resolvedRound.won ? `${formatDisplayToken(resolvedRound.playerPayout)} ${tokenDisplayName}` : `0 ${tokenDisplayName}`}</strong>
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
                    ? "开奖动态"
                    : activeTab === "odds"
                      ? "概率 · ODDS"
                      : activeTab === "spaceHistory"
                        ? "飞船记录"
                        : "我的中心"}
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
                          <span>开奖 {formatOutcome(item.outcome)}</span>
                          <strong>{item.won ? `${formatDisplayToken(item.playerPayout)} ${tokenDisplayName}` : "未命中"}</strong>
                        </div>
                      </div>
                    )) : (
                      <div className="capsule-empty-state">还没有链上开奖记录，等你打第一枪。</div>
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
                          <strong>{item.guessUp ? "看涨飞升" : "看跌坠落"}</strong>
                        </div>
                        <div>
                          <span>结果 {item.landedUp ? "UP" : "DOWN"}</span>
                          <strong>{item.won ? `${formatDisplayToken(item.playerPayout)} ${tokenDisplayName}` : "未命中"}</strong>
                        </div>
                      </div>
                    )) : (
                      <div className="capsule-empty-state">还没有飞船开奖记录，等待第一位玩家起飞。</div>
                    )}
                  </div>
                ) : null}

                {activeTab === "me" ? (
                  <div className="capsule-me-panel">
                    <div className="capsule-wallet-card">
                      <span>当前钱包</span>
                      <strong>{access.activeAddress ? shortAddress(access.activeAddress) : "未连接"}</strong>
                      <div className="capsule-wallet-balance">
                        <span>分红银行余额</span>
                        <strong>{access.activeAddress ? `${formatToken(walletBalance.data, 18, 2)} ${tokenDisplayName}` : "--"}</strong>
                      </div>
                    </div>

                    <div className="capsule-referral-stats">
                      <div>
                        <span>绑定邀请人</span>
                        <strong>{referrerLabel}</strong>
                      </div>
                      <div>
                        <span>邀请人数</span>
                        <strong>{referralStats.data?.[1]?.toString() ?? "0"}</strong>
                      </div>
                      <div>
                        <span>累计奖励</span>
                        <strong>{referralStats.data?.[2] ? `${formatToken(referralStats.data[2], 18, 2)} ${tokenDisplayName}` : `0.00 ${tokenDisplayName}`}</strong>
                      </div>
                    </div>

                    {hasReferrerConflict && boundReferrer ? (
                      <div className="status-banner status-banner-warning">
                        <strong>邀请链接已自动纠偏</strong>
                        <span>你已绑定 {shortAddress(boundReferrer)}，系统会忽略旧缓存的邀请码，避免下注失败。</span>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            referralLanding.clearCachedReferrer();
                            sound.play("coin");
                          }}
                        >
                          清除旧缓存
                        </button>
                      </div>
                    ) : null}

                    <div className="capsule-share-card">
                      <span>邀请链接</span>
                      <code>{shareLink || "连接钱包后生成专属链接"}</code>
                      <div className="capsule-share-actions">
                        <button type="button" onClick={() => void copyInviteLink()} disabled={!shareLink}>
                          {copiedShareLink ? "已复制" : "复制"}
                        </button>
                        <button type="button" onClick={() => void shareInviteLink()} disabled={!shareLink}>
                          分享
                        </button>
                      </div>
                    </div>

                    <div className="capsule-history-panel">
                      <div className="capsule-history-head">
                        <span>我的开奖记录</span>
                        <strong>{myDiscoveries.length} 次</strong>
                      </div>
                      {myDiscoveries.length > 0 ? myDiscoveries.map((item) => (
                        <div key={item.key} className={`capsule-history-row ${item.tier.accentClass}`.trim()}>
                          <span>{item.tier.label}</span>
                          <strong>{item.won ? `${formatDisplayToken(item.playerPayout)} ${tokenDisplayName}` : "未命中"}</strong>
                        </div>
                      )) : (
                        <div className="capsule-empty-state">还没开过盲盒，拉开封印试试。</div>
                      )}
                    </div>
                  </div>
                ) : null}

                {activeTab === "spaceMe" ? (
                  <div className="capsule-me-panel">
                    <div className="capsule-wallet-card">
                      <span>当前钱包</span>
                      <strong>{access.activeAddress ? shortAddress(access.activeAddress) : "未连接"}</strong>
                      <div className="capsule-wallet-balance">
                        <span>分红银行余额</span>
                        <strong>{access.activeAddress ? `${formatToken(walletBalance.data, 18, 2)} ${tokenDisplayName}` : "--"}</strong>
                      </div>
                    </div>

                    <div className="capsule-referral-stats">
                      <div>
                        <span>绑定邀请人</span>
                        <strong>{referrerLabel}</strong>
                      </div>
                      <div>
                        <span>邀请人数</span>
                        <strong>{referralStats.data?.[1]?.toString() ?? "0"}</strong>
                      </div>
                      <div>
                        <span>累计奖励</span>
                        <strong>{referralStats.data?.[2] ? `${formatToken(referralStats.data[2], 18, 2)} ${tokenDisplayName}` : `0.00 ${tokenDisplayName}`}</strong>
                      </div>
                    </div>

                    <div className="capsule-history-panel">
                      <div className="capsule-history-head">
                        <span>我的飞船记录</span>
                        <strong>{mySpaceDiscoveries.length} 次</strong>
                      </div>
                      {mySpaceDiscoveries.length > 0 ? mySpaceDiscoveries.map((item) => (
                        <div key={item.key} className={`capsule-history-row ${item.won ? "success" : "failure"}`.trim()}>
                          <span>{item.guessUp ? "看涨飞升" : "看跌坠落"} · 结果 {item.landedUp ? "UP" : "DOWN"}</span>
                          <strong>{item.won ? `${formatDisplayToken(item.playerPayout)} ${tokenDisplayName}` : "未命中"}</strong>
                        </div>
                      )) : (
                        <div className="capsule-empty-state">还没有飞船记录，完成一次飞行后会显示在这里。</div>
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
