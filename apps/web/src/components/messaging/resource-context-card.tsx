import type {
  MessageContextInput,
  MessageResourceContext,
} from "@clc/core/features/messaging/logic";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";

type Context = MessageContextInput | MessageResourceContext;

export function ResourceContextCard({
  context,
  approve = false,
}: {
  context: Context;
  approve?: boolean;
}) {
  const name = "resourceName" in context ? context.resourceName : context.resourceId;
  const proposed =
    "resourceName" in context
      ? context.proposedVoucher
      : context.kind === "pool" && context.proposedVoucherAddress
        ? {
            address: context.proposedVoucherAddress,
            name: context.proposedVoucherAddress,
            symbol: "",
          }
        : undefined;
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
      <p className="text-xs text-muted-foreground">
        <Trans>Regarding</Trans>
      </p>
      <Link {...resourceLink} className="break-words text-sm font-semibold underline">
        {name}
      </Link>
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
                search={{ tool: "approve", candidate: proposed.address }}
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
