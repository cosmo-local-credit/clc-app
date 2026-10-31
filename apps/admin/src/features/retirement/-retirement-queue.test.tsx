import type { RetirementRequest } from "@clc/api/features/retirement/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RetirementRequestsPage } from "./retirement-requests-page";
import { RetirementRequestPage } from "./retirement-request-page";
import { RetirementDashboardLink, RetirementPendingBadge } from "./retirement-notification";
import { parseRetirementSearch } from "./retirement-search";

const mocks = vi.hoisted(() => ({
  listAdmin: vi.fn(),
  getAdminRequest: vi.fn(),
  preview: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}));
vi.mock("#/lib/api", () => ({ clcApi: { retirement: mocks } }));
const ADDRESS = "0x1111111111111111111111111111111111111111";
const request: RetirementRequest = {
  id: 7,
  resourceType: "pool",
  resourceAddress: ADDRESS,
  resourceName: "Market pool",
  symbol: "MKT",
  chainId: 100,
  requesterAddress: ADDRESS,
  ownerAddress: ADDRESS,
  reason: "Moving activity to another pool",
  status: "pending",
  requestedAt: "2026-10-25T12:00:00Z",
  decisionAt: null,
  decisionBy: null,
  decisionReason: null,
  snapshot: {
    resourceType: "pool",
    resourceAddress: ADDRESS,
    chainId: 100,
    ownerAddress: ADDRESS,
    active: true,
    symbol: "MKT",
    decimals: 6,
    amountOutsideOwnerRaw: null,
    positiveTokenCount: 0,
    hasPositiveBalances: false,
    blockNumber: "1000",
    checkedAt: "2026-10-25T12:00:00Z",
    coverage: "known-tokens",
    coverageNote: null,
  },
  decisionSnapshot: null,
};

