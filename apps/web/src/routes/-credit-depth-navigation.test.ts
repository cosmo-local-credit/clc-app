import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { getRouter } from "#/router";

/**
 * The Credit depth through the real route tree: the canonical `creditDepth`,
 * legacy `creditable` links folded into it, and the depth kept from the market
 * through details, related resources, Get and its receipt, and Back/Forward.
 */

const VOUCHER = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";
const POOL = "0x1111111111111111111111111111111111111111";
const TRACKING = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

async function routerAt(url: string) {
  const router = getRouter();
  router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [url] }) });
  await router.load();
  return router;
}

function search(router: Awaited<ReturnType<typeof routerAt>>) {
  return router.state.location.search as Record<string, unknown>;
}

async function settle(router: Awaited<ReturnType<typeof routerAt>>) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await router.load();
}

describe("Credit depth URL", () => {
  it.each([
    ["/?tab=market&view=map&creditable=true", "/", 1],
    ["/?tab=market&view=map&creditable=false", "/", undefined],
    ["/market?scope=offers&creditable=true", "/market", 1],
    ["/market?scope=offers&creditDepth=2", "/market", 2],
  ])("normalizes %s with a replace redirect", async (url, pathname, depth) => {
    const router = await routerAt(url);
    expect(router.state.location.pathname).toBe(pathname);
    expect(search(router).creditDepth).toBe(depth);
    expect(search(router)).not.toHaveProperty("creditable");
    expect(router.history.length).toBe(1);
  });

  it("keeps the depth through a detail, a related resource, Get and its receipt, and back", async () => {
    const router = await routerAt("/market?scope=all&creditDepth=2");
    expect(search(router).creditDepth).toBe(2);

    await router.navigate({
      to: "/vouchers/$voucherAddress",
      params: { voucherAddress: VOUCHER },
      search: { from: "market" },
    });
    expect(router.state.location.pathname).toBe(`/vouchers/${VOUCHER}`);
    expect(search(router)).toMatchObject({ from: "market", creditDepth: 2 });

    await router.navigate({ to: "/pools/$poolAddress", params: { poolAddress: POOL } });
    expect(search(router).creditDepth).toBe(2);

    await router.navigate({ to: "/get/$voucherAddress", params: { voucherAddress: VOUCHER } });
    expect(search(router).creditDepth).toBe(2);

    await router.navigate({ to: "/routed-swaps/$trackingId", params: { trackingId: TRACKING } });
    expect(search(router).creditDepth).toBe(2);

    router.history.back();
    await settle(router);
    expect(router.state.location.pathname).toBe(`/get/${VOUCHER}`);
    expect(search(router).creditDepth).toBe(2);

    router.history.back();
    router.history.back();
    router.history.back();
    await settle(router);
    expect(router.state.location.pathname).toBe("/market");
    expect(search(router)).toMatchObject({ scope: "all", creditDepth: 2 });

    router.history.forward();
    await settle(router);
    expect(router.state.location.pathname).toBe(`/vouchers/${VOUCHER}`);
    expect(search(router).creditDepth).toBe(2);
  });

  it("lets an explicit change win over the kept depth", async () => {
    const router = await routerAt(`/vouchers/${VOUCHER}?creditDepth=1`);
    await router.navigate({
      to: "/get/$voucherAddress",
      params: { voucherAddress: VOUCHER },
      search: { creditDepth: undefined },
    });
    expect(search(router)).not.toHaveProperty("creditDepth");
  });

  it("does not carry the depth to a tab's own root", async () => {
    const router = await routerAt(`/vouchers/${VOUCHER}?creditDepth=1`);
    await router.navigate({ to: "/", search: { tab: "wallet" } });
    expect(search(router)).not.toHaveProperty("creditDepth");
  });

  it("reads an invalid depth on a detail screen as off", async () => {
    const router = await routerAt(`/get/${VOUCHER}?creditDepth=7`);
    const leaf = (router: Awaited<ReturnType<typeof routerAt>>) =>
      (router.state.matches.at(-1)?.search ?? {}) as Record<string, unknown>;
    expect(leaf(router).creditDepth).toBeUndefined();
    expect(leaf(await routerAt(`/get/${VOUCHER}?creditDepth=1`)).creditDepth).toBe(1);
  });
});
