import type { CatalogKind } from "@clc/core/features/catalogs/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiCloseLine, RiSearchLine } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { SectionHeading } from "#/components/ui/section-heading";
import { Spinner } from "#/components/ui/spinner";
import { MarketAvatar } from "#/desktop/market/market-bits";
import {
  type CandidateGroup,
  type CandidateSearch,
  useCatalogMemberPicker,
  usePoolCandidates,
  useVoucherCandidates,
  visibleCandidateGroups,
} from "#/features/catalogs/hooks/use-catalog-member-picker";
import type { CatalogMemberCandidate } from "#/features/catalogs/logic/catalog-member-candidates";

type MemberIdentity = { id: string; address: string };
type Select = (candidate: CatalogMemberCandidate) => void;

/** "Add a pool" / "Add a voucher" as a dialog: search, then the suggestion groups. */
export function CatalogMemberPickerDesk({
  catalogId,
  kind,
  open,
  onOpenChange,
}: {
  catalogId: string;
  kind: CatalogKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const { members, title, pendingId, addCandidate } = useCatalogMemberPicker({
    catalogId,
    kind,
    open,
    onOpenChange,
  });
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="flex max-h-[min(640px,calc(100dvh-4rem))] max-w-[520px] flex-col rounded-none border border-border bg-card p-0 shadow-none">
          <div className="flex h-13 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogClose
              render={
                <Button type="button" variant="ghost" size="icon" aria-label={t`Close`}>
                  <RiCloseLine aria-hidden="true" />
                </Button>
              }
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {open && members.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Spinner />
                <Trans>Loading…</Trans>
              </p>
            ) : null}
            {open && members.isError ? (
              <div className="grid justify-items-start gap-2">
                <p role="alert" className="text-sm text-destructive">
                  <Trans>Couldn't load catalog items.</Trans>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  pending={members.isFetching}
                  onClick={() => void members.refetch()}
                >
                  <Trans>Retry</Trans>
                </Button>
              </div>
            ) : null}
            {open && members.isSuccess ? (
              kind === "pool" ? (
                <PoolCandidates
                  members={members.data}
                  pendingId={pendingId}
                  onSelect={addCandidate}
                />
              ) : (
                <VoucherCandidates
                  members={members.data}
                  pendingId={pendingId}
                  onSelect={addCandidate}
                />
              )
            ) : null}
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}

function VoucherCandidates(props: {
  members: readonly MemberIdentity[];
  pendingId?: string;
  onSelect: Select;
}) {
  const model = useVoucherCandidates(props.members);
  return <CandidateBrowser kind="voucher" {...model} {...props} />;
}

function PoolCandidates(props: {
  members: readonly MemberIdentity[];
  pendingId?: string;
  onSelect: Select;
}) {
  const model = usePoolCandidates(props.members);
  return <CandidateBrowser kind="pool" {...model} {...props} />;
}

function CandidateBrowser({
  kind,
  query,
  setQuery,
  minimum,
  search,
  groups,
  pendingId,
  onSelect,
}: {
  kind: CatalogKind;
  query: string;
  setQuery: (query: string) => void;
  minimum: number;
  search: CandidateSearch;
  groups: readonly CandidateGroup[];
  pendingId?: string;
  onSelect: Select;
}) {
  const { t } = useLingui();
  const term = query.trim();
  const searching = term.length >= minimum;
  const visibleGroups = visibleCandidateGroups(groups);
  return (
    <div className="grid gap-4">
      <div className="relative">
        <RiSearchLine
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label={kind === "pool" ? t`Search pools` : t`Search vouchers`}
          placeholder={t`Name, symbol or address`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="bg-card ps-9"
          autoFocus
        />
      </div>
      {term.length > 0 && !searching ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Type at least two characters.</Trans>
        </p>
      ) : null}
      {searching ? (
        <SearchResults kind={kind} search={search} pendingId={pendingId} onSelect={onSelect} />
      ) : visibleGroups.length > 0 ? (
        visibleGroups.map((group) => (
          <SuggestionGroup
            key={group.id}
            group={group}
            kind={kind}
            pendingId={pendingId}
            onSelect={onSelect}
          />
        ))
      ) : (
        <p className="text-xs text-muted-foreground">
          <Trans>No suggestions available.</Trans>
        </p>
      )}
    </div>
  );
}

