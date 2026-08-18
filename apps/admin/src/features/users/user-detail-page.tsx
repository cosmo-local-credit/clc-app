import { useState } from "react";

import { LoadingBlock } from "#/components/admin/loading-block";
import { PageState } from "#/components/admin/page-state";
import { adminAccountStatsQueryOptions } from "@clc/api/features/admin/queries";
import { useQuery } from "@tanstack/react-query";
import { clcApi } from "#/lib/api";
import { useDataState } from "#/lib/use-data-state";
import { useLatestAccountTokens } from "./use-account-balances";
import { AccountBalancesCard } from "./ui/account-balances-card";
import { AccountHeader } from "./ui/account-header";
import { AccountProfileCard } from "./ui/account-profile-card";
import { AccountRecordTabs } from "./ui/account-record-tabs";
import { AccountSummaryMetrics } from "./ui/account-summary-metrics";
import { EditAccountProfileSheet } from "./ui/edit-account-profile-sheet";
import { useAdminUser } from "./use-admin-users";
import type { UserDetailSearch } from "./user-detail-search";

/**
 * One account, as an operator reads it: who it is and what to do about it first,
 * then its details and holdings, then its records.
 *
 * Query orchestration stays here and the panels take data as props, so each panel
 * renders from what it was given and there is one place to see what this screen
 * fetches.
 *
 * An address with no account is a first-class case, not an error. The pools and
 * vouchers surfaces link to addresses that hold vouchers without ever having
 * registered, so the balances and records still render for them; only the profile
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
      <PageState
        title="Could not load this account"
        message={
          accountQuery.error instanceof Error ? accountQuery.error.message : "The request failed."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AccountHeader address={address} account={account} onEditProfile={() => setEditing(true)} />

      {/* Profile, balances and figures share one band so the records below stay
          above the fold on a laptop. The profile is still the widest of the three
          but no longer takes half the page: at these widths its fields read fine
          in two columns, and the space it gave up is what makes room for the
          tiles. Below xl the band folds to two columns and the tiles span both,
          then to one. */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(14rem,0.7fr)_minmax(15rem,0.75fr)]">
        {account ? (
          <AccountProfileCard account={account} />
        ) : (
          <div className="h-full border border-border bg-card p-4 text-sm text-muted-foreground">
            This address holds vouchers but has no CLC account.
          </div>
        )}
        <AccountBalancesCard tokens={tokens} state={tokensState} />
        <div className="lg:col-span-2 xl:col-span-1">
          {/* null while loading or after a failure: the tiles then read as
              unavailable rather than as zero. */}
          <AccountSummaryMetrics stats={statsQuery.data ?? null} />
        </div>
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
