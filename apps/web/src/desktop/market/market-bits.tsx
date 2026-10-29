import { Trans } from "@lingui/react/macro";

import { Badge } from "#/components/ui/badge";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import { cn } from "#/lib/utils";

type ResultKind =
  | "goods"
  | "services"
  | "voucher"
  | "offering"
  | "pool"
  | "want"
  | "catalog"
  | "post";

const KIND_BACKGROUND: Record<Exclude<ResultKind, "goods" | "services" | "voucher">, string> = {
  offering: "bg-offer",
  pool: "bg-pool",
  want: "bg-want",
  catalog: "bg-catalog",
  post: "bg-post",
};

/**
 * The square initials mark that leads a result row. A voucher takes the seeded
 * hue its wallet avatar uses; every other kind takes its resource colour.
 */
export function MarketAvatar({
  name,
  seed,
  kind,
  size = "md",
}: {
  name: string;
  seed: string;
  kind: ResultKind;
  size?: "md" | "sm";
}) {
  const seeded = kind === "goods" || kind === "services" || kind === "voucher";
  const letters =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center font-heading font-bold text-white",
        size === "md" ? "size-[34px] text-2xs" : "size-7 text-2xs",
        !seeded && KIND_BACKGROUND[kind],
      )}
      style={seeded ? { background: hueFromSeed(seed.toLowerCase()) } : undefined}
    >
      {letters}
    </span>
  );
}

export function MarketKindBadge({ kind }: { kind: ResultKind }) {
  return (
    <Badge size="sm" variant="outline">
      {kind === "goods" ? (
        <Trans>Goods</Trans>
      ) : kind === "services" ? (
        <Trans>Services</Trans>
      ) : kind === "pool" ? (
        <Trans>Pool</Trans>
      ) : kind === "want" ? (
        <Trans>Want</Trans>
      ) : kind === "catalog" ? (
        <Trans>Catalog</Trans>
      ) : kind === "post" ? (
        <Trans>Post</Trans>
      ) : kind === "offering" ? (
        <Trans>Offer</Trans>
      ) : (
        <Trans>Voucher</Trans>
      )}
    </Badge>
  );
}

/** The voucher colour a thumbnail falls back to when the offering has no photo. */
export function marketSeedGradient(seed: string) {
  const hue = hueFromSeed(seed.toLowerCase());
  return `linear-gradient(135deg, color-mix(in oklch, ${hue} 70%, #000), ${hue})`;
}
