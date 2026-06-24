import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { RiCheckLine, RiFileCopyLine, RiFingerprintLine } from "react-icons/ri";
import QRCode from "qrcode";

import { cn } from "#/lib/utils";
import { hueFromSeed, type WalletToken } from "./wallet-data";

/* ------------------------------------------------------------------ */
/*  Token logo                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Address helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Renders a hex address with the head and tail bytes emphasised — mirrors
 * how block explorers highlight the checksummed portions.
 */
export function HighlightAddress({
  address,
  className,
  tailLength = 4,
}: {
  address: string;
  className?: string;
  tailLength?: number;
}) {
  const head = address.slice(2, 6);
  const tail = address.slice(-tailLength);
  const mid = address.slice(6, -tailLength);
  return (
    <span className={cn("font-mono text-muted-foreground text-xs", className)}>
      0x
      <span className="font-semibold text-primary">{head}</span>
      {mid}
      <span className="font-semibold text-primary">{tail}</span>
    </span>
  );
}

export function EllipsizedAddress({ address, className }: { address: string; className?: string }) {
  return (
    <span className={cn("font-mono text-muted-foreground text-xs", className)}>
      0x
      <span className="font-semibold text-primary">{address.slice(2, 6)}</span>…
      <span className="font-semibold text-primary">{address.slice(-6)}</span>
    </span>
  );
}

/** Shortened address label, e.g. `0x91Ab3f…d2E7`. */
export function shortenAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  Avatar — deterministic hue disc with the seed's first letter       */
/* ------------------------------------------------------------------ */

export function HueAvatar({
  seed,
  label,
  size = 30,
  icon,
}: {
  seed: string;
  label?: string;
  size?: number;
  icon?: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: hueFromSeed(seed) }}
    >
      {icon ?? label?.slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Network badge, sign hint, success check                            */
/* ------------------------------------------------------------------ */

export function NetworkBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-border bg-card px-2 py-0.5 font-semibold text-xs",
        className,
      )}
    >
      <span className="size-2 rounded-full bg-[oklch(0.78_0.17_120)]" />
      <Trans>Celo network</Trans>
    </span>
  );
}

export function SignHint({ label, className }: { label?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border border-border bg-muted px-2.5 py-2 text-muted-foreground text-xs",
        className,
      )}
    >
      <RiFingerprintLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{label ?? <Trans>You'll confirm with Face ID, fingerprint or PIN</Trans>}</span>
    </div>
  );
}

export function SuccessCheck({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary",
        className,
      )}
      style={{ width: 56, height: 56 }}
    >
      <RiCheckLine className="size-7" aria-hidden="true" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Copyable address row                                               */
/* ------------------------------------------------------------------ */

export function CopyableAddress({ address, className }: { address: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 border border-border bg-card p-3", className)}>
      <span className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">{address}</span>
      <span className="flex size-8 shrink-0 items-center justify-center bg-muted text-muted-foreground">
        <RiFileCopyLine className="size-3.5" aria-hidden="true" />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  QR code — real scannable matrix for the connected address          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Row primitives — back navigation, list chevron, section header     */
/* ------------------------------------------------------------------ */

export function BackChevron({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-ml-1.5 flex h-11 items-center gap-1.5 px-1.5 font-medium text-muted-foreground text-sm",
        className,
      )}
    >
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-3", className)}>
      <h2 className="font-heading font-semibold text-base">{title}</h2>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          className="font-medium text-foreground text-sm underline-offset-4 hover:underline"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}