function SearchResults({
  kind,
  search,
  pendingId,
  onSelect,
}: {
  kind: CatalogKind;
  search: CandidateSearch;
  pendingId?: string;
  onSelect: Select;
}) {
  if (search.status === "searching") {
    return (
      <p className="text-xs text-muted-foreground">
        <Trans>Searching…</Trans>
      </p>
    );
  }
  if (search.status === "error") {
    return (
      <div className="grid justify-items-start gap-2">
        <p role="alert" className="text-sm text-destructive">
          {kind === "pool" ? (
            <Trans>Couldn't search pools.</Trans>
          ) : (
            <Trans>Couldn't search vouchers.</Trans>
          )}
        </p>
        <Button type="button" variant="outline" pending={search.retrying} onClick={search.retry}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  if (search.status === "ready" && search.results.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {kind === "pool" ? (
          <Trans>No pools match this search.</Trans>
        ) : (
          <Trans>No vouchers match that search.</Trans>
        )}
      </p>
    );
  }
  return (
    <CandidateList
      kind={kind}
      candidates={search.results}
      pendingId={pendingId}
      onSelect={onSelect}
    />
  );
}

function SuggestionGroup({
  group,
  kind,
  pendingId,
  onSelect,
}: {
  group: CandidateGroup;
  kind: CatalogKind;
  pendingId?: string;
  onSelect: Select;
}) {
  const retryRow = (message: ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <p role="status" className="text-xs text-muted-foreground">
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        pending={group.source.retrying}
        onClick={group.source.retry}
      >
        <Trans>Retry</Trans>
      </Button>
    </div>
  );
  return (
    <section className="grid gap-1.5" aria-labelledby={`catalog-add-${kind}-${group.id}`}>
      <SectionHeading as="h3" variant="group" id={`catalog-add-${kind}-${group.id}`}>
        {group.label}
      </SectionHeading>
      {group.rows.length > 0 ? (
        <CandidateList
          kind={kind}
          candidates={group.rows}
          pendingId={pendingId}
          onSelect={onSelect}
        />
      ) : group.source.status === "loading" ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Loading…</Trans>
        </p>
      ) : group.source.status === "error" ? (
        retryRow(<Trans>Unavailable</Trans>)
      ) : null}
      {group.source.status === "ready" && group.source.completeness === "partial"
        ? retryRow(<Trans>Showing recent vouchers only.</Trans>)
        : null}
    </section>
  );
}

function CandidateList({
  kind,
  candidates,
  pendingId,
  onSelect,
}: {
  kind: CatalogKind;
  candidates: readonly CatalogMemberCandidate[];
  pendingId?: string;
  onSelect: Select;
}) {
  return (
    <ul className="flex flex-col border border-border bg-card [&>*+*]:border-border [&>*+*]:border-t">
      {candidates.map((candidate) => {
        const pending = pendingId === candidate.id;
        return (
          <li key={`${candidate.id}:${candidate.address}`}>
            <button
              type="button"
              disabled={pendingId !== undefined}
              aria-busy={pending || undefined}
              onClick={() => onSelect(candidate)}
              className="flex min-h-14 w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-start outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              {candidate.imageUrl ? (
                <span className="relative flex size-[34px] shrink-0 overflow-hidden border border-border">
                  <ProgressiveImage
                    src={candidate.imageUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                </span>
              ) : (
                <MarketAvatar
                  name={candidate.name}
                  seed={candidate.address}
                  kind={kind === "pool" ? "pool" : "voucher"}
                />
              )}
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-sm font-semibold">
                  {candidate.name}
                </span>
                <span dir="ltr" className="block truncate font-mono text-xs text-muted-foreground">
                  {formatVoucherAddress(candidate.address)}
                </span>
              </span>
              {pending ? <Spinner /> : null}
              <Badge variant="outline" size="sm" className="font-mono" dir="ltr">
                {candidate.symbol}
              </Badge>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
