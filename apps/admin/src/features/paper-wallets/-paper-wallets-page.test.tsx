import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { BatchWallet } from "./use-paper-wallet-batch";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  navigate: vi.fn(),
  renderSheet: vi.fn(),
  downloadBlob: vi.fn(),
  phase: "idle",
  wallets: [] as BatchWallet[],
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, search: _search, ...props }: Record<string, unknown>) => (
    <a {...(props as object)}>{children as React.ReactNode}</a>
  ),
}));
vi.mock("./use-paper-wallet-batch", () => ({
  usePaperWalletBatch: () => ({
    wallets: mocks.wallets,
    phase: mocks.phase,
    encrypted: 0,
    fatalError: null,
    start: mocks.start,
    retryFailed: vi.fn(),
    reset: vi.fn(),
    qrUrlFor: () => null,
  }),
}));
vi.mock("./render-sheet", () => ({ renderPaperWalletSheet: mocks.renderSheet }));
vi.mock("./download", () => ({ downloadBlob: mocks.downloadBlob }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,") },
}));

import { PaperWalletsPage } from "./paper-wallets-page";

describe("PaperWalletsPage", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    mocks.renderSheet.mockReset();
    mocks.downloadBlob.mockReset();
    mocks.phase = "idle";
    mocks.wallets = [];
  });

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

  it("shows PDF progress from click through worker assembly", async () => {
    mocks.phase = "done";
    mocks.wallets = [
      {
        id: 0,
        address: `0x${"a".repeat(40)}`,
        recipient: { name: "Amina", email: "", phone: "", country: "", currency: "" },
        status: "ready",
      },
    ];
    let finish!: (pdf: Blob) => void;
    const pending = new Promise<Blob>((resolve) => {
      finish = resolve;
    });
    mocks.renderSheet.mockReturnValue(pending);

    render(<PaperWalletsPage search={{ source: "blank" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Download A4 PDF (1)" }));

    expect(screen.getByText("Preparing card design…")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "PDF generation" })).toBeTruthy();
    expect(mocks.renderSheet).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.renderSheet).toHaveBeenCalledTimes(1));
    const options = mocks.renderSheet.mock.calls[0]?.[2];
    act(() => {
      options.onProgress(1);
    });
    expect(screen.getByText("Drawing cards… 1 / 1")).toBeTruthy();
    act(() => {
      options.onAssembling();
    });
    expect(screen.getByText("Assembling PDF…")).toBeTruthy();

    await act(async () => finish(new Blob(["%PDF-1.4"], { type: "application/pdf" })));
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("progressbar", { name: "PDF generation" })).toBeNull();
  });
});
