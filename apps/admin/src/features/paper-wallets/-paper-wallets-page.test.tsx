import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createFakeNfc } from "#/lib/nfc/-fake-ndef-reader";
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
    toEncrypt: 0,
    fatalError: null,
    start: mocks.start,
    retryFailed: vi.fn(),
    reset: vi.fn(),
    qrUrlFor: (id: number) => `https://app.test/?w=0x${String(id).padStart(64, "1")}`,
    rowForUrl: () => null,
  }),
}));
vi.mock("./render-sheet", () => ({ renderPaperWalletSheet: mocks.renderSheet }));
vi.mock("./download", () => ({ downloadBlob: mocks.downloadBlob }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,") },
}));

import { PaperWalletsPage } from "./paper-wallets-page";

const registered = (count: number): BatchWallet[] =>
  Array.from({ length: count }, (_, id) => ({
    id,
    address: `0x${String(id + 1)
      .repeat(40)
      .slice(0, 40)}`,
    recipient: { name: `Holder ${id + 1}`, email: "", phone: "", country: "", currency: "" },
    status: "ready" as const,
  }));

describe("PaperWalletsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mocks.start.mockReset();
    mocks.renderSheet.mockReset();
    mocks.downloadBlob.mockReset();
    mocks.phase = "idle";
    mocks.wallets = [];
  });

  it("requires a confirmed batch password before generating", () => {
    render(<PaperWalletsPage search={{ source: "blank", carrier: "print" }} />);
    const generate = screen.getByRole("button", { name: "Generate 10 wallets" });
    expect(generate.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "sunflower" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "sunflower" } });
    fireEvent.click(generate);

    const entries = mocks.start.mock.calls[0]?.[0];
    expect(entries).toHaveLength(10);
    expect(entries[0]).toMatchObject({ passphrase: "sunflower" });
  });

  it.each(["+254712345678", "254712345678"])(
    "issues valid CSV rows with phone %s normalised and each with its own password",
    async (phone) => {
      render(<PaperWalletsPage search={{ source: "csv", carrier: "print" }} />);
      expect(screen.queryByText("QR protection")).toBeNull();

      const file = new File(
        [`name,phone,country,password\nAmina,${phone},KE,sunflower\nBad,0712,KE,\nBaraka,,,\n`],
        "people.csv",
        { type: "text/csv" },
      );
      fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });

      const generate = await screen.findByRole("button", { name: "Generate 2 wallets" });
      expect(screen.getByText(/with issues, skipped/)).toBeTruthy();
      fireEvent.click(generate);

      expect(mocks.start.mock.calls[0]?.[0]).toEqual([
        {
          recipient: expect.objectContaining({
            name: "Amina",
            phone: "+254712345678",
            country: "KE",
          }),
          passphrase: "sunflower",
        },
        { recipient: expect.objectContaining({ name: "Baraka" }), passphrase: null },
      ]);
    },
  );

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

    render(<PaperWalletsPage search={{ source: "blank", carrier: "print" }} />);
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

  it("asks before leaving while the batch is preparing", () => {
    mocks.phase = "preparing";
    mocks.wallets = [];
    render(<PaperWalletsPage search={{ source: "blank", carrier: "print" }} />);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets an idle page go without asking", () => {
    render(<PaperWalletsPage search={{ source: "blank", carrier: "print" }} />);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("offers NFC cards only where the browser can write them", () => {
    const view = render(<PaperWalletsPage search={{ source: "blank", carrier: "nfc" }} />);
    expect(screen.queryByText("Write NFC cards")).toBeNull();
    // Without Web NFC the shared link falls back to printing.
    expect(screen.getByRole("button", { name: "Generate 10 wallets" })).toBeTruthy();
    view.unmount();

    vi.stubGlobal("NDEFReader", createFakeNfc().Reader);
    render(<PaperWalletsPage search={{ source: "blank", carrier: "print" }} />);
    fireEvent.click(screen.getByText("Write NFC cards"));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/paper-wallets",
      search: { source: "blank", carrier: "nfc" },
    });
  });

  it("prepares an NFC batch with conservative encryption on the phone", () => {
    vi.stubGlobal("NDEFReader", createFakeNfc().Reader);
    render(<PaperWalletsPage search={{ source: "blank", carrier: "nfc" }} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "sunflower" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "sunflower" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare 10 wallets" }));
    expect(mocks.start.mock.calls[0]?.[1]).toEqual({ encryptWorkers: 2 });
  });

  it("shows the writer and holds the page while registered wallets have no card", () => {
    vi.stubGlobal("NDEFReader", createFakeNfc().Reader);
    mocks.phase = "done";
    mocks.wallets = registered(2);
    render(<PaperWalletsPage search={{ source: "blank", carrier: "nfc" }} />);

    expect(screen.getByRole("region", { name: "NFC card writer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start writing" })).toBeTruthy();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
