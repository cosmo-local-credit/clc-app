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
import { catalogsClient } from "#/lib/api/catalogs";
import { marketClient } from "#/lib/api/market";
import { poolsClient } from "#/lib/api/pools";
import { wantsClient } from "#/lib/api/wants";

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
            <Button asChild variant="outline" className="mt-1 justify-self-start">
              <Link
                to="/pools/$poolAddress"
                params={{ poolAddress: context.resourceId }}
                search={{ tab: "holdings", tool: "approve", candidate: proposed.address }}
              >
                <Trans>Approve voucher</Trans>
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
