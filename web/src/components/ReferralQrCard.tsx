import { type MutableRefObject, useEffect } from "react";
import QRCode from "qrcode";

const qrOptions = {
  errorCorrectionLevel: "M" as const,
  margin: 1,
  width: 320,
  color: {
    dark: "#f8fafc",
    light: "#0000",
  },
};

type Props = {
  value?: string;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
};

export function ReferralQrCard({ value, canvasRef }: Props) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!value) {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    void QRCode.toCanvas(canvas, value, qrOptions).catch(() => {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
    });
  }, [canvasRef, value]);

  return (
    <div className="referral-qr-card">
      <div className="referral-qr-frame">
        {value ? (
          <div className="referral-qr-box">
            <canvas ref={canvasRef} className="referral-qr-canvas" />
          </div>
        ) : (
          <div className="referral-qr-placeholder">待生成</div>
        )}
      </div>
    </div>
  );
}
