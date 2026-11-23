import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ShareLinkButton } from "./share-link-button";

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));
const shareDescriptor = Object.getOwnPropertyDescriptor(navigator, "share");
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  vi.restoreAllMocks();
  toast.success.mockReset();
  toast.error.mockReset();
  for (const [property, descriptor] of [
    ["share", shareDescriptor],
    ["clipboard", clipboardDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(navigator, property, descriptor);
    else Reflect.deleteProperty(navigator, property);
  }
});

function nativeShare(share: typeof navigator.share | undefined) {
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
}

function clipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

describe("resource link sharing", () => {
  it("shares the canonical resource URL and title", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    nativeShare(share);
    render(<ShareLinkButton title="Community pool" path="/pools/0x123" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Community pool",
        url: `${window.location.origin}/pools/0x123`,
      }),
    );
  });

  it("copies the link when native sharing is unavailable", async () => {
    nativeShare(undefined);
    const copy = vi.fn().mockResolvedValue(undefined);
    clipboard(copy);
    render(<ShareLinkButton title="Harvest" path="/posts/42" variant="outline" size="icon" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link copied"));
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/posts/42`);
  });

  it("keeps cancellation silent", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    nativeShare(share);
    const copy = vi.fn();
    clipboard(copy);
    render(<ShareLinkButton title="Harvest" path="/posts/42" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(copy).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("offers an explicit copy action after a native failure", async () => {
    nativeShare(vi.fn().mockRejectedValue(new Error("Unavailable")));
    const copy = vi.fn().mockResolvedValue(undefined);
    clipboard(copy);
    render(<ShareLinkButton title="Harvest" path="/posts/42" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link copied"));
    expect(copy).toHaveBeenCalledOnce();
  });

  it("reports unavailable clipboard access", () => {
    nativeShare(undefined);
    clipboard(undefined);
    render(<ShareLinkButton title="Harvest" path="/posts/42" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy link");
  });

  it("reports a rejected clipboard write", async () => {
    nativeShare(undefined);
    clipboard(vi.fn().mockRejectedValue(new Error("Denied")));
    render(<ShareLinkButton title="Harvest" path="/posts/42" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy link"));
  });
});
