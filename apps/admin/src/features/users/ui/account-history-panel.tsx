import type {
  AccountLifecycleEvent,
  ModerationEvent,
} from "@clc/core/features/account-retirement/logic";

import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { SectionHeading } from "#/components/admin/section-heading";
import { Badge } from "#/components/ui/badge";
import { errorMessage } from "#/lib/data-state";
import { formatDateTime } from "#/lib/format";
import { useAccountRetirement, useModerationHistory } from "../use-account-retirement";

type HistoryItem = {
  key: string;
  title: string;
  /** Who started a retirement or restore; moderation has no source. */
  source: "SELF" | "ADMIN" | null;
  actorAddress: string | null;
  reason: string;
  createdAt: string;
};

const MODERATION_TITLES = { ban: "Banned", unban: "Unbanned" } as const;
const LIFECYCLE_TITLES = { retired: "Retired", restored: "Restored" } as const;

function moderationItem(event: ModerationEvent): HistoryItem {
  return {
    key: `moderation-${event.id}`,
    title: MODERATION_TITLES[event.action],
    source: null,
    actorAddress: event.actorAddress,
    reason: event.reason,
    createdAt: event.createdAt,
  };
}

function lifecycleItem(event: AccountLifecycleEvent): HistoryItem {
  return {
    key: `lifecycle-${event.id}`,
    title: LIFECYCLE_TITLES[event.action],
    source: event.source,
    actorAddress: event.actorAddress,
    reason: "",
    createdAt: event.createdAt,
  };
}

/**
 * Bans, unbans, retirements and restores in one list, newest first.
 *
 * The two histories come from separate endpoints and fail separately. One that
 * fails is named above the other's rows instead of blanking the panel, so an
 * operator never reads a partial history as a complete one.
 */
export function AccountHistoryPanel({ address }: { address: string }) {
  const moderation = useModerationHistory(address);
  const lifecycle = useAccountRetirement(address);

  const items = [
    ...(moderation.data ?? []).map(moderationItem),
    ...(lifecycle.data?.events ?? []).map(lifecycleItem),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const failed = moderation.isError || lifecycle.isError;
  const loading = moderation.isPending || lifecycle.isPending;

  return (
    <section className="border-border bg-card flex flex-col gap-3 border p-4">
      <SectionHeading>Account history</SectionHeading>
      {moderation.isError ? (
        <p role="alert" className="text-destructive text-sm">
          Ban history could not be loaded. {errorMessage(moderation.error)}
        </p>
      ) : null}
      {lifecycle.isError ? (
        <p role="alert" className="text-destructive text-sm">
          Retirement history could not be loaded. {errorMessage(lifecycle.error)}
        </p>
      ) : null}
      {loading ? (
        <LoadingBlock rows={2} />
      ) : items.length === 0 ? (
        // A failed source is already named above; it must not also read as empty.
        failed ? null : (
          <EmptyState title="No account history" />
        )
      ) : (
        <ol className="divide-border divide-y">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.title}</span>
                  {item.source ? (
                    <Badge variant="outline" className="font-mono text-xs uppercase">
                      {item.source === "SELF" ? "Self" : "Admin"}
                    </Badge>
                  ) : null}
                </div>
                <time className="font-data text-muted-foreground text-xs" dateTime={item.createdAt}>
                  {formatDateTime(item.createdAt)}
                </time>
              </div>
              {item.actorAddress ? (
                <p className="font-data text-muted-foreground text-xs break-all">
                  {item.actorAddress}
                </p>
              ) : null}
              {item.reason ? (
                <p className="break-words whitespace-pre-wrap">{item.reason}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
