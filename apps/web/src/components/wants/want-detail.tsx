import {
  wantCreatorPoolsInfiniteQueryOptions,
  wantCreatorVouchersInfiniteQueryOptions,
} from "@clc/api/features/wants/queries";
import type { WantCreatorPool, WantCreatorVoucher } from "@clc/api/features/wants/client";
import type { Want } from "@clc/core/features/wants/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense, type ReactNode } from "react";
import {
  RiArrowRightSLine,
  RiExternalLinkLine,
  RiMailLine,
  RiPhoneLine,
  RiShareLine,
} from "react-icons/ri";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { TagBadge } from "#/components/ui/tag-badge";
import { PoolLogo, VoucherAvatar } from "#/components/wallet";
import { WantPicture } from "./want-row";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { wantsClient } from "#/lib/api/wants";

export function WantDetail({
  want,
  showHeader = true,
  distanceOrigin = null,
  showLocationMap = false,
  showRelated = false,
}: {
  want: Want;
  showHeader?: boolean;
  distanceOrigin?: { lat: number; lng: number } | null;
  showLocationMap?: boolean;
  showRelated?: boolean;
}) {
  const { i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const distance = useMarketDistanceLabel(distanceOrigin, { lat: want.geoLat, lng: want.geoLng });
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${want.geoLat},${want.geoLng}`)}`;
  return (
    <div className="space-y-4">
      {showHeader ? (
        <header className="border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <WantPicture want={want} size="size-14" />
            <div className="min-w-0 flex-1">
              <h1 dir="auto" className="font-heading text-[1.75rem] font-bold leading-tight">
                {want.name}
              </h1>
              <p dir="auto" className="mt-1 text-xs text-muted-foreground">
                <Trans>Wanted by {want.ownerName}</Trans>
              </p>
            </div>
            <WantShareButton want={want} />
          </div>
        </header>
      ) : null}

      {want.tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {want.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} size="sm" />
          ))}
        </div>
      ) : null}

      <section className="space-y-2 border border-border bg-card p-4">
        <h2>
          <Trans>When and where</Trans>
        </h2>
        <a
          dir="auto"
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-4"
        >
          <span>
            {want.locationName}
            {distance ? ` · ${distance}` : null}
          </span>
          <RiExternalLinkLine className="size-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">
            <Trans>Open location in Google Maps</Trans>
          </span>
        </a>
        {showLocationMap ? (
          <Suspense
            fallback={
              <output className="block h-52 w-full border border-border bg-card">
                <span className="sr-only">
                  <Trans>Loading location map</Trans>
                </span>
              </output>
            }
          >
            <LocationMap
              lat={want.geoLat}
              lng={want.geoLng}
              markerStyle={{ icon: want.markerIcon, color: want.markerColor }}
            />
          </Suspense>
        ) : null}
        <p className="font-mono text-xs text-muted-foreground">
          <Trans>Starts {dates.format(new Date(want.startsAt))}</Trans>
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {want.expiresAt ? (
            <Trans>Ends {dates.format(new Date(want.expiresAt))}</Trans>
          ) : (
            <Trans>No ending date</Trans>
          )}
        </p>
      </section>

      <section className="space-y-2 border border-border bg-card p-4">
        <h2>
          <Trans>Description</Trans>
        </h2>
        <p dir="auto" className="whitespace-pre-wrap text-sm">
          {want.description}
        </p>
      </section>

      {want.contact ? (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2>
            <Trans>Contact</Trans>
          </h2>
          {want.contact.text ? (
            <p dir="auto" className="whitespace-pre-wrap text-sm">
              {want.contact.text}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {want.contact.email ? (
              <Button asChild variant="outline" tap>
                <a href={`mailto:${want.contact.email}`}>
                  <RiMailLine aria-hidden="true" />
                  <Trans>Email</Trans>
                </a>
              </Button>
            ) : null}
            {want.contact.phone ? (
              <Button asChild variant="outline" tap>
                <a href={`tel:${want.contact.phone}`}>
                  <RiPhoneLine aria-hidden="true" />
                  <Trans>Call</Trans>
                </a>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {showRelated ? <WantCreatorResources want={want} /> : null}
    </div>
  );
}

function WantCreatorResources({ want }: { want: Want }) {
  const vouchers = useInfiniteQuery(wantCreatorVouchersInfiniteQueryOptions(wantsClient, want.id));
  const pools = useInfiniteQuery(wantCreatorPoolsInfiniteQueryOptions(wantsClient, want.id));
  return (
    <>
      <RelatedSection
        title={<Trans>Vouchers by {want.ownerName}</Trans>}
        pending={vouchers.isPending}
        error={vouchers.isError}
        fetching={vouchers.isFetchingNextPage}
        hasMore={vouchers.hasNextPage}
        onRetry={() => void vouchers.refetch()}
        onLoadMore={() => void vouchers.fetchNextPage()}
        empty={<Trans>No vouchers yet.</Trans>}
        errorMessage={<Trans>Couldn't load vouchers.</Trans>}
      >
        {vouchers.data?.pages
          .flatMap((page) => page.vouchers)
          .map((voucher) => (
            <CreatorVoucherRow
              key={voucher.address.toLowerCase()}
              voucher={voucher}
              wantId={want.id}
            />
          ))}
      </RelatedSection>
      <RelatedSection
        title={<Trans>Creditable pools</Trans>}
        pending={pools.isPending}
        error={pools.isError}
        fetching={pools.isFetchingNextPage}
        hasMore={pools.hasNextPage}
        onRetry={() => void pools.refetch()}
        onLoadMore={() => void pools.fetchNextPage()}
        empty={<Trans>No pools yet.</Trans>}
        errorMessage={<Trans>Couldn't load pools.</Trans>}
      >
        {pools.data?.pages
          .flatMap((page) => page.pools)
          .map((pool) => (
            <CreatorPoolRow key={pool.address.toLowerCase()} pool={pool} wantId={want.id} />
          ))}
      </RelatedSection>
    </>
  );
}

function RelatedSection({
  title,
  pending,
  error,
  fetching,
  hasMore,
  onRetry,
  onLoadMore,
  empty,
  errorMessage,
  children,
}: {
  title: ReactNode;
  pending: boolean;
  error: boolean;
  fetching: boolean;
  hasMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  empty: ReactNode;
  errorMessage: ReactNode;
  children: ReactNode;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="space-y-3 border border-border bg-card p-4">
      <h2>{title}</h2>
      {pending ? (
        <p className="text-sm text-muted-foreground">
          <Trans>Loading…</Trans>
        </p>
      ) : error ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm">{errorMessage}</p>
          <Button variant="outline" tap onClick={onRetry}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="border border-border">{children}</div>
      )}
      {hasMore ? (
        <Button variant="outline" tap className="w-full" pending={fetching} onClick={onLoadMore}>
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </section>
  );
}

function CreatorVoucherRow({ voucher, wantId }: { voucher: WantCreatorVoucher; wantId: string }) {
  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: voucher.address }}
      search={{ from: "wants", wantId }}
      className="flex min-h-16 items-center gap-3 border-b border-border p-3 text-start last:border-b-0 active:bg-muted"
    >
      <VoucherAvatar
        address={voucher.address}
        symbol={voucher.symbol}
        iconUrl={voucher.iconUrl}
        size={40}
      />
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold">
          {voucher.name}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
          {voucher.symbol}
        </span>
      </span>
      <RiArrowRightSLine
        className="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100"
        aria-hidden="true"
      />
    </Link>
  );
}

function CreatorPoolRow({ pool, wantId }: { pool: WantCreatorPool; wantId: string }) {
  return (
    <Link
      to="/pools/$poolAddress"
      params={{ poolAddress: pool.address }}
      search={{ wantId }}
      className="flex min-h-16 items-center gap-3 border-b border-border p-3 text-start last:border-b-0 active:bg-muted"
    >
      <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={40} />
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold">
          {pool.name}
        </span>
        <span dir="auto" className="mt-0.5 block truncate text-xs text-muted-foreground">
          {pool.locationName ?? pool.symbol}
        </span>
      </span>
      <RiArrowRightSLine
        className="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100"
        aria-hidden="true"
      />
    </Link>
  );
}

export function WantShareButton({ want }: { want: Pick<Want, "id" | "name"> }) {
  const { t } = useLingui();
  const share = async () => {
    const url = new URL(`/wants/${want.id}`, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: want.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t`Link copied`);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      toast.error(t`Couldn't share this Want.`);
    }
  };
  return (
    <Button variant="ghost" size="icon" onClick={() => void share()} aria-label={t`Share`}>
      <RiShareLine aria-hidden="true" />
    </Button>
  );
}
