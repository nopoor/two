declare module "qrcode" {
  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  type QRCodeRenderOptions = {
    errorCorrectionLevel?: ErrorCorrectionLevel;
    margin?: number;
    scale?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  const QRCode: {
    toCanvas(
      canvas: HTMLCanvasElement,
      text: string,
      options?: QRCodeRenderOptions,
    ): Promise<void>;
  };

  export default QRCode;
}
