import { describe, expect, it } from "vite-plus/test";
import { buildOfferingOrderLine, buildOfferingOrderNote, offeringOrderTotal } from "./order";

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
    expect(first?.lineTotal).toEqual({ value: "41", unit: "KES" });
    expect(second?.lineTotal).toEqual({ value: "6.6", unit: "KES" });
    expect(offeringOrderTotal([first!, second!])).toEqual({ value: "47.6", unit: "KES" });
  });

  it("serializes the order and optional message deterministically", () => {
    const result = buildOfferingOrderNote({
      message: "Please hold this for Friday.",
      lines: [line()!],
      labels: { order: "Order", total: "Total", message: "Message" },
    });
    expect(result).toEqual({
      ok: true,
      total: { value: "41", unit: "KES" },
      note: "Order\n- 2 × Maize flour @ 20.5 KES / bag = 41 KES\nTotal: 41 KES\n\nMessage: Please hold this for Friday.",
    });
  });

  it("applies the 500-character limit to the final combined note", () => {
    const labels = { order: "Order", total: "Total", message: "Message" };
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
        labels: { order: "Order", total: "Total", message: "Message" },
      }),
    ).toEqual({ ok: false, reason: "too-many-items" });
    expect(
      buildOfferingOrderNote({
        message: "x".repeat(501),
        lines: [],
        labels: { order: "Order", total: "Total", message: "Message" },
      }),
    ).toEqual({ ok: false, reason: "too-long" });
    expect(
      buildOfferingOrderNote({
        message: "",
        lines: [
          valid,
          {
            ...valid,
            unitPrice: { value: "1", unit: "USD" },
            lineTotal: { value: "1", unit: "USD" },
          },
        ],
        labels: { order: "Order", total: "Total", message: "Message" },
      }),
    ).toEqual({ ok: false, reason: "mixed-units" });
  });
});
