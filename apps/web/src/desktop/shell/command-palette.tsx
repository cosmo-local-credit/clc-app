import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog } from "@base-ui/react/dialog";
import {
  type KeyboardEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useState,
} from "react";

import { marketplaceInfiniteQueryOptions } from "@clc/api/features/marketplace/queries";
import { recipientLabel } from "@clc/api/features/recipients/client";
import { recipientSearchQueryOptions } from "@clc/api/features/recipients/queries";
import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { usePaletteStore } from "#/desktop/palette-store";
import { useShortcutHelp } from "#/desktop/shell/shortcut-help";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { marketplaceClient } from "#/lib/api/marketplace";
import { recipientsClient } from "#/lib/api/recipients";
import { cn } from "#/lib/utils";

type Group = "actions" | "people" | "marketplace";

type Entry = {
  key: string;
  group: Group;
  label: string;
  /** What the row is about, beside its action: an address or a kind. */
  hint?: string;
  mono?: boolean;
  run: () => void;
};

const SEARCH_MIN = 2;

/**
 * Search, and the actions a person reaches for by name. It is a combobox over
 * one listbox: focus stays in the input while Up/Down move a visible active
 * result and Enter runs it. Create actions appear only when the allowance
 * hook says the person can create that resource.
 */
export function CommandPalette() {
  const { t } = useLingui();
  const open = usePaletteStore((state) => state.open);
  const setOpen = usePaletteStore((state) => state.setOpen);
  const setHelpOpen = useShortcutHelp((state) => state.setOpen);
  const navigate = useNavigate();
  const usage = useResourceUsage(open);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const deferred = useDeferredValue(query.trim());
  const searching = open && deferred.length >= SEARCH_MIN;
  const people = useQuery({
    ...recipientSearchQueryOptions(recipientsClient, deferred),
    enabled: searching,
  });
  const market = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, { q: deferred, perPage: 8 }),
    enabled: searching,
  });
  const baseId = useId();

  function kindLabel(kind: MarketplaceResult["kind"]) {
    switch (kind) {
      case "offering":
        return t`Offer`;
      case "want":
        return t`Want`;
      case "voucher":
        return t`Voucher`;
      case "pool":
        return t`Pool`;
      case "catalog":
        return t`Catalog`;
    }
  }

  function go(run: () => void) {
    setOpen(false);
    setQuery("");
    run();
  }

  const needle = deferred.toLowerCase();
  const actions: Entry[] = [
    { key: "send", label: t`Send`, run: () => void navigate({ to: "/wallet/send" }) },
    { key: "receive", label: t`Receive`, run: () => void navigate({ to: "/wallet/receive" }) },
    {
      key: "swap",
      label: t`Swap`,
      run: () => void navigate({ to: "/market", search: { scope: "pools" } }),
    },
    ...(usage.data?.vouchers.canCreate
      ? [
          {
            key: "create-voucher",
            label: t`Create voucher`,
            run: () => void navigate({ to: "/vouchers/create/$step", params: { step: "voucher" } }),
          },
        ]
      : []),
    ...(usage.data?.pools.canCreate
      ? [
          {
            key: "create-pool",
            label: t`Create pool`,
            run: () => void navigate({ to: "/pools/create/$step", params: { step: "pool" } }),
          },
        ]
      : []),
    ...(usage.data?.catalogs.canCreate
      ? [
          {
            key: "create-catalog",
            label: t`Create catalog`,
            run: () => void navigate({ to: "/catalogs/create" }),
          },
        ]
      : []),
    {
      key: "settings",
      label: t`Settings`,
      run: () => void navigate({ to: "/", search: { tab: "settings" } }),
    },
    { key: "shortcuts", label: t`Keyboard shortcuts`, run: () => setHelpOpen(true) },
  ]
    .filter((entry) => !needle || entry.label.toLowerCase().includes(needle))
    .map((entry) => ({ ...entry, group: "actions" as const }));

  const peopleEntries: Entry[] = searching
    ? (people.data ?? []).map((person) => {
        const label = recipientLabel(person);
        return {
          key: `person-${person.address}`,
          group: "people" as const,
          label: person.kind === "pool" ? t`Open pool ${label}` : t`Send to ${label}`,
          hint: formatVoucherAddress(person.address),
          mono: true,
          run: () => {
            if (person.kind === "pool") {
              void navigate({ to: "/pools/$poolAddress", params: { poolAddress: person.address } });
              return;
            }
            void navigate({ to: "/wallet/send", search: { to: person.address } });
          },
        };
      })
    : [];

  const results = searching ? (market.data?.pages.flatMap((page) => page.results) ?? []) : [];
  const marketEntries: Entry[] = results.map((result) => ({
    key: `result-${result.kind}-${result.id}`,
    group: "marketplace" as const,
    label: result.name,
    hint: kindLabel(result.kind),
    run: () => openResult(result),
  }));
  if (searching && results.length > 0) {
    marketEntries.push({
      key: "all-results",
      group: "marketplace",
      label: t`See all results for “${deferred}”`,
      run: () =>
        void navigate({ to: "/market", search: { scope: "all", view: "list", q: deferred } }),
    });
  }

  function openResult(result: MarketplaceResult) {
    if (result.kind === "pool") {
      void navigate({ to: "/pools/$poolAddress", params: { poolAddress: result.address } });
    } else if (result.kind === "voucher") {
      void navigate({
        to: "/vouchers/$voucherAddress",
        params: { voucherAddress: result.address },
      });
    } else if (result.kind === "offering") {
      void navigate({
        to: "/vouchers/$voucherAddress",
        params: { voucherAddress: result.voucherAddress },
      });
    } else if (result.kind === "catalog") {
      void navigate({ to: "/catalogs/$catalogId", params: { catalogId: result.id } });
    } else {
      void navigate({ to: "/wants/$wantId", params: { wantId: result.id } });
    }
  }

  const groups = [
    { id: "actions" as const, heading: t`Actions`, entries: actions },
    { id: "people" as const, heading: t`People`, entries: peopleEntries },
    { id: "marketplace" as const, heading: t`Marketplace`, entries: marketEntries },
  ].filter((group) => group.entries.length > 0);
  const entries = groups.flatMap((group) => group.entries);
  const found = entries.findIndex((entry) => entry.key === activeKey);
  const activeIndex = entries.length === 0 ? -1 : Math.max(found, 0);
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const activeId = activeIndex >= 0 ? optionId(activeIndex) : undefined;

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  const loading = searching && (people.isLoading || market.isLoading);
  const failed = searching && (people.isError || market.isError);
  const noMatches = query.trim() !== "" && entries.length === 0 && !loading && !failed;

  function retry() {
    if (people.isError) void people.refetch();
    if (market.isError) void market.refetch();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (entries.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = entries[(activeIndex + step + entries.length) % entries.length];
      if (next) setActiveKey(next.key);
      return;
    }
    if (event.key === "Enter") {
      const entry = entries[activeIndex];
      if (!entry) return;
      event.preventDefault();
      go(entry.run);
    }
  }

  let position = -1;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setActiveKey(null);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup className="fixed inset-x-0 top-[12%] z-50 mx-auto flex max-h-[70dvh] w-[min(36rem,calc(100vw-4rem))] flex-col border border-border bg-card">
          <Dialog.Title className="sr-only">
            <Trans>Search the marketplace</Trans>
          </Dialog.Title>
          <div className="border-border border-b p-3">
            <Input
              autoFocus
              role="combobox"
              aria-expanded={entries.length > 0}
              aria-controls={entries.length > 0 ? `${baseId}-list` : undefined}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveKey(null);
              }}
              onKeyDown={onInputKeyDown}
              placeholder={t`Search the marketplace`}
              aria-label={t`Search the marketplace`}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {entries.length > 0 ? (
              <div id={`${baseId}-list`} role="listbox" aria-label={t`Results`}>
                {groups.map((group) => (
                  <div key={group.id} role="group" aria-labelledby={`${baseId}-${group.id}`}>
                    <div
                      id={`${baseId}-${group.id}`}
                      role="presentation"
                      className="px-3 pt-2 pb-1 font-mono text-2xs font-medium text-muted-foreground uppercase"
                    >
                      {group.heading}
                    </div>
                    {group.entries.map((entry) => {
                      position += 1;
                      const index = position;
                      const active = index === activeIndex;
                      return (
                        <div
                          key={entry.key}
                          id={optionId(index)}
                          role="option"
                          aria-selected={active}
                          className={cn(
                            "flex min-h-10 w-full cursor-default items-center justify-between gap-3 px-3 py-1.5 text-start text-sm",
                            active ? "bg-muted" : "hover:bg-muted/60",
                          )}
                          onMouseMove={() => {
                            if (!active) setActiveKey(entry.key);
                          }}
                          onClick={() => go(entry.run)}
                        >
                          <span dir="auto" className="min-w-0 truncate">
                            {entry.label}
                          </span>
                          {entry.hint ? (
                            <span
                              className={cn(
                                "shrink-0 text-xs text-muted-foreground",
                                entry.mono && "font-mono",
                              )}
                              dir={entry.mono ? "ltr" : undefined}
                            >
                              {entry.hint}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}
            <Status
              loading={loading}
              failed={failed}
              noMatches={noMatches}
              onRetry={retry}
              pending={people.isFetching || market.isFetching}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Search progress as text, announced politely: loading, no matches, or a failure with Retry. */
function Status({
  loading,
  failed,
  noMatches,
  pending,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  noMatches: boolean;
  pending: boolean;
  onRetry: () => void;
}) {
  let message: ReactNode = null;
  if (loading) {
    message = (
      <>
        <Spinner />
        <Trans>Searching…</Trans>
      </>
    );
  } else if (failed) {
    message = <Trans>Search failed</Trans>;
  } else if (noMatches) {
    message = <Trans>No matches</Trans>;
  }
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 text-sm text-muted-foreground",
        message !== null && "min-h-9",
      )}
    >
      <div role="status" className="flex items-center gap-2">
        {message}
      </div>
      {failed && !loading ? (
        <Button variant="outline" pending={pending} onClick={onRetry}>
          <Trans>Retry</Trans>
        </Button>
      ) : null}
    </div>
  );
}
