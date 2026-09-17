import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { cn } from "#/lib/utils";

export function AddressQRCode({
  value,
  size = 184,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(value, {
      // Keep the required four-module quiet zone in the QR image itself. The
      // surrounding surface is visual chrome, not a dependable scan margin.
      margin: 4,
      // Render at the displayed size so browser interpolation cannot soften
      // the individual QR modules.
      width: size,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).then((result) => {
      if (!cancelled) setDataUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      className={cn("flex items-center justify-center bg-card", className)}
      style={{ width: size, height: size }}
    >
      {dataUrl ? (
        // biome-ignore lint/performance/noImgElement: QR is a generated PNG, no layout shift concern
        <img src={dataUrl} alt="" className="size-full" aria-hidden="true" />
      ) : (
        <div className="size-full animate-pulse bg-muted" />
      )}
    </div>
  );
}
