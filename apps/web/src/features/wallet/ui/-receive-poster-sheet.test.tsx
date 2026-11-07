import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { renderReceivePoster, profile, toast } = vi.hoisted(() => ({
  renderReceivePoster: vi.fn(),
  profile: {
    data: null as null | { name: string; avatarUrl: string | null },
    fetchStatus: "idle" as "idle" | "fetching",
  },
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("./receive-poster", () => ({
  renderReceivePoster,
  RECEIVE_POSTER_WIDTH: 1080,
  RECEIVE_POSTER_HEIGHT: 1440,
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => profile,
}));
vi.mock("sonner", () => ({ toast }));

import { ReceivePosterSheet } from "./receive-poster-sheet";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;
const QR_VALUE = `ethereum:${ADDRESS}@100`;
const PNG = new Blob(["png"], { type: "image/png" });

const writeText = vi.fn().mockResolvedValue(undefined);
const anchorClick = vi.fn();
const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:poster");
const share = vi.fn<(data: ShareData) => Promise<void>>();
const canShare = vi.fn<(data: ShareData) => boolean>();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function renderSheet(props: { name?: string | null; username?: string | null } = {}) {
  return render(
    <ReceivePosterSheet
      open
      onClose={vi.fn()}
      address={ADDRESS}
      qrValue={QR_VALUE}
      name={props.name ?? "Alice Example"}
      username={props.username ?? "alice"}
    />,
    { wrapper },
  );
}

const payLink = () => `${window.location.origin}/wallet/send/amount?recipient=${ADDRESS}`;
const shareText = () => ["Pay me on CLC", "Alice Example", ADDRESS, payLink()].join("\n");

beforeEach(() => {
  profile.data = null;
  profile.fetchStatus = "idle";
  renderReceivePoster.mockResolvedValue(PNG);
  share.mockResolvedValue(undefined);
  canShare.mockReturnValue(true);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  HTMLAnchorElement.prototype.click = anchorClick;
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "standalone");
  vi.clearAllMocks();
});

describe("ReceivePosterSheet", () => {
  it("draws the receive QR with the member's photo and previews the PNG", async () => {
    profile.data = { name: "Profile Name", avatarUrl: "https://storage.example/a.png" };
    renderSheet();

    const preview = await screen.findByRole("img", { name: "Payment QR code" });
    expect(preview.getAttribute("src")).toBe("blob:poster");
    expect(renderReceivePoster).toHaveBeenCalledTimes(1);
    expect(renderReceivePoster.mock.calls[0]?.[0]).toMatchObject({
      qrValue: QR_VALUE,
      // The name payers resolve wins over the profile's.
      name: "Alice Example",
      avatarUrl: "https://storage.example/a.png",
      identity: { title: "Alice Example", detail: "alice · 0x1a3E18…73563d" },
      headline: "Scan to pay me",
      footer: "Open Send in CLC and scan",
      direction: "ltr",
    });
  });

  it("waits for the profile so the poster is drawn once, photo included", async () => {
    profile.fetchStatus = "fetching";
    const view = renderSheet();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(renderReceivePoster).not.toHaveBeenCalled();

    profile.fetchStatus = "idle";
    profile.data = { name: "Alice Example", avatarUrl: "https://storage.example/a.png" };
    view.rerender(
      <ReceivePosterSheet
        open
        onClose={vi.fn()}
        address={ADDRESS}
        qrValue={QR_VALUE}
        name="Alice Example"
        username="alice"
      />,
    );
    await screen.findByRole("img", { name: "Payment QR code" });
    expect(renderReceivePoster).toHaveBeenCalledTimes(1);
  });

  it("shares the poster with the address and a link that opens Send", async () => {
    renderSheet();
    await screen.findByRole("img", { name: "Payment QR code" });

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0]?.[0];
    expect(data?.text).toBe(shareText());
    expect(data?.url).toBeUndefined();
    expect(data?.files).toHaveLength(1);
    expect(data?.files?.[0]?.name).toBe("clc-receive-1a3E18f7.png");
    expect(data?.files?.[0]?.type).toBe("image/png");
  });

  it("shares the text alone where files cannot be shared", async () => {
    canShare.mockReturnValue(false);
    renderSheet();
    await screen.findByRole("img", { name: "Payment QR code" });

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ title: "My wallet address", text: shareText() }),
    );
  });

  it("turns Share into a copy after a failed share, but not after a dismissal", async () => {
    renderSheet();
    await screen.findByRole("img", { name: "Payment QR code" });

    share.mockRejectedValueOnce(Object.assign(new Error("dismissed"), { name: "AbortError" }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();

    share.mockRejectedValueOnce(new Error("NotAllowedError"));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const copy = await screen.findByRole("button", { name: "Copy link" });

    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledWith(shareText());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link copied"));
  });

  it("downloads the poster in a browser", async () => {
    renderSheet();
    await screen.findByRole("img", { name: "Payment QR code" });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
    const saved = createObjectURL.mock.calls.at(-1)?.[0];
    expect(saved).toBeInstanceOf(File);
    expect((saved as File).name).toBe("clc-receive-1a3E18f7.png");
  });

  it("saves through the share sheet in an installed iOS app, which ignores downloads", async () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    renderSheet();
    await screen.findByRole("img", { name: "Payment QR code" });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0]?.[0];
    expect(Object.keys(data ?? {})).toEqual(["files"]);
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it("points an installed iOS app without file sharing at the preview", async () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    canShare.mockReturnValue(false);
    renderSheet();
    await screen.findByRole("img", { name: "Payment QR code" });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith("Press and hold the image to save it."));
    expect(share).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it("still shares the address and link when the poster cannot be drawn", async () => {
    renderReceivePoster.mockRejectedValue(new Error("no canvas"));
    renderSheet();

    expect(await screen.findByText("Couldn't create the image.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ title: "My wallet address", text: shareText() }),
    );
  });
});
