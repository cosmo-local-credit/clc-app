import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { SafeTransaction } from "@clc/core/features/safe/logic";
import { createHttpClient } from "../../client/http-client";
import { createSafeClient } from "./client";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const proposal = {
  safe: A(1),
  safeTxHash: `0x${"ab".repeat(32)}`,
  to: A(2),
  value: "0",
  data: "0xf2fde38b",
  operation: 0,
  safeTxGas: "0",
  baseGas: "0",
  gasPrice: "0",
  gasToken: A(0),
  refundReceiver: A(0),
  nonce: "3",
  confirmations: [{ owner: A(5), signature: `0x${"11".repeat(65)}`, submittedAt: "2026-10-25" }],
  confirmationsRequired: 2,
  isExecuted: false,
  isSuccessful: null,
  transactionHash: null,
};

function client(body: unknown) {
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: true, description: "", result: body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  return { spy, safe: createSafeClient(createHttpClient({ baseUrl: "https://api.example" })) };
}

afterEach(() => vi.restoreAllMocks());

describe("safe client", () => {
  it("reads public persisted ownership with an unknown threshold", async () => {
    const state = { kind: "safe", owner: A(1), signers: [A(5)], threshold: null };
    const { spy, safe } = client(state);
    await expect(safe.owner(A(1))).resolves.toEqual(state);
    expect(spy).toHaveBeenCalledWith(
      `https://api.example/api/v2/owners/${A(1)}`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });
  it("lists pending transactions of a Safe", async () => {
    const { spy, safe } = client({ results: [proposal] });
    const result = await safe.pending(A(1));
    expect(spy).toHaveBeenCalledWith(
      `https://api.example/api/v2/safe/${A(1)}/pending`,
      expect.anything(),
    );
    expect(result[0]?.confirmationsRequired).toBe(2);
  });

  it("POSTs a proposal", async () => {
    const { spy, safe } = client(proposal);
    await safe.propose({
      safe: A(1) as `0x${string}`,
      safeTxHash: proposal.safeTxHash as `0x${string}`,
      sender: A(5) as `0x${string}`,
      signature: `0x${"11".repeat(65)}`,
      tx: proposal as SafeTransaction,
    });
    expect(spy).toHaveBeenCalledWith(
      "https://api.example/api/v2/safe/proposals",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects a malformed response", async () => {
    const { safe } = client({ results: [{ ...proposal, confirmationsRequired: 0 }] });
    await expect(safe.pending(A(1))).rejects.toThrow();
  });
});
