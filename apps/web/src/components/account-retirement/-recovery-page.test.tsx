import { BackendApiError } from "@clc/api/client/errors";
import type { SessionResult } from "@clc/api/features/auth/client";
import { accountRetirementKeys } from "@clc/api/features/account-retirement/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

const { account, assets, disconnect, getSession, logout, restore } = vi.hoisted(() => ({
  account: {
    address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as `0x${string}`,
    chainId: 100,
    connector: { id: "test" },
    status: "connected" as const,
  },
  assets: { current: {} as Record<string, unknown> },
  disconnect: vi.fn(),
  getSession: vi.fn(),
  logout: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useConnection: () => account,
  useDisconnect: () => ({ mutateAsync: disconnect }),
}));
vi.mock("#/providers/auth-bootstrap", () => ({ useReconnectAttempted: () => true }));
vi.mock("#/lib/api/auth", () => ({
  authClient: { getSession: () => getSession(), logout: () => logout() },
}));
vi.mock("#/lib/api/account-retirement", () => ({ accountRetirementClient: { restore } }));
vi.mock("#/features/account-retirement/hooks/use-recovery-assets", () => ({
  useRecoveryAssets: () => assets.current,
}));
vi.mock("./recovery-resources", () => ({
  RecoveryVoucherRow: ({ token }: { token: { symbol: string } }) => <li>owned {token.symbol}</li>,
  RecoveryPoolRow: ({ pool }: { pool: { name: string } }) => <li>owned {pool.name}</li>,
}));
vi.mock("#/components/wallet", async () => ({
  HoldingBalance: ({ token }: { token: { amount: string } }) => <span>{token.amount}</span>,
  TokenLogo: () => null,
}));

import { AccountLifecycleGate } from "#/features/account-retirement/ui/account-lifecycle-gate";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { RecoveryPage } from "./recovery-page";

const CLOSES_AT = "2027-05-11T10:00:00Z";
const CAPABILITIES = {
  canUseApp: false,
  canRecoverAssets: true,
  canTransferResources: true,
  canRestoreAccount: true,
};
const RETIRING: SessionResult = {
  address: ADDRESS,
  chainId: 100,
  role: "USER",
  accountLifecycle: "RETIREMENT_SCHEDULED",
  closesAt: CLOSES_AT,
  capabilities: CAPABILITIES,
};
const ACTIVE: SessionResult = { address: ADDRESS, chainId: 100, role: "USER" };

function loadedAssets(overrides: Record<string, unknown> = {}) {
  return {
    holdings: [{ id: "0xh1", symbol: "HOLD", name: "Held Voucher", amount: "12" }],
    issued: [{ id: "0xi1", symbol: "OWN", name: "Owned Voucher", amount: "3" }],
    vouchersPending: false,
    vouchersError: false,
    retryVouchers: vi.fn(),
    hasMoreBalances: false,
    fetchingMoreBalances: false,
    loadMoreBalances: vi.fn(),
    pools: [{ address: "0xp1", name: "Village Pool" }],
    poolsPending: false,
    poolsError: false,
    retryPools: vi.fn(),
    hasMorePools: false,
    fetchingMorePools: false,
    loadMorePools: vi.fn(),
    ...overrides,
  };
}

function renderRecovery(session: SessionResult | Error | "pending" = RETIRING) {
  if (session === "pending") getSession.mockReturnValue(new Promise(() => {}));
  else if (session instanceof Error) getSession.mockRejectedValue(session);
  else getSession.mockResolvedValue(session);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <AccountLifecycleGate>
          <Outlet />
        </AccountLifecycleGate>
      </QueryClientProvider>
    ),
  });
  const history = createMemoryHistory({ initialEntries: ["/recovery"] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <h1>Market</h1> }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/recovery",
        component: () => <RecoveryPage />,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/wallet/send",
        component: () => <h1>Send</h1>,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/wallet/receive",
        component: () => <h1>Receive</h1>,
      }),
    ]),
    history,
  });
  render(<RouterProvider router={router} />);
  return { history, queryClient };
}

