import { QueryClientProvider } from "@tanstack/react-query";
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
import { AbuseReportsPage } from "./abuse-reports-page";
import { abuseReport, never, OPERATOR, testQueryClient } from "./-messaging-fixtures";
import { parseAbuseReportSearch } from "./messaging-search";

const mocks = vi.hoisted(() => ({ abuseReports: vi.fn(), resolveAbuseReport: vi.fn() }));
vi.mock("#/lib/messaging", () => ({ adminMessaging: mocks }));

function mount(entry = "/abuse-reports") {
  const client = testQueryClient();
  const root = createRootRoute({ component: Outlet });
  const reports = createRoute({
    getParentRoute: () => root,
    path: "/abuse-reports",
    validateSearch: parseAbuseReportSearch,
    component: () => <AbuseReportsPage search={reports.useSearch()} />,
  });
  const account = createRoute({
    getParentRoute: () => root,
    path: "/users/$address",
    component: () => <p>account</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([reports, account]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

const RESOLVED = abuseReport(6, {
  status: "dismissed",
  resolvedBy: OPERATOR,
  resolvedAt: "2026-11-09T11:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("abuse report queue", () => {
  it("shows a loading block, not an empty queue, while pending", async () => {
    mocks.abuseReports.mockReturnValueOnce(never());
    mount();
    await waitFor(() => expect(document.querySelector('[data-slot="skeleton"]')).toBeTruthy());
    expect(screen.queryByText("No open reports")).toBeNull();
  });

  it("does not read a failed request as an empty queue", async () => {
    mocks.abuseReports.mockRejectedValueOnce(new Error("Forbidden"));
    mount();
    expect(await screen.findByText("Could not load abuse reports")).toBeTruthy();
    expect(screen.queryByText("No open reports")).toBeNull();
  });

  it("shows who reported whom, the attached message and the comment", async () => {
    mocks.abuseReports.mockResolvedValue({ items: [abuseReport(5)], nextCursor: null });
    mount();
    const row = (await screen.findByText("Send me your PIN")).closest("tr");
    if (!row) throw new Error("no row");
    const cells = within(row).getAllByRole("cell");
    expect(within(cells[0] as HTMLElement).getByText("baraka")).toBeTruthy();
    expect(within(cells[1] as HTMLElement).getByText("amina")).toBeTruthy();
    expect(within(row).getByRole("img", { name: "Photo 1 of 1" })).toBeTruthy();
    expect(within(row).getByText("Asked for my PIN")).toBeTruthy();
    expect(mocks.abuseReports).toHaveBeenCalledWith(
      { status: "open", cursor: undefined },
      expect.any(AbortSignal),
    );
  });

  it("dismisses a report after confirmation and refreshes the queue", async () => {
    mocks.abuseReports.mockResolvedValueOnce({ items: [abuseReport(5)], nextCursor: null });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss report 5" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dismiss report")).toBeTruthy();

    mocks.resolveAbuseReport.mockResolvedValueOnce({ ...abuseReport(5), status: "dismissed" });
    mocks.abuseReports.mockResolvedValue({ items: [], nextCursor: null });
    fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    expect(await screen.findByText("No open reports")).toBeTruthy();
    expect(mocks.resolveAbuseReport).toHaveBeenCalledWith(5, "dismissed");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("actions a report after confirmation", async () => {
    mocks.abuseReports.mockResolvedValueOnce({ items: [abuseReport(5)], nextCursor: null });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Action report 5" }));
    const dialog = await screen.findByRole("dialog");
    mocks.resolveAbuseReport.mockResolvedValueOnce({ ...abuseReport(5), status: "actioned" });
    mocks.abuseReports.mockResolvedValue({ items: [], nextCursor: null });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark actioned" }));
    await waitFor(() => expect(mocks.resolveAbuseReport).toHaveBeenCalledWith(5, "actioned"));
    expect(await screen.findByText("No open reports")).toBeTruthy();
  });

  it("keeps the dialog and the report when resolving fails", async () => {
    mocks.abuseReports.mockResolvedValue({ items: [abuseReport(5)], nextCursor: null });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss report 5" }));
    const dialog = await screen.findByRole("dialog");
    mocks.resolveAbuseReport.mockRejectedValueOnce(new Error("Conflict"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(
        (within(dialog).getByRole("button", { name: "Dismiss" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Behind the modal, so outside the accessibility tree until it closes.
    expect(screen.getByRole("button", { name: "Dismiss report 5", hidden: true })).toBeTruthy();
  });

  it("filters by outcome in the URL and shows who resolved a report", async () => {
    mocks.abuseReports.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve({ items: status === "dismissed" ? [RESOLVED] : [], nextCursor: null }),
    );
    const { router } = mount();
    await screen.findByText("No open reports");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "dismissed" } });
    await waitFor(() => expect(router.state.location.search).toEqual({ status: "dismissed" }));
    expect(await screen.findByLabelText("report state dismissed")).toBeTruthy();
    expect(screen.getByTitle(OPERATOR)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss report 6" })).toBeNull();
  });

  it("pages forward through the cursor", async () => {
    mocks.abuseReports.mockImplementation(({ cursor }: { cursor?: string }) =>
      Promise.resolve(
        cursor === "next"
          ? { items: [abuseReport(4, { comment: "Second page" })], nextCursor: null }
          : { items: [abuseReport(5)], nextCursor: "next" },
      ),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second page")).toBeTruthy();
    expect(screen.getByText("Asked for my PIN")).toBeTruthy();
    expect(screen.getByText("2 reports")).toBeTruthy();
  });
});
