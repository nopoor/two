import { useMemo, useState } from "react";
import { formatEther, keccak256, stringToHex, zeroHash } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { SectionCard } from "../components/SectionCard";
import { TxStatusBanner } from "../components/TxStatusBanner";
import { accessControlAbi, gameManagerAbi, gameRegistryAbi, nftRevenueDistributorAbi } from "../abi/gamefi";
import { contracts } from "../config/contracts";
import { bscChain } from "../config/chains";
import { useGameAvailability } from "../hooks/useGameAvailability";
import { useTxFlow } from "../hooks/useTxFlow";
import { shortAddress } from "../lib/format";

const roles = [
  { key: "DEFAULT_ADMIN_ROLE", label: "管理員", hash: zeroHash },
  { key: "OPERATOR_ROLE", label: "營運", hash: keccak256(stringToHex("OPERATOR_ROLE")) },
  { key: "PAUSER_ROLE", label: "暫停控制", hash: keccak256(stringToHex("PAUSER_ROLE")) },
  { key: "REVENUE_ROLE", label: "收益管理", hash: keccak256(stringToHex("REVENUE_ROLE")) },
  { key: "GAME_ADMIN_ROLE", label: "遊戲配置", hash: keccak256(stringToHex("GAME_ADMIN_ROLE")) },
  { key: "AUTOMATION_ROLE", label: "自動化", hash: keccak256(stringToHex("AUTOMATION_ROLE")) },
] as const;

const betStatusText = ["未建立", "待开奖", "已结算", "已退款"] as const;

export function AdminPage() {
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
  const canPause = isPauser && paused.data === false;
  const canUnpause = isAdmin && paused.data === true;
  const canManageGames = isAdmin || isGameAdmin;
  const canRunSnapshot = (isAutomation || isAdmin) && currentDay.data !== undefined && !hasTodaySnapshot;
  const canRefundPendingBet = (isOperator || isAdmin) && refundBetId !== undefined && refundStatus === 1;
  const refundPlayer = pendingBet.data?.[0];
  const refundWager = pendingBet.data?.[3];

  const snapshotSummary = useMemo(() => {
    if (todaySnapshot.data === undefined) return "读取中";
    if (todaySnapshot.data[0] === 0n) return "今日尚未快照";
    return `区块 #${todaySnapshot.data[0].toString()} · 分配 ${Number(formatEther(todaySnapshot.data[1])).toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} 分红银行`;
  }, [todaySnapshot.data]);

  async function handlePauseToggle(nextAction: "pause" | "unpause") {
    if (!contracts.accessControl) {
      tx.setError("管理合约地址未配置");
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
      tx.setError(error instanceof Error ? error.message : "状态更新失败");
    }
  }

  async function handleRunSnapshot() {
    if (!contracts.nftRevenueDistributor || currentDay.data === undefined) {
      tx.setError("快照参数尚未准备完成");
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
      tx.setError(error instanceof Error ? error.message : "执行快照失败");
    }
  }

  async function handleRefundBet() {
    if (!contracts.gameManager || refundBetId === undefined) {
      tx.setError("请输入有效注单编号");
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
      tx.setError(error instanceof Error ? error.message : "退款失败");
    }
  }

  async function handleToggleGame(gameId: `0x${string}`, enabled: boolean) {
    if (!contracts.gameRegistry) {
      tx.setError("游戏注册表地址未配置");
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
      tx.setError(error instanceof Error ? error.message : "更新游戏状态失败");
    }
  }

  return (
    <div className="vault-page-stack">
      <TxStatusBanner phase={tx.phase} hash={tx.hash} errorMessage={tx.errorMessage} />

      <SectionCard title="系統開關" description="暂停会影响下注、退款、分红领取等受控流程。">
        <div className="claim-action-row">
          <div className="claim-action-copy">
            <strong>{paused.data ? "系统已暂停" : "系统运行中"}</strong>
            <span>{paused.data ? "仅管理员可恢复系统" : "可在此执行暂停控制"}</span>
          </div>
          <div className="claim-action-buttons">
            <button className="warning-button" disabled={actionLocked || !canPause} onClick={() => void handlePauseToggle("pause")}>
              緊急暫停
            </button>
            <button className="primary-button" disabled={actionLocked || !canUnpause} onClick={() => void handlePauseToggle("unpause")}>
              恢復系統
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="遊戲上線控制">
        <div className="form-shell">
          {gameAvailability.isLoading ? (
            <div className="empty-state">读取游戏状态中</div>
          ) : (
            <div className="portfolio-grid">
              {Object.values(gameAvailability.games).map((game) => (
                <div key={game.key} className="portfolio-card">
                  <span>{game.label}</span>
                  <strong>{game.enabled ? "已上线" : "未上线"}</strong>
                  <div className="claim-action-buttons">
                    <button
                      className={game.enabled ? "warning-button" : "primary-button"}
                      disabled={actionLocked || !canManageGames}
                      onClick={() => void handleToggleGame(game.gameId, !game.enabled)}
                    >
                      {game.enabled ? "下线此游戏" : "上线此游戏"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!canManageGames ? (
            <div className="status-banner">
              <strong>当前地址没有游戏开关权限</strong>
              <span>仅owner钱包连接后可操作</span>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="每日快照" description="为 NFT 分红生成当日快照并从收益池拉取当日可分配额度。">
        <div className="claim-action-row">
          <div className="claim-action-copy">
            <strong>UTC+8 Day #{currentDay.data?.toString() || "--"}</strong>
            <span>{snapshotSummary}</span>
          </div>
          <div className="claim-action-buttons">
            <button className="primary-button" disabled={actionLocked || !canRunSnapshot} onClick={() => void handleRunSnapshot()}>
              執行當日快照
            </button>
          </div>
        </div>
        {hasTodaySnapshot ? (
          <div className="status-banner">
            <strong>今日快照已存在</strong>
            <span>同一日只允许创建一次快照；用户现在可以预览并领取当日收益。</span>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="退款處理" description="当 VRF 长时间未返回时，可按注单编号将待开奖注单原路退款。">
        <div className="form-shell">
          <label>
            <span>注單編號</span>
            <input
              inputMode="numeric"
              placeholder="例如 12"
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
                <span>玩家</span>
                <strong>{refundPlayer && refundPlayer !== "0x0000000000000000000000000000000000000000" ? shortAddress(refundPlayer) : "--"}</strong>
              </div>
              <div className="summary-row">
                <span>狀態</span>
                <strong>{betStatusText[refundStatus] ?? "未知"}</strong>
              </div>
              <div className="summary-row">
                <span>下注額</span>
                <strong>{refundWager ? `${Number(formatEther(refundWager)).toLocaleString("zh-CN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} 分红银行` : "--"}</strong>
              </div>
            </div>
          ) : null}

          <div className="claim-action-buttons">
            <button className="warning-button" disabled={actionLocked || !canRefundPendingBet} onClick={() => void handleRefundBet()}>
              退款此注單
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
