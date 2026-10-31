import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RetirementPendingBadge } from "./retirement-notification";

const mocks = vi.hoisted(() => ({ listAdmin: vi.fn() }));
vi.mock("#/lib/api", () => ({ clcApi: { retirement: mocks } }));

const clients: QueryClient[] = [];

function mount(
  client = new QueryClient({
    // Match the console defaults: retirement must override both for prompt updates.
    defaultOptions: { queries: { staleTime: 120_000, refetchOnWindowFocus: false, retry: false } },
  }),
) {
  if (!clients.includes(client)) clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <RetirementPendingBadge />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

function pending(count: number) {
  mocks.listAdmin.mockResolvedValue({
    requests: [],
    pendingCount: count,
    first: 0,
    last: 0,
    receivedCount: 0,
  });
}

/** A zero count draws nothing, so the settled query is the signal that it loaded. */
async function settled(client: QueryClient) {
  await waitFor(() => {
    const query = client.getQueryCache().findAll({ queryKey: ["clc", "retirement"] })[0];
    expect(query?.state.status).toBe("success");
    expect(query?.state.fetchStatus).toBe("idle");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  onlineManager.setOnline(true);
  focusManager.setFocused(true);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe("retirement notification recovery", () => {
  it("loads requests that existed before the admin opened the panel", async () => {
    pending(3);
    mount();
    expect(await screen.findByLabelText("3 pending retirement requests")).toBeTruthy();
    expect(mocks.listAdmin).toHaveBeenCalledWith(
      { status: "pending", perPage: 1 },
      expect.anything(),
    );
  });

  it("refreshes a cached empty count when the admin returns", async () => {
    pending(0);
    const first = mount();
    await settled(first.client);
    expect(screen.queryByLabelText(/pending retirement requests/)).toBeNull();
    first.unmount();
    pending(2);
    mount(first.client);
    expect(await screen.findByLabelText("2 pending retirement requests")).toBeTruthy();
  });

  it("loads pending requests when the network reconnects", async () => {
    onlineManager.setOnline(false);
    pending(4);
    mount();
    expect(mocks.listAdmin).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/pending retirement/)).toBeNull();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByLabelText("4 pending retirement requests")).toBeTruthy();
  });

  it("refreshes on focus even though normal admin queries disable focus refresh", async () => {
    pending(0);
    const view = mount();
    await settled(view.client);
    act(() => focusManager.setFocused(false));
    pending(1);
    act(() => focusManager.setFocused(true));
    expect(await screen.findByLabelText("1 pending retirement requests")).toBeTruthy();
  });

  it("polls after 30 seconds while the panel is visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pending(0);
    const view = mount();
    await settled(view.client);
    pending(5);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await waitFor(() =>
      expect(screen.getByLabelText("5 pending retirement requests")).toBeTruthy(),
    );
  });
});
