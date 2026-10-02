import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CHAIN_ID } from "#/lib/chain";

const qrCode = vi.hoisted(() => ({ toDataURL: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("qrcode", () => ({ default: qrCode }));
vi.mock("sonner", () => ({ toast }));

import { PoolReceiveSheet } from "./pool-receive-sheet";

const ADDRESS = "0xAbC0000000000000000000000000000000000123" as const;
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  qrCode.toDataURL.mockResolvedValue("data:image/png;base64,pool-qr");
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PoolReceiveSheet", () => {
  it("shows a chain-specific QR and copies the pool address", async () => {
    render(<PoolReceiveSheet pool={{ address: ADDRESS }} open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(qrCode.toDataURL).toHaveBeenCalledWith(`ethereum:${ADDRESS}@${CHAIN_ID}`, {
        margin: 4,
        width: 184,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy pool address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ADDRESS));
    expect(toast.success).toHaveBeenCalledWith("Address copied");
  });

  it("displays and copies the pool name while retaining the address in the QR", async () => {
    render(
      <PoolReceiveSheet
        pool={{ address: ADDRESS, name: "Community Pool" }}
        open
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Community Pool")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy pool name" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Community Pool"));
    expect(toast.success).toHaveBeenCalledWith("Pool name copied");
    expect(qrCode.toDataURL).toHaveBeenCalledWith(
      `ethereum:${ADDRESS}@${CHAIN_ID}`,
      expect.any(Object),
    );
  });
});
