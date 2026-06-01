import { useState } from "react";
import { useReadContract } from "wagmi";
import { referralRegistryAbi } from "../abi/gamefi";
import { bscChain } from "../config/chains";
import { contracts } from "../config/contracts";
import { useDappAccess } from "../hooks/useDappAccess";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { formatPercent, formatToken } from "../lib/format";

export function ReferralPage() {
  const access = useDappAccess();
  const sound = useSoundEffects();
  const [copied, setCopied] = useState(false);

  const referralStats = useReadContract({
    address: contracts.referralRegistry,
    chainId: bscChain.id,
    abi: referralRegistryAbi,
    functionName: "getReferralStats",
    args: [access.activeAddress!],
    query: {
      enabled: Boolean(contracts.referralRegistry && access.activeAddress),
    },
  });

  const referralLink = access.activeAddress ? `${window.location.origin}/play?ref=${access.activeAddress}` : "--";
  const inviteeCount = access.activeAddress ? referralStats.data?.[1]?.toString() || "0" : "--";
  const cumulativeRewards = access.activeAddress ? `${formatToken(referralStats.data?.[2])} 分紅銀行` : "--";

  async function copyLink() {
    if (!access.activeAddress) {
      sound.play("coin");
      await access.requestConnect();
      return;
    }

    await navigator.clipboard.writeText(referralLink);
    sound.play("coin");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="vault-page-stack">
      <section className="section-card referral-link-card">
        <div className="referral-link-head">
          <h2>邀請鏈接</h2>
        </div>

        <div className="referral-link-box">
          <p className="address-line">{referralLink}</p>
          <div className="copy-row">
            <button className="primary-button" onClick={() => void copyLink()}>
              {!access.activeAddress ? "连接钱包" : copied ? "已复制" : "复制链接"}
            </button>
          </div>
        </div>

        <div className="referral-link-stats">
          <div className="referral-stat-chip">
            <span>固定返佣</span>
            <strong>{formatPercent(20)}</strong>
          </div>
          <div className="referral-stat-chip">
            <span>绑定用户</span>
            <strong>{inviteeCount}</strong>
          </div>
          <div className="referral-stat-chip">
            <span>累计奖励</span>
            <strong>{cumulativeRewards}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
