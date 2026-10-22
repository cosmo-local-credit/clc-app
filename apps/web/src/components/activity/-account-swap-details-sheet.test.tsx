import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

import { AccountSwapDetailsSheet } from "./account-swap-details-sheet";

const TX_HASH = `0x${"55".repeat(32)}`;
const SWAP = {
  kind: "swapped",
  id: 4000010,
  txHash: TX_HASH,
  dateBlock: "2026-10-20T08:00:00Z",
  success: true,
  sent: {
    tokenAddress: "0x1111111111111111111111111111111111111111",
    tokenName: "My voucher",
    tokenSymbol: "MY3R",
    tokenDecimals: 6,
    amount: "1000000",
    uoaValue: "1",
    uoa: "KES",
  },
  received: {
    tokenAddress: "0x2222222222222222222222222222222222222222",
    tokenName: "Kilifi voucher",
    tokenSymbol: "KNSM2",
    tokenDecimals: 6,
    amount: "2000000",
    uoaValue: "2",
    uoa: "BAM",
  },
  poolAddresses: ["0x3333333333333333333333333333333333333333"],
} satisfies Extract<AccountActivityItem, { kind: "swapped" }>;

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
}

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.clearAllMocks();
});

function renderSheet() {
  render(<AccountSwapDetailsSheet activity={SWAP} open onOpenChange={vi.fn()} />);
  return screen.getByRole("button", { name: "Copy transaction hash" });
}

describe("AccountSwapDetailsSheet copying", () => {
  it("copies the indexed transaction hash", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    fireEvent.click(renderSheet());

    expect(writeText).toHaveBeenCalledWith(TX_HASH);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Transaction hash copied"));
  });

  it("reports a missing clipboard", () => {
    setClipboard(undefined);

    fireEvent.click(renderSheet());

    expect(toast.error).toHaveBeenCalledWith("Couldn't copy transaction hash");
  });

  it("reports a rejected clipboard write", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });

    fireEvent.click(renderSheet());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy transaction hash"));
  });
});
