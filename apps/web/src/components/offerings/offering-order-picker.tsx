import type { Offering } from "@clc/api/features/offerings/client";
import {
  buildOfferingOrderLine,
  offeringOrderSummary,
  OFFERING_ORDER_MAX_ITEMS,
  type OfferingOrderLine,
} from "@clc/core/features/offerings/order";
import {
  formatOfferingDisplayPrice,
  formatOfferingDisplayValue,
} from "@clc/core/features/market/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiAddLine, RiSubtractLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";

export type OfferingOrderQuantities = Record<string, string>;

type OfferingOrderContext = {
  voucherSymbol: string;
  voucherValue: string | null;
  voucherUoa: string | null;
};

export function selectedOfferingOrderLines(
  offerings: readonly Offering[],
  quantities: OfferingOrderQuantities,
  context: OfferingOrderContext,
): OfferingOrderLine[] {
  return offerings.flatMap((offering) => {
    const quantity = quantities[offering.id];
    if (!quantity) return [];
    const line = buildOfferingOrderLine({
      offeringId: offering.id,
      name: offering.name,
      quantity,
      unitLabel: offering.unitLabel,
      pricePerUnit: offering.pricePerUnit,
      voucherValue: context.voucherValue,
      voucherUoa: context.voucherUoa,
      voucherSymbol: offering.voucherSymbol ?? context.voucherSymbol,
    });
    return line ? [line] : [];
  });
}

export function OfferingOrderPicker({
  offerings,
  quantities,
  onQuantitiesChange,
  voucherSymbol,
  voucherValue,
  voucherUoa,
}: {
  offerings: readonly Offering[];
  quantities: OfferingOrderQuantities;
  onQuantitiesChange: (quantities: OfferingOrderQuantities) => void;
} & OfferingOrderContext) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const context = { voucherSymbol, voucherValue, voucherUoa };
  const selectedLines = selectedOfferingOrderLines(offerings, quantities, context);
  const selectedCount = Object.keys(quantities).length;
  const summary = offeringOrderSummary(selectedLines);

  function select(offering: Offering, checked: boolean) {
    const next = { ...quantities };
    if (checked) next[offering.id] = "1";
    else delete next[offering.id];
    onQuantitiesChange(next);
  }

  function changeQuantity(offeringId: string, change: bigint) {
    const current = quantities[offeringId];
    if (!current || !/^\d+$/.test(current)) return;
    const nextValue = BigInt(current) + change;
    if (nextValue < 1n) return;
    onQuantitiesChange({ ...quantities, [offeringId]: nextValue.toString() });
  }

  return (
    <fieldset className="space-y-2 border-t border-border pt-3">
      <legend className="font-heading text-sm font-semibold">
        <Trans>Order (optional)</Trans>
      </legend>
      <p className="text-muted-foreground text-xs">
        <Trans>
          This order is shared as a private message. It does not change the voucher amount already
          sent.
        </Trans>
      </p>

      <div className="space-y-2">
        {offerings.map((offering) => {
          const checked = quantities[offering.id] !== undefined;
          const price = formatOfferingDisplayPrice(
            offering.pricePerUnit,
            voucherValue,
            voucherUoa,
            offering.voucherSymbol ?? voucherSymbol,
          );
          const line = selectedLines.find((candidate) => candidate.offeringId === offering.id);
          const disabled = !checked && selectedCount >= OFFERING_ORDER_MAX_ITEMS;
          const checkboxId = `send-order-${offering.id}`;

          return (
            <div key={offering.id} className="border border-border bg-card p-3">
              <label
                htmlFor={checkboxId}
                className="flex min-h-11 cursor-pointer items-start justify-between gap-3"
              >
                <span className="min-w-0 pt-1">
                  <span dir="auto" className="block font-semibold text-sm [overflow-wrap:anywhere]">
                    {offering.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-primary text-xs">
                    {price ? (
                      `${formatOfferingDisplayValue(price.value, locale) ?? price.value} ${price.unit}${offering.unitLabel ? ` / ${offering.unitLabel}` : ""}`
                    ) : (
                      <Trans>Price on request</Trans>
                    )}
                  </span>
                </span>
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  disabled={disabled}
                  aria-label={t`Add ${offering.name} to order`}
                  onCheckedChange={(next) => select(offering, next)}
                />
              </label>

              {checked && line ? (
                <div className="mt-2 flex min-h-11 items-center justify-between gap-2 border-t border-border pt-2">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11 bg-card"
                      disabled={line.quantity === "1"}
                      aria-label={t`Decrease ${offering.name} quantity`}
                      onClick={() => changeQuantity(offering.id, -1n)}
                    >
                      <RiSubtractLine aria-hidden="true" />
                    </Button>
                    <output
                      className="min-w-10 text-center font-mono text-sm tabular-nums"
                      aria-label={t`${offering.name} quantity`}
                    >
                      {new Intl.NumberFormat(locale).format(BigInt(line.quantity))}
                    </output>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11 bg-card"
                      aria-label={t`Increase ${offering.name} quantity`}
                      onClick={() => changeQuantity(offering.id, 1n)}
                    >
                      <RiAddLine aria-hidden="true" />
                    </Button>
                  </div>
                  <span className="text-end font-mono text-primary text-xs">
                    {line.pricing === "fixed" ? (
                      <>
                        {formatOfferingDisplayValue(line.lineTotal.value, locale) ??
                          line.lineTotal.value}{" "}
                        {line.lineTotal.unit}
                      </>
                    ) : (
                      <Trans>Price on request</Trans>
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {summary?.kind === "price-on-request" && summary.pricedSubtotal ? (
        <OrderSummaryRow
          label={<Trans>Priced subtotal</Trans>}
          value={`${formatOfferingDisplayValue(summary.pricedSubtotal.value, locale) ?? summary.pricedSubtotal.value} ${summary.pricedSubtotal.unit}`}
        />
      ) : null}
      {summary ? (
        <OrderSummaryRow
          label={<Trans>Order total</Trans>}
          value={
            summary.kind === "exact"
              ? `${formatOfferingDisplayValue(summary.total.value, locale) ?? summary.total.value} ${summary.total.unit}`
              : t`Price on request`
          }
        />
      ) : null}
    </fieldset>
  );
}

function OrderSummaryRow({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border border-border bg-card px-3 py-2">
      <span className="font-semibold text-sm">{label}</span>
      <span className="text-end font-mono font-semibold text-primary text-sm">{value}</span>
    </div>
  );
}
