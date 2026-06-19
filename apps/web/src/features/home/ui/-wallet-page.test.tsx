import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { WalletPage } from "./wallet-page";

describe("WalletPage", () => {
  it("shows the wallet balance", () => {
    render(<WalletPage />);
    expect(screen.getByText(/KSh 12,840/)).toBeTruthy();
    expect(screen.getByText(/total balance/i)).toBeTruthy();
  });

  it("shows Send, Receive, Swap, and Top up action buttons", () => {
    render(<WalletPage />);
    expect(screen.getByRole("button", { name: /send/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /receive/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /swap/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /top up/i })).toBeTruthy();
  });

  it("shows the voucher section with placeholder token balances", () => {
    render(<WalletPage />);
    expect(screen.getByText(/your vouchers/i)).toBeTruthy();
    expect(screen.getByText(/USDC/)).toBeTruthy();
    expect(screen.getByText(/BABAS/)).toBeTruthy();
  });

  it("shows the pool section with placeholder pools", () => {
    render(<WalletPage />);
    expect(screen.getByText(/your pools/i)).toBeTruthy();
    expect(screen.getAllByText(/Local Solar Coop/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Fresh Food Circle/)).toBeTruthy();
  });
});
