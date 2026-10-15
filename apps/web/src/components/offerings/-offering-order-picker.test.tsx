import type { Offering } from "@clc/api/features/offerings/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { OfferingOrderPicker, type OfferingOrderQuantities } from "./offering-order-picker";

const VOUCHER = "0x1111111111111111111111111111111111111111" as const;

function offering(id: string, name: string, pricePerUnit: string | null): Offering {
  return {
    id,
    sourceId: null,
    voucherId: "voucher-1",
    voucherAddress: VOUCHER,
    voucherName: "Market voucher",
    voucherSymbol: "MKT",
    voucherUoa: "KES",
    priceInUnitOfAccount: pricePerUnit,
    voucherDecimals: 6,
    sellerAddress: VOUCHER,
    name,
    commodityType: "GOOD",
    description: "",
    quantity: "1",
    unit: "item",
    unitLabel: "item",
    frequency: null,
    pricePerUnit,
    available: true,
    locationName: null,
    geoLat: null,
    geoLng: null,
    imageUrl: null,
    tags: [],
  };
}

function Picker({ offerings }: { offerings: Offering[] }) {
  const [quantities, setQuantities] = useState<OfferingOrderQuantities>({});
  return (
    <OfferingOrderPicker
      offerings={offerings}
      quantities={quantities}
      onQuantitiesChange={setQuantities}
      voucherSymbol="MKT"
      voucherValue="1"
      voucherUoa="KES"
    />
  );
}

describe("OfferingOrderPicker", () => {
  it("limits an order to three distinct offerings and calculates exact totals", () => {
    render(
      <Picker
        offerings={[
          offering("one", "One", "10"),
          offering("two", "Two", "20"),
          offering("three", "Three", "30"),
          offering("four", "Four", "40"),
        ]}
      />,
    );

    for (const name of ["One", "Two", "Three"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`Add ${name} to order`) }));
    }

    expect(
      screen.getByRole("checkbox", { name: /Add Four to order/ }).getAttribute("aria-disabled"),
    ).toBe("true");
    expect(screen.getByText("60 KES")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Increase One quantity" }));
    expect(screen.getByText("70 KES")).toBeTruthy();
  });

  it("allows an offering without a fixed price and marks its total as price on request", () => {
    render(<Picker offerings={[offering("one", "Price by arrangement", null)]} />);
    const checkbox = screen.getByRole("checkbox", { name: /Add Price by arrangement to order/ });
    expect(checkbox.getAttribute("aria-disabled")).not.toBe("true");

    fireEvent.click(checkbox);
    expect(screen.getAllByText("Price on request").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("button", { name: "Increase Price by arrangement quantity" }),
    ).toBeTruthy();
  });

  it("shows a priced subtotal and a price-on-request final total for mixed orders", () => {
    render(
      <Picker
        offerings={[offering("one", "Fixed", "10"), offering("two", "By arrangement", null)]}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Add Fixed to order/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Add By arrangement to order/ }));

    expect(screen.getByText("Priced subtotal").parentElement?.textContent).toContain("10 KES");
    expect(screen.getByText("Order total").parentElement?.textContent).toContain(
      "Price on request",
    );
  });
});
