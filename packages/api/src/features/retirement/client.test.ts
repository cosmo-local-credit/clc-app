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

  it("loads private owner and resource histories and normalizes nullable collections", async () => {
    const mineFetcher = respond({ requests: null });
    const signal = new AbortController().signal;
    await expect(api.listMine(signal)).resolves.toEqual([]);
    expect(mineFetcher).toHaveBeenCalledWith(
      "https://api.test/api/v2/users/me/retirement-requests",
      expect.objectContaining({ cache: "no-store", signal }),
    );

    const resourceFetcher = respond({ requests: [request] });
    await expect(api.listResource("pool", ADDRESS, signal)).resolves.toEqual([request]);
    expect(resourceFetcher).toHaveBeenCalledWith(
      `https://api.test/api/v2/pools/${ADDRESS}/retirement-requests`,
      expect.objectContaining({ cache: "no-store", signal }),
    );
  });

  it("cancels an owner request and loads admin request history", async () => {
    const cancelled = { ...request, status: "cancelled" };
    const cancelFetcher = respond({ request: cancelled });
    await expect(api.cancel(1)).resolves.toMatchObject({ id: 1, status: "cancelled" });
    expect(cancelFetcher).toHaveBeenCalledWith(
      "https://api.test/api/v2/retirement-requests/1/cancel",
      expect.objectContaining({ method: "PUT", body: "{}" }),
    );

    const event = {
      id: 2,
      action: "cancelled",
      actorAddress: OWNER,
      reason: "Owner changed plans",
      createdAt: "2026-10-25T13:00:00Z",
      requestId: 1,
    };
    const detailFetcher = respond({ request: cancelled, events: [event] });
    await expect(api.getAdminRequest(1)).resolves.toEqual({ request: cancelled, events: [event] });
    expect(detailFetcher).toHaveBeenCalledWith(
      "https://api.test/api/v2/admin/retirement-requests/1",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );

    const historyFetcher = respond({ requests: null, events: null });
    await expect(api.adminResourceHistory("voucher", ADDRESS)).resolves.toEqual({
      requests: [],
      events: [],
    });
    expect(historyFetcher).toHaveBeenCalledWith(
      `https://api.test/api/v2/admin/vouchers/${ADDRESS}/retirement-history`,
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("restores pools and vouchers and rejects malformed restore responses", async () => {
    const poolFetcher = respond({
      pool: { id: 9, address: ADDRESS, name: "Restored pool", symbol: "POOL", active: true },
    });
    await expect(api.restore("pool", ADDRESS, { reason: "Reopened" })).resolves.toMatchObject({
      address: ADDRESS,
      name: "Restored pool",
      active: true,
    });
    expect(poolFetcher).toHaveBeenCalledWith(
      `https://api.test/api/v2/admin/pools/${ADDRESS}/restore`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ reason: "Reopened" }) }),
    );

    const voucherFetcher = respond({
      voucher: {
        id: 10,
        address: ADDRESS,
        name: "Restored voucher",
        symbol: "VCH",
        active: true,
      },
    });
    await expect(api.restore("voucher", ADDRESS, { reason: "Reopened" })).resolves.toMatchObject({
      address: ADDRESS,
      name: "Restored voucher",
      active: true,
    });
    expect(voucherFetcher).toHaveBeenCalledWith(
      `https://api.test/api/v2/admin/vouchers/${ADDRESS}/restore`,
      expect.objectContaining({ method: "PUT" }),
    );

    respond({ pool: { address: "invalid" } });
    await expect(api.restore("pool", ADDRESS, { reason: "Retry" })).rejects.toThrow(
      "Pool restore response did not include a valid address.",
    );

    respond({ voucher: { id: 11, address: "invalid" } });
    await expect(api.restore("voucher", ADDRESS, { reason: "Retry" })).rejects.toThrow(
      "Voucher restore response did not include a valid address.",
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

  it("omits the admin queue query string when every filter is absent", async () => {
    const fetcher = respond({ requests: [], pendingCount: 0, nextCursor: null });

    await expect(api.listAdmin()).resolves.toMatchObject({ pendingCount: 0 });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.test/api/v2/admin/retirement-requests");
  });

  it("separates private requests and preview caches by viewer", () => {
    expect(retirementKeys.preview("voucher", ADDRESS, OWNER)).not.toEqual(
      retirementKeys.preview("voucher", ADDRESS, ADDRESS),
    );
    expect(retirementKeys.mine(OWNER)).not.toEqual(retirementKeys.mine(ADDRESS));
  });
});
