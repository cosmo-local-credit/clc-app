import type { CatalogKind } from "@clc/core/features/catalogs/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiSearchLine } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { Spinner } from "#/components/ui/spinner";
import { PoolLogo, VoucherAvatar } from "#/components/wallet";
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

export function CatalogMemberPicker({
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
  const { members, title, pendingId, addCandidate } = useCatalogMemberPicker({
    catalogId,
    kind,
    open,
    onOpenChange,
  });

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-8">
            {open && members.isPending ? (
              <p className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
                <Spinner />
                <Trans>Loading…</Trans>
              </p>
            ) : null}
            {open && members.isError ? (
              <div className="space-y-2">
                <p role="alert" className="text-destructive text-sm">
                  <Trans>Couldn't load catalog items.</Trans>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  tap
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
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function VoucherCandidates({
  members,
  pendingId,
  onSelect,
}: {
  members: readonly MemberIdentity[];
  pendingId?: string;
  onSelect: (candidate: CatalogMemberCandidate) => void;
}) {
  const { query, setQuery, minimum, search, groups } = useVoucherCandidates(members);

  return (
    <CandidateBrowser
      kind="voucher"
      query={query}
      setQuery={setQuery}
      minimum={minimum}
      search={search}
      groups={groups}
      pendingId={pendingId}
      onSelect={onSelect}
    />
  );
}

function PoolCandidates({
  members,
  pendingId,
  onSelect,
}: {
  members: readonly MemberIdentity[];
  pendingId?: string;
  onSelect: (candidate: CatalogMemberCandidate) => void;
}) {
  const { query, setQuery, minimum, search, groups } = usePoolCandidates(members);

  return (
    <CandidateBrowser
      kind="pool"
      query={query}
      setQuery={setQuery}
      minimum={minimum}
      search={search}
      groups={groups}
      pendingId={pendingId}
      onSelect={onSelect}
    />
  );
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
  onSelect: (candidate: CatalogMemberCandidate) => void;
}) {
  const { t } = useLingui();
  const term = query.trim();
  const searching = term.length >= minimum;
  const visibleGroups = visibleCandidateGroups(groups);

  return (
    <div className="space-y-3">
      <div className="relative">
        <RiSearchLine
          className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label={kind === "pool" ? t`Search pools` : t`Search vouchers`}
          placeholder={t`Name, symbol or address`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="ps-9"
          autoFocus
        />
      </div>

      {term.length > 0 && !searching ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Type at least two characters.</Trans>
        </p>
      ) : null}

      {searching ? (
        <SearchResults kind={kind} search={search} pendingId={pendingId} onSelect={onSelect} />
      ) : visibleGroups.length > 0 ? (
        <div className="space-y-3">
          {visibleGroups.map((group) => (
            <SuggestionGroup
              key={group.id}
              group={group}
              kind={kind}
              pendingId={pendingId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
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
  onSelect: (candidate: CatalogMemberCandidate) => void;
}) {
  if (search.status === "searching") {
    return (
      <p className="text-muted-foreground text-xs">
        <Trans>Searching…</Trans>
      </p>
    );
  }
  if (search.status === "error") {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-destructive text-sm">
          {kind === "pool" ? (
            <Trans>Couldn't search pools.</Trans>
          ) : (
            <Trans>Couldn't search vouchers.</Trans>
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          tap
          pending={search.retrying}
          onClick={search.retry}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  if (search.status === "ready" && search.results.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
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
  onSelect: (candidate: CatalogMemberCandidate) => void;
}) {
  return (
    <section className="space-y-1" aria-labelledby={`catalog-add-${kind}-${group.id}`}>
      <p id={`catalog-add-${kind}-${group.id}`} className="text-muted-foreground text-xs">
        {group.label}
      </p>
      {group.rows.length > 0 ? (
        <CandidateList
          kind={kind}
          candidates={group.rows}
          pendingId={pendingId}
          onSelect={onSelect}
        />
      ) : group.source.status === "loading" ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Loading…</Trans>
        </p>
      ) : group.source.status === "error" ? (
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-muted-foreground text-xs">
            <Trans>Unavailable</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            tap
            pending={group.source.retrying}
            onClick={group.source.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {group.source.status === "ready" && group.source.completeness === "partial" ? (
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-muted-foreground text-xs">
            <Trans>Showing recent vouchers only.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            tap
            pending={group.source.retrying}
            onClick={group.source.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
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
  onSelect: (candidate: CatalogMemberCandidate) => void;
}) {
  return (
    <ul className="border border-border bg-card">
      {candidates.map((candidate, index) => {
        const pending = pendingId === candidate.id;
        return (
          <li key={`${candidate.id}:${candidate.address}`}>
            <button
              type="button"
              disabled={pendingId !== undefined}
              aria-busy={pending || undefined}
              onClick={() => onSelect(candidate)}
              className={[
                "flex min-h-14 w-full items-center gap-3 p-2 text-start outline-none focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50",
                index === candidates.length - 1 ? "" : "border-b border-border",
              ].join(" ")}
            >
              {kind === "pool" ? (
                <PoolLogo
                  imageUrl={candidate.imageUrl}
                  name={candidate.name}
                  seed={candidate.address}
                  size={40}
                />
              ) : (
                <VoucherAvatar
                  address={candidate.address}
                  symbol={candidate.symbol}
                  iconUrl={candidate.imageUrl}
                  size={40}
                />
              )}
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-sm font-semibold">
                  {candidate.name}
                </span>
                <span dir="ltr" className="block font-mono text-muted-foreground text-xs">
                  {formatVoucherAddress(candidate.address)}
                </span>
              </span>
              {pending ? <Spinner /> : null}
              <Badge variant="outline" size="sm" className="font-mono">
                {candidate.symbol}
              </Badge>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
