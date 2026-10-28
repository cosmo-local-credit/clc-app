import type { UserPool } from "@clc/api/features/pools/client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ value: { data: undefined, isPending: true } as any }));
vi.mock("../use-pool-steward", () => ({ usePoolStewardState: () => state.value }));

import { PoolSealBits, SEAL_BITS } from "./pool-seal-bits";

const pool = {
  id: "1",
  address: "0x1000000000000000000000000000000000000001",
} as unknown as UserPool;

describe("PoolSealBits", () => {
  it("distinguishes reading, unavailable, open, and sealed states", () => {
    const { rerender } = render(<PoolSealBits pool={pool} />);
    expect(screen.getByText("Reading")).toBeTruthy();

    state.value = { data: { sealState: null }, isPending: false };
    rerender(<PoolSealBits pool={pool} />);
    expect(screen.getByText("Unavailable")).toBeTruthy();

    state.value = { data: { sealState: 0 }, isPending: false };
    rerender(<PoolSealBits pool={pool} />);
    expect(screen.getByText("Open")).toBeTruthy();

    state.value = { data: { sealState: SEAL_BITS[0].bit | SEAL_BITS[1].bit }, isPending: false };
    rerender(<PoolSealBits pool={pool} />);
    expect(screen.getByText("Fee")).toBeTruthy();
    expect(screen.getByText("Fee recipient")).toBeTruthy();
  });
});
