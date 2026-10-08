import { describe, expect, it } from "vite-plus/test";
import {
  buildOfferingOrderLine,
  buildOfferingOrderNote,
  offeringOrderSummary,
  offeringOrderTotal,
} from "./order";

const labels = {
  order: "Order",
  total: "Order total",
  message: "Message",
  priceOnRequest: "Price on request",
  pricedSubtotal: "Priced subtotal",
};

function line(overrides: Partial<Parameters<typeof buildOfferingOrderLine>[0]> = {}) {
  return buildOfferingOrderLine({
    offeringId: "1",
    name: "Maize flour",
    quantity: "2",
    unitLabel: "bag",
    pricePerUnit: "10.25",
    voucherValue: "2",
    voucherUoa: "KES",
    voucherSymbol: "MZ",
    ...overrides,
  });
}

describe("offering orders", () => {
  it("builds exact line and order totals", () => {
    const first = line();
    const second = line({ offeringId: "2", name: "Beans", quantity: "3", pricePerUnit: "1.1" });
    expect(first?.pricing).toBe("fixed");
    expect(first?.lineTotal).toEqual({ value: "41", unit: "KES" });
    expect(second?.lineTotal).toEqual({ value: "6.6", unit: "KES" });
    expect(offeringOrderTotal([first!, second!])).toEqual({ value: "47.6", unit: "KES" });
    expect(offeringOrderSummary([first!, second!])).toEqual({
      kind: "exact",
      total: { value: "47.6", unit: "KES" },
    });
  });

  it("serializes the order and optional message deterministically", () => {
    const result = buildOfferingOrderNote({
      message: "Please hold this for Friday.",
      lines: [line()!],
      labels,
    });
    expect(result).toEqual({
      ok: true,
      summary: { kind: "exact", total: { value: "41", unit: "KES" } },
      note: "Order\n- 2 × Maize flour @ 20.5 KES / bag = 41 KES\nOrder total: 41 KES\n\nMessage: Please hold this for Friday.",
    });
  });

  it("keeps unpriced offerings orderable and marks the final total as price on request", () => {
    const unpriced = line({
      offeringId: "2",
      name: "Consultation",
      quantity: "3",
      unitLabel: "hour",
      pricePerUnit: null,
    });

    expect(unpriced).toEqual({
      offeringId: "2",
      name: "Consultation",
      quantity: "3",
      unitLabel: "hour",
      pricing: "on-request",
      unitPrice: null,
      lineTotal: null,
    });
    expect(offeringOrderTotal([unpriced!])).toBeNull();
    expect(offeringOrderSummary([unpriced!])).toEqual({
      kind: "price-on-request",
      pricedSubtotal: null,
    });
    expect(buildOfferingOrderNote({ message: "", lines: [unpriced!], labels })).toEqual({
      ok: true,
      summary: { kind: "price-on-request", pricedSubtotal: null },
      note: "Order\n- 3 × Consultation @ Price on request / hour = Price on request\nOrder total: Price on request",
    });
  });

  it("includes an exact priced subtotal for mixed orders", () => {
    const fixed = line()!;
    const unpriced = line({
      offeringId: "2",
      name: "Delivery",
      quantity: "1",
      unitLabel: null,
      pricePerUnit: null,
    })!;

    expect(offeringOrderSummary([fixed, unpriced])).toEqual({
      kind: "price-on-request",
      pricedSubtotal: { value: "41", unit: "KES" },
    });
    expect(
      buildOfferingOrderNote({ message: "Call first", lines: [fixed, unpriced], labels }),
    ).toEqual({
      ok: true,
      summary: {
        kind: "price-on-request",
        pricedSubtotal: { value: "41", unit: "KES" },
      },
      note: "Order\n- 2 × Maize flour @ 20.5 KES / bag = 41 KES\n- 1 × Delivery @ Price on request = Price on request\nPriced subtotal: 41 KES\nOrder total: Price on request\n\nMessage: Call first",
    });
  });

  it("keeps exact totals beyond JavaScript's safe integer range", () => {
    const large = line({
      pricePerUnit: "9007199254740993.25",
      voucherValue: "1.2",
      quantity: "2",
    });

    expect(large?.unitPrice).toEqual({ value: "10808639105689191.9", unit: "KES" });
    expect(large?.lineTotal).toEqual({ value: "21617278211378383.8", unit: "KES" });
    expect(offeringOrderSummary([large!])).toEqual({
      kind: "exact",
      total: { value: "21617278211378383.8", unit: "KES" },
    });
  });

  it("applies the 500-character limit to the final combined note", () => {
    const orderOnly = buildOfferingOrderNote({ message: "", lines: [line()!], labels });
    expect(orderOnly.ok).toBe(true);
    if (!orderOnly.ok) throw new Error("expected an order note");
    const separatorLength = "\n\nMessage: ".length;
    const fittingMessage = "x".repeat(500 - orderOnly.note.length - separatorLength);

    const exact = buildOfferingOrderNote({ message: fittingMessage, lines: [line()!], labels });
    expect(exact.ok && exact.note).toHaveLength(500);
    expect(
      buildOfferingOrderNote({ message: `${fittingMessage}x`, lines: [line()!], labels }),
    ).toEqual({ ok: false, reason: "too-long" });
  });

  it("rejects invalid quantities, mixed units, too many items, and notes over 500 characters", () => {
    expect(line({ quantity: "0" })).toBeNull();
    const valid = line()!;
    expect(
      buildOfferingOrderNote({
        message: "",
        lines: [valid, valid, valid, valid],
        labels,
      }),
    ).toEqual({ ok: false, reason: "too-many-items" });
    expect(
      buildOfferingOrderNote({
        message: "x".repeat(501),
        lines: [],
        labels,
      }),
    ).toEqual({ ok: false, reason: "too-long" });
    expect(
      buildOfferingOrderNote({
        message: "",
        lines: [
          valid,
          {
            ...valid,
            pricing: "fixed" as const,
            unitPrice: { value: "1", unit: "USD" },
            lineTotal: { value: "1", unit: "USD" },
          },
        ],
        labels,
      }),
    ).toEqual({ ok: false, reason: "mixed-units" });
  });
});
