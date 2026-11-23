import {
  profileActivityQueryOptions,
  profileDetailsQueryOptions,
  profileResourcesQueryOptions,
} from "@clc/api/features/public-profiles/queries";
import {
  PROFILE_SECTIONS,
  type ProfileResource,
  type ProfileSection,
  type PublicProfile,
} from "@clc/core/features/public-profiles/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense, useState, type ReactNode } from "react";
import { RiArticleLine } from "react-icons/ri";
import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { RESOURCE_HUE, RESOURCE_ICON, POST_RESOURCE_HUE } from "#/components/resource-tone";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { SectionHeading } from "#/components/ui/section-heading";
import { Spinner } from "#/components/ui/spinner";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { publicProfilesClient } from "#/lib/api/public-profiles";
import { cn } from "#/lib/utils";

/** Public-data content shared by the two independent page layouts. */
export function PublicProfileContent({
  profile,
  gridClassName,
}: {
  profile: PublicProfile;
  gridClassName?: string;
}) {
  const { t } = useLingui();
  const labels: Record<ProfileSection, string> = {
    vouchers: t`Vouchers`,
    offers: t`Offers`,
    wants: t`Wants`,
    pools: t`Pools`,
    posts: t`Posts`,
    catalogs: t`Catalogs`,
    activity: t`Transaction activity`,
  };
  return (
    <div className="space-y-6">
      {profile.bio ? (
        <p dir="auto" className="whitespace-pre-wrap text-sm">
          {profile.bio}
        </p>
      ) : null}
      {profile.website && isHttpUrl(profile.website) ? (
        <a
          href={profile.website}
          target="_blank"
          rel="noopener noreferrer"
          className="block break-all text-sm underline"
          dir="ltr"
        >
          {profile.website}
        </a>
      ) : null}
      {profile.country ? <p className="text-sm">{profile.country}</p> : null}
      {profile.preferredCurrency ? (
        <p className="font-mono text-sm">{profile.preferredCurrency}</p>
      ) : null}
      {profile.hasPrivateDetails ? (
        <section className="space-y-3">
          <SectionHeading>
            <Trans>Contact and location</Trans>
          </SectionHeading>
          <AuthenticatedDetailsGate>
            <ProfileDetails address={profile.address} />
          </AuthenticatedDetailsGate>
        </section>
      ) : null}
      {PROFILE_SECTIONS.filter((section) => profile.sections[section]).map((section) => (
        <ProfileSectionDisclosure key={section} label={labels[section]}>
          {section === "activity" ? (
            <ProfileActivity address={profile.address} />
          ) : (
            <ProfileResources
              address={profile.address}
              section={section}
              gridClassName={gridClassName}
            />
          )}
        </ProfileSectionDisclosure>
      ))}
    </div>
  );
}

function ProfileSectionDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="border-t border-border py-4"
    >
      <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
        {label}
      </summary>
      {open ? <div className="mt-4">{children}</div> : null}
    </details>
  );
}

function ProfileDetails({ address }: { address: string }) {
  const auth = useAuthStatus();
  const query = useQuery(
    profileDetailsQueryOptions(
      publicProfilesClient,
      address,
      auth.isAuthenticated ? auth.session?.address : undefined,
    ),
  );
  if (query.isPending) return <ProfileLoading />;
  if (query.isError)
    return <ProfileReadError retry={() => void query.refetch()} pending={query.isFetching} />;
  const details = query.data;
  return (
    <div className="space-y-3 text-sm">
      {details.email ? <p dir="ltr">{details.email}</p> : null}
      {details.phone ? (
        <p dir="ltr" className="font-mono">
          {details.phone}
        </p>
      ) : null}
      {details.locationName ? <p dir="auto">{details.locationName}</p> : null}
      {details.geoLat != null && details.geoLng != null ? (
        <Suspense fallback={<ProfileLoading />}>
          <LocationMap lat={details.geoLat} lng={details.geoLng} className="h-52 w-full" />
        </Suspense>
      ) : null}
    </div>
  );
}

