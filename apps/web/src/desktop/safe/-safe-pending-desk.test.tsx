import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SAFE = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

const mocks = vi.hoisted(() => ({
  proposals: [] as Array<{ transaction: { safeTxHash: string } }>,
}));

vi.mock("#/features/safe/hooks/use-safe-pending", () => ({
  useSafePending: () => ({ status: "ready", proposals: mocks.proposals }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useSafeSigners: () => ({ data: [] }),
}));

import { useSafeSheet } from "#/features/safe/state/safe-sheet";
import { SafePendingDesk } from "./safe-pending-desk";

beforeEach(() => {
  mocks.proposals = [];
  act(() => useSafeSheet.getState().close());
});

describe("SafePendingDesk", () => {
  it("opens the exact proposal and explains when it is no longer pending", async () => {
    mocks.proposals = [{ transaction: { safeTxHash: `0x${"cd".repeat(32)}` } }];
    render(<SafePendingDesk />);
    act(() => useSafeSheet.getState().show(SAFE, HASH));
    expect(await screen.findByText("This proposal is no longer pending.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useSafeSheet.getState().safe).toBeNull();
  });
});
