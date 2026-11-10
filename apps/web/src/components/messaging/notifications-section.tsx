import { Trans, useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { useNotificationInbox } from "#/features/notifications/inbox/use-notification-inbox";
import { cn } from "#/lib/utils";

/** Activity's Notifications: the in-app inbox, retirements included, without message kinds. */
export function NotificationsSection() {
  const { i18n, t } = useLingui();
  const router = useRouter();
  const inbox = useNotificationInbox();
  const items = inbox.data ?? [];
  return (
    <div className="space-y-3">
      {inbox.isPending && inbox.fetchStatus !== "idle" ? (
        <ListSkeleton label={<Trans>Loading notifications…</Trans>} count={4} />
      ) : null}
      {inbox.isError ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <p role="alert" className="text-muted-foreground text-sm">
            <Trans>Couldn't load notifications.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={inbox.isFetching}
            onClick={() => void inbox.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {inbox.isSuccess && items.length === 0 ? (
        <p className="border border-border bg-card p-3 text-muted-foreground text-sm">
          <Trans>No notifications yet.</Trans>
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="border border-border bg-card" aria-label={t`Notifications`}>
          {items.map((item, index) => (
            <li key={item.notificationId}>
              {/* The target is a normalized same-origin path from the payload schema. */}
              <a
                href={item.targetUrl}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  void router.navigate({ href: item.targetUrl });
                }}
                className={cn(
                  "block p-3 text-start",
                  index < items.length - 1 && "border-border border-b",
                )}
              >
                <span className="block text-sm font-semibold">{item.title}</span>
                <span className="block text-muted-foreground text-xs">{item.body}</span>
                <time
                  dateTime={item.createdAt}
                  className="mt-1 block font-mono text-2xs text-muted-foreground"
                >
                  {i18n.date(new Date(item.createdAt), { dateStyle: "short", timeStyle: "short" })}
                </time>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
