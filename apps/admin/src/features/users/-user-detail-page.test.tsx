import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AdminUser } from "@clc/api/features/admin/client";
import { UserDetailPage } from "./user-detail-page";
import { parseUserDetailSearch } from "./user-detail-search";

const ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645";
const OTHER_ADDRESS = "0x4D478F0e1c1b0b3d0F5b8d2cbde4581dB6369abc";

const PIN = { lat: -1.3, lng: 36.85 };

const reverseLocation = vi.hoisted(() => vi.fn());

vi.mock("#/lib/geo-client", () => ({
  reverseLocation: (...args: unknown[]) => reverseLocation(...args),
}));

// The map itself cannot run here — jsdom has no WebGL — so it is stubbed down to
// the one thing this screen asks of it: reporting where the operator clicked.
// Only the sheet's map is interactive; the record's is a picture, and stubbing it
// as one keeps a single "Set pin" control on the page.
// The photo row is hidden where the upload service is unconfigured, and the test
// env has no VITE_STORAGE_URL.
vi.mock("#/lib/storage", () => ({ isStorageConfigured: true }));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({
    mutateAsync: () =>
      Promise.resolve({
        url: "https://cdn.test/profile/new_400_a3f91c2e.webp",
        width: 400,
        height: 400,
        byteSize: 6516,
        contentType: "image/webp",
      }),
    reset: () => {},
    isPending: false,
    isError: false,
  }),
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: ({ onLocationChange }: { onLocationChange?: (lat: number, lng: number) => void }) =>
    onLocationChange ? (
      <button type="button" onClick={() => onLocationChange(PIN.lat, PIN.lng)}>
        Set pin
      </button>
    ) : (
      <div>Map</div>
    ),
}));

const listUsers = vi.hoisted(() => vi.fn());
const getAccountStats = vi.hoisted(() => vi.fn());
const updateUserProfile = vi.hoisted(() => vi.fn());
const updateUserLimits = vi.hoisted(() => vi.fn());
const updateUserRole = vi.hoisted(() => vi.fn());
const sessionRole = vi.hoisted(() => ({ value: "SUPERADMIN" }));
const getLatestAccountTokens = vi.hoisted(() => vi.fn());
const getAccountTransfers = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: {
    auth: {
      getSession: () =>
        Promise.resolve({ address: OTHER_ADDRESS, chainId: 100, role: sessionRole.value }),
    },
    admin: {
      listUsers: (...args: unknown[]) => listUsers(...args),
      getAccountStats: (...args: unknown[]) => getAccountStats(...args),
      updateUserProfile: (...args: unknown[]) => updateUserProfile(...args),
      updateUserLimits: (...args: unknown[]) => updateUserLimits(...args),
      updateUserRole: (...args: unknown[]) => updateUserRole(...args),
    },
    accounts: {
      getLatestAccountTokens: (...args: unknown[]) => getLatestAccountTokens(...args),
      getAccountTransfers: (...args: unknown[]) => getAccountTransfers(...args),
    },
  },
}));

function account(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 4210,
    ethereumAddress: ADDRESS,
    username: "ada",
    name: "Ada Lovelace",
    email: "ada@example.test",
    phone: "+254700000000",
    country: "KE",
    role: "USER",
    status: "PENDING",
    maxPools: 10,
    maxTokens: 20,
    maxCatalogs: 1,
    maxOffers: 3,
    maxWants: 3,
    createdAt: "2026-08-13T11:00:00Z",
    updatedAt: "2026-08-13T11:00:00Z",
    avatarUrl: null,
    locationName: null,
    geoLat: null,
    geoLng: null,
    ...overrides,
  };
}

function token(id: number) {
  return {
    id,
    tokenAddress: `0x${id.toString(16).padStart(40, "0")}`,
    tokenSymbol: `TK${id}`,
    tokenName: `Token ${id}`,
    tokenDecimals: 6,
    balance: "1500000",
    iconUrl: null,
    lastDateBlock: "2026-08-13T11:00:00Z",
  };
}

// Entered from the accounts list, as an operator actually arrives: Back has
// somewhere to go, which is the whole point of the history assertions below.
function transfer(id: number) {
  return {
    id,
    txHash: `0x${id.toString(16)}`,
    dateBlock: "2026-08-13T11:00:00Z",
    direction: "IN" as const,
    counterpartyAddress: OTHER_ADDRESS,
    senderAddress: OTHER_ADDRESS,
    recipientAddress: ADDRESS,
    tokenAddress: OTHER_ADDRESS,
    tokenSymbol: "TK1",
    tokenName: "Token 1",
    tokenDecimals: 6,
    amount: "1500000",
    success: true,
  };
}

