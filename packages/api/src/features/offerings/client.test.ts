import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getVoucherOfferings } from "./client";

const fetchMock = vi.fn();
const VOUCHER_ADDRESS = "0x4444444444444444444444444444444444444444";
const SELLER_ADDRESS = "0x6666666666666666666666666666666666666666";

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    voucherId: 10,
    voucherAddress: VOUCHER_ADDRESS,
    sellerAddress: SELLER_ADDRESS,
    commodityName: "Vegetables",
    commodityType: "GOOD",
    description: "Fresh produce",
    quantity: "5.0000",
    frequency: "week",
    price: "10.5000",
    imageUrl: "https://content.example/vegetables.jpg",
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getVoucherOfferings", () => {
  it("builds first and next cursor requests with the public cache policy", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [], first: 0, last: 0 }));
    const controller = new AbortController();

    await getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 }, controller.signal);
    await getVoucherOfferings(
      VOUCHER_ADDRESS,
      { perPage: 20, cursor: 9, next: true },
      controller.signal,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`/api/v2/vouchers/${VOUCHER_ADDRESS}/offerings?perPage=20`),
      expect.objectContaining({
        credentials: "omit",
        method: "GET",
        signal: controller.signal,
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("cursor=");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `/api/v2/vouchers/${VOUCHER_ADDRESS}/offerings?perPage=20&cursor=9&next=true`,
      ),
      expect.objectContaining({ credentials: "omit", method: "GET" }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("cache");
  });

  it("normalizes valid rows while preserving addresses and numeric text", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [offering()], first: 3, last: 3 }));

    const page = await getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 });

    expect(page).toMatchObject({
      first: 3,
      last: 3,
      receivedCount: 1,
      offerings: [
        {
          voucherAddress: VOUCHER_ADDRESS,
          sellerAddress: SELLER_ADDRESS,
          quantity: "5.0000",
          price: "10.5000",
          frequency: "week",
        },
      ],
    });
  });

  it("rejects unsafe images and counts malformed rows before dropping them", async () => {
    fetchMock.mockResolvedValue(
      response({
        offerings: [
          offering({ imageUrl: "javascript:alert(1)" }),
          offering({ id: 2, sellerAddress: undefined }),
        ],
        first: 3,
        last: 2,
      }),
    );

    const page = await getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 });

    expect(page.receivedCount).toBe(2);
    expect(page.offerings).toHaveLength(1);
    expect(page.offerings[0]?.imageUrl).toBeNull();
  });

  it("normalizes missing cursors to zero", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [] }));

    const page = await getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 });

    expect(page.first).toBe(0);
    expect(page.last).toBe(0);
  });
});
