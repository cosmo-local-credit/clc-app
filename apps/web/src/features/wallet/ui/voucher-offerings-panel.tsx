import type { Offering } from "@clc/api/features/offerings/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";

import { OfferingsPanel } from "#/components/offerings";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  useManagedVoucherOfferingsInfinite,
  useVoucherOfferingsInfinite,
} from "#/features/home/hooks/use-voucher-offerings";

import { useDeleteVoucherOffering } from "../hooks/use-offering-mutations";
import { OfferingEditorSheet, type OfferingEditor } from "./offering-editor-sheet";

/**
 * One voucher's offerings. No tile names its voucher: every row on this screen
 * belongs to the voucher in the page header.
 *
 * The issuer of the voucher sees the same list plus the controls to change it,
 * and reads it through a different query. Two things separate the owner's view
 * from a visitor's:
 *
 *   * the request bypasses the browser's HTTP cache. The public endpoint answers
 *     `public, max-age=60, stale-while-revalidate=300`, which is right for
 *     browsing and wrong for the person who just unlisted a row — they would
 *     watch it come back;
 *   * the `kind === "voucher"` shortcut does not apply. It is a sound inference
 *     for a visitor (that marker means no available offerings), but an owner
 *     needs somewhere to add the first one, and the empty state has to come from
 *     a real answer rather than from a guess that a create then invalidates.
 */
export function VoucherOfferingsPanel({
  voucherAddress,
  voucherSymbol,
  ownerAddress,
  isKnownEmpty,
}: {
  voucherAddress: string | undefined;
  voucherSymbol: string;
  /** The catalog's owner for this voucher, or null when it records none. */
  ownerAddress: string | null;
  /** `kind === "voucher"` already proves the result is empty — skip the request. */
  isKnownEmpty: boolean;
}) {
  const { t } = useLingui();
  const { isAuthenticated, session } = useAuthStatus();

  // The backend session's address, not the wagmi connector's. The write is
  // authorized against the cookie, so a connector that has moved on from the
  // session would show controls whose requests then fail with a 403.
  const isOwner =
    isAuthenticated &&
    Boolean(session?.address) &&
    Boolean(ownerAddress) &&
    session?.address?.toLowerCase() === ownerAddress?.toLowerCase();

  const [editor, setEditor] = useState<OfferingEditor | null>(null);
  const [deletingID, setDeletingID] = useState<string | null>(null);
  const remove = useDeleteVoucherOffering(voucherAddress ?? "");

  const visitorQuery = useVoucherOfferingsInfinite(
    isOwner || isKnownEmpty ? undefined : voucherAddress,
  );
  const ownerQuery = useManagedVoucherOfferingsInfinite(isOwner ? voucherAddress : undefined);
  const query = isOwner ? ownerQuery : visitorQuery;

  async function requestDelete(offering: Offering) {
    if (!window.confirm(t`Remove “${offering.name}” from the marketplace?`)) return;
    setDeletingID(offering.id);
    try {
      await remove.mutateAsync(offering.id);
      toast.success(t`Offering removed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Couldn't remove the offering.`);
    } finally {
      setDeletingID(null);
    }
  }

  return (
    <div id="voucher-panel-offerings" role="tabpanel" aria-labelledby="voucher-tab-offerings">
      {isOwner ? (
        <Button
          className="mb-3 h-11 w-full"
          onClick={() => setEditor({ kind: "create" })}
          disabled={!voucherAddress}
        >
          <Trans>Add offering</Trans>
        </Button>
      ) : null}

      <OfferingsPanel
        query={query}
        suppressed={!isOwner && isKnownEmpty}
        fallbackSymbol={voucherSymbol}
        management={
          isOwner
            ? {
                onEdit: (offering) => setEditor({ kind: "edit", offering }),
                onDelete: (offering) => void requestDelete(offering),
                deletingID,
              }
            : undefined
        }
        emptyState={
          isOwner ? (
            <Trans>Add what you accept this voucher for, and it appears in the marketplace.</Trans>
          ) : (
            <Trans>There is nothing available for exchange with this voucher yet.</Trans>
          )
        }
      />

      {voucherAddress ? (
        <OfferingEditorSheet
          editor={editor}
          voucherAddress={voucherAddress}
          voucherSymbol={voucherSymbol}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}
