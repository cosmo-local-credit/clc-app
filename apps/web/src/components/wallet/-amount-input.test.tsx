import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { WalletAmountInput } from "./amount-input";

describe("WalletAmountInput", () => {
  it("provides the wallet amount defaults and an accessible name", () => {
    function ControlledAmountInput() {
      const [value, setValue] = useState("");
      return <WalletAmountInput label="Amount to receive" value={value} onValueChange={setValue} />;
    }

    render(<ControlledAmountInput />);

    const input = screen.getByRole("textbox", { name: "Amount to receive" }) as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("decimal");
    expect(input.dir).toBe("ltr");
    expect(input.placeholder).toBe("0.00");
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "12.50" } });
    expect(input.value).toBe("12.50");
  });

  it("forwards focus, invalid, described-by, and disabled states", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <WalletAmountInput
        label="Amount to send"
        value=""
        onValueChange={onValueChange}
        autoFocus
        aria-invalid
        aria-describedby="amount-error"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Amount to send" }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("amount-error");
    expect(input.className).toContain("rounded-none");
    expect(input.className).toContain("border-input");
    expect(input.className).toContain("bg-card");
    expect(input.className).toContain("text-[1.375rem]");
    expect(input.className).toContain("font-heading");
    expect(input.className).toContain("tracking-tight");
    expect(input.className).toContain("focus-visible:border-foreground");
    expect(input.className).toContain("aria-invalid:border-destructive");

    rerender(
      <WalletAmountInput label="Amount to send" value="" onValueChange={onValueChange} disabled />,
    );

    expect(input.disabled).toBe(true);
    expect(input.className).toContain("disabled:opacity-50");
  });

  it("outlines a highlighted amount in the brand colour without changing its size", () => {
    const noop = vi.fn();
    render(
      <>
        <WalletAmountInput label="Highlighted" value="" onValueChange={noop} highlighted />
        <WalletAmountInput label="Plain" value="" onValueChange={noop} />
      </>,
    );

    const highlighted = screen.getByRole("textbox", { name: "Highlighted" });
    const plain = screen.getByRole("textbox", { name: "Plain" });

    // The outline holds while focused, rather than falling back to the neutral
    // focus border the moment someone starts typing.
    expect(highlighted.className).toContain("border-primary");
    expect(highlighted.className).toContain("focus-visible:border-primary");
    expect(highlighted.className).not.toContain("border-input");
    expect(plain.className).toContain("border-input");
    expect(plain.className).not.toContain("border-primary");
    // An invalid amount still reads as invalid.
    expect(highlighted.className).toContain("aria-invalid:border-destructive");
    for (const input of [highlighted, plain]) {
      expect(input.className).toContain("h-9");
      expect(input.className).toContain("text-[1.375rem]");
      expect(input.className).toContain("bg-card");
      expect(input.className).toContain("rounded-none");
    }
  });
});
