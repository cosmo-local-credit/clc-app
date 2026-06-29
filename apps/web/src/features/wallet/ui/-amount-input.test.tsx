import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { WalletAmountInput } from "./amount-input";

describe("WalletAmountInput", () => {
  it("associates the label and reports decimal input changes", () => {
    const onValueChange = vi.fn();

    render(
      <WalletAmountInput id="amount" label="Amount" value="25.00" onValueChange={onValueChange} />,
    );

    const input = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;
    expect(input.value).toBe("25.00");
    expect(input.getAttribute("inputmode")).toBe("decimal");

    fireEvent.change(input, { target: { value: "30.50" } });
    expect(onValueChange).toHaveBeenCalledWith("30.50");
  });

  it("renders leading, trailing, action, and footer slots", () => {
    render(
      <WalletAmountInput
        id="token-amount"
        label="Token amount"
        value="10"
        onValueChange={vi.fn()}
        leading={<span>KSh</span>}
        trailing="USDC"
        action={<button type="button">Max</button>}
        footer={<button type="button">Use max</button>}
      />,
    );

    expect(screen.getByText("KSh")).toBeTruthy();
    expect(screen.getByText("USDC")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^max$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /use max/i })).toBeTruthy();
  });

  it("links invalid state to error copy", () => {
    render(
      <WalletAmountInput
        id="invalid-amount"
        label="Invalid amount"
        value="999"
        onValueChange={vi.fn()}
        error="Amount exceeds balance"
      />,
    );

    const input = screen.getByRole("textbox", { name: /invalid amount/i });
    const error = screen.getByText(/exceeds balance/i);

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("keeps hidden labels accessible", () => {
    render(
      <WalletAmountInput
        id="hidden-label-amount"
        label="Hidden amount"
        value="5"
        onValueChange={vi.fn()}
        hideLabel
      />,
    );

    expect(screen.getByRole("textbox", { name: /hidden amount/i })).toBeTruthy();
  });

  it("disables the input and field surface together", () => {
    render(
      <WalletAmountInput
        id="disabled-amount"
        label="Disabled amount"
        value="5"
        onValueChange={vi.fn()}
        disabled
      />,
    );

    const input = screen.getByRole("textbox", { name: /disabled amount/i }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.closest("[aria-disabled='true']")).toBeTruthy();
  });
});