function ProfileResources({
  address,
  section,
  gridClassName,
}: {
  address: string;
  section: Exclude<ProfileSection, "activity">;
  gridClassName?: string;
}) {
  const query = useInfiniteQuery(
    profileResourcesQueryOptions(publicProfilesClient, address, section),
  );
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="space-y-3">
      {query.isPending ? <ProfileLoading /> : null}
      {rows.length ? (
        <div className={cn("grid gap-3", gridClassName)}>
          {rows.map((row) => (
            <ProfileResourceLink key={`${row.kind}:${row.id}`} row={row} />
          ))}
        </div>
      ) : query.isSuccess ? (
        <p className="text-sm text-muted-foreground">
          <Trans>No resources to show.</Trans>
        </p>
      ) : null}
      {query.isError ? (
        <ProfileReadError pending={query.isFetching} retry={() => void query.refetch()} />
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          tap
          pending={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function ProfileResourceLink({ row }: { row: ProfileResource }) {
  const [imageFailed, setImageFailed] = useState(false);
  const scope = row.kind === "post" ? null : (`${row.kind}s` as keyof typeof RESOURCE_ICON);
  const Icon = scope ? RESOURCE_ICON[scope] : RiArticleLine;
  const content = (
    <>
      {row.imageUrl && !imageFailed ? (
        <ProgressiveImage
          src={row.imageUrl}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="size-14 shrink-0 object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "flex size-14 shrink-0 items-center justify-center text-(--ink)",
            scope ? RESOURCE_HUE[scope] : POST_RESOURCE_HUE,
          )}
        >
          <Icon className="size-6" />
        </span>
      )}
      <span className="grid min-w-0 gap-1">
        <span className="text-sm font-semibold" dir="auto">
          {row.name}
        </span>
        {row.symbol ? <span className="font-mono text-xs">{row.symbol}</span> : null}
        {row.description ? (
          <span className="line-clamp-2 text-xs text-muted-foreground" dir="auto">
            {row.description}
          </span>
        ) : null}
        {row.management === "multisig" ? (
          <Badge size="sm" variant="outline" className="justify-self-start">
            <Trans>Multisig managed</Trans>
          </Badge>
        ) : null}
      </span>
    </>
  );
  const className =
    "flex min-w-0 items-start gap-3 border border-border bg-card p-3 hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-primary";
  switch (row.kind) {
    case "offer":
    case "voucher":
      return (
        <Link
          to="/vouchers/$voucherAddress"
          params={{ voucherAddress: row.resourceId }}
          className={className}
        >
          {content}
        </Link>
      );
    case "pool":
      return (
        <Link
          to="/pools/$poolAddress"
          params={{ poolAddress: row.resourceId }}
          className={className}
        >
          {content}
        </Link>
      );
    case "want":
      return (
        <Link to="/wants/$wantId" params={{ wantId: row.resourceId }} className={className}>
          {content}
        </Link>
      );
    case "post":
      return (
        <Link to="/posts/$reportId" params={{ reportId: row.resourceId }} className={className}>
          {content}
        </Link>
      );
    case "catalog":
      return (
        <Link
          to="/catalogs/$catalogId"
          params={{ catalogId: row.resourceId }}
          className={className}
        >
          {content}
        </Link>
      );
  }
}

function ProfileActivity({ address }: { address: string }) {
  const { i18n, t } = useLingui();
  const kindLabels: Record<string, string> = {
    creation: t`Created`,
    sent: t`Sent`,
    received: t`Received`,
    swapped: t`Swap`,
  };
  const query = useInfiniteQuery(profileActivityQueryOptions(publicProfilesClient, address));
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="space-y-3">
      {query.isPending ? <ProfileLoading /> : null}
      {rows.map((row) => (
        <a
          key={row.id}
          href={`https://gnosisscan.io/tx/${row.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block space-y-1 border border-border bg-card p-3 text-sm underline"
        >
          <span>{kindLabels[row.kind] ?? t`Transaction`}</span>
          <span className="block font-mono text-xs">
            {new Intl.DateTimeFormat(i18n.locale, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(row.timestamp))}
          </span>
        </a>
      ))}
      {query.isSuccess && !rows.length ? (
        <p className="text-sm text-muted-foreground">
          <Trans>No transactions to show.</Trans>
        </p>
      ) : null}
      {query.isError ? (
        <ProfileReadError pending={query.isFetching} retry={() => void query.refetch()} />
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          tap
          pending={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
}

export function ProfileLoading() {
  const { t } = useLingui();
  return (
    <div role="status" aria-label={t`Loading…`} className="flex items-center gap-2 p-3">
      <Spinner />
      <span className="text-sm">
        <Trans>Loading…</Trans>
      </span>
    </div>
  );
}

export function ProfileReadError({ retry, pending }: { retry: () => void; pending: boolean }) {
  return (
    <div role="alert" className="space-y-3">
      <p className="text-sm">
        <Trans>Couldn't load profile information.</Trans>
      </p>
      <Button variant="outline" tap pending={pending} onClick={retry}>
        <Trans>Retry</Trans>
      </Button>
    </div>
  );
}
