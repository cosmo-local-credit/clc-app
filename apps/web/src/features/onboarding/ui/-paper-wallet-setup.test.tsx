import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockExport, mockExportSheet, FAKE_QR_DATA_URL, FAKE_ADDRESS } = vi.hoisted(() => ({
  mockExport: vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
  mockExportSheet: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
  FAKE_QR_DATA_URL: "data:image/png;base64,fakeqrcode",
  FAKE_ADDRESS: "0x37f944fe60D10350a2AAFBAf14FaA824811153a2" as `0x${string}`,
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue(FAKE_QR_DATA_URL),
  },
}));

vi.mock("./paper-wallet-export", () => ({
  exportPaperWallet: mockExport,
  exportPaperWalletSheet: mockExportSheet,
}));

// Prevent actual anchor download during tests
const mockAnchorClick = vi.fn();
HTMLAnchorElement.prototype.click = mockAnchorClick;

/** Installs the share sheet the platform would offer, or removes it again. */
function setShareSupport(share: ((data: ShareData) => Promise<void>) | null) {
  if (!share) {
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "canShare");
    return;
  }
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
}

function setInstalledApp(installed: boolean) {
  Object.defineProperty(navigator, "standalone", { value: installed, configurable: true });
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      matches: query.includes("standalone"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
    configurable: true,
  });
}

function renderDownload() {
  return render(
    <HookRenderer
      address={FAKE_ADDRESS}
      qrUrl="https://cosmolocal.credit/?w=0xabc"
      defaultName="Alice"
      render={(s) => (
        <>
          {s.card}
          {s.downloadButton}
        </>
      )}
    />,
  );
}

import { type PaperWalletSetupSlots, usePaperWalletSetup } from "./paper-wallet-setup";

/**
 * Helper: renders a component that calls the hook and passes the slots to a
 * render function.
 */
function HookRenderer({
  address,
  qrUrl,
  defaultName,
  onDownloaded,
  render: renderSlots,
}: {
  address: `0x${string}`;
  qrUrl: string;
  defaultName: string;
  onDownloaded?: () => void;
  render: (slots: PaperWalletSetupSlots) => ReactNode;
}) {
  const slots = usePaperWalletSetup({ address, qrUrl, defaultName, onDownloaded });
  return <>{renderSlots(slots)}</>;
}

