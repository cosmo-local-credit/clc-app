import type { PoolVoucher } from "@clc/api/features/pools/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { RiArrowLeftRightLine, RiArrowRightUpLine, RiQrCodeLine } from "react-icons/ri";
import { ManagerClosureNotice } from "#/components/closure/manager-closure-notice";
import { Badge } from "#/components/ui/badge";
import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { PoolReviewsPanel } from "#/components/reviews/voucher-reviews-panel";
import { ReportList } from "#/components/reports/report-list";
import { ReviewSummaryContent } from "#/components/reviews/review-summary";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { BackChevron, PoolLogo } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { usePoolReportsInfinite } from "#/features/home/hooks/use-reports";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { MultisigOwnerNotice } from "#/components/safe/multisig-owner-notice";
import { useRefreshPoolOfferingsOnMembership } from "#/features/pools/hooks/use-pool-offerings-refresh";
import { usePoolVouchersWithStatus } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import { usePoolSideNavigation } from "#/lib/navigation/pool-side";
import { isAdminRole } from "@clc/core/features/users/roles";
import { PoolActivityPanel } from "./pool-activity-panel";
import { PoolControlsPanel } from "./pool-controls-panel";
import { PoolCreditPanel } from "./pool-credit-panel";
import { PoolHoldingsPanel } from "./pool-holdings-panel";
import { PoolInfoPanel } from "./pool-info-panel";
import { PoolOfferingsPanel } from "./pool-offerings-panel";
import { PoolReceiveSheet } from "./pool-receive-sheet";
import { PoolVoucherSheet } from "./pool-voucher-sheet";
import { PoolWantsPanel } from "./pool-wants-panel";

export type PoolDetailTab = "offerings" | "wants" | "holdings" | "credit" | "activity" | "info";

// Holdings and credit sit side by side because they read the same rows two
// ways: what the pool is made of, and how much more of each it will take.
const POOL_TABS: PoolDetailTab[] = ["offerings", "wants", "holdings", "credit", "activity", "info"];

const TAB_LABELS: Record<PoolDetailTab, ReactNode> = {
  offerings: <Trans>Offerings</Trans>,
  wants: <Trans>Wants</Trans>,
  // Its own message rather than the wallet's: a tab has a fifth of a 360px
  // row, and a translation that suits a section heading — Italian's
  // "Disponibilità" — does not fit one.
  holdings: <Trans context="Pool tab">Holdings</Trans>,
  credit: <Trans>Credit</Trans>,
  activity: <Trans>Activity</Trans>,
  info: <Trans>Info</Trans>,
};

