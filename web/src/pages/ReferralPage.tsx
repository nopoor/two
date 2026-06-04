import { useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { referralRegistryAbi } from "../abi/gamefi";
import { ReferralQrCard } from "../components/ReferralQrCard";
import { bscChain } from "../config/chains";
import { contracts } from "../config/contracts";
import { useDappAccess } from "../hooks/useDappAccess";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { formatPercent, formatToken } from "../lib/format";

const shareTitle = "分紅銀行邀請";
const shareText = "用我的邀請鏈接一起加入。";
const qrExportSize = 768;
const qrExportPadding = 44;
const qrExportRadius = 58;
const qrExportBackground = "#020617";

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const boundedRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + boundedRadius, y);
  context.lineTo(x + width - boundedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + boundedRadius);
  context.lineTo(x + width, y + height - boundedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - boundedRadius, y + height);
  context.lineTo(x + boundedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - boundedRadius);
  context.lineTo(x, y + boundedRadius);
  context.quadraticCurveTo(x, y, x + boundedRadius, y);
  context.closePath();
}

export function ReferralPage() {
  const access = useDappAccess();
  const sound = useSoundEffects();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

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

  const referralLink = access.activeAddress ? `${window.location.origin}/play?ref=${access.activeAddress}` : undefined;
  const inviteeCount = access.activeAddress ? referralStats.data?.[1]?.toString() || "0" : "--";
  const cumulativeRewards = access.activeAddress ? `${formatToken(referralStats.data?.[2])} 分紅銀行` : "--";

  function flashStatus(setter: (value: boolean) => void) {
    setter(true);
    window.setTimeout(() => setter(false), 1500);
  }

  async function ensureConnected() {
    if (access.activeAddress) return true;
    sound.play("coin");
    await access.requestConnect();
    return false;
  }

  async function copyLink() {
    if (!await ensureConnected()) return;
    if (!referralLink) return;

    await navigator.clipboard.writeText(referralLink);
    sound.play("coin");
    flashStatus(setCopied);
  }

  async function getQrBlob() {
    const canvas = qrCanvasRef.current;
    if (!canvas) return undefined;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = qrExportSize;
    exportCanvas.height = qrExportSize;

    const context = exportCanvas.getContext("2d");
    if (!context) return undefined;

    context.clearRect(0, 0, qrExportSize, qrExportSize);
    drawRoundedRect(context, 0, 0, qrExportSize, qrExportSize, qrExportRadius);
    context.fillStyle = qrExportBackground;
    context.fill();

    const qrSize = qrExportSize - qrExportPadding * 2;
    context.drawImage(canvas, qrExportPadding, qrExportPadding, qrSize, qrSize);

    return new Promise<Blob | undefined>((resolve) => {
      exportCanvas.toBlob((blob) => resolve(blob ?? undefined), "image/png");
    });
  }

  async function saveQrCode() {
    if (!await ensureConnected()) return;

    const blob = await getQrBlob();
    if (!blob) return;

    const objectUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = objectUrl;
    downloadLink.download = `dividend-bank-invite-${access.activeAddress?.slice(2, 8) ?? "qr"}.png`;
    downloadLink.click();
    URL.revokeObjectURL(objectUrl);

    sound.play("coin");
    flashStatus(setSaved);
  }

  async function shareQrCode() {
    if (!await ensureConnected()) return;
    if (!referralLink) return;

    const shareData = {
      title: shareTitle,
      text: shareText,
      url: referralLink,
    };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const blob = await getQrBlob();
        if (blob) {
          const file = new File([blob], "dividend-bank-invite.png", { type: "image/png" });
          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({
              ...shareData,
              files: [file],
            });
            sound.play("coin");
            flashStatus(setShared);
            return;
          }
        }

        await navigator.share(shareData);
        sound.play("coin");
        flashStatus(setShared);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    await copyLink();
  }

  return (
    <div className="vault-page-stack">
      <section className="section-card referral-link-card">
        <div className="referral-link-head">
          <h2>邀請鏈接</h2>
        </div>

        <div className="referral-link-layout">
          <div className="referral-link-box">
            <p className="address-line">{referralLink ?? "--"}</p>
            <div className="copy-row referral-action-row">
              <button type="button" className="primary-button" onClick={() => void copyLink()}>
                {!access.activeAddress ? "连接钱包" : copied ? "已复制" : "复制链接"}
              </button>
              <button type="button" className="secondary-button" onClick={() => void saveQrCode()}>
                {!access.activeAddress ? "连接钱包" : saved ? "已保存" : "保存二维码"}
              </button>
              <button type="button" className="ghost-button" onClick={() => void shareQrCode()}>
                {!access.activeAddress ? "连接钱包" : shared ? "已转发" : "转发"}
              </button>
            </div>
          </div>

          <ReferralQrCard value={referralLink} canvasRef={qrCanvasRef} />
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
