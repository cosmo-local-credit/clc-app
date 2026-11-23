import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
import { createHttpClient } from "../../client/http-client";
import { createAuthClient } from "../auth/client";
import { DEFAULT_PROFILE_VISIBILITY } from "@clc/core/features/public-profiles/logic";
import { createPublicProfilesClient } from "./client";
import {
  publicProfileQueryOptions,
  profileResourcesQueryOptions,
  profileActivityQueryOptions,
  profileDetailsQueryOptions,
  resourceProfilesQueryOptions,
} from "./queries";

const address = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const sections = {
  vouchers: true,
  offers: true,
  wants: true,
  pools: true,
  catalogs: true,
  posts: false,
  activity: false,
};
const profile = { address, username: "alice", sections, hasPrivateDetails: true };
const http = createHttpClient({ baseUrl: "https://api.test" });
const client = createPublicProfilesClient(http);
function respond(result: unknown) {
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, result }), { status: 200 })),
    );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("public profile transport and query lifecycle", () => {
  it("omits cookies for public reads and includes them only for chosen details", async () => {
    const fetch = respond({ profile: { ...profile, email: "secret" } });
    const signal = new AbortController().signal;
    expect(await client.detail(address, signal)).not.toHaveProperty("email");
    expect(fetch.mock.calls[0]?.[0]).toBe(`https://api.test/api/v2/profiles/${address}`);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      cache: "no-store",
      signal,
    });
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, result: { details: { email: "shared@example.test" } } }),
      ),
    );
    expect(await client.details(address, signal)).toEqual({ email: "shared@example.test" });
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
      signal,
    });
  });
  it.each([address, address.toLowerCase()])(
    "uses the API's checksummed path for every profile read from %s",
    async (input) => {
      const base = `/api/v2/profiles/${address}`;
      const sections = ["vouchers", "offers", "wants", "pools", "posts", "catalogs"] as const;
      const paths = [
        base,
        `${base}/details`,
        ...sections.map((section) => `${base}/${section}`),
        `${base}/activity`,
      ];
      const fetch = vi.fn((url: string, _init?: RequestInit) => {
        const path = new URL(url).pathname;
        if (!paths.includes(path)) {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: false, code: "E04" }), { status: 400 }),
          );
        }
        const result =
          path === base
            ? { profile }
            : path === `${base}/details`
              ? { details: {} }
              : { items: [], nextCursor: null };
        return Promise.resolve(new Response(JSON.stringify({ ok: true, result })));
      });
      vi.stubGlobal("fetch", fetch);
      const signal = new AbortController().signal;
      expect(await client.detail(input, signal)).toEqual(profile);
      expect(await client.details(input, signal)).toEqual({});
      for (const section of sections) {
        expect(await client.resources(input, section, "20", signal)).toEqual({
          items: [],
          nextCursor: null,
        });
      }
      expect(await client.activity(input, "20", signal)).toEqual({ items: [], nextCursor: null });
      expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(paths);
      for (const [index, call] of fetch.mock.calls.entries()) {
        expect(call[1]).toMatchObject({
          credentials: index === 1 ? "include" : "omit",
          cache: "no-store",
          signal,
        });
        if (index > 1) expect(new URL(call[0]).searchParams.get("cursor")).toBe("20");
      }
    },
  );
  it("passes opaque cursor and section exactly, stripping unapproved Activity metadata", async () => {
    const fetch = respond({
      items: [{ id: 1, kind: "pool", resourceId: address, name: "Pool", management: "multisig" }],
      nextCursor: "cursor+/=",
    });
    const query = new QueryClient();
    const options = profileResourcesQueryOptions(client, address, "pools");
    await query.fetchInfiniteQuery(options);
    const next = options.getNextPageParam(
      { items: [], nextCursor: "cursor+/=" },
      [],
      undefined,
      [],
    );
    await client.resources(address, "pools", next ?? undefined);
    expect(new URL(fetch.mock.calls[1]?.[0]).searchParams.get("cursor")).toBe("cursor+/=");
    expect(options.getNextPageParam({ items: [] }, [], undefined, [])).toBeUndefined();
    fetch.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            result: {
              items: [
                {
                  id: "1",
                  txHash: `0x${"b".repeat(64)}`,
                  chainId: 100,
                  timestamp: "2026-11-23T00:00:00Z",
                  kind: "transfer",
                  hasNote: true,
                  attachments: ["private"],
                },
              ],
              nextCursor: null,
            },
          }),
        ),
      ),
    );
    const activity = await query.fetchInfiniteQuery(profileActivityQueryOptions(client, address));
    expect(activity.pages[0]?.items[0]).not.toHaveProperty("hasNote");
    expect(activity.pages[0]?.items[0]).not.toHaveProperty("attachments");
    expect(
      profileActivityQueryOptions(client, address).getNextPageParam(
        { items: [], nextCursor: null },
        [],
        undefined,
        [],
      ),
    ).toBeUndefined();
    query.clear();
  });
  it("keeps viewer identity and resource kind in keys and resolves public signers", async () => {
    const fetch = respond({ profiles: [{ address, username: "alice" }] });
    const query = new QueryClient();
    const results = await query.fetchQuery(resourceProfilesQueryOptions(client, "pool", address));
    expect(results[0]?.address).toBe(address);
    expect(fetch.mock.calls[0]?.[1].credentials).toBe("omit");
    expect(profileDetailsQueryOptions(client, address).enabled).toBe(false);
    const details = profileDetailsQueryOptions(client, address, "VIEWER");
    expect(details.queryKey).toContain("viewer");
    expect(resourceProfilesQueryOptions(client, "pool", address).queryKey).not.toEqual(
      resourceProfilesQueryOptions(client, "voucher", address).queryKey,
    );
    expect(publicProfileQueryOptions(client, address).queryKey).toEqual(
      publicProfileQueryOptions(client, address.toLowerCase()).queryKey,
    );
    respond({ details: { phone: "+254000000" } });
    expect(await query.fetchQuery(details)).toEqual({ phone: "+254000000" });
    query.clear();
  });
  it("cancels an obsolete request instead of writing its response to the cache", async () => {
    let aborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );
    const query = new QueryClient();
    const options = publicProfileQueryOptions(client, address);
    const pending = query.fetchQuery(options).catch(() => undefined);
    await query.cancelQueries({ queryKey: options.queryKey });
    await pending;
    expect(aborted).toBe(true);
    expect(query.getQueryData(options.queryKey)).toBeUndefined();
    query.clear();
  });
  it("fails closed on malformed public responses", async () => {
    respond({ profile: { ...profile, sections: null } });
    await expect(client.detail(address)).rejects.toMatchObject({ kind: "protocol" });
  });
  it("preserves omitted publication choices and sends explicit changes with profile saves", async () => {
    const fetch = respond({});
    const auth = createAuthClient(http);
    const payload = { name: "Alice", email: "alice@example.test", phone: "", country: "KE" };
    await auth.submitProfile(payload);
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).not.toHaveProperty("publicProfile");
    await auth.submitProfile({
      ...payload,
      publicProfile: { ...DEFAULT_PROFILE_VISIBILITY, posts: true },
    });
    expect(JSON.parse(fetch.mock.calls[1]?.[1].body).publicProfile.posts).toBe(true);
  });
});
