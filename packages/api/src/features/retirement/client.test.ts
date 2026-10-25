import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createRetirementClient } from "./client";
import { retirementKeys } from "./queries";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const api = createRetirementClient(createHttpClient({ baseUrl: "https://api.test" }));
const preview = {
  resourceType: "voucher",
  resourceAddress: ADDRESS,
  chainId: 100,
  ownerAddress: OWNER,
  active: true,
  symbol: "TEST",
  decimals: 18,
  amountOutsideOwnerRaw: "123456789012345678901234567890",
  positiveTokenCount: null,
  hasPositiveBalances: true,
  blockNumber: "1234",
  checkedAt: "2026-10-25T12:00:00Z",
  coverage: "total-supply",
  coverageNote: null,
};
const request = {
  id: 1,
  resourceType: "voucher",
  resourceAddress: ADDRESS,
  resourceName: "Test voucher",
  symbol: "TEST",
  chainId: 100,
  requesterAddress: OWNER,
  ownerAddress: OWNER,
  reason: "Closing the project",
  status: "pending",
  requestedAt: "2026-10-25T12:00:00Z",
  decisionAt: null,
  decisionBy: null,
  decisionReason: null,
  snapshot: preview,
  decisionSnapshot: null,
};
function respond(result: unknown) {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true, result }),
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe("retirement client", () => {
  it("preserves full raw balance precision and requests uncached previews", async () => {
    const fetcher = respond({ preview });
    const signal = new AbortController().signal;
    expect((await api.preview("voucher", ADDRESS, signal)).amountOutsideOwnerRaw).toBe(
      preview.amountOutsideOwnerRaw,
    );
    expect(fetcher).toHaveBeenCalledWith(
      `https://api.test/api/v2/vouchers/${ADDRESS}/retirement-preview`,
      expect.objectContaining({ cache: "no-store", signal }),
    );
  });

  it("rejects a missing pool count instead of converting it to zero", async () => {
    respond({
      preview: {
        ...preview,
        resourceType: "pool",
        coverage: "known-tokens",
        amountOutsideOwnerRaw: null,
      },
    });
    await expect(api.preview("pool", ADDRESS)).rejects.toThrow("The balance check is incomplete");
  });

  it("sends a reason when creating a request instead of using the immediate DELETE route", async () => {
    const fetcher = respond({ request });
    expect((await api.create("voucher", ADDRESS, { reason: request.reason })).status).toBe(
      "pending",
    );
    expect(fetcher).toHaveBeenCalledWith(
      `https://api.test/api/v2/vouchers/${ADDRESS}/retirement-requests`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: request.reason }) }),
    );
  });

  it("submits positive-balance acknowledgment for approval and a reason for rejection", async () => {
    const fetcher = respond({ request: { ...request, status: "approved" } });
    await api.approve(1, { acknowledgeBalances: true, reason: "Owner informed" });
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining("/admin/retirement-requests/1/approve"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ acknowledgeBalances: true, reason: "Owner informed" }),
      }),
    );
    await api.reject(1, { reason: "Please confirm ownership first" });
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining("/1/reject"),
      expect.objectContaining({
        body: JSON.stringify({ reason: "Please confirm ownership first" }),
      }),
    );
  });

  it("retains status filters, cursor and pending count in the admin queue", async () => {
    const fetcher = respond({ requests: [request], pendingCount: 3, nextCursor: 1 });
    expect(
      await api.listAdmin({ status: "pending", resourceType: "voucher", cursor: 2, perPage: 1 }),
    ).toMatchObject({ pendingCount: 3, nextCursor: 1 });
    expect(fetcher.mock.calls[0]?.[0]).toContain(
      "status=pending&resourceType=voucher&cursor=2&perPage=1",
    );
  });

  it("separates private requests and preview caches by viewer", () => {
    expect(retirementKeys.preview("voucher", ADDRESS, OWNER)).not.toEqual(
      retirementKeys.preview("voucher", ADDRESS, ADDRESS),
    );
    expect(retirementKeys.mine(OWNER)).not.toEqual(retirementKeys.mine(ADDRESS));
  });
});
