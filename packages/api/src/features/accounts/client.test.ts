import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { getAccountTransfers, getLatestAccountTokens } from "./client";

function mockFetch(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("account token balances", () => {
  it("fetches latest balances for an account with the auth cookie", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: {
        tokens: [
          {
            id: 1043746,
            tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
            tokenSymbol: "USD₮",
            tokenName: "Tether USD",
            tokenDecimals: 6,
            balance: "100000",
            iconUrl: "https://content.sarafu.network/voucher/icon.jpg",
            lastDateBlock: "2026-07-01T12:20:29Z",
          },
        ],
      },
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await getLatestAccountTokens("0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d");

    expect(result.tokens[0]?.tokenSymbol).toBe("USD₮");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v2/accounts/0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d/tokens/latest",
      ),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("fetches transfer history with documented cursor pagination", async () => {
    const fetcher = mockFetch({ ok: true, result: { transfers: [], first: 10, last: 5 } });
    vi.stubGlobal("fetch", fetcher);

    await getAccountTransfers({
      address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
      perPage: 20,
      cursor: 5,
      next: true,
    });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v2/accounts/0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d/transfers?perPage=20&cursor=5&next=true",
      ),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });
});
