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

import type { AdminUser } from "@clc/api/features/admin/client";
import { UserDetailPage } from "./user-detail-page";
import { parseUserDetailSearch } from "./user-detail-search";

const ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645";
const OPERATOR = "0x4D478F0e1c1b0b3d0F5b8d2cbde4581dB6369abc";
const FUTURE = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  getAccountStats: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
  adminGet: vi.fn(),
  adminRetire: vi.fn(),
  adminRestore: vi.fn(),
  moderationHistory: vi.fn(),
  getLatestAccountTokens: vi.fn(),
  getAccountTransfers: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  session: { role: "SUPERADMIN", address: "" },
}));

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("#/lib/storage", () => ({ isStorageConfigured: false }));
vi.mock("#/components/ui/location-map.lazy", () => ({ LocationMap: () => <div>Map</div> }));
vi.mock("#/lib/api", () => ({
  clcApi: {
    auth: {
      getSession: () =>
        Promise.resolve({
          address: mocks.session.address,
          chainId: 100,
          role: mocks.session.role,
        }),
    },
    admin: {
      listUsers: (...args: unknown[]) => mocks.listUsers(...args),
      getAccountStats: (...args: unknown[]) => mocks.getAccountStats(...args),
      approveUser: (...args: unknown[]) => mocks.approveUser(...args),
      rejectUser: (...args: unknown[]) => mocks.rejectUser(...args),
    },
    accountRetirement: {
      adminGet: (...args: unknown[]) => mocks.adminGet(...args),
      adminRetire: (...args: unknown[]) => mocks.adminRetire(...args),
      adminRestore: (...args: unknown[]) => mocks.adminRestore(...args),
      moderationHistory: (...args: unknown[]) => mocks.moderationHistory(...args),
    },
    accounts: {
      getLatestAccountTokens: (...args: unknown[]) => mocks.getLatestAccountTokens(...args),
      getAccountTransfers: (...args: unknown[]) => mocks.getAccountTransfers(...args),
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
    status: "APPROVED",
    lifecycle: "ACTIVE",
    closesAt: null,
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

function lifecycleState(overrides: Record<string, unknown> = {}) {
  return {
    accountLifecycle: "ACTIVE",
    closesAt: null,
    capabilities: {
      canUseApp: true,
      canRecoverAssets: true,
      canTransferResources: true,
      canRestoreAccount: false,
    },
    retirement: null,
    events: [],
    preview: {
      closesAt: "2027-05-11T10:00:00Z",
      recoveryMonths: 6,
      ownedResources: [
        { resourceType: "voucher", address: OPERATOR, name: "Care voucher", active: true },
        { resourceType: "pool", address: ADDRESS, name: "Old pool", active: false },
      ],
      pendingResourceRequests: 2,
      hiddenContent: { wants: 3, catalogs: 1, posts: 4, reviews: 5 },
      balancesCoverage: "partial",
      balancesCoverageNote: "Balances stay on chain.",
      pendingOperationsNote: "Pending operations are not cancelled.",
    },
    ...overrides,
  };
}

function renderDetail() {
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
      return <UserDetailPage address={ADDRESS} search={detailRoute.useSearch()} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([detailRoute]),
    history: createMemoryHistory({ initialEntries: [`/users/${ADDRESS}`] }),
  });
  render(<RouterProvider router={router} />);
}

function load(user: AdminUser) {
  mocks.listUsers.mockResolvedValue({ users: [user], first: 0, last: 0, receivedCount: 1 });
}

async function ready(button: string) {
  await waitFor(() => expect(screen.getByRole("button", { name: button })).toBeTruthy());
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
  }
  mocks.session.role = "SUPERADMIN";
  mocks.session.address = OPERATOR;
  mocks.getAccountStats.mockResolvedValue(null);
  mocks.getLatestAccountTokens.mockResolvedValue({ tokens: [] });
  mocks.getAccountTransfers.mockResolvedValue({ transfers: [] });
  mocks.moderationHistory.mockResolvedValue([]);
  mocks.adminGet.mockResolvedValue(lifecycleState());
  load(account());
});

describe("Ban and Unban", () => {
  it("bans without a reason when none is typed", async () => {
    mocks.rejectUser.mockResolvedValue(account({ status: "REJECTED" }));
    renderDetail();
    await ready("Ban user");
    fireEvent.click(screen.getByRole("button", { name: "Ban user" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("0/2000")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Ban user" }));

    await waitFor(() => expect(mocks.rejectUser).toHaveBeenCalledWith(ADDRESS, ""));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("User banned."));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("passes the typed reason and counts it", async () => {
    mocks.rejectUser.mockResolvedValue(account({ status: "REJECTED" }));
    renderDetail();
    await ready("Ban user");
    fireEvent.click(screen.getByRole("button", { name: "Ban user" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), {
      target: { value: "Spam" },
    });
    expect(within(dialog).getByText("4/2000")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Ban user" }));

    await waitFor(() => expect(mocks.rejectUser).toHaveBeenCalledWith(ADDRESS, "Spam"));
  });

  it("does not ban when the dialog is cancelled", async () => {
    renderDetail();
    await ready("Ban user");
    fireEvent.click(screen.getByRole("button", { name: "Ban user" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.rejectUser).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and toasts when the ban fails", async () => {
    mocks.rejectUser.mockRejectedValue(new Error("Forbidden"));
    renderDetail();
    await ready("Ban user");
    fireEvent.click(screen.getByRole("button", { name: "Ban user" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ban user" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Forbidden"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("unbans a banned account with an optional reason", async () => {
    load(account({ status: "REJECTED" }));
    mocks.approveUser.mockResolvedValue(account());
    renderDetail();
    await ready("Unban user");
    expect(screen.queryByRole("button", { name: "Ban user" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Unban user" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), {
      target: { value: "Appeal accepted" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unban user" }));

    await waitFor(() => expect(mocks.approveUser).toHaveBeenCalledWith(ADDRESS, "Appeal accepted"));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("User unbanned."));
  });

  it("unbans without a reason", async () => {
    load(account({ status: "REJECTED" }));
    mocks.approveUser.mockResolvedValue(account());
    renderDetail();
    await ready("Unban user");
    fireEvent.click(screen.getByRole("button", { name: "Unban user" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Unban user" }));

    await waitFor(() => expect(mocks.approveUser).toHaveBeenCalledWith(ADDRESS, ""));
  });

  it("approves a pending account directly", async () => {
    load(account({ status: "PENDING" }));
    mocks.approveUser.mockResolvedValue(account());
    renderDetail();
    await ready("Approve account");
    fireEvent.click(screen.getByRole("button", { name: "Approve account" }));

    await waitFor(() => expect(mocks.approveUser).toHaveBeenCalledWith(ADDRESS, undefined));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("role hierarchy", () => {
  async function expectNoControls() {
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit profile" })).toBeTruthy());
    // The session resolves after the page; give the gate time to have mattered.
    await waitFor(() => expect(mocks.listUsers).toHaveBeenCalled());
    for (const name of ["Ban user", "Unban user", "Retire account", "Approve account"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  }

  it("offers an Admin no controls over another Admin", async () => {
    mocks.session.role = "ADMIN";
    load(account({ role: "ADMIN" }));
    renderDetail();
    await expectNoControls();
  });

  it("offers nobody controls over a Superadmin", async () => {
    load(account({ role: "SUPERADMIN" }));
    renderDetail();
    await expectNoControls();
  });

  it("offers nobody controls over their own account", async () => {
    mocks.session.address = ADDRESS.toLowerCase();
    renderDetail();
    await expectNoControls();
  });

  it("lets an Admin act on a User", async () => {
    mocks.session.role = "ADMIN";
    renderDetail();
    await ready("Ban user");
    expect(screen.getByRole("button", { name: "Retire account" })).toBeTruthy();
  });

  it("lets a Superadmin act on an Admin", async () => {
    load(account({ role: "ADMIN" }));
    renderDetail();
    await ready("Ban user");
    expect(screen.getByRole("button", { name: "Retire account" })).toBeTruthy();
  });
});

describe("Retire account", () => {
  async function openSheet() {
    renderDetail();
    await ready("Retire account");
    fireEvent.click(screen.getByRole("button", { name: "Retire account" }));
    return screen.findByRole("dialog");
  }

  it("shows the server preview before anything is changed", async () => {
    const sheet = await openSheet();
    await within(sheet).findByText(/Hidden while retired/);

    expect(within(sheet).getByText("Care voucher")).toBeTruthy();
    // The retired pool does not stay active, so it is not listed.
    expect(within(sheet).queryByText("Old pool")).toBeNull();
    expect(within(sheet).getByText("Balances stay on chain.")).toBeTruthy();
    expect(within(sheet).getByText("Pending operations are not cancelled.")).toBeTruthy();
    expect(within(sheet).getByText("Pending resource requests:").textContent).toContain("2");
    expect(within(sheet).getByText("Posts").nextElementSibling?.textContent).toBe("4");
    expect(mocks.adminRetire).not.toHaveBeenCalled();
  });

  it("holds the button back until the preview has loaded", async () => {
    mocks.adminGet.mockReturnValue(new Promise(() => {}));
    const sheet = await openSheet();
    const button = within(sheet).getByRole("button", { name: "Retire account" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("names a failed preview and retries it", async () => {
    // The history panel reads the same query, so the failure has to hold for
    // every call until the retry.
    let failing = true;
    mocks.adminGet.mockImplementation(() =>
      failing ? Promise.reject(new Error("Preview failed")) : Promise.resolve(lifecycleState()),
    );
    const sheet = await openSheet();
    await within(sheet).findByText("Preview failed");
    expect(
      (within(sheet).getByRole("button", { name: "Retire account" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    failing = false;
    fireEvent.click(within(sheet).getByRole("button", { name: "Retry" }));
    await within(sheet).findByText(/Hidden while retired/);
  });

  it("retires with the reason and closes", async () => {
    mocks.adminRetire.mockResolvedValue(
      lifecycleState({ accountLifecycle: "RETIREMENT_SCHEDULED" }),
    );
    const sheet = await openSheet();
    await within(sheet).findByText(/Hidden while retired/);
    fireEvent.change(within(sheet).getByRole("textbox", { name: /Reason/ }), {
      target: { value: "Requested by phone" },
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Retire account" }));

    await waitFor(() =>
      expect(mocks.adminRetire).toHaveBeenCalledWith(ADDRESS, { reason: "Requested by phone" }),
    );
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Account retired."));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("retires without a reason", async () => {
    mocks.adminRetire.mockResolvedValue(lifecycleState());
    const sheet = await openSheet();
    await within(sheet).findByText(/Hidden while retired/);
    fireEvent.click(within(sheet).getByRole("button", { name: "Retire account" }));

    await waitFor(() => expect(mocks.adminRetire).toHaveBeenCalledWith(ADDRESS, {}));
  });

  it("shows a pending state while retiring", async () => {
    mocks.adminRetire.mockReturnValue(new Promise(() => {}));
    const sheet = await openSheet();
    await within(sheet).findByText(/Hidden while retired/);
    fireEvent.click(within(sheet).getByRole("button", { name: "Retire account" }));

    const pending = await within(sheet).findByRole("button", { name: "Retiring…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(
      (within(sheet).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps the sheet open and says why when retirement fails", async () => {
    mocks.adminRetire.mockRejectedValue(new Error("Superadmin cannot be retired"));
    const sheet = await openSheet();
    await within(sheet).findByText(/Hidden while retired/);
    fireEvent.click(within(sheet).getByRole("button", { name: "Retire account" }));

    await within(sheet).findByText("Superadmin cannot be retired");
    expect(mocks.success).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes on Escape and ignores a submit before the preview has loaded", async () => {
    mocks.adminGet.mockReturnValue(new Promise(() => {}));
    const sheet = await openSheet();
    fireEvent.submit(sheet.querySelector("form") as HTMLFormElement);
    expect(mocks.adminRetire).not.toHaveBeenCalled();

    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("is not offered for an account that is already retiring", async () => {
    load(account({ lifecycle: "RETIREMENT_SCHEDULED", closesAt: FUTURE }));
    renderDetail();
    await ready("Restore account");
    expect(screen.queryByRole("button", { name: "Retire account" })).toBeNull();
  });
});

describe("Restore account", () => {
  const retiring = () => account({ lifecycle: "RETIREMENT_SCHEDULED", closesAt: FUTURE });

  it("marks a retiring account with its closing date", async () => {
    load(retiring());
    renderDetail();
    await waitFor(() =>
      expect(screen.getByLabelText(/account lifecycle state retiring · closes/)).toBeTruthy(),
    );
  });

  it("draws no lifecycle badge for an active account", async () => {
    renderDetail();
    await ready("Ban user");
    expect(screen.queryByLabelText(/account lifecycle state/)).toBeNull();
  });

  it("restores after confirmation", async () => {
    load(retiring());
    mocks.adminRestore.mockResolvedValue(lifecycleState());
    renderDetail();
    await ready("Restore account");
    fireEvent.click(screen.getByRole("button", { name: "Restore account" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Restore account" }),
    );

    await waitFor(() => expect(mocks.adminRestore).toHaveBeenCalledWith(ADDRESS));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Account restored."));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not restore when the dialog is cancelled", async () => {
    load(retiring());
    renderDetail();
    await ready("Restore account");
    fireEvent.click(screen.getByRole("button", { name: "Restore account" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.adminRestore).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when restoring fails", async () => {
    load(retiring());
    mocks.adminRestore.mockRejectedValue(new Error("The recovery window has closed"));
    renderDetail();
    await ready("Restore account");
    fireEvent.click(screen.getByRole("button", { name: "Restore account" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Restore account" }),
    );

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("The recovery window has closed"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("is not offered once the closing date has passed", async () => {
    load(account({ lifecycle: "RETIREMENT_SCHEDULED", closesAt: PAST }));
    renderDetail();
    await ready("Edit profile");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Ban user" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Restore account" })).toBeNull();
  });
});

describe("Account history", () => {
  it("lists moderation and lifecycle events newest first", async () => {
    mocks.moderationHistory.mockResolvedValue([
      {
        id: 1,
        action: "ban",
        previousStatus: "APPROVED",
        newStatus: "REJECTED",
        reason: "Spam links",
        actorAddress: OPERATOR,
        createdAt: "2026-09-01T10:00:00Z",
      },
      {
        id: 2,
        action: "unban",
        previousStatus: "REJECTED",
        newStatus: "APPROVED",
        reason: "",
        actorAddress: null,
        createdAt: "2026-09-03T10:00:00Z",
      },
    ]);
    mocks.adminGet.mockResolvedValue(
      lifecycleState({
        events: [
          {
            id: 7,
            action: "retired",
            source: "SELF",
            actorAddress: ADDRESS,
            createdAt: "2026-09-02T10:00:00Z",
          },
          {
            id: 8,
            action: "restored",
            source: "ADMIN",
            actorAddress: OPERATOR,
            createdAt: "2026-09-04T10:00:00Z",
          },
        ],
      }),
    );
    renderDetail();

    const panel = (await screen.findByRole("heading", { name: "Account history" })).closest(
      "section",
    ) as HTMLElement;
    await within(panel).findByText("Restored");

    const titles = within(panel)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("span")?.textContent);
    expect(titles).toEqual(["Restored", "Unbanned", "Retired", "Banned"]);
    expect(within(panel).getByText("Spam links")).toBeTruthy();
    expect(within(panel).getByText("Self")).toBeTruthy();
    expect(within(panel).getByText("Admin")).toBeTruthy();
  });

  it("says so when there is no history", async () => {
    renderDetail();
    await screen.findByText("No account history");
  });

  it("names a history that failed to load instead of reading it as empty", async () => {
    mocks.moderationHistory.mockRejectedValue(new Error("Moderation down"));
    renderDetail();
    await screen.findByText(/Ban history could not be loaded/);
    expect(screen.queryByText("No account history")).toBeNull();
  });

  it("keeps the other history when the retirement read fails", async () => {
    mocks.adminGet.mockRejectedValue(new Error("Lifecycle down"));
    mocks.moderationHistory.mockResolvedValue([
      {
        id: 1,
        action: "ban",
        previousStatus: "APPROVED",
        newStatus: "REJECTED",
        reason: "",
        actorAddress: OPERATOR,
        createdAt: "2026-09-01T10:00:00Z",
      },
    ]);
    renderDetail();
    await screen.findByText(/Retirement history could not be loaded/);
    expect(await screen.findByText("Banned")).toBeTruthy();
  });

  it("is not shown for an address with no account", async () => {
    mocks.listUsers.mockResolvedValue({ users: [], first: 0, last: 0, receivedCount: 0 });
    renderDetail();
    await screen.findByText("No CLC account.");
    expect(screen.queryByRole("heading", { name: "Account history" })).toBeNull();
  });
});
