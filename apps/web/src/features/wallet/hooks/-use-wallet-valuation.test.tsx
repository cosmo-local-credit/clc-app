import { CELO_MAINNET_CUSD_ADDRESS } from "@clc/core/lib/constants/celo";
import { accountKeys } from "@clc/api/features/accounts/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useWalletValuation } from "./use-wallet-valuation";

const WALLET = "0x9000000000000000000000000000000000000000";
const OTHER = "0x8000000000000000000000000000000000000000";
const connection = vi.hoisted(() => ({ address: "" as string }));
vi.mock("wagmi", () => ({ useConnection: () => connection }));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 42220 }));

function tokenAddress(id: number) {
  return `0x${id.toString(16).padStart(40, "0")}`;
}

function token(id: number, unit?: string) {
  return {
    id,
    tokenAddress: tokenAddress(id),
    // 1.25 vouchers at three units each.
    balance: "125",
    tokenDecimals: 2,
    ...(unit ? { voucherValue: "3", voucherUoa: unit } : {}),
  };
}

function reply(result: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify({ ok: status < 400, result }), {
      status,
      headers: status === 503 ? { "Retry-After": "0" } : undefined,
    }),
  );
}

function mount() {
  connection.address = WALLET;
  const client = new QueryClient();
  return {
    client,
    ...renderHook(({ address }) => useWalletValuation(address), {
      initialProps: { address: WALLET as string },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

it("prices holdings from account rows and the cash-out rate without Voucher detail reads", async () => {
  const fetch = vi.fn((input: string, _options: RequestInit) => {
    const path = new URL(input).pathname;
    if (path.endsWith("/tokens"))
      return reply({
        tokens: [
          token(1, "KES"),
          token(2),
          { ...token(3), balance: "200", tokenAddress: CELO_MAINNET_CUSD_ADDRESS },
        ],
      });
    if (path === "/auth/profile") return reply({ preferredCurrency: "KES" });
    if (path.endsWith("/pretium/rates")) return reply({ buy: "130", sell: "135" });
    throw new Error(`Unexpected read: ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  const { result, client, unmount } = mount();
  await waitFor(() => expect(result.current.total).toBe("263.75"));
  expect(result.current.unit).toBe("KES");
  expect(result.current.values.get(tokenAddress(1))).toEqual({ status: "priced", value: "3.75" });
  expect(result.current.values.get(tokenAddress(2))).toEqual({ status: "unpriced" });
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname).sort()).toEqual(
    ["/auth/profile", `/api/v2/accounts/${WALLET}/tokens`, "/api/v2/pretium/rates"].sort(),
  );
  expect(fetch.mock.calls.every(([, options]) => options.signal instanceof AbortSignal)).toBe(true);
  unmount();
  client.clear();
});

it("withholds a partial total and retries the missing cursor without restarting the walk", async () => {
  let failLaterPage = true;
  let failedPageReads = 0;
  const fetch = vi.fn((input: string) => {
    const url = new URL(input);
    if (url.pathname === "/auth/profile") return reply({ preferredCurrency: "USD" });
    if (url.pathname === `/api/v2/accounts/${OTHER}/tokens`) return reply({ tokens: [] });
    if (url.pathname !== `/api/v2/accounts/${WALLET}/tokens`)
      throw new Error(`Unexpected read: ${url.pathname}`);
    if (!url.searchParams.has("cursor"))
      return reply({
        tokens: Array.from({ length: 100 }, (_, index) => token(index + 1, "USD")),
        last: 100,
      });
    if (failLaterPage) {
      failedPageReads++;
      return reply({}, 503);
    }
    return reply({ tokens: [token(101, "USD")] });
  });
  vi.stubGlobal("fetch", fetch);
  const { result, rerender, client, unmount } = mount();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(failedPageReads).toBe(3);
  expect(result.current.isPending).toBe(false);
  expect(result.current.values.get(tokenAddress(1))).toEqual({ status: "priced", value: "3.75" });
  expect(result.current.total).toBeNull();

  failLaterPage = false;
  await act(async () => {
    await result.current.retry();
  });
  await waitFor(() => expect(result.current.total).toBe("378.75"));
  expect(
    fetch.mock.calls
      .map(([input]) => new URL(input))
      .filter((url) => url.pathname.endsWith("/tokens"))
      .map((url) => url.searchParams.get("cursor")),
  ).toEqual([null, "100", "100", "100", "100"]);

  // After a complete walk, an interrupted refresh can keep the snapshot.
  failLaterPage = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: accountKeys.tokensInfinite(WALLET, 100) });
  });
  expect(result.current.total).toBe("378.75");

  connection.address = OTHER;
  rerender({ address: OTHER });
  expect(result.current.values.size).toBe(0);
  await waitFor(() => expect(result.current.total).toBe("0"));
  unmount();
  client.clear();
});
