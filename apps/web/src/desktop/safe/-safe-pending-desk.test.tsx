import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SAFE = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

vi.mock("#/features/safe/hooks/use-safe-pending", () => ({
  useSafePending: () => ({ status: "ready", proposals: [] }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useSafeSigners: () => ({ data: [] }),
}));

import { useSafeSheet } from "#/features/safe/state/safe-sheet";
import { SafePendingDesk } from "./safe-pending-desk";

beforeEach(() => {
  act(() => useSafeSheet.getState().close());
});

describe("SafePendingDesk", () => {
  it("opens the exact proposal and explains when it is no longer pending", async () => {
    render(<SafePendingDesk />);
    act(() => useSafeSheet.getState().show(SAFE, HASH));
    expect(await screen.findByText("This proposal is no longer pending.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useSafeSheet.getState().safe).toBeNull();
  });
});
