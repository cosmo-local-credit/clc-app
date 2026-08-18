import { type ReactNode, useEffect, useRef, useState } from "react";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";

/**
 * Quiet period before a typed term is committed.
 *
 * The console's searches are server-side, so a term is a request and a history
 * entry: committing per keystroke would fire one of each per character. Matches
 * the catalog filter debounce in apps/web.
 */
const SEARCH_DEBOUNCE_MS = 250;

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search",
  filters,
  children,
}: {
  /** The committed term — normally the route's `q`, not the field's contents. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onSearchChange ? (
        <ToolbarSearch value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />
      ) : null}
      {filters}
      {children}
    </div>
  );
}

/**
 * The search field, debounced against the committed term.
 *
 * The committed term lives in the URL, which is the source of truth for what the
 * table is showing — so the field re-seeds whenever it changes underneath
 * (Back, Forward, a filter reset). Local state alone would leave the box
 * displaying a term the table is no longer filtered by.
 *
 * The page decides which committed terms reach its backend query. Directory and
 * transaction pages share the catalog contract, which holds terms below two
 * characters locally until they are specific enough for an indexed search.
 */
function ToolbarSearch({
  value,
  onChange,
  placeholder,
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const committed = value ?? "";
  const [draft, setDraft] = useState(committed);

  // The callback is read through a ref so a caller's inline arrow — which is a
  // new function on every parent render — cannot restart the timer and delay the
  // commit indefinitely.
  const commit = useRef(onChange);
  useEffect(() => {
    commit.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setDraft(committed);
  }, [committed]);

  useEffect(() => {
    if (draft === committed) return;
    const timeout = window.setTimeout(() => commit.current(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [draft, committed]);

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-8 w-56 bg-card font-sans text-sm"
    />
  );
}

function filterChipClassName(active: boolean) {
  return cn(
    "inline-flex h-8 items-center border border-border px-2.5 font-mono text-xs font-medium tracking-wide uppercase",
    active
      ? "bg-foreground text-background"
      : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

export function FilterChip({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onSelect} className={filterChipClassName(active)}>
      {children}
    </button>
  );
}

export function FilterGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center">{children}</div>;
}
