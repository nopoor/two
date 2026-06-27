import { useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { referralRegistryAbi } from "../abi/gamefi";
import { ReferralQrCard } from "../components/ReferralQrCard";
import { bscChain } from "../config/chains";
import { contracts } from "../config/contracts";
import { useDappAccess } from "../hooks/useDappAccess";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useI18n } from "../i18n/LanguageProvider";
import { formatPercent, formatToken } from "../lib/format";
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
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
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
  const cumulativeRewards = access.activeAddress ? `${formatToken(referralStats.data?.[2])} ${t("common.tokenName")}` : "--";

  function flashStatus(setter: (value: boolean) => void) {
    setter(true);
    window.setTimeout(() => setter(false), 1500);
  }

  async function copyText(value: string) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // fallback below
      }
    }

    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, value.length);

    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textArea);
    }
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

    const copiedOk = await copyText(referralLink);
    if (!copiedOk) return;

    sound.play("coin");
    flashStatus(setCopied);
  }

  function getQrDataUrl() {
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

    return exportCanvas.toDataURL("image/png");
  }

  async function saveQrCode() {
    if (!await ensureConnected()) return;

    const dataUrl = getQrDataUrl();
    if (!dataUrl) return;

    const fileName = `dividend-bank-invite-${access.activeAddress?.slice(2, 8) ?? "qr"}.png`;
    const encoded = dataUrl.split(",")[1];
    if (!encoded) return;

    const bytes = new Uint8Array(
      window.atob(encoded).split("").map((character) => character.charCodeAt(0)),
    );
    const file = new File([bytes], fileName, { type: "image/png" });

    if (
      typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          title: t("referral.linkTitle"),
          files: [file],
        });
        sound.play("coin");
        flashStatus(setSaved);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    const downloadLink = document.createElement("a");
    downloadLink.href = dataUrl;
    downloadLink.download = fileName;
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();

    window.setTimeout(() => {
      document.body.removeChild(downloadLink);
    }, 1000);

    sound.play("coin");
    flashStatus(setSaved);
  }


  return (
    <div className="vault-page-stack">
      <section className="section-card referral-link-card">
        <div className="referral-link-head">
          <h2>{t("referral.linkTitle")}</h2>
        </div>

        <div className="referral-link-layout">
          <div className="referral-link-box">
            <p className="address-line">{referralLink ?? "--"}</p>
            <div className="copy-row referral-action-row">
              <button type="button" className="primary-button" onClick={() => void copyLink()}>
                {!access.activeAddress ? t("common.connectWalletShort") : copied ? t("referral.linkCopied") : t("referral.copyLink")}
              </button>
              <button type="button" className="secondary-button" onClick={() => void saveQrCode()}>
                {!access.activeAddress ? t("common.connectWalletShort") : saved ? t("referral.qrSaved") : t("referral.saveQr")}
              </button>
            </div>
          </div>

          <ReferralQrCard value={referralLink} canvasRef={qrCanvasRef} />
        </div>

        <div className="referral-link-stats">
          <div className="referral-stat-chip">
            <span>{t("referral.fixedCommission")}</span>
            <strong>{formatPercent(20)}</strong>
          </div>
          <div className="referral-stat-chip">
            <span>{t("referral.boundUsers")}</span>
            <strong>{inviteeCount}</strong>
          </div>
          <div className="referral-stat-chip">
            <span>{t("referral.totalRewards")}</span>
            <strong>{cumulativeRewards}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
