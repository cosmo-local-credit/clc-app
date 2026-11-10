import { Trans, useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { DeskCanvas } from "#/desktop/ui/page";
import { useNotificationInbox } from "#/features/notifications/inbox/use-notification-inbox";

/**
 * Activity's Notifications: the in-app inbox, retirements included. Message
 * kinds are left out; they already show in Messages and Helpdesk.
 */
export function NotificationsDesk({ header }: { header: ReactNode }) {
  const { i18n, t } = useLingui();
  const router = useRouter();
  const inbox = useNotificationInbox();
  const items = inbox.data ?? [];
  return (
    <DeskCanvas className="gap-4">
      {header}
      {inbox.isPending && inbox.fetchStatus !== "idle" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <Trans>Loading notifications…</Trans>
        </p>
      ) : null}
      {inbox.isError ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="text-sm text-muted-foreground">
            <Trans>Couldn't load notifications.</Trans>
          </p>
          <Button variant="outline" pending={inbox.isFetching} onClick={() => void inbox.refetch()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {inbox.isSuccess && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <Trans>No notifications yet.</Trans>
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul
          className="border border-border bg-card [&>li+li]:border-border [&>li+li]:border-t"
          aria-label={t`Notifications`}
        >
          {items.map((item) => (
            <li key={item.notificationId}>
              {/* The target is a normalized same-origin path from the payload schema. */}
              <a
                href={item.targetUrl}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  void router.navigate({ href: item.targetUrl });
                }}
                className="flex min-w-0 items-center gap-4 px-3.5 py-2.5 hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.body}</span>
                </span>
                <time
                  dateTime={item.createdAt}
                  className="shrink-0 font-mono text-xs text-muted-foreground"
                >
                  {i18n.date(new Date(item.createdAt), { dateStyle: "short", timeStyle: "short" })}
                </time>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </DeskCanvas>
  );
}