function renderDetailRoute(entries = ["/users", `/users/${ADDRESS}`]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const detailRoute = createRoute({
    getParentRoute: () => root,
    path: "/users/$address",
    validateSearch: parseUserDetailSearch,
    component: function DetailRoute() {
      return (
        // The address is fixed by the history entry; the search parameter is what
        // these tests exercise.
        <UserDetailPage address={ADDRESS} search={detailRoute.useSearch()} />
      );
    },
  });
  const listRoute = createRoute({
    getParentRoute: () => root,
    path: "/users",
    component: () => <p>accounts</p>,
  });

  const router = createRouter({
    routeTree: root.addChildren([detailRoute, listRoute]),
    history: createMemoryHistory({ initialEntries: entries }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

// jest-dom matchers are not wired into this suite, so field values are read off
// the element rather than asserted with toHaveValue.
function fieldValue(name: string): string {
  const field = screen.getByRole("textbox", { name });
  return field instanceof HTMLInputElement ? field.value : "";
}

/** Every action is a button in the header; editing is one click. */
async function openProfileSheet() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit profile" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Full name" })).toBeTruthy());
}

beforeEach(() => {
  for (const mock of [
    listUsers,
    getAccountStats,
    updateUserProfile,
    updateUserLimits,
    updateUserRole,
    getLatestAccountTokens,
    getAccountTransfers,
    reverseLocation,
  ]) {
    mock.mockReset();
  }
  sessionRole.value = "SUPERADMIN";
});

