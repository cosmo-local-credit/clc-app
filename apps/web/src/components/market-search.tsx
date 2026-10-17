import { Dialog } from "@base-ui/react/dialog";
import { parseCatalogFilter } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import {
  RiArrowLeftLine,
  RiCloseLine,
  RiHistoryLine,
  RiPriceTag3Line,
  RiSearchLine,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { SelectableTagBadge } from "#/components/ui/tag-badge";
import { PoolLogo, VoucherAvatar } from "#/components/wallet";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { readRecentSearches, rememberSearch } from "#/features/home/api/recent-search-storage";
import {
  type PoolSuggestion,
  useMarketSearchSuggestions,
  type VoucherSuggestion,
} from "#/features/home/hooks/use-market-search-suggestions";
import { categoryLabel } from "#/lib/category-label";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

const RESTING_TAGS = 8;
const SUGGESTED_TAGS = 5;

const rowClassName =
  "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-start outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * The bar's search field. It holds no text of its own: a tap opens the
 * search screen, and the field shows the search that is applied.
 */
export function MarketSearchField({
  filter,
  label,
  onOpen,
}: {
  filter: CatalogFilterControls;
  label: string;
  onOpen: () => void;
}) {
  const { t } = useLingui();
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 ps-3 pe-2 text-start outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <RiSearchLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {filter.term === "" ? (
          <span className="min-w-0 flex-1 truncate text-base text-muted-foreground">{label}</span>
        ) : (
          <>
            <span className="sr-only">{label}</span>{" "}
            <span dir="auto" className="min-w-0 flex-1 truncate text-base">
              {filter.term}
            </span>
          </>
        )}
      </button>
      {filter.term !== "" ? (
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={filter.clearTerm}
          aria-label={t`Clear search`}
          className="border-0 text-muted-foreground"
        >
          <RiCloseLine className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </>
  );
}

/**
 * Full-screen search: recent searches and tags at rest, then matching
 * vouchers, pools and tags as you type. Enter searches; a voucher or a pool
 * opens its page; a tag joins the applied tags.
 */
export function MarketSearchScreen({
  onClose,
  filter,
  label,
  onApplyTags,
}: {
  onClose: () => void;
  filter: CatalogFilterControls;
  label: string;
  onApplyTags: (tags: readonly string[]) => void;
}) {
  const { t, i18n } = useLingui();
  const owner = useStorageOwner();
  const inputRef = useRef<HTMLInputElement>(null);
  // Mounted for each opening, so it starts from the applied search.
  const [draft, setDraft] = useState(filter.term);
  const [recent] = useState(() => (owner === null ? [] : readRecentSearches(owner)));
  const suggestions = useMarketSearchSuggestions(draft);
  const query = draft.trim();

  function search(term: string) {
    const parsed = parseCatalogFilter({ q: term });
    const canonical = parsed.ok ? parsed.filter.term : "";
    if (term.trim() === "") filter.clearTerm();
    else filter.setTerm(term.trim());
    if (canonical !== "" && owner !== null) rememberSearch(owner, canonical);
    onClose();
  }

  function pickTag(tag: string) {
    if (!filter.tags.includes(tag)) onApplyTags([...filter.tags, tag]);
    onClose();
  }

  const lowered = query.toLocaleLowerCase();
  const matchingTags =
    query === ""
      ? []
      : suggestions.tags
          .filter(
            (tag) =>
              tag.toLocaleLowerCase().includes(lowered) ||
              categoryLabel(tag, i18n).toLocaleLowerCase().includes(lowered),
          )
          .slice(0, SUGGESTED_TAGS);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup
          initialFocus={inputRef}
          className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] text-foreground outline-none"
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <form
            role="search"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              search(draft);
            }}
            className="mx-4 mt-4 flex h-11 shrink-0 items-center border border-foreground! bg-card"
          >
            <Button
              variant="ghost"
              size="icon-lg"
              className="border-0"
              aria-label={t`Back`}
              onClick={onClose}
            >
              <RiArrowLeftLine className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            </Button>
            <input
              ref={inputRef}
              dir="auto"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={label}
              placeholder={label}
              className="h-full min-w-0 flex-1 appearance-none bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
            />
            {draft !== "" ? (
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={t`Clear search`}
                className="border-0 text-muted-foreground"
                onClick={() => {
                  setDraft("");
                  inputRef.current?.focus();
                }}
              >
                <RiCloseLine className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </form>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {query === "" ? (
              <>
                {recent.length > 0 ? (
                  <section className="space-y-2">
                    <SectionHeading variant="group">
                      <Trans>Recent</Trans>
                    </SectionHeading>
                    <ul className="divide-y divide-border border border-border bg-card">
                      {recent.map((term) => (
                        <li key={term}>
                          <button
                            type="button"
                            className={rowClassName}
                            onClick={() => search(term)}
                          >
                            <RiHistoryLine
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
                              {term}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {suggestions.tags.length > 0 ? (
                  <section className="space-y-2">
                    <SectionHeading variant="group">
                      <Trans>Tags</Trans>
                    </SectionHeading>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.tags.slice(0, RESTING_TAGS).map((tag) => {
                        const selected = filter.tags.includes(tag);
                        return (
                          <SelectableTagBadge
                            key={tag}
                            tag={tag}
                            selected={selected}
                            disabled={!selected && filter.isAtTagLimit}
                            onClick={() => pickTag(tag)}
                          />
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <ul className="divide-y divide-border border border-border bg-card">
                <li>
                  <button type="button" className={rowClassName} onClick={() => search(draft)}>
                    <RiSearchLine
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
                      <Trans>Search “{query}”</Trans>
                    </span>
                  </button>
                </li>
                {suggestions.vouchers.map((row) => (
                  <li key={`voucher:${row.id}`}>
                    <SuggestionLink row={row} query={query}>
                      <VoucherAvatar
                        address={row.address}
                        symbol={row.symbol ?? ""}
                        iconUrl={row.imageUrl}
                        size={28}
                      />
                    </SuggestionLink>
                  </li>
                ))}
                {suggestions.pools.map((row) => (
                  <li key={`pool:${row.id}`}>
                    <SuggestionLink row={row} query={query}>
                      <PoolLogo
                        imageUrl={row.imageUrl}
                        name={row.name}
                        seed={row.address}
                        size={28}
                      />
                    </SuggestionLink>
                  </li>
                ))}
                {matchingTags.map((tag) => (
                  <li key={`tag:${tag}`}>
                    <button
                      type="button"
                      className={rowClassName}
                      disabled={!filter.tags.includes(tag) && filter.isAtTagLimit}
                      onClick={() => pickTag(tag)}
                    >
                      <RiPriceTag3Line
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <Highlight text={categoryLabel(tag, i18n)} query={query} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SuggestionLink({
  row,
  query,
  children,
}: {
  row: VoucherSuggestion | PoolSuggestion;
  query: string;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const detail =
    row.kind === "pool"
      ? [t`Pool`, row.locationName].filter(Boolean).join(" · ")
      : row.locationName;
  const content = (
    <>
      {children}
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate font-medium text-sm">
          <Highlight text={row.name} query={query} />
        </span>
        {detail ? (
          <span dir="auto" className="block truncate text-muted-foreground text-xs">
            {detail}
          </span>
        ) : null}
      </span>
    </>
  );
  if (row.kind === "pool") {
    return (
      <Link to="/pools/$poolAddress" params={{ poolAddress: row.address }} className={rowClassName}>
        {content}
      </Link>
    );
  }
  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: row.address }}
      search={{ from: "market" }}
      className={rowClassName}
    >
      {content}
    </Link>
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
