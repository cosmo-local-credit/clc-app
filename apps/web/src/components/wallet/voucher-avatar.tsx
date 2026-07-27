import { useState } from "react";

import { ProgressiveImage } from "#/components/ui/progressive-image";
import { cn } from "#/lib/utils";
import { hueFromSeed } from "./wallet-data";

/** Voucher identity shared by the market card and voucher detail screen. */
export function VoucherAvatar({
  address,
  symbol,
  iconUrl,
  size,
  className,
}: {
  address: string;
  symbol: string;
  iconUrl: string | null;
  size: number;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = iconUrl && failedUrl !== iconUrl ? iconUrl : null;

  if (imageUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn("relative block shrink-0 overflow-hidden rounded-full bg-muted", className)}
        style={{ width: size, height: size }}
      >
        <ProgressiveImage
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="size-full object-cover"
          skeletonClassName="rounded-full"
          onError={() => setFailedUrl(imageUrl)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: hueFromSeed(address.toLowerCase()),
        fontSize: Math.round(size * 0.34),
        letterSpacing: "-0.02em",
      }}
    >
      {symbol.slice(0, 2)}
    </span>
  );
}
