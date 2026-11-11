import { isRecoveryLifecycle } from "@clc/core/features/account-retirement/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiDownloadLine, RiSendPlane2Line } from "react-icons/ri";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { HoldingBalance, TokenLogo } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useSignOut } from "#/features/home/hooks/use-sign-out";
import { SignOutRow } from "#/features/home/ui/settings-page";
import { useRecoveryAssets } from "#/features/account-retirement/hooks/use-recovery-assets";
import { useRestoreAccount } from "#/features/account-retirement/hooks/use-account-retirement";
import { resolveAccountLifecycle } from "#/features/account-retirement/logic/lifecycle";
import { RecoveryPoolRow, RecoveryVoucherRow } from "./recovery-resources";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { ListSkeleton } from "#/components/ui/list-skeleton";

/**
 * `column` holds the page to one phone-width column, for the desktop view, which
 * has no layout of its own for it.
 *
 * The only screen a retiring account lives in: when the account closes, how to
 * restore it, what it holds and owns, and the way out. It shows nothing until
 * the session is settled — `AuthenticatedRoute` holds loading, expired and
 * failed checks — and nothing at all for an account that is not restricted.
 */
export function RecoveryPage({ column = false }: { column?: boolean }) {
  return (
    <AuthenticatedRoute>
      <RecoveryContent column={column} />
    </AuthenticatedRoute>
  );
}

