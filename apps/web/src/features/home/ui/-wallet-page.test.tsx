import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

import { WalletPage } from "./wallet-page";

describe("WalletPage", () => {
  it("shows the wallet header without the total balance card", () => {
    render(<WalletPage />);
    expect(screen.getByRole("heading", { name: /wallet/i })).toBeTruthy();
    expect(screen.queryByText(/total balance/i)).toBeNull();
  });

  it("shows Send, Receive, Swap, and Top up action buttons", () => {
    render(<WalletPage />);
    expect(screen.getByRole("button", { name: /send/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /receive/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /swap/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /top up/i })).toBeTruthy();
  });

  it("shows the voucher section with placeholder voucher balances", () => {
    render(<WalletPage />);
    expect(screen.getByText(/your vouchers/i)).toBeTruthy();
    expect(screen.getByText("BABAS")).toBeTruthy();
    expect(screen.getByText("GRDN")).toBeTruthy();
  });

  it("shows the pool section with placeholder pools", () => {
    render(<WalletPage />);
    expect(screen.getByText(/your pools/i)).toBeTruthy();
    expect(screen.getAllByText(/Local Solar Coop/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Fresh Food Circle/)).toBeTruthy();
  });
});
