import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import type { NotificationPayload } from "#/features/notifications/logic/payload-schema";
import { cn } from "#/lib/utils";
import { useSafeSheet } from "#/features/safe/state/safe-sheet";

export function NotificationContextLinks({
  item,
  className,
}: {
  item: NotificationPayload;
  className?: string;
}) {
  const auth = useAuthStatus();
  const actorIsViewer =
    item.actorAddress &&
    auth.address &&
    item.actorAddress.toLowerCase() === auth.address.toLowerCase();
  const voucher = item.resources?.find(
    (resource) => resource.voucherAddress && resource.voucherName,
  );
  const openSafe = () => {
    if (item.safeAddress && item.safeTxHash) {
      useSafeSheet
        .getState()
        .show(item.safeAddress as `0x${string}`, item.safeTxHash as `0x${string}`);
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs", className)}>
      {item.actorAddress && !actorIsViewer ? (
        <Link
          to="/"
          search={{
            tab: "activity",
            section: "messages",
            messageTo: item.actorAddress,
          }}
          className="font-mono underline"
        >
          {item.actorUsername ?? item.actorAddress}
        </Link>
      ) : item.actorUsername ? (
        <span className="font-mono">{item.actorUsername}</span>
      ) : null}
      {item.resources?.slice(0, 3).map((resource) =>
        resource.kind === "pool" ? (
          <Link
            key={`${resource.kind}:${resource.address}`}
            to="/pools/$poolAddress"
            params={{ poolAddress: resource.address }}
            className="font-semibold underline"
            onClick={openSafe}
          >
            {resource.name}
          </Link>
        ) : (
          <Link
            key={`${resource.kind}:${resource.address}`}
            to="/vouchers/$voucherAddress"
            params={{ voucherAddress: resource.address }}
            className="font-semibold underline"
            onClick={openSafe}
          >
            {resource.name}
          </Link>
        ),
      )}
      {(item.resources?.length ?? 0) > 3 ? (
        <span className="text-muted-foreground">
          <Trans>View the proposal for more resources.</Trans>
        </span>
      ) : null}
      {item.approvals && item.approvalsRequired ? (
        <span className="font-mono text-muted-foreground">
          {item.approvals}/{item.approvalsRequired} <Trans>signers</Trans>
        </span>
      ) : null}
      {voucher?.voucherAddress && voucher.voucherName ? (
        <span className="text-muted-foreground">
          <Trans>Voucher</Trans>:{" "}
          <Link
            to="/vouchers/$voucherAddress"
            params={{ voucherAddress: voucher.voucherAddress }}
            className="font-semibold text-foreground underline"
          >
            {voucher.voucherName}
          </Link>
        </span>
      ) : null}
    </div>
  );
}
