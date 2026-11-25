import type { Want } from "@clc/core/features/wants/logic";
import { wantKeys } from "@clc/api/features/wants/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { renderInShell } from "#/desktop/shell/-shell-test-router";
import { VoucherWantsDesk } from "#/desktop/vouchers/detail/voucher-wants";
import { VoucherWantsPanel } from "#/components/vouchers/voucher-wants-panel";

const mocks = vi.hoisted(() => ({ voucher: vi.fn() }));
vi.mock("#/lib/api/wants", () => ({ wantsClient: mocks }));

const ADDRESS = "0x1111111111111111111111111111111111111111";
const clients: QueryClient[] = [];
function want(id: number): Want {
  return {
    id: String(id),
    name: `Want ${id}`,
    description: "Looking for help",
    locationName: "Kilifi",
    geoLat: -3.6,
    geoLng: 39.8,
    startsAt: "2026-01-01T00:00:00Z",
    expiresAt: null,
    status: "OPEN",
    state: "active",
    tags: ["Repair"],
    imageUrl: null,
    markerIcon: "question",
    markerColor: "orange",
  };
}
const page = (wants: Want[], last = 0) => ({ wants, first: 1, last });

async function mount(desktop: boolean, onCount = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const component = desktop ? (
    <VoucherWantsDesk address={ADDRESS} layout="page" onCount={onCount} />
  ) : (
    <VoucherWantsPanel address={ADDRESS} />
  );
  const view = await renderInShell(
    <QueryClientProvider client={client}>{component}</QueryClientProvider>,
  );
  return { ...view, client, onCount };
}

beforeEach(() => {
  mocks.voucher.mockReset();
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe.each([false, true])("Voucher Wants with desktop=%s", (desktop) => {
  it("loads public owner Wants, paginates, and counts only the complete set", async () => {
    mocks.voucher
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 20 }, (_, index) => want(index + 1)),
          20,
        ),
      )
      .mockResolvedValueOnce(page([{ ...want(21), state: "scheduled", tags: [] }]));
    const view = await mount(desktop);
    expect(await screen.findByText("Want 1")).toBeTruthy();
    expect(mocks.voucher).toHaveBeenCalledWith(
      ADDRESS,
      { perPage: 20, cursor: undefined, next: true },
      expect.any(AbortSignal),
    );
    if (desktop) expect(view.onCount).not.toHaveBeenCalledWith(20);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Want 21")).toBeTruthy();
    expect(screen.getByText("Scheduled")).toBeTruthy();
    expect(mocks.voucher).toHaveBeenLastCalledWith(
      ADDRESS,
      { perPage: 20, cursor: 20, next: true },
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    if (desktop) await waitFor(() => expect(view.onCount).toHaveBeenCalledWith(21));
    const link = screen.getByText("Want 21").closest("a");
    expect(link?.getAttribute("href")).toContain("/wants/21");
  });

  it("shows pending, Retry on failure, and a genuine empty success", async () => {
    let fail!: (error: Error) => void;
    mocks.voucher.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    await mount(desktop);
    expect(screen.getByText("Loading Wants…")).toBeTruthy();
    expect(screen.queryByText("No Wants yet.")).toBeNull();
    await act(async () => {
      fail(new Error("Offline"));
    });
    expect(await screen.findByText("Couldn't load Wants.")).toBeTruthy();
    mocks.voucher.mockResolvedValueOnce(page([]));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No Wants yet.")).toBeTruthy();
    expect(screen.queryByText("Couldn't load Wants.")).toBeNull();
  });

  it("retains verified rows through a background failure and recovers manually", async () => {
    mocks.voucher.mockResolvedValueOnce(page([want(1)]));
    const { client } = await mount(desktop);
    expect(await screen.findByText("Want 1")).toBeTruthy();
    mocks.voucher.mockRejectedValueOnce(new Error("Offline"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: wantKeys.voucher(ADDRESS) });
    });
    expect(await screen.findByText("Couldn't load Wants.")).toBeTruthy();
    expect(screen.getByText("Want 1")).toBeTruthy();
    expect(screen.queryByText("No Wants yet.")).toBeNull();
    mocks.voucher.mockResolvedValueOnce(page([want(2)]));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Want 2")).toBeTruthy();
    expect(screen.queryByText("Couldn't load Wants.")).toBeNull();
    expect(screen.queryByText("Want 1")).toBeNull();
  });
});

it("uses compact desktop panel rows without repeating the tab heading", async () => {
  mocks.voucher.mockResolvedValue(page([{ ...want(1), tags: [] }]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  await renderInShell(
    <QueryClientProvider client={client}>
      <VoucherWantsDesk address={ADDRESS} layout="panel" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Want 1")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Wants" })).toBeNull();
  expect(screen.queryByText("Repair")).toBeNull();
});
