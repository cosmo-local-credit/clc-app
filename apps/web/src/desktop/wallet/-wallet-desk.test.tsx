import type { RetirementRequest } from "@clc/api/features/retirement/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const OTHER = "0x2b4F29a8438cc9c644F6Cf1E9C287fF2fe84674e";

const mocks = vi.hoisted(() => ({
  catalogs: vi.fn(),
  listRetirements: vi.fn(),
  cancelRetirement: vi.fn(),
  navigate: vi.fn(),
  profile: { data: undefined as unknown },
  usage: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  preview: {
    holdings: [] as unknown[],
    issued: [] as unknown[],
    isTruncated: false,
    isPending: false,
    isIssuedError: false,
    isBalanceError: false,
    isFetching: false,
    refetchIssued: vi.fn(),
    refetchBalances: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => undefined,
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    children: React.ReactNode;
  }) => {
    const pathname = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    const query = new URLSearchParams(search).toString();
    return (
      <a href={query ? `${pathname}?${query}` : pathname} {...props}>
        {children}
      </a>
    );
  },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: true,
    address: ADDRESS,
    session: { address: ADDRESS },
  }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => mocks.profile }));
vi.mock("#/hooks/use-resource-usage", () => ({ useResourceUsage: () => mocks.usage }));
vi.mock("#/features/wallet/hooks/use-wallet-voucher-preview", () => ({
  useWalletVoucherPreview: () => mocks.preview,
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAccountActivityInfinite: () => ({
    data: { pages: [{ activity: [] }] },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/features/pools/hooks/use-user-pools", () => ({
  useOwnedPoolsInfinite: () => ({
    data: { pages: [{ pools: [] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    hasNextPage: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useSafeOwnersSignedBy: () => new Set<string>(),
}));
vi.mock("#/features/wallet/hooks/use-holding-pools", () => ({
  useHoldingPools: () =>
    new Map([
      [
        "0x1111111111111111111111111111111111111111",
        { pools: [{ name: "Riverside Pool" }, { name: "Second" }], more: false },
      ],
    ]),
}));
vi.mock("#/features/wallet/hooks/use-wallet-valuation", () => ({
  useWalletValuation: () => ({
    isPending: false,
    isError: false,
    unit: "USD",
    total: "10",
    values: new Map(),
  }),
}));
vi.mock("#/lib/api/wants", () => ({
  wantsClient: { mine: () => Promise.resolve({ wants: [], first: 0, last: 0 }) },
}));
vi.mock("#/lib/api/catalogs", () => ({ catalogsClient: { mine: mocks.catalogs } }));
vi.mock("#/lib/api/retirement", () => ({
  retirementClient: { listMine: mocks.listRetirements, cancel: mocks.cancelRetirement },
}));
// Only the row key is used; the Activity screen is its own module.
vi.mock("#/desktop/activity/activity-desk", () => ({ activityRowKey: () => "row" }));

import { WalletDesk } from "./wallet-desk";

const HELD = {
  id: "0x1111111111111111111111111111111111111111",
  contractAddress: "0x1111111111111111111111111111111111111111",
  symbol: "RIV",
  name: "Riverside Voucher",
  amount: "12.50",
  balance: "1250",
  fiat: "",
  color: "",
  kind: "voucher",
  tokenDecimals: 2,
};

const CATALOG = {
  id: "7",
  name: "Local makers",
  description: null,
  imageUrl: null,
  locationName: "Sarajevo",
  tags: [],
};

function usage(catalogs: { used: number; limit: number; canCreate: boolean }) {
  const open = { used: 0, limit: 5, unlimited: false, canCreate: true };
  return {
    vouchers: open,
    pools: open,
    wants: open,
    offers: open,
    catalogs: { ...catalogs, unlimited: false },
  };
}

function request(id: number, status: RetirementRequest["status"], requester = ADDRESS) {
  return {
    id,
    resourceType: "voucher",
    resourceAddress: ADDRESS,
    resourceName: `Voucher ${id}`,
    symbol: `V${id}`,
    chainId: 100,
    requesterAddress: requester,
    ownerAddress: requester,
    reason: `Reason ${id}`,
    status,
    requestedAt: "2026-10-25T12:00:00Z",
    decisionAt: null,
    decisionBy: null,
    decisionReason: null,
    snapshot: {},
    decisionSnapshot: null,
  } as unknown as RetirementRequest;
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WalletDesk />
    </QueryClientProvider>,
  );
}

function section(name: string) {
  return screen.getByRole("heading", { level: 2, name }).closest("section") as HTMLElement;
}

function setHoldingsWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.usage.data = usage({ used: 1, limit: 3, canCreate: true });
  mocks.usage.isError = false;
  mocks.catalogs.mockResolvedValue({ catalogs: [CATALOG], nextCursor: null });
  mocks.listRetirements.mockResolvedValue([]);
  mocks.cancelRetirement.mockResolvedValue(undefined);
  mocks.profile.data = {
    name: "Amina",
    email: "amina@example.com",
    phone: "",
    avatarUrl: "https://storage.example/a.webp",
  };
  mocks.preview.holdings = [HELD];
  mocks.preview.issued = [];
  mocks.preview.isTruncated = false;
});

afterEach(() => {
  // Restore jsdom's own `clientWidth` (0) for the next test.
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

describe("Wallet structure", () => {
  it("has one page heading and tells the two cash destinations apart", () => {
    mount();

    expect(screen.getAllByRole("heading", { level: 1 }).map((node) => node.textContent)).toEqual([
      "Wallet",
    ]);
    expect(
      within(screen.getByRole("region", { name: "Wallet actions" }))
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Send", "/wallet/send"],
      ["Receive", "/wallet/receive"],
      ["Add / withdraw", "/wallet/top-up"],
      ["Other cash options", "/wallet/cash"],
    ]);
  });
});

describe("Wallet catalogs", () => {
  it("lists the catalogs the account owns and offers Create while the allowance has room", async () => {
    mount();

    const catalogs = section("My Catalogs");
    const row = await within(catalogs).findByRole("link", { name: /Local makers/ });
    expect(row.getAttribute("href")).toBe("/catalogs/7");
    expect(within(catalogs).getByText("1 of 3 used")).toBeTruthy();
    expect(within(catalogs).getByRole("link", { name: "Create" }).getAttribute("href")).toBe(
      "/catalogs/create",
    );
  });

  it("withholds Create and says why once the allowance is used up", async () => {
    mocks.usage.data = usage({ used: 3, limit: 3, canCreate: false });
    mount();

    const catalogs = section("My Catalogs");
    await within(catalogs).findByRole("link", { name: /Local makers/ });
    expect(within(catalogs).queryByRole("link", { name: "Create" })).toBeNull();
    expect(
      within(catalogs).getByText("Limit reached. Ask an administrator to increase your allowance."),
    ).toBeTruthy();
  });

  it("shows the empty state and recovers from a failed load", async () => {
    mocks.catalogs
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ catalogs: [], nextCursor: null });
    mount();

    const catalogs = section("My Catalogs");
    expect(await within(catalogs).findByText("Couldn't load catalogs.")).toBeTruthy();
    fireEvent.click(within(catalogs).getByRole("button", { name: "Try again" }));
    expect(await within(catalogs).findByText("You haven't created a catalog yet.")).toBeTruthy();
    expect(mocks.catalogs).toHaveBeenCalledTimes(2);
  });
});

describe("Wallet retirement requests", () => {
  it("has no section until there is a request to show", async () => {
    mount();
    await waitFor(() => expect(mocks.listRetirements).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Retirement requests" })).toBeNull();
  });

  it("shows each request's state and lets only the requester cancel a pending one", async () => {
    mocks.listRetirements.mockResolvedValue([
      request(1, "pending"),
      request(2, "approved"),
      request(3, "pending", OTHER),
    ]);
    mount();

    const requests = await waitFor(() => section("Retirement requests"));
    expect(within(requests).getAllByText("Awaiting admin review")).toHaveLength(2);
    expect(within(requests).getByText("Retirement approved")).toBeTruthy();
    const cancels = within(requests).getAllByRole("button", { name: "Cancel request" });
    expect(cancels).toHaveLength(1);

    fireEvent.click(cancels[0]);
    await waitFor(() => expect(mocks.cancelRetirement).toHaveBeenCalledWith(1));
  });

  it("recovers from an unavailable history", async () => {
    mocks.listRetirements
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([request(4, "rejected")]);
    mount();

    const requests = await waitFor(() => section("Retirement requests"));
    expect(within(requests).getByText("Could not load retirement requests.")).toBeTruthy();
    fireEvent.click(within(requests).getByRole("button", { name: "Try again" }));
    expect(await within(requests).findByText("Request rejected")).toBeTruthy();
  });
});

describe("Wallet profile action", () => {
  it("asks an account with gaps to finish its profile, and remembers a dismissal", () => {
    mocks.profile.data = { name: "Paper wallet", email: "", phone: "", avatarUrl: null };
    const first = mount();

    expect(screen.getByRole("link", { name: "Complete your profile" }).getAttribute("href")).toBe(
      "/settings/profile",
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("link", { name: "Complete your profile" })).toBeNull();
    first.unmount();

    mount();
    expect(screen.queryByRole("link", { name: "Complete your profile" })).toBeNull();
  });

  it("stays away when the profile is complete or has not loaded", () => {
    mount();
    expect(screen.queryByRole("link", { name: "Complete your profile" })).toBeNull();
    cleanup();

    mocks.profile.data = undefined;
    mount();
    expect(screen.queryByRole("link", { name: "Complete your profile" })).toBeNull();
  });
});

describe("Wallet holdings columns", () => {
  const POOLS = /^Pools$/;

  it("keeps Pools as its own column while Holdings has room", () => {
    setHoldingsWidth(900);
    mount();

    const table = screen.getByRole("table", { name: "Holdings" });
    expect(within(table).getByRole("columnheader", { name: POOLS })).toBeTruthy();
    expect(within(table).getByText("Riverside Pool")).toBeTruthy();
  });

  it("folds Pools into the voucher cell when Holdings is narrow, keeping the data", () => {
    setHoldingsWidth(600);
    mount();

    const table = screen.getByRole("table", { name: "Holdings" });
    expect(within(table).queryByRole("columnheader", { name: POOLS })).toBeNull();
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    // Name, symbol and pool are all still on the row.
    const row = within(table).getByRole("row", { name: /Riverside Voucher/ });
    expect(within(row).getByText("RIV")).toBeTruthy();
    expect(within(row).getByText("Riverside Pool")).toBeTruthy();
  });

  it("says a sort covers only the rows of a preview that was cut", () => {
    mocks.preview.isTruncated = true;
    mount();

    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Balance/ }));
    expect(screen.getByRole("status").textContent).toContain("rows loaded so far");
  });
});
