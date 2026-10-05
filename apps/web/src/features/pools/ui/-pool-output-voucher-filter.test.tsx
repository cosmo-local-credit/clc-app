import type { PoolVoucherFacet } from "@clc/api/features/pools/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { PoolOutputVoucherFilter } from "./pool-output-voucher-filter";

const FIRST = "0x1000000000000000000000000000000000000001" as const;
const SECOND = "0x2000000000000000000000000000000000000002" as const;
const UNKNOWN = "0x3000000000000000000000000000000000000003" as const;
const FACETS: PoolVoucherFacet[] = [
  { chainId: 100, address: FIRST, name: "Market Credit", symbol: "MKT1", count: 2 },
  { chainId: 100, address: SECOND, name: "Market Credit", symbol: "MKT2", count: 1 },
];

function Harness({ initial = null }: { initial?: `0x${string}` | null }) {
  const [value, setValue] = useState<`0x${string}` | null>(initial);
  return (
    <>
      <PoolOutputVoucherFilter
        facets={FACETS}
        value={value}
        fallbackLabel={value === UNKNOWN ? "Unlisted Voucher" : undefined}
        loading={false}
        onValueChange={setValue}
      />
      <output data-testid="value">{value ?? "all"}</output>
    </>
  );
}

describe("PoolOutputVoucherFilter", () => {
  it("opens with All Vouchers first and searches by display name", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Output voucher" }) as HTMLInputElement;
    expect(input.value).toBe("All Vouchers");

    fireEvent.click(input);
    expect(screen.getAllByRole("option")[0]?.textContent).toBe("All Vouchers");
    fireEvent.change(input, { target: { value: "market" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.textContent)).toEqual([
      "Market CreditMKT1",
      "Market CreditMKT2",
    ]);
  });

  it("keys duplicate display names by address", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Output voucher" });
    fireEvent.click(input);

    const second = screen.getByRole("option", { name: /Market Credit MKT2/ });
    fireEvent.pointerDown(second, { pointerType: "touch" });
    fireEvent.click(second);

    expect(screen.getByTestId("value").textContent).toBe(SECOND);
  });

  it("clears the selected address through All Vouchers", () => {
    render(<Harness initial={FIRST} />);
    const input = screen.getByRole("combobox", { name: "Output voucher" });
    fireEvent.click(input);
    const all = screen.getByRole("option", { name: "All Vouchers" });
    fireEvent.pointerDown(all, { pointerType: "touch" });
    fireEvent.click(all);

    expect(screen.getByTestId("value").textContent).toBe("all");
  });

  it("shows a detail-backed label for a valid deep link outside the vocabulary", () => {
    render(<Harness initial={UNKNOWN} />);
    expect(
      (screen.getByRole("combobox", { name: "Output voucher" }) as HTMLInputElement).value,
    ).toBe("Unlisted Voucher");
  });

  it("disables searching while the vocabulary loads", () => {
    render(<PoolOutputVoucherFilter facets={[]} value={null} loading onValueChange={() => {}} />);
    expect(
      (screen.getByRole("combobox", { name: "Output voucher" }) as HTMLInputElement).disabled,
    ).toBe(true);
  });
});