export function PoolDetailPage({
  poolAddress,
  activeTab,
  wantId,
}: {
  poolAddress: string;
  activeTab: PoolDetailTab;
  wantId?: string;
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const poolQuery = useUserPoolByAddress(
    poolAddress,
    auth.isAuthenticated ? auth.session?.address : undefined,
  );
  const pool = poolQuery.data;
  // The same rule the voucher screen applies: the backend session's address
  // must be the catalog owner, or the session must have an administrative role. clc-core
  // decides for real; this only keeps the button off everyone else's screen.
  // The owner itself, or a signer of the Safe that owns the pool.
  const ownerInfo = useAssetOwnerInfo(poolAddress, pool?.ownerAddress);
  const isPoolOwner =
    auth.isAuthenticated &&
    !!pool &&
    !!auth.session?.address &&
    !!pool.ownerAddress &&
    ownerInfo.canManage;
  // Public composition hides retired vouchers. The owner's protected read,
  // which clc-core also grants a Safe owner's signers, retains them so
  // withdrawal controls can recover every recorded holding. Browse rows below
  // still hide retired vouchers whose public page is gone.
  const poolVouchersQuery = usePoolVouchersWithStatus(pool, {
    all: true,
    owner: isPoolOwner ? auth.session?.address : undefined,
  });
  const poolVouchers = poolVouchersQuery.vouchers;
  const vouchers = poolVouchers.filter((voucher) => voucher.active);
  useRefreshPoolOfferingsOnMembership(
    poolAddress,
    !!pool && !poolVouchersQuery.isPending && !poolVouchersQuery.isError,
    vouchers,
  );
  const canEditDetails =
    auth.isAuthenticated && !!pool && (isAdminRole(auth.session?.role) || isPoolOwner);
  // On-chain management is narrower than editing the record. Every call behind
  // it is `onlyOwner` on a contract the pool's owner deployed, so an administrator —
  // who may correct the catalog for anyone — would only be signing a revert.
  const canManageOnChain = isPoolOwner;
  const [managing, setManaging] = useState<PoolVoucher | null>(null);
  // The approve sheet lives in `tool=approve`, the param the desktop panel
  // uses, so one link opens either view and Back closes it.
  const side = usePoolSideNavigation();
  const approving = side.request?.kind === "tool" && side.request.tool === "approve";
  const [receiving, setReceiving] = useState(false);
  const selectedTab =
    pool?.active === false && activeTab !== "activity" && activeTab !== "info"
      ? "holdings"
      : activeTab;
  const visibleTabs =
    pool?.active === false
      ? POOL_TABS.filter((tab) => tab === "holdings" || tab === "activity" || tab === "info")
      : auth.isAuthenticated
        ? POOL_TABS
        : POOL_TABS.filter(
            (tab) => tab === "offerings" || tab === "wants" || tab === "holdings" || tab === "info",
          );

  if (poolQuery.isPending) {
    return <DetailShell message={t`Loading pool…`} />;
  }
  if (poolQuery.isError) {
    return <DetailShell message={t`Couldn't load this pool.`} />;
  }
  if (!pool) {
    return <DetailShell message={t`Pool not found.`} />;
  }

  return (
    <div className="space-y-3">
      <BackChevron
        label={wantId ? t`Want` : t`Pools`}
        to={wantId ? `/wants/${wantId}` : "/market"}
        search={wantId ? undefined : { scope: "pools" }}
      />
      <section className="border border-border bg-card p-3">
        <div className="flex items-start gap-3">
          <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={42} />
          <div className="min-w-0 flex-1 overflow-hidden">
            <h1 className="truncate font-heading text-[1.75rem] font-bold leading-tight">
              {pool.name}
            </h1>
            <MultisigOwnerNotice info={ownerInfo.info} />
            <p
              dir="auto"
              className="mt-1 line-clamp-3 overflow-hidden text-muted-foreground text-xs break-words"
            >
              {pool.description}
            </p>
            <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground text-xs">
              <ReviewSummaryContent kind="pool" address={pool.address} />
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pool.tags.map((tag) => (
                <Badge key={tag} variant="muted" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      {pool.active === false ? (
        <div role="status" className="space-y-1 border border-border bg-muted p-3 text-sm">
          <p className="font-semibold">
            <Trans>Retired pool</Trans>
          </p>
          <p>
            <Trans>
              This pool is hidden from discovery and does not accept new swaps or deposits in CLC.
              You can still withdraw funds and view its history.
            </Trans>
          </p>
        </div>
      ) : null}

      <ManagerClosureNotice closure={pool.managerClosure} resource="pool" active={pool.active} />

      {/* The three-up action row the wallet screen already uses, so a pool's
          actions are read the same way as every other screen's: the icon over
          a 12px label, which fits a third of a 360px row in every catalog. */}
      {auth.isAuthenticated && pool.active !== false ? (
        <section className="grid grid-cols-3 gap-2" aria-label={t`Pool actions`}>
          <Button asChild size="lg" className="flex-col gap-1 px-1 text-xs leading-tight">
            <Link to="/pools/$poolAddress/swap" params={{ poolAddress }}>
              <RiArrowLeftRightLine className="size-4" aria-hidden="true" />
              <Trans>Swap</Trans>
            </Link>
          </Button>
          {/* A shortcut into the ordinary send flow with the pool as the
            recipient, rather than a flow of its own. Back returns here on its
            own: BackChevron prefers real history over its deep-link fallback.
            `returnPool` rides along to the receipt so finishing the send lands
            back on this pool rather than on the wallet. */}
          <Button
            asChild
            variant="outline"
            size="lg"
            className="flex-col gap-1 px-1 text-xs leading-tight"
          >
            <Link
              to="/wallet/send/amount"
              search={{
                recipient: pool.address,
                recipientLabel: pool.name,
                returnPool: pool.address,
              }}
            >
              <RiArrowRightUpLine className="size-4" aria-hidden="true" />
              <Trans>Deposit</Trans>
            </Link>
          </Button>
          {/* The sheet's own title carries "Receive vouchers"; the trigger stays a
            one-word label so all three fit a 360px row. */}
          <Button
            variant="info"
            size="lg"
            className="flex-col gap-1 px-1 text-xs leading-tight"
            onClick={() => setReceiving(true)}
          >
            <RiQrCodeLine className="size-4" aria-hidden="true" />
            <Trans>Receive</Trans>
          </Button>
        </section>
      ) : null}

      {auth.isAuthenticated && pool.active !== false ? (
        <>
          <PoolReceiveSheet pool={pool} open={receiving} onClose={() => setReceiving(false)} />
          <AddToCatalogButton kind="pool" resourceId={pool.id} address={pool.address} tap />
        </>
      ) : null}

      {canEditDetails ? (
        <PoolControlsPanel
          pool={pool}
          vouchers={poolVouchers}
          canManageOnChain={canManageOnChain}
          viewerAddress={auth.session?.address}
          privateInfo={
            poolQuery.privateInfo
              ? {
                  ...poolQuery.privateInfo,
                  retry: () => void poolQuery.privateInfo?.refetch(),
                }
              : undefined
          }
        />
      ) : null}

      <div
        className="flex overflow-x-auto border border-border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t`Pool contents`}
      >
        {visibleTabs.map((tab) => {
          const label = TAB_LABELS[tab];
          // Five tabs leave about 60px a label at 360px. A label of two words
          // wraps onto a second line centred under the first; a single word
          // has to fit, which is what the tab's own `context` is for.
          const className = [
            "flex h-10 min-w-20 flex-1 items-center justify-center px-2 text-center text-2xs leading-tight font-semibold",
            selectedTab === tab ? "bg-foreground text-background" : "text-muted-foreground",
          ].join(" ");

          if (selectedTab === tab) {
            return (
              <button
                key={tab}
                type="button"
                id={`pool-tab-${tab}`}
                role="tab"
                aria-selected="true"
                aria-controls={`pool-panel-${tab}`}
                className={className}
              >
                {label}
              </button>
            );
          }

          return (
            <Link
              key={tab}
              id={`pool-tab-${tab}`}
              role="tab"
              aria-selected="false"
              aria-controls={`pool-panel-${tab}`}
              to="/pools/$poolAddress"
              params={{ poolAddress }}
              search={{ tab: tab === "offerings" ? undefined : tab }}
              // Switching panel on the same screen is not a navigation: Back
              // must leave the pool, not walk back through visited tabs.
              replace
              resetScroll={false}
              className={className}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {pool.active !== false && selectedTab === "offerings" ? (
        <PoolOfferingsPanel poolAddress={poolAddress} vouchers={vouchers} />
      ) : null}

      {pool.active !== false && selectedTab === "wants" ? (
        <PoolWantsPanel poolAddress={poolAddress} />
      ) : null}

      {selectedTab === "holdings" ? (
        <PoolHoldingsPanel
          pool={pool}
          catalog={poolVouchersQuery}
          canManageOnChain={canManageOnChain}
          onManage={setManaging}
          onApprove={side.openApprove}
        />
      ) : null}

      {pool.active !== false && selectedTab === "credit" ? (
        <PoolCreditPanel pool={pool} vouchers={vouchers} />
      ) : null}

      {selectedTab === "activity" ? <PoolActivityPanel pool={pool} /> : null}

      {selectedTab === "info" ? (
        <AuthenticatedDetailsGate className="border border-border bg-card p-4">
          <AuthenticatedPoolInfo
            pool={pool}
            privateInfo={
              poolQuery.privateInfo
                ? {
                    ...poolQuery.privateInfo,
                    retry: () => void poolQuery.privateInfo?.refetch(),
                  }
                : undefined
            }
          />
        </AuthenticatedDetailsGate>
      ) : null}

      <section id="pool-reviews" className="space-y-3" aria-labelledby="pool-reviews-title">
        <SectionHeading id="pool-reviews-title" as="h2">
          <Trans>Reviews</Trans>
        </SectionHeading>
        <PoolReviewsPanel key={poolAddress} address={poolAddress} presentation="section" />
      </section>

      <PoolPostsSection
        pool={{ chainId: pool.chainId, address: pool.address }}
        authenticated={auth.isAuthenticated}
        authLoading={auth.isLoading}
      />

      {canManageOnChain ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={poolVouchers}
          voucher={null}
          approveSeed={approving ? side.approveSeed : null}
          open={approving}
          onClose={side.close}
        />
      ) : null}

      {canManageOnChain && managing ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={poolVouchers}
          voucher={managing}
          open
          onClose={() => setManaging(null)}
        />
      ) : null}
    </div>
  );
}

function PoolPostsSection({
  pool,
  authenticated,
  authLoading,
}: {
  pool: { chainId: number | null; address: `0x${string}` };
  authenticated: boolean;
  authLoading: boolean;
}) {
  const { t } = useLingui();
  const poolRef =
    pool.chainId === null ? undefined : { chainId: pool.chainId, address: pool.address };
  const query = usePoolReportsInfinite(poolRef, 3, authenticated && !!poolRef);
  const reports = query.data?.pages.flatMap((page) => page.reports) ?? [];

  let content: ReactNode;
  if (authLoading) {
    content = <Trans>Loading posts…</Trans>;
  } else if (!authenticated) {
    content = <Trans>Sign in to view posts.</Trans>;
  } else if (query.isPending) {
    content = <Trans>Loading posts…</Trans>;
  } else if (query.isError) {
    content = (
      <div className="space-y-2">
        <p>
          <Trans>Couldn't load posts.</Trans>
        </p>
        <Button
          variant="outline"
          tap
          pending={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <Trans>Try again</Trans>
        </Button>
      </div>
    );
  } else if (reports.length === 0) {
    content = <Trans>No posts yet.</Trans>;
  } else {
    content = <ReportList reports={reports} ariaLabel={t`Posts`} />;
  }

  return (
    <section id="pool-posts" className="space-y-3" aria-labelledby="pool-posts-title">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading id="pool-posts-title" as="h2">
          <Trans>Posts</Trans>
        </SectionHeading>
        {poolRef ? (
          <Button asChild variant="outline" tap>
            <Link
              to="/"
              search={{
                tab: "posts",
                timing: "all",
                pools: `${poolRef.chainId}:${pool.address.toLowerCase()}`,
              }}
            >
              <Trans>View all</Trans>
            </Link>
          </Button>
        ) : null}
      </div>
      <div
        className={
          reports.length > 0
            ? undefined
            : "border border-border bg-card p-4 text-muted-foreground text-sm"
        }
      >
        {content}
      </div>
    </section>
  );
}

function AuthenticatedPoolInfo({
  pool,
  privateInfo,
}: {
  pool: Parameters<typeof PoolInfoPanel>[0]["pool"];
  privateInfo?: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    retry: () => void;
  };
}) {
  if (privateInfo?.isPending) {
    return (
      <p aria-busy="true" className="text-sm text-muted-foreground">
        <Trans>Loading pool information…</Trans>
      </p>
    );
  }
  if (privateInfo?.isError) {
    return (
      <div role="alert" className="space-y-3 text-sm">
        <p>
          <Trans>Couldn't load pool information.</Trans>
        </p>
        <Button variant="outline" tap pending={privateInfo.isFetching} onClick={privateInfo.retry}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  return <PoolInfoPanel pool={pool} />;
}

function DetailShell({ message }: { message: string }) {
  const { t } = useLingui();
  return (
    <div className="space-y-3">
      <BackChevron label={t`Pools`} to="/market" search={{ scope: "pools" }} />
      <p className="border border-border bg-card p-3 text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
