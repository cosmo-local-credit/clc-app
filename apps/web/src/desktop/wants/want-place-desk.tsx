import { myWantQueryOptions, wantDetailQueryOptions } from "@clc/api/features/wants/queries";
import type { Want } from "@clc/core/features/wants/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense, type ReactNode } from "react";
import {
  RiCloseLine,
  RiExternalLinkLine,
  RiMailLine,
  RiPencilLine,
  RiPhoneLine,
  RiShareLine,
} from "react-icons/ri";

import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { SectionHeading } from "#/components/ui/section-heading";
import { Skeleton } from "#/components/ui/skeleton";
import { TagBadge } from "#/components/ui/tag-badge";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { PoolLogo, VoucherAvatar } from "#/components/wallet";
import {
  useWantContact,
  useWantCreatorResources,
  useWantShare,
} from "#/components/wants/use-want-detail";
import { WantPicture } from "#/components/wants/want-row";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskRowList } from "#/desktop/ui/page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { wantsClient } from "#/lib/api/wants";

/**
 * The Want in the market's 380px inspector column: tags, When and where,
 * Description, Contact, then the creator's Vouchers and Creditable pools.
 * Fills its column; the body scrolls under a 52px header.
 */
export function WantPlaceDesk({
  id,
  distanceOrigin,
  onClose,
}: {
  id: string;
  distanceOrigin: { lat: number; lng: number } | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const query = useQuery({ ...wantDetailQueryOptions(wantsClient, id), retry: false });
  const want = query.data;
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-13 shrink-0 items-center gap-2.5 border-border border-b px-4">
        {want ? <WantPicture want={want} size="size-6" /> : null}
        <h2 dir="auto" className="min-w-0 flex-1 truncate font-heading text-base font-semibold">
          {want?.name ?? <Trans>Want</Trans>}
        </h2>
        <Button type="button" variant="ghost" size="icon" aria-label={t`Close`} onClick={onClose}>
          <RiCloseLine aria-hidden="true" />
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-4 pb-6">
        {query.isError ? (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-muted-foreground">
              <Trans>Couldn't load this Want.</Trans>
            </p>
            <Button
              variant="outline"
              pending={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <Trans>Retry</Trans>
            </Button>
          </div>
        ) : want ? (
          <WantPlaceBody want={want} distanceOrigin={distanceOrigin} />
        ) : (
          <Skeleton className="h-40" />
        )}
      </div>
    </div>
  );
}

function WantPlaceBody({
  want,
  distanceOrigin,
}: {
  want: Want;
  distanceOrigin: { lat: number; lng: number } | null;
}) {
  const { t, i18n } = useLingui();
  const auth = useAuthStatus();
  const mine = useQuery({
    ...myWantQueryOptions(wantsClient, auth.address ?? "", want.id),
    enabled: !!auth.address,
    retry: false,
  });
  const share = useWantShare(want);
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const distance = useMarketDistanceLabel(distanceOrigin, { lat: want.geoLat, lng: want.geoLng });
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${want.geoLat},${want.geoLng}`)}`;

  return (
    <>
      <div className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {want.state === "scheduled" ? (
            <Badge variant="outline" size="sm" className="text-want-ink">
              <Trans>Scheduled</Trans>
            </Badge>
          ) : null}
          {want.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} size="sm" />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {mine.data ? (
            <Button asChild variant="ghost" size="icon" aria-label={t`Edit Want`}>
              <Link to="/wallet/wants/$wantId/edit" params={{ wantId: want.id }}>
                <RiPencilLine aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" aria-label={t`Share`} onClick={() => void share()}>
            <RiShareLine aria-hidden="true" />
          </Button>
        </div>
      </div>

      <PlaceSection title={<Trans>When and where</Trans>}>
        <AuthenticatedDetailsGate>
          <Suspense
            fallback={
              <output className="block h-[120px] w-full border border-border bg-card">
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
              className="h-[120px]"
            />
          </Suspense>
        </AuthenticatedDetailsGate>
        <DeskKV
          className="mt-2"
          rows={[
            [
              <Trans key="l">Location</Trans>,
              <AuthenticatedDetailsGate key="v">
                <a
                  dir="auto"
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 max-w-full items-center gap-1 font-sans underline-offset-4 hover:underline"
                >
                  <span className="truncate">
                    {want.locationName}
                    {distance ? ` · ${distance}` : null}
                  </span>
                  <RiExternalLinkLine className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="sr-only">
                    <Trans>Open location in Google Maps</Trans>
                  </span>
                </a>
              </AuthenticatedDetailsGate>,
            ],
            [<Trans key="s">Starts</Trans>, dates.format(new Date(want.startsAt))],
            [
              <Trans key="e">Ends</Trans>,
              want.expiresAt ? (
                dates.format(new Date(want.expiresAt))
              ) : (
                <span className="font-sans font-normal text-muted-foreground">
                  <Trans>No ending date</Trans>
                </span>
              ),
            ],
          ]}
        />
      </PlaceSection>

      <PlaceSection title={<Trans>Description</Trans>}>
        <p dir="auto" className="whitespace-pre-wrap text-sm">
          {want.description}
        </p>
      </PlaceSection>

      <PlaceSection title={<Trans>Contact</Trans>}>
        <AuthenticatedDetailsGate>
          <WantContact wantId={want.id} />
        </AuthenticatedDetailsGate>
      </PlaceSection>

      <WantCreatorLists wantId={want.id} />
    </>
  );
}

function PlaceSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2.5">
      <SectionHeading as="h3" variant="section">
        {title}
      </SectionHeading>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function WantContact({ wantId }: { wantId: string }) {
  const contact = useWantContact(wantId);
  if (contact.isPending) {
    return (
      <p aria-busy="true" className="text-sm text-muted-foreground">
        <Trans>Loading contact information…</Trans>
      </p>
    );
  }
  if (contact.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p className="text-sm">
          <Trans>Couldn't load contact information.</Trans>
        </p>
        <Button
          variant="outline"
          pending={contact.isFetching}
          onClick={() => void contact.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  const data = contact.data;
  if (!data || (!data.text && !data.email && !data.phone)) {
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>No contact details available.</Trans>
      </p>
    );
  }
  return (
    <div className="grid gap-2.5">
      {data.text ? (
        <p dir="auto" className="whitespace-pre-wrap text-sm">
          {data.text}
        </p>
      ) : null}
      {data.email || data.phone ? (
        <div className="grid grid-cols-2 gap-2">
          {data.email ? (
            <Button asChild variant="outline">
              <a href={`mailto:${data.email}`}>
                <RiMailLine aria-hidden="true" />
                <Trans>Email</Trans>
              </a>
            </Button>
          ) : null}
          {data.phone ? (
            <Button asChild variant="outline">
              <a href={`tel:${data.phone}`}>
                <RiPhoneLine aria-hidden="true" />
                <Trans>Call</Trans>
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WantCreatorLists({ wantId }: { wantId: string }) {
  const { vouchers, pools } = useWantCreatorResources(wantId);
  const voucherRows = vouchers.data?.pages.flatMap((page) => page.vouchers) ?? [];
  const poolRows = pools.data?.pages.flatMap((page) => page.pools) ?? [];
  return (
    <>
      <PlaceSection title={<Trans>Vouchers</Trans>}>
        <CreatorList
          pending={vouchers.isPending}
          error={vouchers.isError}
          errorMessage={<Trans>Couldn't load vouchers.</Trans>}
          empty={voucherRows.length === 0 ? <Trans>No vouchers yet.</Trans> : null}
          onRetry={() => void vouchers.refetch()}
          hasMore={vouchers.hasNextPage}
          fetching={vouchers.isFetchingNextPage}
          onLoadMore={() => void vouchers.fetchNextPage()}
        >
          {voucherRows.map((voucher) => (
            <Link
              key={voucher.address.toLowerCase()}
              to="/vouchers/$voucherAddress"
              params={{ voucherAddress: voucher.address }}
              search={{ from: "wants", wantId }}
              className="flex min-h-14 min-w-0 items-center gap-3 px-3.5 py-2.5 hover:bg-muted"
            >
              <VoucherAvatar
                address={voucher.address}
                symbol={voucher.symbol}
                iconUrl={voucher.iconUrl}
                size={34}
              />
              <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-semibold">
                {voucher.name}
              </span>
              <Badge variant="outline" size="sm" className="font-mono" dir="ltr">
                {voucher.symbol}
              </Badge>
            </Link>
          ))}
        </CreatorList>
      </PlaceSection>
      <PlaceSection title={<Trans>Creditable pools</Trans>}>
        <CreatorList
          pending={pools.isPending}
          error={pools.isError}
          errorMessage={<Trans>Couldn't load pools.</Trans>}
          empty={poolRows.length === 0 ? <Trans>No pools yet.</Trans> : null}
          onRetry={() => void pools.refetch()}
          hasMore={pools.hasNextPage}
          fetching={pools.isFetchingNextPage}
          onLoadMore={() => void pools.fetchNextPage()}
        >
          {poolRows.map((pool) => (
            <Link
              key={pool.address.toLowerCase()}
              to="/pools/$poolAddress"
              params={{ poolAddress: pool.address }}
              search={{ wantId }}
              className="flex min-h-14 min-w-0 items-center gap-3 px-3.5 py-2.5 hover:bg-muted"
            >
              <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={34} />
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-sm font-semibold">
                  {pool.name}
                </span>
                <span dir="auto" className="block truncate text-xs text-muted-foreground">
                  {pool.locationName ?? pool.symbol}
                </span>
              </span>
            </Link>
          ))}
        </CreatorList>
      </PlaceSection>
    </>
  );
}

function CreatorList({
  pending,
  error,
  errorMessage,
  empty,
  onRetry,
  hasMore,
  fetching,
  onLoadMore,
  children,
}: {
  pending: boolean;
  error: boolean;
  errorMessage: ReactNode;
  empty: ReactNode;
  onRetry: () => void;
  hasMore: boolean;
  fetching: boolean;
  onLoadMore: () => void;
  children: ReactNode;
}) {
  if (pending) {
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>Loading…</Trans>
      </p>
    );
  }
  if (error) {
    return (
      <div className="space-y-2" role="alert">
        <p className="text-sm">{errorMessage}</p>
        <Button variant="outline" onClick={onRetry}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  if (empty) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="grid gap-2">
      <DeskRowList>{children}</DeskRowList>
      {hasMore ? (
        <Button variant="outline" className="w-full" pending={fetching} onClick={onLoadMore}>
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
}
