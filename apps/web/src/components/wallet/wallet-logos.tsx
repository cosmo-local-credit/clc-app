import { useState } from "react";

import { ProgressiveImage } from "#/components/ui/progressive-image";
import { cn } from "#/lib/utils";
import { type WalletToken } from "./wallet-data";

export function TokenLogo({
  token,
  size = 34,
  className,
}: {
  token: WalletToken;
  size?: number;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const displaySize = Math.round(size);
  const glyph =
    token.glyph ?? (token.kind === "stable" ? token.symbol.slice(0, 1) : token.symbol.slice(0, 2));

  if (token.iconUrl && failedUrl !== token.iconUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn("relative block shrink-0 overflow-hidden rounded-full bg-muted", className)}
        style={{ width: displaySize, height: displaySize }}
      >
        <ProgressiveImage
          src={token.iconUrl}
          alt=""
          width={displaySize}
          height={displaySize}
          loading="lazy"
          className="size-full object-cover"
          skeletonClassName="rounded-full"
          onError={() => setFailedUrl(token.iconUrl ?? null)}
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
        background: token.color,
        fontSize: Math.round(size * 0.34),
        letterSpacing: "-0.02em",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
      }}
    >
      {glyph}
    </span>
  );
}
