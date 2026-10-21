import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createAccountsClient } from "./client";

// One client over a test base URL. `fetch` is left to the platform so the
// existing vi.stubGlobal("fetch") in each test is what answers the request.
const api = createAccountsClient(createHttpClient({ baseUrl: "https://api.test" }));
const ACCOUNT = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const LOWERCASE_ACCOUNT = ACCOUNT.toLowerCase();

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

    const result = await api.getLatestAccountTokens(LOWERCASE_ACCOUNT);

    expect(result.tokens[0]?.tokenSymbol).toBe("USD₮");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v2/accounts/${ACCOUNT}/tokens/latest`),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("fetches transfer history with documented cursor pagination", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: {
        transfers: [
          {
            id: 10,
            txHash: `0x${"11".repeat(32)}`,
            uoaValue: "9007199254740993.25",
            uoa: "KES",
          },
        ],
        first: 10,
        last: 5,
      },
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await api.getAccountTransfers({
      address: LOWERCASE_ACCOUNT,
      perPage: 20,
      cursor: 5,
      next: true,
    });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        `/api/v2/accounts/${ACCOUNT}/transfers?perPage=20&cursor=5&next=true`,
      ),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
    expect(result.transfers[0]).toMatchObject({
      uoaValue: "9007199254740993.25",
      uoa: "KES",
    });
  });

  it("sends an encoded history search with the cursor and cancellation signal", async () => {
    const fetcher = mockFetch({ ok: true, result: { transfers: [] } });
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    await api.getAccountTransfers(
      { address: ACCOUNT, perPage: 20, cursor: 7, next: true, q: "old & voucher" },
      controller.signal,
    );
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("cursor=7&next=true&q=old%20%26%20voucher"),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("checksums paginated token-balance account paths", async () => {
    const fetcher = mockFetch({ ok: true, result: { tokens: [], first: 10, last: 5 } });
    vi.stubGlobal("fetch", fetcher);

    await api.getAccountTokens({ address: LOWERCASE_ACCOUNT, perPage: 20 });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v2/accounts/${ACCOUNT}/tokens?perPage=20`),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("fetches issued vouchers with the same cursor pagination", async () => {
    const fetcher = mockFetch({ ok: true, result: { tokens: null, first: 0, last: 0 } });
    vi.stubGlobal("fetch", fetcher);

    const result = await api.getAccountIssuedTokens({
      address: LOWERCASE_ACCOUNT,
      perPage: 100,
      cursor: 7,
      next: true,
    });

    expect(result.tokens).toEqual([]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        `/api/v2/accounts/${ACCOUNT}/tokens/issued?perPage=100&cursor=7&next=true`,
      ),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });
});

describe("account status", () => {
  it("GETs /account/status/:address and returns the gas balance", async () => {
    const address = "0x2Dd3bB110D5609723b761416d2EA914F20E1FfD4";
    const fetcher = mockFetch({
      ok: true,
      result: {
        gasBalance: "3202847782677689810",
        networkNonce: 4,
        internalNonce: 5,
        active: true,
      },
    });
    vi.stubGlobal("fetch", fetcher);

    const status = await api.getAccountStatus(address.toLowerCase());

    expect(status.gasBalance).toBe("3202847782677689810");
    expect(status.active).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v2/account/status/${address}`),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("rejects a malformed address before making a request", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: { gasBalance: "0", networkNonce: 0, internalNonce: 0, active: false },
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(api.getAccountStatus("../../tokens")).rejects.toThrow(/address.*invalid/i);

    expect(fetcher).not.toHaveBeenCalled();
  });
});
