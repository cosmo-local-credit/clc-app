import { Trans } from "@lingui/react/macro";

import { OfferingsPanel } from "#/components/offerings";
import { ResourceUsage } from "#/components/resource-usage";
import { Button } from "#/components/ui/button";
import { useVoucherOfferingsManager } from "#/features/vouchers/hooks/use-voucher-offerings-manager";

import { OfferingEditorSheet } from "./offering-editor-sheet";

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
  const {
    isOwner,
    query,
    editor,
    setEditor,
    deletingID,
    requestDelete,
    canCreate,
    defaultImageUrl,
  } = useVoucherOfferingsManager({ voucherAddress, ownerAddress, readOnly });

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
            disabled={!canCreate}
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
          defaultImageUrl={defaultImageUrl}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}