function RecoveryContent({ column }: { column: boolean }) {
  const { t, i18n } = useLingui();
  const auth = useAuthStatus();
  const view = resolveAccountLifecycle(auth);
  const { signOut, isSigningOut } = useSignOut(auth.address?.toLowerCase() ?? GUEST_STORAGE_OWNER);
  const restore = useRestoreAccount();

  // The gate sends an active account away; until it does, render nothing.
  if (!view.known || !isRecoveryLifecycle(view.lifecycle) || !auth.address) return null;

  const { lifecycle, closesAt, capabilities } = view;
  const title =
    lifecycle === "ERASED"
      ? t`Account erased`
      : lifecycle === "ERASURE_PENDING"
        ? t`Account erasure pending`
        : t`Account retired`;

  return (
    <div
      className={
        column
          ? "mx-auto flex min-h-screen w-[430px] flex-col space-y-6 bg-background px-6 pt-10 pb-12"
          : "flex min-h-[100svh] flex-col space-y-6 bg-background px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-12"
      }
    >
      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">{title}</h1>

      {closesAt ? (
        <div className="border border-border bg-card p-4">
          <p className="text-muted-foreground text-xs">
            <Trans>Closing date</Trans>
          </p>
          <p className="mt-1 font-mono font-semibold text-sm">
            <time dateTime={closesAt}>
              {i18n.date(closesAt, { dateStyle: "long", timeStyle: "short" })}
            </time>
          </p>
        </div>
      ) : null}

      {capabilities.canRestoreAccount ? (
        <div className="space-y-2">
          <Button
            tap
            className="w-full"
            pending={restore.isPending}
            onClick={() => restore.mutate()}
          >
            {restore.isPending ? t`Restoring…` : t`Restore account`}
          </Button>
          {restore.isError ? (
            <p role="alert" className="text-destructive text-xs">
              {restore.error.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {capabilities.canRecoverAssets || capabilities.canTransferResources ? (
        <RecoveryAssets
          address={auth.address}
          canRecoverAssets={capabilities.canRecoverAssets}
          canTransferResources={capabilities.canTransferResources}
        />
      ) : null}

      <div className="border border-border bg-card">
        <SignOutRow isSigningOut={isSigningOut} onSignOut={() => void signOut()} />
      </div>
    </div>
  );
}

function RecoveryAssets({
  address,
  canRecoverAssets,
  canTransferResources,
}: {
  address: `0x${string}`;
  canRecoverAssets: boolean;
  canTransferResources: boolean;
}) {
  const { t } = useLingui();
  const assets = useRecoveryAssets(address);
  return (
    <>
      {canRecoverAssets ? (
        <>
          <section aria-label={t`Wallet actions`} className="grid grid-cols-2 gap-2">
            <Button asChild size="tile">
              <Link to="/wallet/send">
                <RiSendPlane2Line className="size-4" aria-hidden="true" />
                <Trans>Send</Trans>
              </Link>
            </Button>
            <Button asChild variant="outline" size="tile">
              <Link to="/wallet/receive">
                <RiDownloadLine className="size-4" aria-hidden="true" />
                <Trans>Receive</Trans>
              </Link>
            </Button>
          </section>

          <section aria-labelledby="recovery-holdings">
            <SectionHeading id="recovery-holdings" className="mb-2">
              <Trans>Holdings</Trans>
            </SectionHeading>
            <ResourceList
              pending={assets.vouchersPending}
              error={assets.vouchersError}
              retry={assets.retryVouchers}
              empty={<Trans>No holdings.</Trans>}
              loading={<Trans>Loading vouchers…</Trans>}
              failed={<Trans>Couldn't load vouchers.</Trans>}
              items={assets.holdings.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center gap-3 border-border border-b p-3 last:border-b-0"
                >
                  <TokenLogo token={token} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{token.symbol}</p>
                    <p className="truncate text-muted-foreground text-xs">{token.name}</p>
                  </div>
                  <HoldingBalance token={token} />
                </li>
              ))}
            />
            {assets.hasMoreBalances ? (
              <Button
                variant="outline"
                tap
                className="mt-2 w-full"
                pending={assets.fetchingMoreBalances}
                onClick={assets.loadMoreBalances}
              >
                <Trans>Load more</Trans>
              </Button>
            ) : null}
          </section>
        </>
      ) : null}

      {canTransferResources ? (
        <>
          <section aria-labelledby="recovery-vouchers">
            <SectionHeading id="recovery-vouchers" className="mb-2">
              <Trans>My Vouchers</Trans>
            </SectionHeading>
            <ResourceList
              pending={assets.vouchersPending}
              error={assets.vouchersError}
              retry={assets.retryVouchers}
              empty={<Trans>No vouchers.</Trans>}
              loading={<Trans>Loading vouchers…</Trans>}
              failed={<Trans>Couldn't load vouchers.</Trans>}
              items={assets.issued.map((token) => (
                <RecoveryVoucherRow key={token.id} token={token} walletAddress={address} />
              ))}
            />
          </section>

          <section aria-labelledby="recovery-pools">
            <SectionHeading id="recovery-pools" className="mb-2">
              <Trans>My Pools</Trans>
            </SectionHeading>
            <ResourceList
              pending={assets.poolsPending}
              error={assets.poolsError}
              retry={assets.retryPools}
              empty={<Trans>No pools.</Trans>}
              loading={<Trans>Loading pools…</Trans>}
              failed={<Trans>Couldn't load your pools.</Trans>}
              items={assets.pools.map((pool) => (
                <RecoveryPoolRow key={pool.address} pool={pool} walletAddress={address} />
              ))}
            />
            {assets.hasMorePools ? (
              <Button
                variant="outline"
                tap
                className="mt-2 w-full"
                pending={assets.fetchingMorePools}
                onClick={assets.loadMorePools}
              >
                <Trans>Load more</Trans>
              </Button>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}

/** A framed list that says what it is waiting on or why it failed instead of showing an empty box. */
function ResourceList({
  pending,
  error,
  retry,
  empty,
  loading,
  failed,
  items,
}: {
  pending: boolean;
  error: boolean;
  retry: () => void;
  empty: ReactNode;
  loading: ReactNode;
  failed: ReactNode;
  items: ReactNode[];
}) {
  if (pending) return <ListSkeleton framed count={2} label={loading} />;
  if (error) {
    return (
      <div role="alert" className="space-y-2 border border-border bg-card p-3">
        <p className="text-muted-foreground text-sm">{failed}</p>
        <Button variant="outline" tap onClick={retry}>
          <Trans>Try again</Trans>
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="border border-border bg-card p-3 text-muted-foreground text-sm">{empty}</p>
    );
  }
  return <ul className="border border-border bg-card">{items}</ul>;
}
