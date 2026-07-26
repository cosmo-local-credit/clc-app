import { useState } from "react";

import { hueFromSeed } from "#/components/wallet";
import { cn } from "#/lib/utils";

/**
 * A voucher's profile image, with the fallback treated as the common case:
 * roughly two thirds of the imported catalog has no `iconUrl`, and the URLs
 * that do exist point at a third-party host that sometimes 404s.
 *
 * The fallback colour is seeded from the contract address rather than the
 * symbol, so the same voucher looks identical on the map card and on its page
 * even though only one of them is showing a symbol at any moment.
 */
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
  const [imageFailed, setImageFailed] = useState(false);

  if (iconUrl && !imageFailed) {
    return (
      <span
        aria-hidden="true"
        className={cn("block shrink-0 overflow-hidden rounded-full bg-muted", className)}
        style={{ width: size, height: size }}
      >
        <img
          src={iconUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
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
