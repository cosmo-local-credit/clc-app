import {
  formatOfferingDisplayPrice,
  formatOfferingDisplayTotal,
  sumDecimalAmounts,
  type OfferingDisplayPrice,
} from "../market/logic";

export const OFFERING_ORDER_MAX_ITEMS = 3;
export const OFFERING_ORDER_NOTE_MAX_LENGTH = 500;

export type OfferingOrderLine = {
  offeringId: string;
  name: string;
  quantity: string;
  unitLabel: string | null;
  unitPrice: OfferingDisplayPrice;
  lineTotal: OfferingDisplayPrice;
};

export type OfferingOrderLabels = {
  order: string;
  total: string;
  message: string;
};

export type OfferingOrderNoteResult =
  | { ok: true; note: string; total: OfferingDisplayPrice | null }
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
  if (!unitPrice || !lineTotal || unitPrice.unit !== lineTotal.unit) return null;
  return {
    offeringId: input.offeringId,
    name: input.name.trim(),
    quantity: input.quantity,
    unitLabel: input.unitLabel?.trim() || null,
    unitPrice,
    lineTotal,
  };
}

export function offeringOrderTotal(
  lines: readonly OfferingOrderLine[],
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
        line.unitPrice.unit !== line.lineTotal.unit,
    )
  ) {
    return { ok: false, reason: "invalid-line" };
  }

  const total = offeringOrderTotal(input.lines);
  if (input.lines.length > 0 && !total) return { ok: false, reason: "mixed-units" };

  const orderLines = input.lines.map((line) => {
    const perUnit = line.unitLabel ? ` / ${line.unitLabel}` : "";
    return `- ${line.quantity} × ${line.name} @ ${line.unitPrice.value} ${line.unitPrice.unit}${perUnit} = ${line.lineTotal.value} ${line.lineTotal.unit}`;
  });
  const sections: string[] = [];
  if (orderLines.length > 0 && total) {
    sections.push(
      [
        input.labels.order,
        ...orderLines,
        `${input.labels.total}: ${total.value} ${total.unit}`,
      ].join("\n"),
    );
  }
  const message = input.message.trim();
  if (message) sections.push(`${input.labels.message}: ${message}`);
  const note = sections.join("\n\n");
  if (note.length > OFFERING_ORDER_NOTE_MAX_LENGTH) return { ok: false, reason: "too-long" };
  return { ok: true, note, total };
}
