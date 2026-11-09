import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { FullValue } from "./full-value";

const ADDRESS = "0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0";
const PRETIUM_ID = "pretium-9f3a1c77e2b44d0a8c51-0042";

function textOf(value: string) {
  return screen.queryAllByText((_, element) => element?.textContent === value);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("FullValue", () => {
  it("reads short, then lays out every character on request", () => {
    render(<FullValue value={ADDRESS} copyLabel="Copy contract address" onCopy={() => {}} />);
    expect(textOf(ADDRESS)).toHaveLength(0);

    const toggle = screen.getByRole("button", { name: "Show full" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(textOf(ADDRESS).length).toBeGreaterThan(0);
    const hide = screen.getByRole("button", { name: "Hide full" });
    expect(hide.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(hide);
    expect(textOf(ADDRESS)).toHaveLength(0);
  });

  it("shows an identifier that is not hex as plain text, never as a broken address", () => {
    render(<FullValue value={PRETIUM_ID} copyLabel="Copy ID" onCopy={() => {}} />);
    // Shortened with its head and tail intact, not sliced as if it were 0x...
    expect(textOf(PRETIUM_ID)).toHaveLength(0);
    expect(screen.getByText(`${PRETIUM_ID.slice(0, 10)}…${PRETIUM_ID.slice(-8)}`)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show full" }));
    expect(textOf(PRETIUM_ID).length).toBeGreaterThan(0);
  });

  it("can start in full, as a confirmation step does", () => {
    render(<FullValue value={ADDRESS} copyLabel="Copy" onCopy={() => {}} initiallyFull />);
    expect(textOf(ADDRESS).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Hide full" })).toBeTruthy();
  });

  it("hands the exact value to onCopy, whether or not it is shown in full", () => {
    const onCopy = vi.fn();
    render(<FullValue value={ADDRESS} copyLabel="Copy contract address" onCopy={onCopy} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy contract address" }));
    expect(onCopy).toHaveBeenCalledWith(ADDRESS);
  });

  it("copies the exact value and says so when given messages instead of onCopy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <FullValue
        value={ADDRESS}
        copyLabel="Copy address"
        copiedMessage="Address copied"
        failedMessage="Couldn't copy address"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Address copied"));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports a failed copy instead of claiming success", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <FullValue
        value={ADDRESS}
        copyLabel="Copy address"
        copiedMessage="Address copied"
        failedMessage="Couldn't copy address"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy address"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports a missing clipboard the same way", () => {
    vi.stubGlobal("navigator", {});
    render(
      <FullValue
        value={ADDRESS}
        copyLabel="Copy address"
        copiedMessage="Address copied"
        failedMessage="Couldn't copy address"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy address");
  });
});
