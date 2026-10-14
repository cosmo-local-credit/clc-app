import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
}));

const { toast, useConnectionMock } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  useConnectionMock: vi.fn(),
}));

vi.mock("wagmi", () => ({ useConnection: () => useConnectionMock() }));
vi.mock("sonner", () => ({ toast }));

import { CashPage } from "./cash-page";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  useConnectionMock.mockReturnValue({ address: ADDRESS });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => vi.clearAllMocks());

describe("CashPage", () => {
  it("shows and copies the exact Gnosis address without an alias or QR", async () => {
    const { container } = render(<CashPage />);
    expect(screen.getByText("Gnosis wallet address")).toBeTruthy();
    expect(screen.queryByText("Username")).toBeNull();
    expect(container.querySelector("canvas")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Address copied"));
  });

  it("shows an unavailable state instead of an invented address", () => {
    useConnectionMock.mockReturnValue({ address: undefined });
    render(<CashPage />);

    expect(screen.getByText("No wallet address available.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy address" })).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("reports a missing clipboard without attempting a copy", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<CashPage />);

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy address"));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("reports a rejected clipboard write", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<CashPage />);

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy address"));
  });

  it("uses the exact secure provider destinations and safety guidance", () => {
    render(<CashPage />);
    expect(
      screen.getAllByRole("link", { name: /Mt Pelerin/ }).map((link) => link.getAttribute("href")),
    ).toEqual(["https://www.mtpelerin.com/buy-xdai", "https://www.mtpelerin.com/sell-xdai"]);
    expect(screen.getByRole("link", { name: /Monerium/ }).getAttribute("href")).toBe(
      "https://monerium.app/",
    );
    expect(screen.getByRole("link", { name: /Binance/ }).getAttribute("href")).toBe(
      "https://www.binance.com/",
    );
    expect(screen.getByRole("link", { name: /Jumper/ }).getAttribute("href")).toBe(
      "https://jumper.exchange/",
    );
    for (const link of screen.getAllByRole("link").filter((item) => item.hasAttribute("target"))) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(screen.getByText("Test with a small amount first.")).toBeTruthy();
  });
});
