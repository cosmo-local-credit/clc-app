import type { Offering } from "@clc/api/features/offerings/client";
import { formatOfferingPrice, formatOfferingQuantity } from "@clc/core/features/market/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";

/**
 * One thing being offered against this voucher.
 *
 * A thumbnail, not a record card. An offering's photograph is how an operator
 * recognises the commodity a seller named "bag", so the image is the tile and
 * everything else is a caption — which is also what lets a voucher with fifty
 * listings be scanned rather than scrolled. The previous card carried the seller,
 * the quantity and an availability badge as labelled rows and fitted three per
 * row; those moved to the tooltip, and the badge went entirely because this tab
 * reads the public list, where every row is available by definition.
 *
 * The whole tile is the edit control. A footer button would cost a row of height
 * on every tile to duplicate what clicking the thing already means.
 */
export function VoucherOfferingCard({
  offering,
  onEdit,
}: {
  offering: Offering;
  onEdit: () => void;
}) {
  const quantity = formatOfferingQuantity(offering.quantity, offering.unitLabel);
  const price = formatOfferingPrice(offering.pricePerUnit);
  const priceLine = price
    ? [price.value, offering.voucherSymbol, offering.unitLabel ? `/ ${offering.unitLabel}` : null]
        .filter(Boolean)
        .join(" ")
    : "Unpriced";

  // What no longer fits at this size, for a pointer. Not the only route to any of
  // it: the editor is one click away and the global offerings list is the audit
  // surface.
  const detail = [
    offering.commodityType ?? "unclassified",
    quantity ? `qty ${[quantity.value, quantity.unit].filter(Boolean).join(" ")}` : null,
    `seller ${formatVoucherAddress(offering.sellerAddress)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onEdit}
      title={`${offering.name} — ${detail}`}
      className="border-border bg-card hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 flex flex-col border text-left transition-colors focus-visible:ring-1 focus-visible:outline-none"
    >
      {/* The frame is kept when there is no photograph: a grid whose tiles are two
          different heights depending on whether a seller uploaded an image reads
          as a layout failure rather than as missing data.

          `object-cover` is safe because the object is already square — the
          offering purpose crops to 1:1 before upload, so what the seller framed
          is what this tile shows and there is nothing left to crop away. */}
      <div className="bg-muted aspect-square w-full overflow-hidden">
        {offering.imageUrl ? (
          <img src={offering.imageUrl} alt={offering.name} className="size-full object-cover" />
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 p-2">
        <span className="truncate text-xs leading-tight font-medium">{offering.name}</span>
        {/* font-data so a column of prices does not jitter as it updates, the same
            rule every other figure in the console follows. */}
        <span className="font-data text-muted-foreground truncate text-[0.6875rem] leading-tight">
          {priceLine}
        </span>
      </div>
    </button>
  );
}
