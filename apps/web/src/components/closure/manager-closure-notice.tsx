import type { ManagerClosure } from "@clc/core/features/account-retirement/logic";
import { Trans, useLingui } from "@lingui/react/macro";

/**
 * What a public voucher or pool says about its managing account: that it is
 * scheduled to close, or has closed. The server sends no account identity and
 * no reason, and this notice has nothing else to show.
 *
 * A retired resource carries its own, stronger notice, and "remains active"
 * would contradict it, so `active === false` shows nothing here. A scheduled
 * closure with no usable date shows nothing either rather than guess one.
 */
export function ManagerClosureNotice({
  closure,
  resource,
  active,
  compact = false,
}: {
  closure: ManagerClosure | undefined;
  resource: "voucher" | "pool";
  active?: boolean;
  /** Plain helper text for dense rows, instead of the boxed notice. */
  compact?: boolean;
}) {
  const { i18n } = useLingui();
  if (!closure || active === false) return null;

  let message;
  if (closure.state === "CLOSED") {
    message =
      resource === "voucher" ? (
        <Trans>The account managing this voucher has closed. This voucher remains active.</Trans>
      ) : (
        <Trans>The account managing this pool has closed. This pool remains active.</Trans>
      );
  } else {
    const closesAt = closure.closesAt ? new Date(closure.closesAt) : null;
    if (!closesAt || Number.isNaN(closesAt.getTime())) return null;
    const date = i18n.date(closesAt, { dateStyle: "long" });
    message =
      resource === "voucher" ? (
        <Trans>
          The account managing this voucher is scheduled to close on {date}. This voucher remains
          active.
        </Trans>
      ) : (
        <Trans>
          The account managing this pool is scheduled to close on {date}. This pool remains active.
        </Trans>
      );
  }

  if (compact) return <p className="text-muted-foreground text-xs">{message}</p>;
  return (
    <p role="status" className="border border-border bg-muted p-3 text-sm">
      {message}
    </p>
  );
}
