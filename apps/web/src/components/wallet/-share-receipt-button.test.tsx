import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ShareReceiptButton } from "./share-receipt-button";

const { success, error } = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success, error } }));

const props = {
  title: "Payment receipt",
  lines: ["I sent 2.13 USDC to Alice."],
  url: "https://gnosisscan.io/tx/0x123",
};
const receiptText = `${props.lines[0]}\n${props.url}`;
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function setNavigator(name: "share" | "clipboard", value: unknown) {
  Object.defineProperty(navigator, name, { configurable: true, value });
}

afterEach(() => {
  for (const [name, descriptor] of [
    ["share", originalShare],
    ["clipboard", originalClipboard],
  ] as const) {
    if (descriptor) Object.defineProperty(navigator, name, descriptor);
    else Reflect.deleteProperty(navigator, name);
  }
  vi.clearAllMocks();
});

describe("ShareReceiptButton", () => {
  it("copies the full receipt when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator("share", undefined);
    setNavigator("clipboard", { writeText });
    render(<ShareReceiptButton {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Receipt copied"));
    expect(writeText).toHaveBeenCalledWith(receiptText);
  });

  it("recovers with a new copy tap after sharing consumes user activation", async () => {
    // Model Web Share consuming activation and WebKit requiring it for writes.
    let active = true;
    const share = vi.fn(async () => {
      active = false;
      throw Object.assign(new Error("Share failed"), { name: "DataError" });
    });
    const writeText = vi.fn(async () => {
      if (!active) throw new DOMException("Needs a new tap", "NotAllowedError");
    });
    setNavigator("share", share);
    setNavigator("clipboard", { writeText });
    render(<ShareReceiptButton {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));

    const copyButton = await screen.findByRole("button", { name: "Copy receipt" });
    expect(writeText).not.toHaveBeenCalled();
    active = true;
    fireEvent.click(copyButton);

    await waitFor(() => expect(success).toHaveBeenCalledWith("Receipt copied"));
    expect(writeText).toHaveBeenCalledWith(receiptText);
    expect(share).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("offers copy recovery for native DOMException failures", async () => {
    setNavigator("share", vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator("clipboard", { writeText });
    render(<ShareReceiptButton {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy receipt" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(receiptText));
  });

  it("leaves sharing available without copying when the user cancels", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator("share", share);
    setNavigator("clipboard", { writeText });
    render(<ShareReceiptButton {...props} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));
    });

    expect(share).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Share receipt" })).toBeTruthy();
    expect(writeText).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it("keeps copy recovery available when a clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    setNavigator("share", vi.fn().mockRejectedValue(new Error("Share failed")));
    setNavigator("clipboard", { writeText });
    render(<ShareReceiptButton {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy receipt" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("Couldn't copy receipt"));
    expect(screen.getByRole("button", { name: "Copy receipt" })).toBeTruthy();
    expect(success).not.toHaveBeenCalled();
  });
});
