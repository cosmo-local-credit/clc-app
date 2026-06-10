import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { WalletPage } from "./wallet-page";

describe("WalletPage", () => {
  it("shows the wallet balance", () => {
    render(<WalletPage />);
    expect(screen.getByText(/KSh 12,840/)).toBeTruthy();
  });

  it("shows voucher and pool counts", () => {
    render(<WalletPage />);
    expect(screen.getByText(/3 vouchers/)).toBeTruthy();
    expect(screen.getByText(/2 pools/)).toBeTruthy();
  });

  it("shows Send, Receive, and Top up action buttons", () => {
    render(<WalletPage />);
    expect(screen.getByRole("button", { name: /send/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /receive/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /top up/i })).toBeTruthy();
  });

  it("shows recent activity section with placeholder transactions", () => {
    render(<WalletPage />);
    expect(screen.getByText(/recent activity/i)).toBeTruthy();
    expect(screen.getByText(/Sent to Cosmo Bakery/)).toBeTruthy();
  });

  it("shows My vouchers section with placeholder vouchers", () => {
    render(<WalletPage />);
    expect(screen.getByText(/my vouchers/i)).toBeTruthy();
    expect(screen.getByText(/Community Garden Access/)).toBeTruthy();
    expect(screen.getByText(/Bakery Credit/)).toBeTruthy();
  });

  it("shows My pools section with placeholder pools", () => {
    render(<WalletPage />);
    expect(screen.getByText(/my pools/i)).toBeTruthy();
    expect(screen.getByText(/Local Solar Coop/)).toBeTruthy();
    expect(screen.getByText(/Fresh Food Circle/)).toBeTruthy();
  });
});
