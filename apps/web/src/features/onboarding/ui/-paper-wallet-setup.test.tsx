import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

const { mockToPng, FAKE_QR_DATA_URL, FAKE_ADDRESS } = vi.hoisted(() => ({
  mockToPng: vi.fn().mockResolvedValue("data:image/png;base64,exported"),
  FAKE_QR_DATA_URL: "data:image/png;base64,fakeqrcode",
  FAKE_ADDRESS: "0x37f944fe60D10350a2AAFBAf14FaA824811153a2" as `0x${string}`,
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue(FAKE_QR_DATA_URL),
  },
}));

vi.mock("html-to-image", () => ({
  toPng: mockToPng,
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
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      matches: installed && query.includes("standalone"),
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
  render: renderSlots,
}: {
  address: `0x${string}`;
  qrUrl: string;
  defaultName: string;
  render: (slots: PaperWalletSetupSlots) => ReactNode;
}) {
  const slots = usePaperWalletSetup({ address, qrUrl, defaultName });
  return <>{renderSlots(slots)}</>;
}

describe("usePaperWalletSetup", () => {
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
        defaultName="Paper wallet"
        render={(s) => (
          <>
            {s.card}
            {s.controls}
          </>
        )}
      />,
    );

    fireEvent.click(screen.getByText("Customize"));
    fireEvent.change(screen.getByLabelText("Name on wallet"), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: " example.org " },
    });

    expect(screen.getByText("Paper wallet")).toBeTruthy();
    expect(screen.getByText("example.org")).toBeTruthy();
  });

  it("downloads with correct options and filename", async () => {
    mockToPng.mockClear();
    mockAnchorClick.mockClear();
    setShareSupport(null);
    setInstalledApp(false);

    renderDownload();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    expect(mockToPng).toHaveBeenCalled();
    const callArgs = mockToPng.mock.calls[0] as unknown[];
    expect(callArgs[0]).toBeTruthy();
    expect(callArgs[1]).toMatchObject({
      pixelRatio: 2,
      width: 600,
      height: 378,
      backgroundColor: "#ffffff",
    });
    expect(mockAnchorClick).toHaveBeenCalled();
  });

  it("hands the card to the share sheet where the platform has one", async () => {
    mockAnchorClick.mockClear();
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport(share);
    setInstalledApp(true);

    renderDownload();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    // The anchor's `download` attribute is ignored inside an installed iOS PWA,
    // so the share sheet is the only path that actually saves the image.
    expect(share).toHaveBeenCalledTimes(1);
    const [shared] = share.mock.calls[0] as [ShareData];
    const sharedFile = shared.files?.[0];
    expect(sharedFile?.name).toBe("clc-wallet-37f944fe.png");
    expect(sharedFile?.type).toBe("image/png");
    expect(mockAnchorClick).not.toHaveBeenCalled();

    setShareSupport(null);
    setInstalledApp(false);
  });

  it("shows the rendered card to long-press when an installed app can neither share nor download", async () => {
    mockAnchorClick.mockClear();
    setShareSupport(null);
    setInstalledApp(true);

    renderDownload();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    expect(screen.getByRole("img", { name: /paper wallet card/i }).getAttribute("src")).toBe(
      "data:image/png;base64,exported",
    );
    expect(mockAnchorClick).not.toHaveBeenCalled();

    setInstalledApp(false);
  });

  it("includes the Customize disclosure in controls slot", () => {
    render(
      <HookRenderer
        address={FAKE_ADDRESS}
        qrUrl="https://cosmolocal.credit/?w=0xabc"
        defaultName="Alice"
        render={(s) => s.controls}
      />,
    );
    expect(screen.getByText("Customize")).toBeTruthy();
  });
});
