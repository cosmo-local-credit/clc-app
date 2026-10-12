import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

type RoutePolicy = {
  id: string;
  fullPath: string;
  source: string;
  navOwner?: "home" | "market" | "posts" | "wallet" | "voucher";
};

const ROUTES_DIR = resolve(import.meta.dirname);
const GENERATED_TREE = resolve(ROUTES_DIR, "../routeTree.gen.ts");

const routePolicy = [
  { id: "/_nav/", fullPath: "/", source: "_nav/index.tsx", navOwner: "home" },
  {
    id: "/_nav/catalogs/",
    fullPath: "/catalogs/",
    source: "_nav/catalogs/index.tsx",
    navOwner: "market",
  },
  {
    id: "/_nav/catalogs/$catalogId",
    fullPath: "/catalogs/$catalogId",
    source: "_nav/catalogs/$catalogId.tsx",
    navOwner: "wallet",
  },
  {
    id: "/_nav/offers/",
    fullPath: "/offers/",
    source: "_nav/offers/index.tsx",
    navOwner: "market",
  },
  {
    id: "/_nav/market/",
    fullPath: "/market/",
    source: "_nav/market/index.tsx",
    navOwner: "market",
  },
  { id: "/catalogs/create", fullPath: "/catalogs/create", source: "catalogs/create.tsx" },
  // $reportId is a directory, not a leaf: the owner edit route lives beside the
  // public detail one, and a leaf file with a sibling folder becomes a layout
  // with no Outlet.
  {
    id: "/_nav/posts/$reportId/",
    fullPath: "/posts/$reportId/",
    source: "_nav/posts/$reportId/index.tsx",
    navOwner: "posts",
  },
  {
    id: "/_nav/posts/$reportId/edit",
    fullPath: "/posts/$reportId/edit",
    source: "_nav/posts/$reportId/edit.tsx",
    navOwner: "posts",
  },
  // Static, so they win over $reportId: "new" must not be read as a report id.
  {
    id: "/_nav/posts/new",
    fullPath: "/posts/new",
    source: "_nav/posts/new.tsx",
    navOwner: "posts",
  },
  {
    id: "/_nav/posts/mine",
    fullPath: "/posts/mine",
    source: "_nav/posts/mine.tsx",
    navOwner: "posts",
  },
  {
    id: "/_nav/wallet/vouchers",
    fullPath: "/wallet/vouchers",
    source: "_nav/wallet/vouchers.tsx",
    navOwner: "wallet",
  },
  { id: "/_nav/pools/", fullPath: "/pools/", source: "_nav/pools/index.tsx", navOwner: "market" },
  {
    id: "/_nav/pools/$poolAddress/",
    fullPath: "/pools/$poolAddress/",
    source: "_nav/pools/$poolAddress/index.tsx",
    navOwner: "wallet",
  },
  {
    id: "/_nav/vouchers/$voucherAddress",
    fullPath: "/vouchers/$voucherAddress",
    source: "_nav/vouchers/$voucherAddress.tsx",
    navOwner: "voucher",
  },
  {
    id: "/_nav/vouchers/",
    fullPath: "/vouchers/",
    source: "_nav/vouchers/index.tsx",
    navOwner: "market",
  },
  { id: "/onboarding", fullPath: "/onboarding", source: "onboarding.tsx" },
  { id: "/install", fullPath: "/install", source: "install.tsx" },
  {
    id: "/settings/profile",
    fullPath: "/settings/profile",
    source: "settings/profile.tsx",
  },
  { id: "/posts/", fullPath: "/posts/", source: "posts/index.tsx" },
  { id: "/settings/", fullPath: "/settings/", source: "settings/index.tsx" },
  {
    id: "/vouchers/create/$step",
    fullPath: "/vouchers/create/$step",
    source: "vouchers/create/$step.tsx",
  },
  {
    id: "/vouchers/create/receipt",
    fullPath: "/vouchers/create/receipt",
    source: "vouchers/create/receipt.tsx",
  },
  {
    id: "/pools/create/$step",
    fullPath: "/pools/create/$step",
    source: "pools/create/$step.tsx",
  },
  {
    id: "/pools/create/receipt",
    fullPath: "/pools/create/receipt",
    source: "pools/create/receipt.tsx",
  },
  { id: "/wallet/", fullPath: "/wallet/", source: "wallet/index.tsx" },
  { id: "/wallet/cash", fullPath: "/wallet/cash", source: "wallet/cash.tsx" },
  { id: "/wallet/collect", fullPath: "/wallet/collect", source: "wallet/collect.tsx" },
  { id: "/wallet/receive", fullPath: "/wallet/receive", source: "wallet/receive.tsx" },
  { id: "/wallet/top-up", fullPath: "/wallet/top-up", source: "wallet/top-up.tsx" },
  { id: "/wallet/send/", fullPath: "/wallet/send/", source: "wallet/send/index.tsx" },
  {
    id: "/wallet/send/amount",
    fullPath: "/wallet/send/amount",
    source: "wallet/send/amount.tsx",
  },
  {
    id: "/wallet/send/receipt",
    fullPath: "/wallet/send/receipt",
    source: "wallet/send/receipt.tsx",
  },
  {
    id: "/pools/$poolAddress/swap/",
    fullPath: "/pools/$poolAddress/swap/",
    source: "pools/$poolAddress/swap/index.tsx",
  },
  {
    id: "/pools/$poolAddress/swap/receipt",
    fullPath: "/pools/$poolAddress/swap/receipt",
    source: "pools/$poolAddress/swap/receipt.tsx",
  },
] satisfies RoutePolicy[];

function interfaceKeys(source: string, interfaceName: string): string[] {
  const body = source.match(
    new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  if (!body) throw new Error(`Missing ${interfaceName} in generated route tree`);
  return [...body.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1]);
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.startsWith("-") ? [path] : [];
  });
}

describe("bottom-navigation route policy", () => {
  it("keeps browse routes in the shared shell and focused routes outside it without changing URLs", () => {
    const generatedSource = readFileSync(GENERATED_TREE, "utf8");
    const routeIds = interfaceKeys(generatedSource, "FileRoutesById");
    const fullPaths = interfaceKeys(generatedSource, "FileRoutesByFullPath");

    for (const route of routePolicy) {
      expect(routeIds, `${route.fullPath} should use route ID ${route.id}`).toContain(route.id);
      expect(fullPaths, `${route.id} should keep public path ${route.fullPath}`).toContain(
        route.fullPath,
      );

      if (route.navOwner) {
        const routeSource = readFileSync(resolve(ROUTES_DIR, route.source), "utf8");
        expect(routeSource).toContain(`navOwner: "${route.navOwner}"`);
      }
    }

    expect(fullPaths.sort()).toEqual(routePolicy.map((route) => route.fullPath).sort());

    const navDirectory = resolve(ROUTES_DIR, "_nav");
    for (const file of routeFiles(navDirectory)) {
      expect(
        readFileSync(file, "utf8"),
        `${relative(ROUTES_DIR, file)} must declare navOwner`,
      ).toMatch(/navOwner:\s*"(?:home|market|posts|wallet|voucher)"/);
    }
  });
});
