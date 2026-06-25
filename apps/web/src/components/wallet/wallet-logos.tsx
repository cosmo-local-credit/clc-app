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
  const glyph =
    token.glyph ?? (token.kind === "stable" ? token.symbol.slice(0, 1) : token.symbol.slice(0, 2));
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

export function PicsumLogo({
  seed,
  size = 34,
  alt = "",
  className,
}: {
  seed: string;
  size?: number;
  alt?: string;
  className?: string;
}) {
  const displaySize = Math.round(size);
  const encodedSeed = encodeURIComponent(`clc-${seed}`);
  const src = `https://picsum.photos/seed/${encodedSeed}/${displaySize}/${displaySize}`;
  const srcSet = `${src} 1x, https://picsum.photos/seed/${encodedSeed}/${displaySize * 2}/${displaySize * 2} 2x`;

  return (
    <span
      className={cn("block shrink-0 overflow-hidden rounded-full bg-muted", className)}
      style={{ width: displaySize, height: displaySize }}
    >
      <img
        src={src}
        srcSet={srcSet}
        alt={alt}
        width={displaySize}
        height={displaySize}
        loading="lazy"
        decoding="async"
        aria-hidden={alt ? undefined : true}
        className="size-full object-cover"
      />
    </span>
  );
}
