import type { Offering } from "@clc/api/features/offerings/client";
import type { PoolVoucher } from "@clc/api/features/pools/client";
import {
  formatOfferingDisplayPrice,
  formatOfferingQuantity,
} from "@clc/core/features/market/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RiNavigationLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { Skeleton } from "#/components/ui/skeleton";
import { TagBadge } from "#/components/ui/tag-badge";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import { useVoucherOfferingsInfinite } from "#/features/home/hooks/use-voucher-offerings";
import type { PoolAvailableValue } from "#/features/pools/logic/pool-available-value";
import { poolVoucherCoordinates } from "#/features/pools/logic/pool-voucher-location";
import { openDefaultMaps } from "#/lib/default-maps";
import { cn } from "#/lib/utils";

export type ExploreSheetSnap = "peek" | "half" | "expanded";

const SNAP_FRACTION: Record<ExploreSheetSnap, number> = {
  peek: 0.28,
  half: 0.56,
  expanded: 0.94,
};

const SNAP_ORDER: ExploreSheetSnap[] = ["peek", "half", "expanded"];

export function PoolVoucherExploreSheet({
  poolAddress,
  voucher,
  availableValue,
  availableLoading,
  snap,
  onSnapChange,
  onClose,
}: {
  poolAddress: string;
  voucher: PoolVoucher;
  availableValue: PoolAvailableValue | null;
  availableLoading: boolean;
  snap: ExploreSheetSnap;
  onSnapChange: (snap: ExploreSheetSnap) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useLingui();
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    lastY: number;
    lastAt: number;
  } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const offeringsQuery = useVoucherOfferingsInfinite(voucher.tokenAddress);
  const offerings = offeringsQuery.data?.pages.flatMap((page) => page.offerings) ?? [];
  const coordinates = poolVoucherCoordinates(voucher);
  const canDirect = !!coordinates || !!voucher.locationName;
  const canSwap = !availableLoading && availableValue !== null;
  const availableLabel = availableValue
    ? t`${availableValue.unit} ${formatGroupedAmount(availableValue.value, i18n.locale)} available`
    : t`No value currently available`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function availablePx() {
    const nav = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-offset"),
    );
    const navPx = Number.isFinite(nav) && nav > 0 ? nav : 64;
    return Math.max(window.innerHeight - navPx, 240);
  }

  function heightFor(next: ExploreSheetSnap) {
    return Math.round(availablePx() * SNAP_FRACTION[next]);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const node = sheetRef.current;
    if (!node) return;
    node.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: node.getBoundingClientRect().height,
      lastY: event.clientY,
      lastAt: performance.now(),
    };
    setDragHeight(node.getBoundingClientRect().height);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = Math.min(
      availablePx() * SNAP_FRACTION.expanded,
      Math.max(72, drag.startHeight + (drag.startY - event.clientY)),
    );
    drag.lastY = event.clientY;
    drag.lastAt = performance.now();
    setDragHeight(next);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const elapsed = Math.max(performance.now() - drag.lastAt, 1);
    const velocity = (event.clientY - drag.lastY) / elapsed;
    const height = dragHeight ?? drag.startHeight;
    dragRef.current = null;
    setDragHeight(null);

    if (height < heightFor("peek") * 0.55) {
      onClose();
      return;
    }

    let next: ExploreSheetSnap = "peek";
    if (velocity < -0.4) {
      const currentIndex = SNAP_ORDER.indexOf(snap);
      next = SNAP_ORDER[Math.min(currentIndex + 1, SNAP_ORDER.length - 1)] ?? "expanded";
    } else if (velocity > 0.4) {
      const currentIndex = SNAP_ORDER.indexOf(snap);
      next = SNAP_ORDER[Math.max(currentIndex - 1, 0)] ?? "peek";
    } else {
      next = nearestSnap(height, availablePx());
    }
    onSnapChange(next);
  }

  const height =
    dragHeight === null
      ? `calc((100svh - var(--bottom-nav-offset)) * ${SNAP_FRACTION[snap]})`
      : `${dragHeight}px`;

  return (
    <section
      ref={sheetRef}
      role="region"
      aria-labelledby={titleId}
      className="absolute inset-x-0 z-20 flex flex-col border-t border-border bg-card shadow-[0_-12px_32px_rgba(15,23,42,0.12)]"
      style={{ bottom: "var(--bottom-nav-offset)", height }}
    >
      <div
        className="flex shrink-0 cursor-grab touch-none flex-col pt-2 pb-1 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30" />
        <span className="sr-only">
          <Trans>Drag to resize</Trans>
        </span>
      </div>

      <div className="flex shrink-0 items-start gap-3 px-4 pb-3">
        <SquareImage
          src={voucher.iconUrl}
          name={voucher.name}
          seed={voucher.tokenAddress}
          size={48}
        />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate font-heading text-base font-semibold leading-tight">
            {voucher.name}
          </h2>
          {voucher.description && voucher.description !== voucher.name ? (
            <p className="mt-0.5 truncate text-muted-foreground text-xs">{voucher.description}</p>
          ) : null}
          {availableLoading ? (
            <Skeleton className="mt-1 h-4 w-36 rounded-none" />
          ) : (
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                availableValue ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {availableLabel}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 gap-2 px-4 pb-3">
        <Button
          variant="outline"
          className="h-11 flex-1 bg-card"
          disabled={!canDirect}
          onClick={() =>
            openDefaultMaps({
              label: voucher.locationName,
              lat: coordinates?.lat,
              lng: coordinates?.lng,
            })
          }
        >
          <RiNavigationLine className="size-4" aria-hidden="true" />
          <Trans>Directions</Trans>
        </Button>
        {canSwap ? (
          <Button asChild className="h-11 flex-1">
            <Link
              to="/pools/$poolAddress/swap"
              params={{ poolAddress }}
              search={{ to: voucher.tokenAddress }}
            >
              <Trans>Swap</Trans>
            </Link>
          </Button>
        ) : (
          <Button className="h-11 flex-1" disabled>
            <Trans>Swap</Trans>
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {voucher.description && voucher.description !== voucher.name ? (
          <p className="text-sm leading-relaxed">{voucher.description}</p>
        ) : null}

        {voucher.locationName ? (
          <p className="mt-3 text-muted-foreground text-sm">{voucher.locationName}</p>
        ) : null}

        {voucher.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {voucher.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        ) : null}

        <h3 className="mt-5 mb-2 font-heading text-sm font-semibold">
          <Trans>Offerings</Trans>
        </h3>

        {offeringsQuery.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label={t`Loading offerings`}>
            <Skeleton className="h-16 rounded-none" />
            <Skeleton className="h-16 rounded-none" />
          </div>
        ) : null}

        {offeringsQuery.isError ? (
          <div className="border border-border bg-background p-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Couldn't load offerings.</Trans>
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-9 bg-card"
              onClick={() => offeringsQuery.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}

        {offeringsQuery.isSuccess && offerings.length === 0 ? (
          <p className="border border-border bg-background p-3 text-muted-foreground text-sm">
            <Trans>No offerings have been added yet.</Trans>
          </p>
        ) : null}

        {offerings.length > 0 ? (
          <ul className="divide-y divide-border border border-border">
            {offerings.map((offering) => (
              <OfferingRow
                key={offering.id}
                offering={offering}
                voucher={voucher}
                poolAddress={poolAddress}
                canSwap={canSwap}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function OfferingRow({
  offering,
  voucher,
  poolAddress,
  canSwap,
}: {
  offering: Offering;
  voucher: PoolVoucher;
  poolAddress: string;
  canSwap: boolean;
}) {
  const { t } = useLingui();
  const price = formatOfferingDisplayPrice(
    offering.pricePerUnit,
    voucher.voucherValue,
    voucher.voucherUoa,
    "",
  );
  const quantity = formatOfferingQuantity(
    offering.quantity,
    offering.unitLabel,
    offering.sourceId === null,
  );
  const location =
    offering.locationName && offering.locationName !== voucher.locationName
      ? offering.locationName
      : null;

  return (
    <li className="flex items-center gap-3 bg-card p-3">
      <SquareImage
        src={offering.imageUrl ?? voucher.iconUrl}
        name={offering.name}
        seed={offering.id}
        size={48}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-sm font-semibold">{offering.name}</p>
        {quantity ? (
          <p className="truncate text-muted-foreground text-xs">
            {quantity.value}
            {quantity.unit ? ` ${quantity.unit}` : null}
          </p>
        ) : offering.description ? (
          <p className="truncate text-muted-foreground text-xs">{offering.description}</p>
        ) : null}
        <p className="mt-0.5 font-semibold text-xs">
          {price ? `${price.unit} ${price.value}` : <Trans>Price on request</Trans>}
        </p>
        {location ? <p className="truncate text-muted-foreground text-xs">{location}</p> : null}
        {offering.available ? null : (
          <p className="text-muted-foreground text-xs">
            <Trans>Currently unavailable</Trans>
          </p>
        )}
      </div>
      {canSwap ? (
        <Button asChild size="sm" className="h-11 shrink-0 px-3">
          <Link
            to="/pools/$poolAddress/swap"
            params={{ poolAddress }}
            search={{ to: voucher.tokenAddress }}
            aria-label={t`Swap for ${offering.name}`}
          >
            <Trans>Swap</Trans>
          </Link>
        </Button>
      ) : (
        <Button size="sm" className="h-11 shrink-0 px-3" disabled>
          <Trans>Swap</Trans>
        </Button>
      )}
    </li>
  );
}

function SquareImage({
  src,
  name,
  seed,
  size,
}: {
  src: string | null;
  name: string;
  seed: string;
  size: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const imageUrl = src && failed !== src ? src : null;
  const initials = initialsFromName(name);

  if (imageUrl) {
    return (
      <span
        aria-hidden="true"
        className="relative block shrink-0 overflow-hidden bg-muted"
        style={{ width: size, height: size }}
      >
        <ProgressiveImage
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(imageUrl)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center font-heading font-bold text-white"
      style={{
        width: size,
        height: size,
        background: hueFromSeed(seed.toLowerCase()),
        fontSize: Math.round(size * 0.34),
      }}
    >
      {initials}
    </span>
  );
}

function initialsFromName(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase() ?? "")
    .join("");
  return initials || "V";
}

function nearestSnap(height: number, available: number): ExploreSheetSnap {
  let best: ExploreSheetSnap = "peek";
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of SNAP_ORDER) {
    const delta = Math.abs(height - available * SNAP_FRACTION[candidate]);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

function formatGroupedAmount(value: string, locale: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(number);
}