describe("usePaperWalletSetup", () => {
  const createObjectURL = vi.fn().mockReturnValue("blob:paper-wallet");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    mockExport.mockReset();
    mockExport.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    mockAnchorClick.mockClear();
    createObjectURL.mockClear();
    setShareSupport(null);
    setInstalledApp(false);
  });

  it("returns card, controls, and downloadButton slots", () => {
    const capturedSlots: PaperWalletSetupSlots[] = [];
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Alice"
        render={(s) => {
          capturedSlots.push(s);
          return null;
        }}
      />,
    );
    expect(capturedSlots[0]?.card).toBeTruthy();
    expect(capturedSlots[0]?.controls).toBeTruthy();
    expect(capturedSlots[0]?.downloadButton).toBeTruthy();
  });

  it("renders preview wrapper with scaled dimensions", () => {
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Alice"
        render={(s) => s.card}
      />,
    );
    const wrapper = document.querySelector("[data-slot='preview-wrapper']");
    expect(wrapper).toBeTruthy();
  });

  it("renders the card address in preview", () => {
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Alice"
        render={(s) => s.card}
      />,
    );
    expect(screen.getByText(FAKE_ADDRESS)).toBeTruthy();
  });

  it("uses defaultName as the card name", () => {
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Alice"
        render={(s) => s.card}
      />,
    );
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("renders the download button", () => {
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Alice"
        render={(s) => s.downloadButton}
      />,
    );
    expect(screen.getByRole("button", { name: /download/i })).toBeTruthy();
  });

  it("trims customized text and falls back when the wallet name is blank", () => {
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Sign-in card"
        render={(s) => (
          <>
            {s.card}
            {s.controls}
          </>
        )}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name on card"), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: " example.org " },
    });

    expect(screen.getByText("Sign-in card")).toBeTruthy();
    expect(screen.getByText("example.org")).toBeTruthy();
  });

  it("downloads a PNG through a blob URL on Android, even when sharing is available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport(share);
    renderDownload();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    expect(mockExport).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      "https://cosmolocal.credit/?w=0xabc",
    );
    expect(mockAnchorClick).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it("downloads the A4 sheet as a PDF without opening the print dialog", async () => {
    setShareSupport(null);
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const onDownloaded = vi.fn();
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Alice"
        onDownloaded={onDownloaded}
        render={(s) => (
          <>
            {s.card}
            {s.downloadButton}
          </>
        )}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /printable a4 sheet/i }));
    });

    expect(mockExportSheet).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      "https://cosmolocal.credit/?w=0xabc",
    );
    expect(mockAnchorClick).toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    expect(onDownloaded).toHaveBeenCalled();
  });

  it("shares the PNG only when Share card is tapped", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport(share);

    renderDownload();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /share card/i }));
    });

    expect(share).toHaveBeenCalledTimes(1);
    const [shared] = share.mock.calls[0] as [ShareData];
    const sharedFile = shared.files?.[0];
    expect(sharedFile?.name).toBe("clc-wallet-37f944fe.png");
    expect(sharedFile?.type).toBe("image/png");
    expect(mockAnchorClick).not.toHaveBeenCalled();
  });

  it("shows the card's progress on Share card, not on Download card", async () => {
    let finishExport: ((blob: Blob) => void) | undefined;
    mockExport.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          finishExport = resolve;
        }),
    );
    setShareSupport(vi.fn().mockResolvedValue(undefined));
    renderDownload();

    const shareButton = screen.getByRole("button", { name: /share card/i });
    const downloadButton = screen.getByRole("button", { name: /download card/i });
    fireEvent.click(shareButton);

    expect(shareButton.textContent).toContain("Preparing");
    expect(downloadButton.textContent).toContain("Download card");
    expect(downloadButton.textContent).not.toContain("Preparing");
    expect((downloadButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      finishExport?.(new Blob(["png"], { type: "image/png" }));
    });

    expect(shareButton.textContent).toContain("Share card");
    expect((downloadButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the rendered card for long-press saving in an installed iOS app", async () => {
    setInstalledApp(true);

    renderDownload();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    expect(screen.getByRole("img", { name: /sign-in card/i }).getAttribute("src")).toBe(
      "blob:paper-wallet",
    );
    expect(mockAnchorClick).not.toHaveBeenCalled();
  });

  it("does not offer an empty card when QR rendering fails", async () => {
    mockExport.mockRejectedValueOnce(new Error("QR failed"));
    const onDownloaded = vi.fn();
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Alice"
        onDownloaded={onDownloaded}
        render={(slots) => (
          <>
            {slots.card}
            {slots.downloadButton}
          </>
        )}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    expect(screen.getByText(/could not save the sign-in card/i)).toBeTruthy();
    expect(mockAnchorClick).not.toHaveBeenCalled();
    expect(onDownloaded).not.toHaveBeenCalled();
  });

  it("does not mark an outdated QR export as saved", async () => {
    let finishExport: ((blob: Blob) => void) | undefined;
    mockExport.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          finishExport = resolve;
        }),
    );
    const onDownloaded = vi.fn();
    const renderSlots = (slots: PaperWalletSetupSlots) => (
      <>
        {slots.card}
        {slots.downloadButton}
      </>
    );
    const view = render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=old"
        defaultName="Alice"
        onDownloaded={onDownloaded}
        render={renderSlots}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    view.rerender(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=new"
        defaultName="Alice"
        onDownloaded={onDownloaded}
        render={renderSlots}
      />,
    );
    await act(async () => {
      finishExport?.(new Blob(["png"], { type: "image/png" }));
    });

    expect(mockAnchorClick).not.toHaveBeenCalled();
    expect(onDownloaded).not.toHaveBeenCalled();
  });

  it("includes the customization fields in controls slot", () => {
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Alice"
        render={(s) => s.controls}
      />,
    );
    expect(screen.getByLabelText("Name on card")).toBeTruthy();
  });
});