function mount(entry = "/retirement-requests") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <RetirementPendingBadge />
        <RetirementDashboardLink />
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const list = createRoute({
    getParentRoute: () => root,
    path: "/retirement-requests",
    validateSearch: parseRetirementSearch,
    component: () => <RetirementRequestsPage search={list.useSearch()} />,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/retirement-requests/$requestId",
    component: function DetailRoute() {
      const params = useParams({ strict: false });
      return <RetirementRequestPage requestId={params.requestId ?? ""} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([list, detail]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

function adminPage(overrides: Record<string, unknown> = {}) {
  return {
    requests: [request],
    pendingCount: 2,
    first: request.id,
    last: request.id,
    receivedCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAdmin.mockResolvedValue(adminPage());
  mocks.getAdminRequest.mockResolvedValue({ request, events: [] });
  mocks.preview.mockResolvedValue(request.snapshot);
  mocks.approve.mockResolvedValue({ ...request, status: "approved" });
});

describe("retirement queue", () => {
  it("keeps pending work visible after opening a request; approval refreshes the shared count", async () => {
    mount();
    fireEvent.click(await screen.findByRole("link", { name: "Market pool" }));
    await screen.findByRole("heading", { name: "Retirement request #7" });
    expect(screen.getByLabelText("2 pending retirement requests")).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Approve retirement" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    mocks.listAdmin.mockResolvedValue(
      adminPage({ requests: [], pendingCount: 1, first: 0, last: 0, receivedCount: 0 }),
    );
    mocks.getAdminRequest.mockResolvedValue({
      request: { ...request, status: "approved", decisionAt: "2026-10-25T13:00:00Z" },
      events: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve retirement" }));
    await screen.findByLabelText("1 pending retirement requests");
    expect(await screen.findByRole("heading", { name: "Request outcome" })).toBeTruthy();
  });

  it("filters on the server, clears the cursor, and preserves the old filters on Back", async () => {
    const router = mount("/retirement-requests?status=all&cursor=8&dir=next");
    await screen.findByRole("link", { name: "Market pool" });
    fireEvent.change(screen.getByLabelText("Resource type"), { target: { value: "voucher" } });
    await waitFor(() =>
      expect(mocks.listAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: "voucher",
          status: "all",
          perPage: 10,
          cursor: undefined,
          next: undefined,
        }),
        expect.anything(),
      ),
    );
    expect(router.state.location.search).toEqual({
      status: "all",
      resourceType: "voucher",
      perPage: 10,
    });
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        status: "all",
        cursor: 8,
        dir: "next",
        perPage: 10,
      }),
    );
  });

  it("refreshes, filters by status, and pages like the voucher list", async () => {
    mocks.listAdmin.mockResolvedValue(adminPage({ first: 20, last: 11, receivedCount: 10 }));
    const router = mount("/retirement-requests?cursor=8&dir=next");
    await screen.findByRole("link", { name: "Market pool" });
    expect(screen.getByLabelText("Rows per page")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next page" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(mocks.listAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending", cursor: 8, perPage: 10, next: true }),
        expect.anything(),
      ),
    );

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "approved" } });
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ status: "approved", perPage: 10 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        status: "approved",
        cursor: 11,
        dir: "next",
        perPage: 10,
      }),
    );
    await waitFor(() =>
      expect(mocks.listAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ status: "approved", cursor: 11, perPage: 10, next: true }),
        expect.anything(),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        status: "approved",
        cursor: 20,
        dir: "prev",
        perPage: 10,
      }),
    );
    await waitFor(() =>
      expect(mocks.listAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ status: "approved", cursor: 20, perPage: 10, next: false }),
        expect.anything(),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "First" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ status: "approved", perPage: 10 }),
    );

    fireEvent.click(screen.getByLabelText("Rows per page"));
    expect(await screen.findByRole("option", { name: "10" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "25" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "50" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "100" })).toBeTruthy();
  });

  it("clears the resource-type filter and renders address fallbacks", async () => {
    mocks.listAdmin.mockResolvedValue(
      adminPage({
        requests: [{ ...request, resourceName: "", symbol: "" }],
        pendingCount: 1,
      }),
    );
    const router = mount("/retirement-requests?resourceType=pool");
    expect(await screen.findByRole("link", { name: ADDRESS })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Resource type"), { target: { value: "all" } });
    await waitFor(() => expect(router.state.location.search).toEqual({ perPage: 10 }));
  });

  it("keeps successful rows visible when a manual refresh fails", async () => {
    mocks.listAdmin
      .mockResolvedValueOnce(adminPage())
      .mockResolvedValueOnce(adminPage())
      .mockRejectedValueOnce(new Error("Refresh unavailable"));
    mount();
    await screen.findByRole("link", { name: "Market pool" });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Refresh unavailable")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Market pool" })).toBeTruthy();
  });

  it("rejects invalid request IDs before loading a detail", async () => {
    mount("/retirement-requests/not-a-number");
    expect(await screen.findByText("Invalid retirement request")).toBeTruthy();
  });

  it("uses the voucher address when a detail has no name or symbol", async () => {
    const voucherRequest: RetirementRequest = {
      ...request,
      resourceType: "voucher",
      resourceName: "",
      symbol: "",
      snapshot: { ...request.snapshot, resourceType: "voucher" },
    };
    mocks.getAdminRequest.mockResolvedValue({ request: voucherRequest, events: [] });

    mount("/retirement-requests/7");

    expect(await screen.findByRole("link", { name: ADDRESS })).toBeTruthy();
  });

  it("retries a failed request detail without leaving the route", async () => {
    mocks.getAdminRequest.mockRejectedValueOnce(new Error("Service unavailable"));
    mount("/retirement-requests/7");
    await screen.findByText("Could not load retirement request");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Retirement request #7" })).toBeTruthy();
  });

  it("renders a decided voucher request with its complete outcome", async () => {
    const voucherRequest: RetirementRequest = {
      ...request,
      resourceType: "voucher",
      resourceName: "",
      symbol: "CARE",
      status: "approved",
      decisionAt: "2026-10-25T13:00:00Z",
      decisionBy: "0x3333333333333333333333333333333333333333",
      decisionReason: "Balances reviewed",
      decisionSnapshot: {
        ...request.snapshot,
        resourceType: "voucher",
        symbol: "CARE",
        amountOutsideOwnerRaw: "0",
        positiveTokenCount: null,
        coverage: "total-supply",
      },
    };
    mocks.getAdminRequest.mockResolvedValue({ request: voucherRequest, events: [] });

    mount("/retirement-requests/7");

    const resource = await screen.findByRole("link", { name: "CARE" });
    expect(resource.getAttribute("href")).toContain(`/vouchers/${ADDRESS}`);
    expect(screen.getByText("Balances reviewed")).toBeTruthy();
    expect(screen.getByText(voucherRequest.decisionBy ?? "")).toBeTruthy();
    expect(screen.getByText("Other accounts hold 0 CARE.")).toBeTruthy();
  });

  it("does not report zero pending requests when the queue fails", async () => {
    mocks.listAdmin.mockRejectedValue(new Error("Service unavailable"));
    mount();
    await screen.findByText("Could not load retirement requests");
    expect(screen.queryByLabelText(/pending retirement requests/)).toBeNull();
    expect(screen.queryByText(/pending across all resources/)).toBeNull();
  });
});
