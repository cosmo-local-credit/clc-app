import { parseCatalogFilter } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import {
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { RiCloseLine, RiHistoryLine, RiPriceTag3Line, RiSearchLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { readRecentSearches, rememberSearch } from "#/features/home/api/recent-search-storage";
import type { MarketFilterControls } from "#/features/home/hooks/use-market-filter";
import {
  type PoolSuggestion,
  useMarketSearchSuggestions,
  type VoucherSuggestion,
} from "#/features/home/hooks/use-market-search-suggestions";
import { categoryLabel } from "#/lib/category-label";
import { cn } from "#/lib/utils";
import { MarketAvatar } from "#/desktop/market/market-bits";
import { DeskKbd } from "#/desktop/ui/kbd";

const RESTING_TAGS = 8;
const SUGGESTED_TAGS = 5;

type Item =
  | { id: string; kind: "search"; term: string }
  | { id: string; kind: "recent"; term: string }
  | { id: string; kind: "tag"; tag: string; disabled: boolean }
  | { id: string; kind: "voucher"; row: VoucherSuggestion }
  | { id: string; kind: "pool"; row: PoolSuggestion }
  | { id: string; kind: "retry" }
  | { id: string; kind: "more" };

type KeyHandler = (event: KeyboardEvent<HTMLInputElement>) => void;

/**
 * Local market search with its assists in a popover under the field, in place
 * of the phone's full-screen search: recent terms and categories at rest, then
 * the vouchers, pools and categories that match what is typed. The field still
 * narrows the results as you type. Up and Down move through the suggestions,
 * Enter picks one (or keeps the typed search), Escape closes the popover.
 */
export function MarketSearchField({
  filter,
  label,
  column,
}: {
  filter: MarketFilterControls;
  label: string;
  /** The map's results column, where `/` focuses the field. */
  column: boolean;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const keyHandler = useRef<KeyHandler | null>(null);
  const listId = useId();

  const close = () => {
    setOpen(false);
    setActiveId(null);
  };

  return (
    <div
      ref={root}
      className="relative min-w-0"
      onBlur={(event) => {
        // Focus moving to a suggestion's button or to another control inside closes nothing.
        if (event.relatedTarget instanceof Node && root.current?.contains(event.relatedTarget)) {
          return;
        }
        close();
      }}
    >
      <RiSearchLine
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && activeId ? activeId : undefined}
        autoComplete="off"
        value={filter.term}
        onChange={(event) => {
          filter.setTerm(event.target.value);
          setActiveId(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            // The popover owns this Escape; the shell's does not also run.
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
          }
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
            return;
          }
          keyHandler.current?.(event);
        }}
        placeholder={label}
        aria-label={label}
        // The map has no top bar, so `/` focuses this field there.
        data-desktop-search={column ? "" : undefined}
        className="truncate ps-9 pe-10"
      />
      {filter.term !== "" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t`Clear search`}
          onClick={filter.clearTerm}
          className="absolute end-0 top-0 border-0 text-muted-foreground"
        >
          <RiCloseLine aria-hidden="true" />
        </Button>
      ) : column ? (
        <DeskKbd className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2">/</DeskKbd>
      ) : null}
      {open ? (
        <Suggestions
          id={listId}
          filter={filter}
          activeId={activeId}
          onActiveChange={setActiveId}
          keyHandler={keyHandler}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function Suggestions({
  id,
  filter,
  activeId,
  onActiveChange,
  keyHandler,
  onClose,
}: {
  id: string;
  filter: MarketFilterControls;
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
  keyHandler: MutableRefObject<KeyHandler | null>;
  onClose: () => void;
}) {
  const { t, i18n } = useLingui();
  const navigate = useNavigate();
  const owner = useStorageOwner();
  const draft = filter.term;
  const query = draft.trim();
  const suggestions = useMarketSearchSuggestions(draft);
  // Read when the popover opens, as the phone reads them when its screen does.
  const [recent] = useState(() => (owner === null ? [] : readRecentSearches(owner)));

  const items = ((): Item[] => {
    const list: Item[] = [];
    const lowered = query.toLocaleLowerCase();
    if (query === "") {
      for (const term of recent) list.push({ id: `${id}-recent-${term}`, kind: "recent", term });
      for (const tag of suggestions.tags.slice(0, RESTING_TAGS)) {
        list.push({
          id: `${id}-tag-${tag}`,
          kind: "tag",
          tag,
          disabled: !filter.tags.includes(tag) && filter.isAtTagLimit,
        });
      }
      return list;
    }
    list.push({ id: `${id}-search`, kind: "search", term: draft });
    for (const row of suggestions.vouchers) {
      list.push({ id: `${id}-voucher-${row.id}`, kind: "voucher", row });
    }
    for (const row of suggestions.pools) {
      list.push({ id: `${id}-pool-${row.id}`, kind: "pool", row });
    }
    for (const tag of suggestions.tags
      .filter(
        (candidate) =>
          candidate.toLocaleLowerCase().includes(lowered) ||
          categoryLabel(candidate, i18n).toLocaleLowerCase().includes(lowered),
      )
      .slice(0, SUGGESTED_TAGS)) {
      list.push({
        id: `${id}-tag-${tag}`,
        kind: "tag",
        tag,
        disabled: !filter.tags.includes(tag) && filter.isAtTagLimit,
      });
    }
    if (suggestions.isError) list.push({ id: `${id}-retry`, kind: "retry" });
    else if (suggestions.hasMore && !suggestions.isLoading) {
      list.push({ id: `${id}-more`, kind: "more" });
    }
    return list;
  })();

  const canonical = (term: string) => {
    const parsed = parseCatalogFilter({ q: term });
    return parsed.ok ? parsed.filter.term : "";
  };

  function search(term: string) {
    if (term.trim() === "") filter.clearTerm();
    else filter.setTerm(term.trim());
    const remembered = canonical(term);
    if (remembered !== "" && owner !== null) rememberSearch(owner, remembered);
    onClose();
  }

  function pickTag(tag: string) {
    if (!filter.tags.includes(tag)) {
      filter.applyFacetFilters(
        [...filter.tags, tag],
        filter.tagMatch,
        filter.vouchers,
        filter.voucherMatch,
      );
    }
    onClose();
  }

  function activate(item: Item) {
    switch (item.kind) {
      case "search":
      case "recent":
        search(item.term);
        return;
      case "tag":
        if (!item.disabled) pickTag(item.tag);
        return;
      case "voucher":
        onClose();
        void navigate({
          to: "/vouchers/$voucherAddress",
          params: { voucherAddress: item.row.address },
          search: { from: "market" },
        });
        return;
      case "pool":
        onClose();
        void navigate({ to: "/pools/$poolAddress", params: { poolAddress: item.row.address } });
        return;
      case "retry":
        suggestions.retry();
        return;
      case "more":
        suggestions.loadMore();
        return;
    }
  }

  const activeIndex = items.findIndex((item) => item.id === activeId);
  // The input's key handler is the latest render's, so it sees the current items.
  useEffect(() => {
    keyHandler.current = handleKey;
    return () => {
      keyHandler.current = null;
    };
  });
  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (items.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next =
        activeIndex < 0
          ? step > 0
            ? 0
            : items.length - 1
          : (activeIndex + step + items.length) % items.length;
      onActiveChange(items[next]?.id ?? null);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) activate(item);
      else search(draft);
    }
  }

  // The highlighted row stays in view as the arrow keys move it.
  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  if (items.length === 0 && !suggestions.isLoading) return null;

  const group = (kind: Item["kind"][], heading: string) => {
    const rows = items.filter((item) => kind.includes(item.kind));
    if (rows.length === 0) return null;
    return (
      <div role="group" aria-label={heading}>
        {rows.map((item) => (
          <Option
            key={item.id}
            item={item}
            active={item.id === activeId}
            query={query}
            onActivate={() => activate(item)}
            onHover={() => onActiveChange(item.id)}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      id={id}
      role="listbox"
      aria-label={t`Search suggestions`}
      className="absolute inset-x-0 top-full z-30 mt-1 max-h-[22rem] overflow-y-auto border border-border bg-popover text-popover-foreground"
    >
      {query === "" ? (
        <>
          {group(["recent"], t`Recent`)}
          {group(["tag"], t`Categories`)}
        </>
      ) : (
        <>
          {group(["search"], t`Search`)}
          {group(["voucher"], t`Vouchers`)}
          {group(["pool"], t`Pools`)}
          {group(["tag"], t`Categories`)}
          {group(["retry", "more"], t`More`)}
          {suggestions.isLoading ? (
            <p
              role="status"
              className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground"
            >
              <Spinner />
              <Trans>Loading…</Trans>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Option({
  item,
  active,
  query,
  onActivate,
  onHover,
}: {
  item: Item;
  active: boolean;
  query: string;
  onActivate: () => void;
  onHover: () => void;
}) {
  const { i18n } = useLingui();
  const disabled = item.kind === "tag" && item.disabled;
  let leading: ReactNode;
  let body: ReactNode;
  switch (item.kind) {
    case "search": {
      const term = item.term.trim();
      leading = <RiSearchLine className="size-4 text-muted-foreground" aria-hidden="true" />;
      body = (
        <span dir="auto" className="block truncate text-sm">
          <Trans>Search “{term}”</Trans>
        </span>
      );
      break;
    }
    case "recent":
      leading = <RiHistoryLine className="size-4 text-muted-foreground" aria-hidden="true" />;
      body = (
        <span dir="auto" className="block truncate text-sm">
          {item.term}
        </span>
      );
      break;
    case "tag":
      leading = <RiPriceTag3Line className="size-4 text-muted-foreground" aria-hidden="true" />;
      body = (
        <span className="block truncate text-sm">
          <Highlight text={categoryLabel(item.tag, i18n)} query={query} />
        </span>
      );
      break;
    case "voucher":
    case "pool": {
      const { row } = item;
      const locationName = row.locationName;
      leading = (
        <MarketAvatar name={row.name} seed={row.address ?? row.id} kind={item.kind} size="sm" />
      );
      body = (
        <>
          <span dir="auto" className="block truncate text-sm font-semibold">
            <Highlight text={row.name} query={query} />
          </span>
          <span dir="auto" className="block truncate text-xs text-muted-foreground">
            {item.kind === "pool" ? (
              locationName ? (
                <Trans>Pool · {locationName}</Trans>
              ) : (
                <Trans>Pool</Trans>
              )
            ) : (
              locationName
            )}
          </span>
        </>
      );
      break;
    }
    case "retry":
      leading = null;
      body = (
        <span className="block text-sm font-medium">
          <Trans>Try again</Trans>
        </span>
      );
      break;
    case "more":
      leading = null;
      body = (
        <span className="block text-sm font-medium">
          <Trans>Load more</Trans>
        </span>
      );
      break;
  }
  return (
    <div
      id={item.id}
      role="option"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      // The field keeps focus; a click must not blur it before it lands.
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={onHover}
      onClick={() => {
        if (!disabled) onActivate();
      }}
      className={cn(
        "flex min-h-10 cursor-default items-center gap-2.5 px-3 py-1.5",
        active && "bg-muted",
        disabled && "opacity-45",
      )}
    >
      {leading ? (
        <span className="flex size-7 shrink-0 items-center justify-center">{leading}</span>
      ) : null}
      <span className="min-w-0 flex-1">{body}</span>
    </div>
  );
}

/** The first case-insensitive match of `query` in `text`, in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (query === "" || index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-bold text-current">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}
