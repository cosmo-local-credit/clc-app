import { describe, expect, it } from "vite-plus/test";
import type { AccountsClient, AccountTokensResult, AccountTransfersResult } from "./client";
import {
  accountKeys,
  accountTokensInfiniteQueryOptions,
  accountTransfersInfiniteQueryOptions,
  latestAccountTokensQueryOptions,
} from "./queries";

const ADDRESS = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";

describe("accountKeys", () => {
  it("hangs every key off `all` so one invalidation reaches them", () => {
    for (const key of [
      accountKeys.latestTokens(ADDRESS),
      accountKeys.tokens(ADDRESS, 20),
      accountKeys.tokensInfinite(ADDRESS, 20),
      accountKeys.issuedTokensInfinite(ADDRESS, 20),
      accountKeys.transfers(ADDRESS, 20),
      accountKeys.transfersInfinite(ADDRESS, 20),
    ]) {
      expect(key.slice(0, accountKeys.all.length)).toEqual([...accountKeys.all]);
    }
  });

  it("keeps an account's issued vouchers apart from its balances", () => {
    expect(accountKeys.issuedTokensInfinite(ADDRESS, 20)).not.toEqual(
      accountKeys.tokensInfinite(ADDRESS, 20),
    );
  });

  it("gives finite and infinite reads distinct keys", () => {
    expect(accountKeys.tokens(ADDRESS, 20)).not.toEqual(accountKeys.tokensInfinite(ADDRESS, 20));
    expect(accountKeys.transfers(ADDRESS, 20)).not.toEqual(
      accountKeys.transfersInfinite(ADDRESS, 20),
    );
  });

  it("gives one account one entry regardless of address casing", () => {
    // A checksummed address from the chain and a lowercased one from a URL must
    // not produce two cache entries for the same account.
    expect(accountKeys.tokens(ADDRESS, 20)).toEqual(accountKeys.tokens(ADDRESS.toLowerCase(), 20));
    expect(accountKeys.latestTokens(ADDRESS)).toEqual(
      accountKeys.latestTokens(ADDRESS.toUpperCase()),
    );
  });

  it("keeps tokens and transfers apart for the same account", () => {
    expect(accountKeys.tokens(ADDRESS, 20)).not.toEqual(accountKeys.transfers(ADDRESS, 20));
  });
});

describe("infinite account options", () => {
  const tokens = accountTokensInfiniteQueryOptions({} as AccountsClient, ADDRESS, 20);
  const transfers = accountTransfersInfiniteQueryOptions({} as AccountsClient, ADDRESS, 20);

  it("stops on a short page of tokens", () => {
    const short = {
      tokens: Array.from({ length: 19 }, () => ({})),
      last: 5,
    } as unknown as AccountTokensResult;
    expect(tokens.getNextPageParam(short, [], undefined, [])).toBeUndefined();
  });

  it("continues from the cursor on a full page of tokens", () => {
    const full = {
      tokens: Array.from({ length: 20 }, () => ({})),
      last: 5,
    } as unknown as AccountTokensResult;
    expect(tokens.getNextPageParam(full, [], undefined, [])).toBe(5);
  });

  it("continues when a transaction tie makes the token page larger than requested", () => {
    const tied = {
      tokens: Array.from({ length: 24 }, () => ({})),
      last: 100,
    } as unknown as AccountTokensResult;
    expect(tokens.getNextPageParam(tied, [], undefined, [])).toBe(100);
  });

  it("stops when the backend returns no cursor", () => {
    const noCursor = {
      transfers: Array.from({ length: 20 }, () => ({})),
    } as unknown as AccountTransfersResult;
    expect(transfers.getNextPageParam(noCursor, [], undefined, [])).toBeUndefined();
  });

  it("stays disabled without an address", () => {
    expect(accountTokensInfiniteQueryOptions({} as AccountsClient, undefined, 20).enabled).toBe(
      false,
    );
    expect(latestAccountTokensQueryOptions({} as AccountsClient, undefined).enabled).toBe(false);
  });
});
