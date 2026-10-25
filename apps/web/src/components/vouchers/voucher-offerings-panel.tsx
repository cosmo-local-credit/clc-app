import { ResourceUsage } from "#/components/resource-usage";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import type { Offering } from "@clc/api/features/offerings/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";

import { OfferingsPanel } from "#/components/offerings";
import { Button } from "#/components/ui/button";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  useManagedVoucherOfferingsInfinite,
  useVoucherOfferingsInfinite,
} from "#/features/home/hooks/use-voucher-offerings";
import { useDeleteVoucherOffering } from "#/features/wallet/hooks/use-offering-mutations";
import { isStorageConfigured } from "#/lib/api/storage";

import { OfferingEditorSheet, type OfferingEditor } from "./offering-editor-sheet";

/**
 * One voucher's offerings. No tile names its voucher: every row on this screen
 * belongs to the voucher in the page header.
 *
 * The issuer of the voucher sees the same list plus the controls to change it,
 * and bypasses the public response cache for their own changes:
 *
 *   * the request bypasses the browser's HTTP cache. The public endpoint answers
 *     `public, max-age=60, stale-while-revalidate=300`, which is right for
 *     browsing and wrong for the person who just unlisted a row — they would
 *     watch it come back;
 */
export function VoucherOfferingsPanel({
  voucherAddress,
  voucherSymbol,
  voucherValue,
  voucherUoa,
  ownerAddress,
  maxItems,
  manualPageSize,
  autoLoadMore,
  presentation = "tabpanel",
  readOnly = false,
  openVoucherPageAction = "navigate",
}: {
  voucherAddress: string | undefined;
  voucherSymbol: string;
  voucherValue: string | null;
  voucherUoa: string | null;
  /** The catalog's owner for this voucher, or null when it records none. */
  ownerAddress: string | null;
  maxItems?: number;
  manualPageSize?: number;
  autoLoadMore?: boolean;
  presentation?: "tabpanel" | "section";
  readOnly?: boolean;
  openVoucherPageAction?: "navigate" | "close";
}) {
  const { t } = useLingui();
  const { isAuthenticated, session } = useAuthStatus();
  const profileQuery = useAuthProfile();

  // The backend session's address, not the wagmi connector's. The write is
  // authorized against the cookie, so a connector that has moved on from the
  // session would show controls whose requests then fail with a 403.
  // A signer of the Safe that owns the voucher may publish for it too.
  const ownerInfo = useAssetOwnerInfo(voucherAddress ?? "", ownerAddress);
  const isOwner =
    !readOnly &&
    isAuthenticated &&
    Boolean(session?.address) &&
    Boolean(ownerAddress) &&
    ownerInfo.canManage;

  const usage = useResourceUsage(isOwner, voucherAddress);

  const [editor, setEditor] = useState<OfferingEditor | null>(null);
  const [deletingID, setDeletingID] = useState<string | null>(null);
  const remove = useDeleteVoucherOffering(voucherAddress ?? "");

  const visitorQuery = useVoucherOfferingsInfinite(isOwner ? undefined : voucherAddress);
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
    <div
      id={presentation === "tabpanel" ? "voucher-panel-offerings" : undefined}
      role={presentation === "tabpanel" ? "tabpanel" : undefined}
      aria-labelledby={presentation === "tabpanel" ? "voucher-tab-offerings" : undefined}
    >
      {isOwner ? (
        <>
          <ResourceUsage resource="offers" count={false} voucher={voucherAddress} />
          <Button
            tap
            className="mb-3 w-full"
            onClick={() => setEditor({ kind: "create" })}
            disabled={!voucherAddress || usage.isError || !usage.data?.offers.canCreate}
          >
            <Trans>Add offering</Trans>
          </Button>
        </>
      ) : null}

      <OfferingsPanel
        query={query}
        fallbackSymbol={voucherSymbol}
        resolveVoucherRate={() => ({ value: voucherValue, unit: voucherUoa })}
        maxItems={maxItems}
        manualPageSize={manualPageSize}
        autoLoadMore={autoLoadMore}
        openVoucherPageAction={openVoucherPageAction}
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
          priceCurrency={voucherUoa ?? voucherSymbol}
          defaultImageUrl={isStorageConfigured ? (profileQuery.data?.avatarUrl ?? null) : null}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}
