import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { getRouter } from "#/router";

/**
 * Credit through the real route tree: the canonical `credit=1`, older
 * `creditDepth` and `creditable` links folded into it, and Credit kept from the
 * market through details, related resources, Get and its receipt, and
 * Back/Forward.
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

/** The leaf route's validated search: what a detail screen reads. */
function leaf(router: Awaited<ReturnType<typeof routerAt>>) {
  return (router.state.matches.at(-1)?.search ?? {}) as Record<string, unknown>;
}

async function settle(router: Awaited<ReturnType<typeof routerAt>>) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await router.load();
}

describe("Credit URL", () => {
  it.each([
    ["/?tab=market&view=map&creditable=true", "/", 1],
    ["/?tab=market&view=map&creditable=false", "/", undefined],
    ["/?tab=market&view=map&creditDepth=2", "/", 1],
    ["/?tab=market&view=map&credit=on", "/", undefined],
    ["/market?scope=offers&creditable=true", "/market", 1],
    ["/market?scope=offers&creditDepth=1", "/market", 1],
    ["/market?scope=offers&creditDepth=2", "/market", 1],
    ["/market?scope=offers&creditDepth=3", "/market", 1],
    ["/market?scope=offers&creditDepth=max", "/market", 1],
    ["/market?scope=offers&creditDepth=9", "/market", undefined],
    ["/market?scope=offers&credit=%221%22", "/market", 1],
    ["/market?scope=offers&credit=2", "/market", undefined],
    ["/market?scope=offers&credit=1&credit=1", "/market", undefined],
  ])("normalizes %s with a replace redirect", async (url, pathname, credit) => {
    const router = await routerAt(url);
    expect(router.state.location.pathname).toBe(pathname);
    expect(search(router).credit).toBe(credit);
    expect(search(router)).not.toHaveProperty("creditDepth");
    expect(search(router)).not.toHaveProperty("creditable");
    expect(router.history.length).toBe(1);
  });

  it("leaves a canonical Credit link as it is", async () => {
    const router = await routerAt("/market?scope=offers&credit=1");
    expect(search(router)).toMatchObject({ scope: "offers", credit: 1 });
    expect(router.state.location.href).toContain("credit=1");
  });

  it("keeps Credit through a detail, a related resource, Get and its receipt, and back", async () => {
    const router = await routerAt("/market?scope=all&credit=1");
    expect(search(router).credit).toBe(1);

    await router.navigate({
      to: "/vouchers/$voucherAddress",
      params: { voucherAddress: VOUCHER },
      search: { from: "market" },
    });
    expect(router.state.location.pathname).toBe(`/vouchers/${VOUCHER}`);
    expect(search(router)).toMatchObject({ from: "market", credit: 1 });

    await router.navigate({ to: "/pools/$poolAddress", params: { poolAddress: POOL } });
    expect(search(router).credit).toBe(1);

    await router.navigate({ to: "/get/$voucherAddress", params: { voucherAddress: VOUCHER } });
    expect(search(router).credit).toBe(1);

    await router.navigate({ to: "/routed-swaps/$trackingId", params: { trackingId: TRACKING } });
    expect(search(router).credit).toBe(1);

    router.history.back();
    await settle(router);
    expect(router.state.location.pathname).toBe(`/get/${VOUCHER}`);
    expect(search(router).credit).toBe(1);

    router.history.back();
    router.history.back();
    router.history.back();
    await settle(router);
    expect(router.state.location.pathname).toBe("/market");
    expect(search(router)).toMatchObject({ scope: "all", credit: 1 });

    router.history.forward();
    await settle(router);
    expect(router.state.location.pathname).toBe(`/vouchers/${VOUCHER}`);
    expect(search(router).credit).toBe(1);
  });

  it("lets an explicit change win over the kept Credit", async () => {
    const router = await routerAt(`/vouchers/${VOUCHER}?credit=1`);
    await router.navigate({
      to: "/get/$voucherAddress",
      params: { voucherAddress: VOUCHER },
      search: { credit: undefined },
    });
    expect(search(router)).not.toHaveProperty("credit");
  });

  it("does not carry Credit to a tab's own root", async () => {
    const router = await routerAt(`/vouchers/${VOUCHER}?credit=1`);
    await router.navigate({ to: "/", search: { tab: "wallet" } });
    expect(search(router)).not.toHaveProperty("credit");
  });

  it("reads a detail screen's older Credit link as on and anything else as off", async () => {
    expect(leaf(await routerAt(`/get/${VOUCHER}?credit=1`)).credit).toBe(1);
    expect(leaf(await routerAt(`/get/${VOUCHER}?creditDepth=2`)).credit).toBe(1);
    expect(leaf(await routerAt(`/get/${VOUCHER}?creditDepth=max`)).credit).toBe(1);
    expect(leaf(await routerAt(`/vouchers/${VOUCHER}?creditable=true`)).credit).toBe(1);
    expect(leaf(await routerAt(`/get/${VOUCHER}?creditDepth=7`)).credit).toBeUndefined();
    expect(leaf(await routerAt(`/get/${VOUCHER}?credit=yes`)).credit).toBeUndefined();
  });

  it("carries an older detail link's Credit onward as credit=1", async () => {
    const router = await routerAt(`/vouchers/${VOUCHER}?creditDepth=2`);
    await router.navigate({ to: "/get/$voucherAddress", params: { voucherAddress: VOUCHER } });
    expect(search(router).credit).toBe(1);
    expect(search(router)).not.toHaveProperty("creditDepth");
  });
});
