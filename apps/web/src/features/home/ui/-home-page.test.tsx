import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/components/ui/clc-logo", () => ({
  CLCLogo: () => <svg data-testid="clc-logo" />,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xabc" as `0x${string}` }),
  useDisconnect: () => ({ disconnectAsync: vi.fn() }),
}));

vi.mock("#/features/auth/state/token", () => ({
  clearAuthToken: vi.fn(),
}));

vi.mock("./wallet-page", () => ({
  WalletPage: () => <div data-testid="wallet-page" />,
}));

vi.mock("./market-page", () => ({
  MarketPage: () => <div data-testid="market-page" />,
}));

vi.mock("./settings-page", () => ({
  SettingsPage: () => <div data-testid="settings-page" />,
}));

vi.mock("./undone-page", () => ({
  UndonePage: ({ tab }: { tab: string }) => <div data-testid={`undone-${tab}`} />,
}));

import { HomePage } from "./home-page";

describe("HomePage (uncontrolled)", () => {
  it("shows wallet page by default", () => {
    render(<HomePage />);
    expect(screen.getByTestId("wallet-page")).toBeTruthy();
    expect(screen.queryByTestId("market-page")).toBeNull();
    expect(screen.queryByTestId("settings-page")).toBeNull();
  });

  it("switches to activity tab", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(screen.getByTestId("undone-activity")).toBeTruthy();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
  });

  it("switches to market tab", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Market" }));
    expect(screen.getByTestId("market-page")).toBeTruthy();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
  });

  it("switches to pool tab", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Pool" }));
    expect(screen.getByTestId("undone-pool")).toBeTruthy();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
  });

  it("switches to settings tab", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("settings-page")).toBeTruthy();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
  });
});

describe("HomePage (controlled)", () => {
  it("renders the tab provided by the parent", () => {
    render(<HomePage activeTab="pool" />);
    expect(screen.getByTestId("undone-pool")).toBeTruthy();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
  });

  it("calls onTabChange with the selected tab", () => {
    const onTabChange = vi.fn();
    render(<HomePage activeTab="wallet" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onTabChange).toHaveBeenCalledWith("settings");
  });

  it("does not update internal tab state when controlled", () => {
    const onTabChange = vi.fn();
    render(<HomePage activeTab="wallet" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    // parent did not update activeTab, so wallet page is still shown
    expect(screen.getByTestId("wallet-page")).toBeTruthy();
    expect(screen.queryByTestId("undone-activity")).toBeNull();
  });
});