describe("UserDetailPage", () => {
  it("leads with identity and the actions an operator came to take", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [token(1)] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    renderDetailRoute();

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Ada Lovelace");
    // Once under the name, once in the record beside email and phone. The
    // record's term and definition are wrapped, so the role has no accessible
    // name; the label's next sibling is the value in both places.
    const usernameLabels = screen.getAllByText("Username");
    expect(usernameLabels.length).toBe(2);
    for (const label of usernameLabels) {
      expect(label.nextElementSibling?.textContent).toBe("ada");
    }
    // Every action is a button: nothing an operator came here to do costs a click
    // to find. Approval leads, banning is last and destructive.
    expect(screen.getByRole("button", { name: "Approve account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ban user" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /actions/i })).toBeNull();
  });

  it("lets only a superadmin confirm promotion to Admin", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    updateUserRole.mockResolvedValue(account({ role: "ADMIN" }));

    renderDetailRoute();
    await waitFor(() => expect(screen.getByRole("button", { name: "Make admin" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Make admin" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make admin" }));

    await waitFor(() => expect(updateUserRole).toHaveBeenCalledWith(ADDRESS, "ADMIN"));
  });

  it("lets a superadmin confirm demotion to User", async () => {
    listUsers.mockResolvedValue({
      users: [account({ role: "ADMIN", status: "APPROVED" })],
      first: 0,
      last: 0,
      receivedCount: 1,
    });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    updateUserRole.mockResolvedValue(account({ role: "USER", status: "APPROVED" }));

    renderDetailRoute();
    await waitFor(() => expect(screen.getByRole("button", { name: "Make user" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Make user" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make user" }));

    await waitFor(() => expect(updateUserRole).toHaveBeenCalledWith(ADDRESS, "USER"));
  });

  it("never offers to change a Superadmin target", async () => {
    listUsers.mockResolvedValue({
      users: [account({ role: "SUPERADMIN", status: "APPROVED" })],
      first: 0,
      last: 0,
      receivedCount: 1,
    });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    renderDetailRoute();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Make admin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Make user" })).toBeNull();
  });

  it("keeps the confirmation open when role mutation fails", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    updateUserRole.mockRejectedValue(new Error("Role update failed"));

    renderDetailRoute();
    await waitFor(() => expect(screen.getByRole("button", { name: "Make admin" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Make admin" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make admin" }));

    await waitFor(() => expect(updateUserRole).toHaveBeenCalledWith(ADDRESS, "ADMIN"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("hides role controls from an Admin operator", async () => {
    sessionRole.value = "ADMIN";
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    renderDetailRoute();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Make admin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Make user" })).toBeNull();
  });

  it("names an account with no name rather than rendering an empty title", async () => {
    listUsers.mockResolvedValue({
      users: [account({ name: "" })],
      first: 0,
      last: 0,
      receivedCount: 1,
    });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    renderDetailRoute();

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unnamed account"),
    );
  });

  it("says when an account has no username", async () => {
    listUsers.mockResolvedValue({
      users: [account({ username: null })],
      first: 0,
      last: 0,
      receivedCount: 1,
    });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    renderDetailRoute();

    await waitFor(() => expect(screen.getAllByText("Username").length).toBe(2));
    for (const label of screen.getAllByText("Username")) {
      expect(label.nextElementSibling?.textContent).toBe("None");
    }
  });

  it("shows the figures the stats endpoint returns", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [token(1), token(2)] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    getAccountStats.mockResolvedValue({
      reports: 3,
      vouchers: 2,
      poolMemberships: 1,
      transactions: 118,
      swaps: 4,
      partners: 9,
    });

    renderDetailRoute();

    const summary = () => within(screen.getByRole("region", { name: "Account summary" }));
    await waitFor(() => expect(summary().getByText("118")).toBeTruthy());
    for (const figure of ["4", "2", "9", "3", "1"]) {
      expect(summary().getAllByText(figure).length).toBeGreaterThan(0);
    }
    expect(summary().queryAllByText("unavailable")).toHaveLength(0);
  });

  it("marks the chain figures unavailable when the federation database answers nothing", async () => {
    // clc-core returns null for those three rather than zero, and a zero would read
    // as "this account has never transacted".
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    getAccountStats.mockResolvedValue({
      reports: 3,
      vouchers: 2,
      poolMemberships: 1,
      transactions: null,
      swaps: null,
      partners: null,
    });

    renderDetailRoute();

    const summary = () => within(screen.getByRole("region", { name: "Account summary" }));
    await waitFor(() => expect(summary().getAllByText("unavailable")).toHaveLength(3));
    expect(summary().getByText("3")).toBeTruthy();
  });

  it("marks the open tab as selected, with a style keyed to that state", async () => {
    // The regression this guards: the highlight was keyed on `data-selected`,
    // which Base UI never emits — its state attribute is `data-active` and the
    // element carries aria-selected. The tab bar rendered with no visible
    // selection at all, which no role query would have caught.
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    renderDetailRoute();

    await waitFor(() => expect(screen.getByRole("tab", { selected: true })).toBeTruthy());
    const selected = screen.getByRole("tab", { selected: true });
    expect(selected.textContent).toBe("Transactions");
    expect(selected.className).toContain("aria-selected:bg-foreground");
    expect(selected.className).not.toContain("data-selected:");
  });

  it("puts the account ID with the identity, and the address only once", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    renderDetailRoute();

    await waitFor(() => expect(screen.getByText("ID 4210")).toBeTruthy());
    // One copy of the address on the screen: the header's. A second in a metadata
    // strip was one more thing to keep in step.
    expect(screen.getAllByText(ADDRESS)).toHaveLength(1);
  });

  it("keeps the open tab in the URL and restores it on Back", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    const router = renderDetailRoute();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(router.state.location.search).toMatchObject({ tab: "transactions" });

    fireEvent.click(screen.getByRole("tab", { name: "Posts" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "reports" }));

    act(() => {
      router.history.back();
    });
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ tab: "transactions" }),
    );
  });

  it("does not push history when the open tab is selected again", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    const router = renderDetailRoute();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());

    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    // Still the first entry: a no-op selection that pushed would make Back appear
    // broken to an operator.
    act(() => {
      router.history.back();
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/users"));
  });

  it("names the pin the operator drops in the sheet, and saves the pair", async () => {
    // Three invariants in one: the place is edited in the sheet rather than on the
    // record, the name follows the pin rather than being typed, and the four
    // identity fields ride along because clc-core's statement assigns them
    // unconditionally — a location-only body would blank the account's name.
    const located = account({ locationName: "Nairobi", geoLat: -1.2921, geoLng: 36.8219 });
    listUsers.mockResolvedValue({ users: [located], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    reverseLocation.mockResolvedValue("Nairobi CBD, Kenya");
    updateUserProfile.mockResolvedValue({ ...located, locationName: "Nairobi CBD, Kenya" });

    renderDetailRoute();

    // The record itself carries no place control — the map on it is a picture.
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit profile" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Set pin" })).toBeNull();

    await openProfileSheet();

    // Seeded from the record.
    expect(fieldValue("Location")).toBe("Nairobi");

    fireEvent.click(screen.getByRole("button", { name: "Set pin" }));

    // The click reverse-geocodes the point and the field follows it.
    await waitFor(() => expect(fieldValue("Location")).toBe("Nairobi CBD, Kenya"));
    expect(reverseLocation).toHaveBeenCalledWith(PIN.lat, PIN.lng, expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalled());
    expect(updateUserProfile).toHaveBeenCalledWith(ADDRESS, {
      name: "Ada Lovelace",
      email: "ada@example.test",
      phone: "+254700000000",
      country: "KE",
      locationName: "Nairobi CBD, Kenya",
      geoLat: PIN.lat,
      geoLng: PIN.lng,
    });
  });

  it("edits the account's currency, bio, and website", async () => {
    const profiled = account({
      preferredCurrency: "KES",
      bio: "Neighbourhood organiser",
      website: "https://ada.example",
    });
    listUsers.mockResolvedValue({ users: [profiled], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    updateUserProfile.mockResolvedValue(profiled);

    renderDetailRoute();
    await openProfileSheet();

    fireEvent.focus(screen.getByLabelText("Preferred unit of account"));
    fireEvent.click(await screen.findByRole("option", { name: "USD - US Dollar" }));
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "Mutual aid organiser" } });
    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "https://new.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalled());
    expect(updateUserProfile).toHaveBeenCalledWith(ADDRESS, {
      name: "Ada Lovelace",
      email: "ada@example.test",
      phone: "+254700000000",
      country: "KE",
      preferredCurrency: "USD",
      bio: "Mutual aid organiser",
      website: "https://new.example",
    });
  });

  it("refuses to save a pin the geocoder cannot name", async () => {
    // Keeping the previous name would attach the last place's label to this pin, so
    // the field clears and the pair rule then blocks the save until it is named.
    const located = account({ locationName: "Nairobi", geoLat: -1.2921, geoLng: 36.8219 });
    listUsers.mockResolvedValue({ users: [located], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    reverseLocation.mockResolvedValue(null);

    renderDetailRoute();
    await openProfileSheet();

    fireEvent.click(screen.getByRole("button", { name: "Set pin" }));

    await waitFor(() => expect(screen.getByText(/no place found/i)).toBeTruthy());
    expect(fieldValue("Location")).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Name the place this pin marks")).toBeTruthy());
    expect(updateUserProfile).not.toHaveBeenCalled();
  });

  it("pages the transfers table with the same controls as the transactions page", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockImplementation((params: { cursor?: number; perPage: number }) =>
      Promise.resolve(
        params.cursor === undefined
          ? {
              transfers: Array.from({ length: params.perPage }, (_, i) => transfer(9000 - i)),
              first: 9000,
              last: 9000 - (params.perPage - 1),
            }
          : { transfers: [transfer(8000)], first: 8000, last: 8000 },
      ),
    );

    const router = renderDetailRoute();

    // A full page came back, so the pager offers Next — and the page-size control
    // is there beside it, as on every other admin table.
    await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeTruthy());
    expect(screen.getByLabelText("Rows per page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    // The cursor lands in the URL beside the tab, so the page is linkable and Back
    // returns to it.
    await waitFor(() => expect(router.state.location.search).toMatchObject({ dir: "next" }));
    expect(router.state.location.search).toMatchObject({ tab: "transactions" });
    await waitFor(() =>
      expect(getAccountTransfers).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: expect.any(Number), next: true }),
      ),
    );
  });

  it("resets the transfers page when another tab is opened", async () => {
    // A cursor issued for transfers names no page in another tab's records.
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [transfer(9000)], first: 9000, last: 9000 });

    const router = renderDetailRoute([
      "/users",
      `/users/${ADDRESS}?perPage=25&cursor=8999&dir=next`,
    ]);

    await waitFor(() => expect(screen.getByRole("tab", { name: "Posts" })).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Posts" }));

    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "reports" }));
    expect(router.state.location.search).not.toHaveProperty("cursor");
  });

  it("still renders balances for an address with no account", async () => {
    // Pools and vouchers link to addresses that hold vouchers without registering.
    listUsers.mockResolvedValue({ users: [], first: 0, last: 0, receivedCount: 0 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [token(7)] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    renderDetailRoute();

    await waitFor(() => expect(screen.getByText("Token 7")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ban user" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve account" })).toBeNull();
  });

  it("opens the profile sheet from the header", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });

    renderDetailRoute();
    await openProfileSheet();
    // Deployment limits are edited here, seeded from the record.
    expect(fieldValue("Max pools")).toBe("10");
    expect(fieldValue("Max vouchers")).toBe("20");
    expect(fieldValue("Max catalogs")).toBe("1");
    expect(fieldValue("Offers per voucher")).toBe("3");
    // Status and role are decisions with their own actions, not form fields.
    expect(screen.queryByRole("textbox", { name: /status/i })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /role/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });
});

