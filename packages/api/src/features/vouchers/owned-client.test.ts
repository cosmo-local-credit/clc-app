import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createOwnedVouchersClient } from "./owned-client";

const api = createOwnedVouchersClient(createHttpClient({ baseUrl: "https://api.test" }));
const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("owned vouchers client", () => {
  it("normalizes active and retired rows and sends cursor pagination", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      text: () =>
        Promise.resolve(
          JSON.stringify({
            ok: true,
            result: {
              vouchers: [
                {
                  id: 9,
                  chainId: 100,
                  address: ADDRESS,
                  name: "Owned voucher",
                  symbol: "OWN",
                  decimals: 6,
                  iconUrl: "https://images.test/owned.png",
                  ownerAddress: ADDRESS,
                  active: false,
                },
              ],
              first: 9,
              last: 9,
            },
          }),
        ),
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(api.list({ perPage: 20, cursor: 10, next: true })).resolves.toEqual({
      vouchers: [
        {
          id: "9",
          chainId: 100,
          address: ADDRESS,
          name: "Owned voucher",
          symbol: "OWN",
          decimals: 6,
          iconUrl: "https://images.test/owned.png",
          ownerAddress: ADDRESS,
          active: false,
        },
      ],
      first: 9,
      last: 9,
      receivedCount: 1,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.test/api/v2/users/me/vouchers?perPage=20&cursor=10&next=true",
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("drops malformed rows without changing pagination completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              result: { vouchers: [{ id: 1, address: "bad" }], first: 1, last: 1 },
            }),
          ),
      }),
    );

    await expect(api.list({ perPage: 20 })).resolves.toMatchObject({
      vouchers: [],
      receivedCount: 1,
      first: 1,
      last: 1,
    });
  });
});
