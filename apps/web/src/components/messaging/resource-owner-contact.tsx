import { ownerInfoQueryOptions } from "@clc/api/features/safe/queries";
import type { OwnerMessageTarget } from "@clc/core/features/safe/logic";
import type { MessageContextInput, MessageLaunchContext } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RiMailLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { EllipsizedAddress } from "#/components/wallet/wallet-address";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { safeClient } from "#/lib/api/safe";
import { onboardingSearch } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";

/** Stable detail action. The authenticated composer resolves and checks the recipient. */
export function ResourceMessageButton({
  context,
  className,
}: {
  context: MessageLaunchContext;
  className?: string;
}) {
  const auth = useAuthStatus();
  const search = {
    tab: "activity",
    section: "messages",
    messageKind: context.kind,
    messageResource: context.resourceId,
    ...(context.kind === "pool" && context.proposedVoucherAddress
      ? { messageVoucher: context.proposedVoucherAddress }
      : {}),
  } as const;
  const label = (
    <>
      <RiMailLine aria-hidden="true" />
      <Trans>Message</Trans>
    </>
  );

  return (
    <Button asChild variant="outline" tap className={className}>
      {auth.state === "guest" || auth.state === "connectedNoSession" ? (
        <Link
          to="/onboarding"
          search={onboardingSearch("signin", `/?${new URLSearchParams(search)}`)}
        >
          {label}
        </Link>
      ) : (
        <Link to="/" search={search}>
          {label}
        </Link>
      )}
    </Button>
  );
}

/** Public owner identity plus a route into the existing private message flow. */
export function ResourceOwnerContact({
  ownerAddress,
  label,
  className,
  context,
}: {
  ownerAddress: string;
  label?: string;
  className?: string;
  context?: MessageContextInput;
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const query = useQuery({ ...ownerInfoQueryOptions(safeClient, ownerAddress), retry: false });
  const targets = query.data?.messageTargets ?? [];
  const available = hasAvailableTarget(
    targets,
    auth.isAuthenticated ? auth.session?.address : undefined,
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-between gap-3 border border-border bg-card p-3",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label ?? t`Owner`}</p>
        {query.isPending ? (
          <Skeleton className="mt-1 h-4 w-32 rounded-none" />
        ) : (
          <OwnerIdentity
            ownerAddress={ownerAddress}
            targets={targets}
            messageable={available}
            context={context}
          />
        )}
        {query.isError ? (
          <Button
            variant="outline"
            tap
            className="mt-2"
            pending={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        ) : null}
      </div>
      {query.isSuccess ? (
        <OwnerMessageButton
          ownerAddress={ownerAddress}
          targets={targets}
          excludeAddress={auth.isAuthenticated ? auth.session?.address : undefined}
          context={context}
        />
      ) : null}
    </div>
  );
}

/** Owner identity and message action for an existing Info/Details value cell. */
export function ResourceOwnerContactValue({
  ownerAddress,
  className,
  context,
}: {
  ownerAddress: string;
  className?: string;
  context?: MessageContextInput;
}) {
  const auth = useAuthStatus();
  const query = useQuery({ ...ownerInfoQueryOptions(safeClient, ownerAddress), retry: false });
  const targets = query.data?.messageTargets ?? [];
  const available = hasAvailableTarget(
    targets,
    auth.isAuthenticated ? auth.session?.address : undefined,
  );

  return (
    <div className={cn("min-w-0", className)}>
      {query.isPending ? (
        <Skeleton className="h-4 w-32 rounded-none" />
      ) : (
        <OwnerIdentity
          ownerAddress={ownerAddress}
          targets={targets}
          messageable={available}
          context={context}
        />
      )}
      {query.isError ? (
        <Button
          variant="outline"
          tap
          className="mt-2"
          pending={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      ) : null}
      {query.isSuccess ? (
        <OwnerMessageButton
          ownerAddress={ownerAddress}
          targets={targets}
          excludeAddress={auth.isAuthenticated ? auth.session?.address : undefined}
          className="mt-2"
          context={context}
        />
      ) : null}
    </div>
  );
}

/** Compact message action for places that already display the counterparty. */
export function OwnerMessageButton({
  ownerAddress,
  targets: suppliedTargets,
  excludeAddress,
  className,
  context,
}: {
  ownerAddress: string;
  targets?: readonly OwnerMessageTarget[];
  excludeAddress?: string;
  className?: string;
  context?: MessageContextInput;
}) {
  const query = useQuery({
    ...ownerInfoQueryOptions(safeClient, suppliedTargets ? undefined : ownerAddress),
    enabled: suppliedTargets === undefined && Boolean(ownerAddress),
    retry: false,
  });
  const targets = suppliedTargets ?? query.data?.messageTargets ?? [];
  const available = hasAvailableTarget(targets, excludeAddress);
  if (!available) return null;

  return (
    <Button asChild variant="outline" tap className={className}>
      <Link
        to="/"
        search={{
          tab: "activity",
          section: "messages",
          messageTo: ownerAddress,
          messageKind: context?.kind,
          messageResource: context?.resourceId,
          messageVoucher: context?.kind === "pool" ? context.proposedVoucherAddress : undefined,
        }}
      >
        <RiMailLine aria-hidden="true" />
        <Trans>Message</Trans>
      </Link>
    </Button>
  );
}

function OwnerIdentity({
  ownerAddress,
  targets,
  messageable,
  context,
}: {
  ownerAddress: string;
  targets: readonly OwnerMessageTarget[];
  messageable: boolean;
  context?: MessageContextInput;
}) {
  const first = targets[0];
  const identity = first ? (
    <div className="mt-1 flex min-w-0 items-center gap-2">
      {first.avatar ? (
        <img
          src={first.avatar}
          alt=""
          className="size-7 shrink-0 rounded-full border border-border object-cover"
        />
      ) : null}
      <span className="min-w-0 truncate font-mono text-sm font-medium" dir="ltr">
        {first.username ?? first.address}
      </span>
      {targets.length > 1 ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          <Trans>+{targets.length - 1} more</Trans>
        </span>
      ) : null}
    </div>
  ) : (
    <EllipsizedAddress address={ownerAddress} className="mt-1 block" />
  );

  if (!messageable) return identity;
  return (
    <Link
      to="/"
      search={{
        tab: "activity",
        section: "messages",
        messageTo: ownerAddress,
        messageKind: context?.kind,
        messageResource: context?.resourceId,
        messageVoucher: context?.kind === "pool" ? context.proposedVoucherAddress : undefined,
      }}
      className="block min-w-0 underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary hover:underline"
    >
      {identity}
    </Link>
  );
}

function hasAvailableTarget(targets: readonly OwnerMessageTarget[], excludeAddress?: string) {
  const excluded = excludeAddress?.toLowerCase();
  return targets.some((target) => target.address.toLowerCase() !== excluded);
}
