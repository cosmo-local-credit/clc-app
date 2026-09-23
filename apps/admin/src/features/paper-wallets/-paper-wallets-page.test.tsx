import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ start: vi.fn(), navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, search: _search, ...props }: Record<string, unknown>) => (
    <a {...(props as object)}>{children as React.ReactNode}</a>
  ),
}));
vi.mock("./use-paper-wallet-batch", () => ({
  usePaperWalletBatch: () => ({
    wallets: [],
    phase: "idle",
    encrypted: 0,
    fatalError: null,
    start: mocks.start,
    retryFailed: vi.fn(),
    reset: vi.fn(),
    qrUrlFor: () => null,
  }),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,") },
}));

import { PaperWalletsPage } from "./paper-wallets-page";

describe("PaperWalletsPage", () => {
  beforeEach(() => mocks.start.mockReset());

  it("requires a confirmed batch password before generating", () => {
    render(<PaperWalletsPage search={{ source: "blank" }} />);
    const generate = screen.getByRole("button", { name: "Generate 10 wallets" });
    expect(generate.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "sunflower" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "sunflower" } });
    fireEvent.click(generate);

    expect(mocks.start).toHaveBeenCalledWith(expect.any(Array), {
      kind: "password",
      passphrase: "sunflower",
    });
    expect(mocks.start.mock.calls[0]?.[0]).toHaveLength(10);
  });

  it("issues only the valid rows of an uploaded CSV", async () => {
    render(<PaperWalletsPage search={{ source: "csv" }} />);
    fireEvent.click(screen.getByRole("button", { name: "No password" }));

    const file = new File(
      ["name,phone,country\nAmina,+254712345678,KE\nBad,0712,KE\nBaraka,,\n"],
      "people.csv",
      { type: "text/csv" },
    );
    fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });

    const generate = await screen.findByRole("button", { name: "Generate 2 wallets" });
    expect(screen.getByText(/with issues, skipped/)).toBeTruthy();
    fireEvent.click(generate);

    expect(mocks.start).toHaveBeenCalledWith(
      [
        expect.objectContaining({ name: "Amina", phone: "+254712345678", country: "KE" }),
        expect.objectContaining({ name: "Baraka" }),
      ],
      { kind: "none" },
    );
  });
});
