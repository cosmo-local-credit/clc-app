import type {
  MessageContextInput,
  MessageResourceContext,
} from "@clc/core/features/messaging/logic";
import { catalogDetailQueryOptions } from "@clc/api/features/catalogs/queries";
import { voucherQueryOptions } from "@clc/api/features/market/queries";
import { poolQueryOptions } from "@clc/api/features/pools/queries";
import { wantDetailQueryOptions } from "@clc/api/features/wants/queries";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import {
  usePoolTokenMembership,
  poolTokenRegistryAddress,
} from "#/features/pools/hooks/use-pool-registry";
import { usePoolVouchersWithStatus } from "#/features/pools/hooks/use-pool-vouchers";
import { catalogsClient } from "#/lib/api/catalogs";
import { marketClient } from "#/lib/api/market";
import { poolsClient } from "#/lib/api/pools";
import { wantsClient } from "#/lib/api/wants";
import { resolvePoolProposalApprovalState } from "./resource-proposal-status";

/** Draft names are display metadata. The send still contains only identifiers. */
function DraftContextCard({ context }: { context: MessageContextInput }) {
  const { kind, resourceId } = context;
  const proposedAddress = kind === "pool" ? context.proposedVoucherAddress : undefined;
  const pool = useQuery({
    ...poolQueryOptions(poolsClient, kind === "pool" ? resourceId : undefined),
    retry: false,
  });
  const voucher = useQuery({
    ...voucherQueryOptions(marketClient, kind === "voucher" ? resourceId : proposedAddress),
    retry: false,
  });
  const want = useQuery({
    ...wantDetailQueryOptions(wantsClient, kind === "want" ? resourceId : ""),
    enabled: kind === "want",
    retry: false,
  });
  const catalog = useQuery({
    ...catalogDetailQueryOptions(catalogsClient, kind === "catalog" ? resourceId : ""),
    enabled: kind === "catalog",
    retry: false,
  });
  const name =
    pool.data?.name ??
    want.data?.name ??
    catalog.data?.name ??
    (kind === "voucher" ? voucher.data?.name : undefined);

  return (
    <ContextCard
      context={{
        kind,
        resourceId,
        resourceName: name || resourceId,
        proposedVoucher: proposedAddress
          ? {
              address: proposedAddress,
              name: voucher.data?.name || proposedAddress,
              symbol: voucher.data?.symbol ?? "",
            }
          : undefined,
      }}
    />
  );
}

export function ResourceContextCard({
  context,
  approve = false,
}: {
  context: MessageContextInput | MessageResourceContext;
  approve?: boolean;
}) {
  return "resourceName" in context ? (
    <ContextCard context={context} approve={approve} />
  ) : (
    <DraftContextCard context={context} />
  );
}

function ContextCard({ context, approve }: { context: MessageResourceContext; approve?: boolean }) {
  const proposed = context.proposedVoucher;
  const resourceLink =
    context.kind === "pool"
      ? { to: "/pools/$poolAddress" as const, params: { poolAddress: context.resourceId } }
      : context.kind === "voucher"
        ? {
            to: "/vouchers/$voucherAddress" as const,
            params: { voucherAddress: context.resourceId },
          }
        : context.kind === "want"
          ? { to: "/wants/$wantId" as const, params: { wantId: context.resourceId } }
          : { to: "/catalogs/$catalogId" as const, params: { catalogId: context.resourceId } };

  return (
    <div className="grid gap-2 border border-current/20 bg-card p-3 text-foreground">
      <p className="flex flex-wrap items-baseline gap-x-1 pe-9 text-sm">
        <span className="text-muted-foreground">
          {context.kind === "pool" ? (
            <Trans>Pool:</Trans>
          ) : context.kind === "voucher" ? (
            <Trans>Voucher:</Trans>
          ) : context.kind === "want" ? (
            <Trans>Want:</Trans>
          ) : (
            <Trans>Catalog:</Trans>
          )}
        </span>
        <Link {...resourceLink} className="min-w-0 break-words font-semibold underline">
          {context.resourceName}
        </Link>
      </p>
      {proposed ? (
        <div className="grid gap-1 border-border border-t pt-2">
          <p className="text-xs text-muted-foreground">
            <Trans>Proposed voucher</Trans>
          </p>
          <Link
            to="/vouchers/$voucherAddress"
            params={{ voucherAddress: proposed.address }}
            className="break-words text-sm font-semibold underline"
          >
            {proposed.name}
            {proposed.symbol ? ` (${proposed.symbol})` : ""}
          </Link>
          {approve && context.kind === "pool" ? (
            <PoolProposalAction
              poolAddress={context.resourceId}
              voucherAddress={proposed.address}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PoolProposalAction({
  poolAddress,
  voucherAddress,
}: {
  poolAddress: string;
  voucherAddress: string;
}) {
  const pool = useQuery({ ...poolQueryOptions(poolsClient, poolAddress), retry: false });
  const membership = usePoolTokenMembership(pool.data, voucherAddress);
  const legacy = usePoolVouchersWithStatus(pool.data, { all: true });
  const hasRegistry = poolTokenRegistryAddress(pool.data) !== null;
  const state = resolvePoolProposalApprovalState({
    poolPending: pool.isPending,
    poolLoaded: pool.isSuccess,
    poolError: pool.isError,
    hasRegistry,
    membership: membership.data,
    membershipPending: membership.isPending,
    membershipError: membership.isError,
    legacyPending: legacy.isPending,
    legacyError: legacy.isError,
    legacyApproved: legacy.vouchers.some(
      (voucher) => voucher.tokenAddress.toLowerCase() === voucherAddress.toLowerCase(),
    ),
  });
  const approved = state === "approved";
  const checking = state === "checking";
  const unavailable = state === "unavailable";

  if (approved) {
    return (
      <Badge size="sm" variant="primary" className="mt-1 justify-self-start">
        <Trans>Approved</Trans>
      </Badge>
    );
  }
  if (unavailable) {
    return (
      <Button
        type="button"
        variant="outline"
        className="mt-1 justify-self-start"
        onClick={() => {
          if (pool.isError) {
            void pool.refetch();
          } else if (hasRegistry) {
            void membership.refetch();
          } else {
            void legacy.refetch();
          }
        }}
      >
        <Trans>Retry</Trans>
      </Button>
    );
  }
  return (
    <Button
      asChild={!checking}
      variant="outline"
      className="mt-1 justify-self-start"
      disabled={checking}
      pending={checking}
    >
      {checking ? (
        <Trans>Checking approval…</Trans>
      ) : (
        <Link
          to="/pools/$poolAddress"
          params={{ poolAddress }}
          search={{ tab: "holdings", tool: "approve", candidate: voucherAddress }}
        >
          <Trans>Approve voucher</Trans>
        </Link>
      )}
    </Button>
  );
}
