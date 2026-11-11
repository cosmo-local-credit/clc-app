import { activateLocale } from "@clc/i18n/index";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { HoldingBalance } from "./holding-balance";

afterEach(async () => activateLocale("en"));

describe("HoldingBalance", () => {
  it("leads with the value in the voucher's unit and keeps the amount beneath", () => {
    render(
      <HoldingBalance
        token={{ amount: "15.3", symbol: "X", unitValue: { value: "153.000000", unit: "KES" } }}
      />,
    );
    expect(screen.getByText("153 KES")).toBeTruthy();
    expect(screen.getByText("15.3 X")).toBeTruthy();
  });

  it("keeps each voucher in its own unit", () => {
    render(
      <HoldingBalance
        token={{ amount: "0.50", symbol: "Y", unitValue: { value: "2.5", unit: "Hours" } }}
      />,
    );
    expect(screen.getByText("2.5 Hours")).toBeTruthy();
  });

  it("shows the token amount alone when the voucher states no rate", () => {
    const { container } = render(
      <HoldingBalance token={{ amount: "4", symbol: "Z", unitValue: null }} />,
    );
    expect(screen.getByText("4")).toBeTruthy();
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("writes the value in the locale's digits", async () => {
    await act(async () => activateLocale("ar"));
    render(
      <HoldingBalance
        token={{ amount: "15.3", symbol: "X", unitValue: { value: "153", unit: "KES" } }}
      />,
    );
    expect(screen.getByText("١٥٣ KES")).toBeTruthy();
  });
});
