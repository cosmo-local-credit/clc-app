import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { cn } from "#/lib/utils";

export function AddressQRCode({
  value,
  size = 156,
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
      margin: 0,
      width: 512,
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
      className={cn(
        "flex items-center justify-center border border-border bg-card p-2.5",
        className,
      )}
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
