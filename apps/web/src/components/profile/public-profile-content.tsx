import {
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
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { retainedProfileData } from "#/features/public-profiles/hooks/use-public-profile";
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
  const sections = PROFILE_SECTIONS.filter((section) => profile.sections[section]);
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
      <ProfileSections
        key={`${profile.address.toLowerCase()}:${sections[0] ?? ""}`}
        address={profile.address}
        sections={sections}
        gridClassName={gridClassName}
      />
    </div>
  );
}

function ProfileSections({
  address,
  sections,
  gridClassName,
}: {
  address: string;
  sections: ProfileSection[];
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
  };
  const [firstSectionLaidOut, setFirstSectionLaidOut] = useState(false);
  const observeLaterSections = useCallback(() => setFirstSectionLaidOut(true), []);

  return sections.map((section, index) => (
    <ProfileSectionDisclosure
      key={section}
      label={labels[section]}
      eager={index === 0}
      canObserve={firstSectionLaidOut}
      onClose={index === 0 ? observeLaterSections : undefined}
    >
      <ProfileResources
        address={address}
        section={section}
        gridClassName={gridClassName}
        onInitialLayout={index === 0 ? observeLaterSections : undefined}
      />
    </ProfileSectionDisclosure>
  ));
}

function ProfileSectionDisclosure({
  label,
  eager,
  canObserve,
  onClose,
  children,
}: {
  label: string;
  eager: boolean;
  canObserve: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [requested, setRequested] = useState(false);
  const summary = useRef<HTMLElement>(null);
  const shouldLoad = eager || requested;
  useEffect(() => {
    const target = summary.current;
    if (!open || shouldLoad || !target) return;
    if (typeof IntersectionObserver === "undefined") {
      setRequested(true);
      return;
    }
    // While the first section only has a spinner, headings normally below its
    // resource grid can all briefly fit on screen.
    if (!canObserve) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRequested(true);
          observer.disconnect();
        }
      },
      { root: profileScrollContainer(target), rootMargin: "200px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [canObserve, open, shouldLoad]);

  return (
    <details
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (!nextOpen) onClose?.();
      }}
      className="border-t border-border py-4"
    >
      <summary
        ref={summary}
        className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary"
        onClick={(event) => {
          // Native mouse/keyboard activation can explicitly reopen a section
          // before its observer is ready. The initial open toggle is not intent.
          if (event.currentTarget.closest("details")?.open === false) setRequested(true);
        }}
      >
        {label}
      </summary>
      {open && shouldLoad ? <div className="mt-4">{children}</div> : null}
    </details>
  );
}

function profileScrollContainer(target: Element): Element | null {
  // Desktop scrolls inside the shell; phone uses the document viewport.
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.scrollingElement) break;
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
  }
  return null;
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
  const details = retainedProfileData(query);
  if (!details)
    return <ProfileReadError retry={() => void query.refetch()} pending={query.isFetching} />;
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
      {query.isError ? (
        <ProfileReadError retry={() => void query.refetch()} pending={query.isFetching} />
      ) : null}
    </div>
  );
}

function ProfileResources({
  address,
  section,
  gridClassName,
  onInitialLayout,
}: {
  address: string;
  section: ProfileSection;
  gridClassName?: string;
  onInitialLayout?: () => void;
}) {
  const query = useInfiniteQuery(
    profileResourcesQueryOptions(publicProfilesClient, address, section),
  );
  useEffect(() => {
    if (!query.isPending) onInitialLayout?.();
  }, [onInitialLayout, query.isPending]);
  const pages = retainedProfileData(query)?.pages;
  const unpublished = pages?.some((page) => page === null) ?? false;
  const rows = unpublished ? [] : (pages?.flatMap((page) => page?.items ?? []) ?? []);
  const retry = () => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch());
  return (
    <div className="space-y-3">
      {query.isPending ? <ProfileLoading /> : null}
      {rows.length ? (
        <div className={cn("grid gap-3", gridClassName)}>
          {rows.map((row) => (
            <ProfileResourceLink key={`${row.kind}:${row.id}`} row={row} />
          ))}
        </div>
      ) : query.isSuccess && !unpublished ? (
        <p className="text-sm text-muted-foreground">
          <Trans>No resources to show.</Trans>
        </p>
      ) : null}
      {query.isError || unpublished ? (
        <ProfileReadError pending={query.isFetching} retry={retry} />
      ) : null}
      {query.hasNextPage && !query.isError && !unpublished ? (
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
