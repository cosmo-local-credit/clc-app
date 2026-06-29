import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, to }: { children?: ReactNode; className?: string; to: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => routerMocks.navigate,
}));

import { SendAmountPage } from "./send-amount-page";
import { SwapPage } from "./swap-page";
import { TopUpPage } from "./top-up-page";

describe("wallet amount screens", () => {
  it("lets send amount use the selected token max", () => {
    render(<SendAmountPage />);

    const amount = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;
    expect(amount.value).toBe("25.00");

    fireEvent.click(screen.getByRole("button", { name: /use max/i }));
    expect(amount.value).toBe("245.00");
  });

  it("renders swap amount fields and applies max to the pay amount", () => {
    render(<SwapPage />);

    const payAmount = screen.getByRole("textbox", { name: /you pay/i }) as HTMLInputElement;
    const receiveAmount = screen.getByRole("textbox", {
      name: /you receive/i,
    }) as HTMLInputElement;

    expect(payAmount.value).toBe("25.00");
    expect(receiveAmount.value).toBe("24.85");

    fireEvent.click(screen.getByRole("button", { name: /max 245\.00/i }));
    expect(payAmount.value).toBe("245.00");
  });

  it("renders the MPESA top-up amount input with currency context", () => {
    render(<TopUpPage />);

    fireEvent.click(screen.getByRole("button", { name: /mpesa/i }));

    const amount = screen.getByRole("textbox", { name: /amount \(ksh\)/i }) as HTMLInputElement;
    expect(amount.value).toBe("500");
    expect(screen.getByText("KSh")).toBeTruthy();
  });
});
