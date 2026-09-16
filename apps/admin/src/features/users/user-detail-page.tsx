import { adminAccountStatsQueryOptions } from "@clc/api/features/admin/queries";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { LoadingBlock } from "#/components/admin/loading-block";
import { PageState } from "#/components/admin/page-state";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { useDataState } from "#/lib/use-data-state";
import { AccountBalancesCard } from "./ui/account-balances-card";
import { AccountHeader } from "./ui/account-header";
import { AccountProfileCard } from "./ui/account-profile-card";
import { AccountRecordTabs } from "./ui/account-record-tabs";
import { AccountSummaryMetrics } from "./ui/account-summary-metrics";
import { EditAccountProfileSheet } from "./ui/edit-account-profile-sheet";
import { useLatestAccountTokens } from "./use-account-balances";
import { useAdminUser } from "./use-admin-users";
import type { UserDetailSearch } from "./user-detail-search";

/**
 * One account, as an operator reads it: who it is and what to do about it first,
 * then what it has done, then its record and its holdings, then its records.
 *
 * Query orchestration stays here and the panels take data as props, so each panel
 * renders from what it was given and there is one place to see what this screen
 * fetches.
 *
 * An address with no account is a first-class case, not an error. The pools and
 * vouchers surfaces link to addresses that hold vouchers without ever having
 * registered, so the balances and records still render for them; only the record
 * panel, which needs a record, stands down.
 */
export function UserDetailPage({ address, search }: { address: string; search: UserDetailSearch }) {
  const accountQuery = useAdminUser(address);
  // Polled while this screen is open; the freshness policy lives in the hook.
  const tokensQuery = useLatestAccountTokens(address);
  const statsQuery = useQuery(adminAccountStatsQueryOptions(clcApi.admin, address));

  const [editing, setEditing] = useState(false);

  const account = accountQuery.data ?? null;
  const tokens = tokensQuery.data?.tokens ?? [];
  const tokensState = useDataState(tokensQuery, (result) => result.tokens.length === 0);

  if (accountQuery.isPending) {
    return <LoadingBlock rows={8} />;
  }

  if (accountQuery.isError) {
    return (
      <PageState title="Could not load this account" message={errorMessage(accountQuery.error)} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AccountHeader address={address} account={account} onEditProfile={() => setEditing(true)} />

      {/* The figures come first and span the width, as they do on the dashboard.
          They answer "has this account done anything" in one glance, which is the
          question an operator asks before reading a single field of the record —
          and giving them the full width is what let the record and the balances
          each have a column below.

          null while loading or after a failure: the tiles then read as
          unavailable rather than as zero. */}
      <AccountSummaryMetrics stats={statsQuery.data ?? null} />

      {/* Two columns, split by how each half is read — the pool screen's division.
          The left is the record: contact details, limits and the place they
          describe, reference an operator reads once and returns to only when
          something is wrong. The right is what the address actually holds, which
          is looked at rather than read and changes without anyone editing it. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {account ? (
          <AccountProfileCard account={account} />
        ) : (
          <div className="border-border bg-card text-muted-foreground border p-4 text-sm">
            This address holds vouchers but has no CLC account, so there is no profile, no limits
            and no place on record. Its holdings and its history are still the chain's.
          </div>
        )}

        <AccountBalancesCard tokens={tokens} state={tokensState} />
      </div>

      <AccountRecordTabs address={address} search={search} />

      {account ? (
        <EditAccountProfileSheet
          account={account}
          open={editing}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
