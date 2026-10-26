import type { Offering } from "@clc/api/features/offerings/client";
import { adminVoucherQueryOptions } from "@clc/api/features/admin/queries";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { LoadingBlock } from "#/components/admin/loading-block";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { useDataState } from "#/lib/use-data-state";
import { EditVoucherSheet } from "./ui/edit-voucher-sheet";
import { OfferingEditorSheet, type OfferingEditor } from "./ui/offering-editor-sheet";
import { RestoreResourceSheet } from "#/features/retirement/restore-resource-sheet";
import { RetirementResourceHistory } from "#/features/retirement/retirement-resource-history";
import { VoucherHeader } from "./ui/voucher-header";
import { VoucherProfileCard } from "./ui/voucher-profile-card";
import type { VoucherDetailSearch } from "./voucher-detail-search";
import { VoucherRecordTabs } from "./voucher-record-tabs";

/**
 * One voucher, as an operator reads it: what it is, then what it is worth and who
 * stands behind it, then its records.
 *
 * The screen fetches exactly one thing — the catalog's row for this voucher — and
 * every panel above the tabs renders from it. The records each fetch their own,
 * inside the tab that shows them, so opening a voucher costs one request and a
 * failing offerings endpoint cannot blank the record.
 *
 * There is no figures band here, unlike the pool screen. The voucher endpoint
 * carries no counts, so tiles would have to be derived from the tab pages, and a
 * count taken off one fetched page is a wrong count quoted confidently. When
 * clc-core serves voucher stats this is where they go.
 */
export function VoucherDetailPage({
  address,
  search,
}: {
  address: string;
  search: VoucherDetailSearch;
}) {
  // The console's own read, not the public one: that endpoint filters `active`,
  // so a retired voucher would 404 here and the restore below would have no
  // screen to sit on.
  const voucherQuery = useQuery(adminVoucherQueryOptions(clcApi.admin, address));
  const voucherState = useDataState(voucherQuery, () => false);

  const [restoring, setRestoring] = useState(false);

  const [editingVoucher, setEditingVoucher] = useState(false);
  const [offeringEditor, setOfferingEditor] = useState<OfferingEditor | null>(null);

  if (voucherState.kind === "pending") return <LoadingBlock rows={8} />;

  const voucher = voucherQuery.data;
  if (!voucher) {
    return (
      <PageState
        title="Could not load voucher"
        message={
          voucherState.kind === "error" ? voucherState.message : errorMessage(voucherQuery.error)
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {voucherState.kind === "stale" ? <StaleNotice message={voucherState.message} /> : null}

      <VoucherHeader
        voucher={voucher}
        onEdit={() => setEditingVoucher(true)}
        onRestore={() => setRestoring(true)}
        restoring={false}
      />

      <VoucherProfileCard voucher={voucher} />
      <RetirementResourceHistory type="voucher" address={address} />
      <RestoreResourceSheet
        type="voucher"
        address={address}
        name={voucher.name}
        open={restoring}
        onClose={() => setRestoring(false)}
      />

      <VoucherRecordTabs
        voucher={voucher}
        search={search}
        onEditOffering={(offering: Offering) => setOfferingEditor({ kind: "edit", offering })}
        onAddOffering={() => setOfferingEditor({ kind: "create" })}
      />

      <EditVoucherSheet
        open={editingVoucher}
        voucher={voucher}
        onClose={() => setEditingVoucher(false)}
      />

      <OfferingEditorSheet
        editor={offeringEditor}
        voucher={voucher}
        onClose={() => setOfferingEditor(null)}
      />
    </div>
  );
}