beforeEach(() => {
  assets.current = loadedAssets();
  disconnect.mockReset().mockResolvedValue(undefined);
  getSession.mockReset();
  logout.mockReset().mockResolvedValue(undefined);
  restore.mockReset();
});

describe("recovery shell", () => {
  it("states the exact closing date and offers recovery actions", async () => {
    renderRecovery();

    await screen.findByRole("heading", { name: "Account retired" });
    const time = screen.getByText((_, node) => node?.tagName === "TIME");
    expect(time.getAttribute("datetime")).toBe(CLOSES_AT);
    expect(time.textContent).toMatch(/2027/);
    expect(screen.getByRole("button", { name: "Restore account" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Send" }).getAttribute("href")).toBe("/wallet/send");
    expect(screen.getByRole("link", { name: "Receive" }).getAttribute("href")).toBe(
      "/wallet/receive",
    );
    expect(screen.getByText("Held Voucher")).toBeTruthy();
    expect(screen.getByText("owned OWN")).toBeTruthy();
    expect(screen.getByText("owned Village Pool")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("offers nothing that leads back into the app", async () => {
    renderRecovery();
    await screen.findByRole("heading", { name: "Account retired" });

    for (const name of [
      "Market",
      "Create voucher",
      "Create pool",
      "Edit profile",
      "Settings",
      "Wallet",
    ]) {
      expect(screen.queryByRole("link", { name }), name).toBeNull();
    }
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("shows only what the capabilities allow", async () => {
    renderRecovery({
      ...RETIRING,
      capabilities: {
        canUseApp: false,
        canRecoverAssets: false,
        canTransferResources: false,
        canRestoreAccount: false,
      },
    });

    await screen.findByRole("heading", { name: "Account retired" });
    expect(screen.queryByRole("button", { name: "Restore account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Send" })).toBeNull();
    expect(screen.queryByText("Holdings")).toBeNull();
    expect(screen.queryByText("My Vouchers")).toBeNull();
    expect(screen.queryByText("My Pools")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it.each([
    ["ERASURE_PENDING", "Account erasure pending"],
    ["ERASED", "Account erased"],
  ] as const)("names the %s state", async (lifecycle, title) => {
    renderRecovery({ ...RETIRING, accountLifecycle: lifecycle, closesAt: null });
    await screen.findByRole("heading", { name: title });
    expect(screen.queryByText("Closing date")).toBeNull();
  });

  it("shows nothing restricted while the session loads", async () => {
    renderRecovery("pending");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("heading", { name: "Account retired" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore account" })).toBeNull();
  });

  it("offers a retry and nothing else when the session check fails", async () => {
    renderRecovery(new Error("offline"));

    await screen.findByText("Session check failed");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("sends an active account back to the app", async () => {
    const { history } = renderRecovery(ACTIVE);

    await screen.findByRole("heading", { name: "Market" });
    expect(history.location.pathname).toBe("/");
  });

  it("explains an empty or failed list instead of drawing an empty box", async () => {
    const retryVouchers = vi.fn();
    const retryPools = vi.fn();
    assets.current = loadedAssets({
      holdings: [],
      issued: [],
      vouchersError: true,
      retryVouchers,
      pools: [],
    });
    renderRecovery();

    await screen.findByRole("heading", { name: "Account retired" });
    expect(screen.getAllByText("Couldn't load vouchers.")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]!);
    expect(retryVouchers).toHaveBeenCalled();
    expect(screen.getByText("No pools.")).toBeTruthy();
    expect(retryPools).not.toHaveBeenCalled();
  });

  it("shows pools failing and loading on their own", async () => {
    const retryPools = vi.fn();
    assets.current = loadedAssets({ poolsError: true, retryPools });
    renderRecovery();
    await screen.findByText("Couldn't load your pools.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryPools).toHaveBeenCalled();
  });

  it("shows loading lists and pages for more", async () => {
    const loadMoreBalances = vi.fn();
    const loadMorePools = vi.fn();
    assets.current = loadedAssets({
      vouchersPending: true,
      hasMoreBalances: true,
      loadMoreBalances,
      hasMorePools: true,
      loadMorePools,
    });
    renderRecovery();

    await screen.findByRole("heading", { name: "Account retired" });
    expect(screen.getAllByText("Loading vouchers…").length).toBeGreaterThan(0);
    const loadMore = screen.getAllByRole("button", { name: "Load more" });
    expect(loadMore).toHaveLength(2);
    fireEvent.click(loadMore[0]!);
    fireEvent.click(loadMore[1]!);
    expect(loadMoreBalances).toHaveBeenCalled();
    expect(loadMorePools).toHaveBeenCalled();
  });

  it("shows pools loading", async () => {
    assets.current = loadedAssets({ poolsPending: true });
    renderRecovery();
    await screen.findByText("Loading pools…");
  });
});

describe("restoring the account", () => {
  it("restores, drops the retired view's caches and returns to the app", async () => {
    restore.mockImplementation(async () => {
      getSession.mockResolvedValue(ACTIVE);
      return {
        accountLifecycle: "ACTIVE",
        closesAt: null,
        capabilities: { ...CAPABILITIES, canUseApp: true, canRestoreAccount: false },
        retirement: null,
      };
    });
    const { history, queryClient } = renderRecovery();
    await screen.findByRole("heading", { name: "Account retired" });
    queryClient.setQueryData(["clc", "wants", "mine"], ["hidden while retired"]);

    fireEvent.click(screen.getByRole("button", { name: "Restore account" }));

    await screen.findByRole("heading", { name: "Market" });
    expect(history.location.pathname).toBe("/");
    expect(restore).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(["clc", "wants", "mine"])).toBeUndefined();
  });

  it("is busy while restoring", async () => {
    restore.mockReturnValue(new Promise(() => {}));
    renderRecovery();
    await screen.findByRole("heading", { name: "Account retired" });

    fireEvent.click(screen.getByRole("button", { name: "Restore account" }));

    const busy = await screen.findByRole("button", { name: "Restoring…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.hasAttribute("disabled")).toBe(true);
  });

  it("keeps the shell, reports the refusal and retries", async () => {
    restore.mockRejectedValueOnce(new BackendApiError(409, "The recovery period has ended."));
    renderRecovery();
    await screen.findByRole("heading", { name: "Account retired" });

    fireEvent.click(screen.getByRole("button", { name: "Restore account" }));
    await screen.findByText("The recovery period has ended.");
    expect(screen.getByRole("heading", { name: "Account retired" })).toBeTruthy();

    restore.mockImplementation(async () => {
      getSession.mockResolvedValue(ACTIVE);
      return {
        accountLifecycle: "ACTIVE",
        closesAt: null,
        capabilities: CAPABILITIES,
        retirement: null,
      };
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore account" }));
    await screen.findByRole("heading", { name: "Market" });
    expect(restore).toHaveBeenCalledTimes(2);
  });
});

describe("signing out of a retiring account", () => {
  it("clears this account's private caches and disconnects", async () => {
    const { queryClient } = renderRecovery();
    await screen.findByRole("heading", { name: "Account retired" });
    queryClient.setQueryData(accountRetirementKeys.preview(ADDRESS), { closesAt: CLOSES_AT });
    queryClient.setQueryData(["clc", "wants", "mine"], ["private"]);
    queryClient.setQueryData(["address-book", ADDRESS], ["private"]);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(disconnect).toHaveBeenCalled());
    expect(logout).toHaveBeenCalled();
    expect(queryClient.getQueryData(accountRetirementKeys.preview(ADDRESS))).toBeUndefined();
    expect(queryClient.getQueryData(["clc", "wants", "mine"])).toBeUndefined();
    expect(queryClient.getQueryData(["address-book", ADDRESS])).toBeUndefined();
    expect(queryClient.getQueryData(authSessionQueryKey)).toBeUndefined();
  });
});