/** Selection opens the crop frame; confirming it is what uploads. */
async function confirmCrop() {
  await waitFor(() => expect(document.querySelector('[role="group"] img')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Crop and upload" }));
}

describe("UserDetailPage photo", () => {
  // The rendered <img> is deliberately not asserted here: Avatar mounts its image
  // only once the browser reports a successful load, which jsdom never does, so
  // such a test would assert Base UI's loading behaviour rather than this screen's.
  it("sends a replacement URL, and omits the keys when the photo is untouched", async () => {
    listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    updateUserProfile.mockResolvedValue(account());

    renderDetailRoute();
    await openProfileSheet();

    // Untouched: an operator fixing a phone number must not send avatar keys at
    // all, because omitted is the only thing that means "leave it alone".
    fireEvent.change(screen.getByRole("textbox", { name: "Phone number" }), {
      target: { value: "+254700000111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateUserProfile).toHaveBeenCalled());
    const [, untouched] = updateUserProfile.mock.calls[0]!;
    expect("avatarUrl" in (untouched as object)).toBe(false);
    expect("clearAvatar" in (untouched as object)).toBe(false);

    updateUserProfile.mockClear();
    await openProfileSheet();
    fireEvent.change(screen.getByLabelText("Profile photo", { selector: "input" }), {
      target: { files: [new File([new Uint8Array(8)], "me.png", { type: "image/png" })] },
    });
    await confirmCrop();
    await waitFor(() => expect(screen.getByRole("button", { name: /replace/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalled());
    const [, replaced] = updateUserProfile.mock.calls[0]!;
    expect(replaced).toMatchObject({ avatarUrl: "https://cdn.test/profile/new_400_a3f91c2e.webp" });
    expect("clearAvatar" in (replaced as object)).toBe(false);
  });

  it("removes a photo with clearAvatar rather than an empty URL", async () => {
    listUsers.mockResolvedValue({
      users: [account({ avatarUrl: "https://cdn.test/profile/old_400_ab.webp" })],
      first: 0,
      last: 0,
      receivedCount: 1,
    });
    getLatestAccountTokens.mockResolvedValue({ tokens: [] });
    getAccountTransfers.mockResolvedValue({ transfers: [] });
    updateUserProfile.mockResolvedValue(account());

    renderDetailRoute();
    await openProfileSheet();

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalled());
    const [, profile] = updateUserProfile.mock.calls[0]!;
    // clc-core cannot tell an absent key from a JSON null, so removal is a flag.
    expect(profile).toMatchObject({ clearAvatar: true });
    expect("avatarUrl" in (profile as object)).toBe(false);
  });
});

it("saves the per-user catalog and offer allowances without changing the profile", async () => {
  listUsers.mockResolvedValue({ users: [account()], first: 0, last: 0, receivedCount: 1 });
  getLatestAccountTokens.mockResolvedValue({ tokens: [] });
  getAccountTransfers.mockResolvedValue({ transfers: [] });
  updateUserLimits.mockResolvedValue(account({ maxCatalogs: 2, maxOffers: 8 }));
  renderDetailRoute();
  await openProfileSheet();
  fireEvent.change(screen.getByRole("textbox", { name: "Max catalogs" }), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Offers per voucher" }), {
    target: { value: "8" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(updateUserLimits).toHaveBeenCalledWith(ADDRESS, {
      maxPools: 10,
      maxTokens: 20,
      maxWants: 3,
      maxCatalogs: 2,
      maxOffers: 8,
    }),
  );
  expect(updateUserProfile).not.toHaveBeenCalled();
});
