import {
  formatOfferingDisplayPrice,
  formatOfferingDisplayTotal,
  sumDecimalAmounts,
  type OfferingDisplayPrice,
} from "../market/logic";

export const OFFERING_ORDER_MAX_ITEMS = 3;
export const OFFERING_ORDER_NOTE_MAX_LENGTH = 500;

type OfferingOrderLineBase = {
  offeringId: string;
  name: string;
  quantity: string;
  unitLabel: string | null;
};

type FixedPriceOfferingOrderLine = OfferingOrderLineBase & {
  pricing: "fixed";
  unitPrice: OfferingDisplayPrice;
  lineTotal: OfferingDisplayPrice;
};

type PriceOnRequestOfferingOrderLine = OfferingOrderLineBase & {
  pricing: "on-request";
  unitPrice: null;
  lineTotal: null;
};

export type OfferingOrderLine = FixedPriceOfferingOrderLine | PriceOnRequestOfferingOrderLine;

export type OfferingOrderSummary =
  | { kind: "exact"; total: OfferingDisplayPrice }
  | { kind: "price-on-request"; pricedSubtotal: OfferingDisplayPrice | null };

export type OfferingOrderLabels = {
  order: string;
  total: string;
  message: string;
  priceOnRequest: string;
  pricedSubtotal: string;
};

export type OfferingOrderNoteResult =
  | { ok: true; note: string; summary: OfferingOrderSummary | null }
  | { ok: false; reason: "invalid-line" | "mixed-units" | "too-many-items" | "too-long" };

export function buildOfferingOrderLine(input: {
  offeringId: string;
  name: string;
  quantity: string;
  unitLabel: string | null;
  pricePerUnit: string | null;
  voucherValue: string | null;
  voucherUoa: string | null;
  voucherSymbol: string;
}): OfferingOrderLine | null {
  if (!/^[1-9]\d*$/.test(input.quantity)) return null;
  const unitPrice = formatOfferingDisplayPrice(
    input.pricePerUnit,
    input.voucherValue,
    input.voucherUoa,
    input.voucherSymbol,
  );
  const lineTotal = formatOfferingDisplayTotal(
    input.pricePerUnit,
    input.voucherValue,
    input.voucherUoa,
    input.voucherSymbol,
    input.quantity,
  );
  const base = {
    offeringId: input.offeringId,
    name: input.name.trim(),
    quantity: input.quantity,
    unitLabel: input.unitLabel?.trim() || null,
  };
  if (!unitPrice || !lineTotal) {
    return {
      ...base,
      pricing: "on-request",
      unitPrice: null,
      lineTotal: null,
    };
  }
  if (unitPrice.unit !== lineTotal.unit) return null;
  return {
    ...base,
    pricing: "fixed",
    unitPrice,
    lineTotal,
  };
}

export function offeringOrderTotal(
  lines: readonly OfferingOrderLine[],
): OfferingDisplayPrice | null {
  if (lines.length === 0) return null;
  const fixedLines = lines.filter(
    (line): line is FixedPriceOfferingOrderLine => line.pricing === "fixed",
  );
  if (fixedLines.length !== lines.length) return null;
  return sumFixedPriceLines(fixedLines);
}

export function offeringOrderSummary(
  lines: readonly OfferingOrderLine[],
): OfferingOrderSummary | null {
  if (lines.length === 0) return null;
  const fixedLines = lines.filter(
    (line): line is FixedPriceOfferingOrderLine => line.pricing === "fixed",
  );
  const fixedTotal = sumFixedPriceLines(fixedLines);
  if (fixedLines.length > 0 && !fixedTotal) return null;
  if (fixedLines.length === lines.length) {
    return fixedTotal ? { kind: "exact", total: fixedTotal } : null;
  }
  return { kind: "price-on-request", pricedSubtotal: fixedTotal };
}

function sumFixedPriceLines(
  lines: readonly FixedPriceOfferingOrderLine[],
): OfferingDisplayPrice | null {
  if (lines.length === 0) return null;
  const unit = lines[0]?.lineTotal.unit;
  if (!unit || lines.some((line) => line.lineTotal.unit !== unit)) return null;
  const value = sumDecimalAmounts(lines.map((line) => line.lineTotal.value));
  return value === null ? null : { value, unit };
}

export function buildOfferingOrderNote(input: {
  message: string;
  lines: readonly OfferingOrderLine[];
  labels: OfferingOrderLabels;
}): OfferingOrderNoteResult {
  if (input.lines.length > OFFERING_ORDER_MAX_ITEMS) {
    return { ok: false, reason: "too-many-items" };
  }
  if (
    input.lines.some(
      (line) =>
        !line.name ||
        !/^[1-9]\d*$/.test(line.quantity) ||
        (line.pricing === "fixed" && line.unitPrice.unit !== line.lineTotal.unit) ||
        (line.pricing === "on-request" && (line.unitPrice !== null || line.lineTotal !== null)),
    )
  ) {
    return { ok: false, reason: "invalid-line" };
  }

  const summary = offeringOrderSummary(input.lines);
  if (input.lines.length > 0 && !summary) return { ok: false, reason: "mixed-units" };

  const orderLines = input.lines.map((line) => {
    const perUnit = line.unitLabel ? ` / ${line.unitLabel}` : "";
    if (line.pricing === "on-request") {
      return `- ${line.quantity} × ${line.name} @ ${input.labels.priceOnRequest}${perUnit} = ${input.labels.priceOnRequest}`;
    }
    return `- ${line.quantity} × ${line.name} @ ${line.unitPrice.value} ${line.unitPrice.unit}${perUnit} = ${line.lineTotal.value} ${line.lineTotal.unit}`;
  });
  const sections: string[] = [];
  if (orderLines.length > 0 && summary) {
    const totals =
      summary.kind === "exact"
        ? [`${input.labels.total}: ${summary.total.value} ${summary.total.unit}`]
        : [
            ...(summary.pricedSubtotal
              ? [
                  `${input.labels.pricedSubtotal}: ${summary.pricedSubtotal.value} ${summary.pricedSubtotal.unit}`,
                ]
              : []),
            `${input.labels.total}: ${input.labels.priceOnRequest}`,
          ];
    sections.push([input.labels.order, ...orderLines, ...totals].join("\n"));
  }
  const message = input.message.trim();
  if (message) sections.push(`${input.labels.message}: ${message}`);
  const note = sections.join("\n\n");
  if (note.length > OFFERING_ORDER_NOTE_MAX_LENGTH) return { ok: false, reason: "too-long" };
  return { ok: true, note, summary };
}
