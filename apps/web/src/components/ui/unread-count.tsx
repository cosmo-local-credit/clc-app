import { Plural, Trans, useLingui } from "@lingui/react/macro";

import { cn } from "#/lib/utils";

/** Past this the chip reads "9+": the count only says there is something to look at. */
const UNREAD_COUNT_CAP = 9;

/**
 * The unread count on a navigation item: a small square chip, absent at zero.
 * It is hidden from assistive tech; pair it with {@link UnreadCountLabel} after
 * the item's name so the link reads "Activity, 3 new".
 */
export function UnreadCount({ count, className }: { count: number; className?: string }) {
  const { i18n } = useLingui();
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-4 min-w-4 items-center justify-center bg-primary px-1 font-semibold text-2xs text-primary-foreground leading-none",
        className,
      )}
    >
      {count > UNREAD_COUNT_CAP ? `${i18n.number(UNREAD_COUNT_CAP)}+` : i18n.number(count)}
    </span>
  );
}

export function UnreadCountLabel({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="sr-only">
      , <Plural value={count} one="# new" other="# new" />
    </span>
  );
}

/** Marks one row that was unread when the screen opened. */
export function UnreadDot() {
  return (
    <>
      <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full bg-primary" />
      <span className="sr-only">
        <Trans>New</Trans>
      </span>
    </>
  );
}
