import { BackendApiError } from "@clc/api/client/errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ reach: vi.fn() }));
vi.mock("#/lib/api/credit-router", () => ({ creditRouterClient: { reach: mocks.reach } }));

import { CreditHopsBadge, CreditHopsProvider } from "./credit-hops";

const WALLET = "0x1111111111111111111111111111111111111111";
const HELD = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const ONE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const THREE = "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc";
const UNKNOWN = "0xDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd";
const POOL = "0xEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEe";

function reach() {
  return {
    depth: 3,
    maxHops: 3,
    asOfBlock: 49254469,
    graphVersion: 812,
    stale: false,
    digest: `0x${"ab".repeat(32)}`,
    inputs: [{ voucher: HELD, balance: "2500000" }],
    vouchers: [
      { address: HELD, minHops: 0 },
      { address: ONE, minHops: 1 },
      { address: THREE, minHops: 3 },
    ],
    pools: [{ address: POOL, minHops: 2 }],
  };
}

function renderBadges(wallet: string | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <CreditHopsProvider wallet={wallet}>
        <ul>
          {[HELD, ONE, THREE, UNKNOWN].map((address) => (
            <li key={address} data-testid={address}>
              <CreditHopsBadge kind="voucher" address={address} />
            </li>
          ))}
          <li data-testid="pool">
            <CreditHopsBadge kind="pool" address={POOL} />
          </li>
          <li data-testid="held-as-pool">
            <CreditHopsBadge kind="pool" address={HELD} />
          </li>
        </ul>
      </CreditHopsProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  mocks.reach.mockReset();
});

describe("CreditHopsBadge", () => {
  it("says a held voucher is in the wallet and counts the swaps to the rest", async () => {
    mocks.reach.mockResolvedValue(reach());
    renderBadges(WALLET);

    await waitFor(() => expect(screen.getByTestId(HELD).textContent).toBe("In your wallet"));
    expect(screen.getByTestId(ONE).textContent).toBe("1 swap");
    expect(screen.getByTestId(THREE).textContent).toBe("3 swaps");
    // The router named no route to it: no label at all.
    expect(screen.getByTestId(UNKNOWN).textContent).toBe("");
    expect(screen.getByTestId("pool").textContent).toBe("2 swaps");
    expect(screen.getByTestId("held-as-pool").textContent).toBe("");
    // One reach for every row, asked without a depth.
    expect(mocks.reach).toHaveBeenCalledTimes(1);
    expect(mocks.reach).toHaveBeenCalledWith(expect.anything());
  });

  it("matches addresses whatever their case", async () => {
    mocks.reach.mockResolvedValue(reach());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CreditHopsProvider wallet={WALLET}>
          <CreditHopsBadge kind="voucher" address={ONE.toLowerCase()} />
        </CreditHopsProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 swap")).toBeTruthy();
  });

  it("shows nothing to a guest and never asks the router", () => {
    renderBadges(undefined);
    expect(screen.queryByText(/swap|In your wallet/)).toBeNull();
    expect(mocks.reach).not.toHaveBeenCalled();
  });

  it("shows nothing, and holds nothing back, while the router is unavailable", async () => {
    mocks.reach.mockImplementation(() =>
      Promise.reject(new BackendApiError(503, "router_unavailable", "E27", { retryAfterMs: 0 })),
    );
    renderBadges(WALLET);
    // The rows render at once; the count simply never arrives.
    expect(screen.getByTestId(HELD)).toBeTruthy();
    await waitFor(() => expect(mocks.reach).toHaveBeenCalledTimes(3));
    expect(screen.queryByText(/swap|In your wallet/)).toBeNull();
  });

  it("drops every label once the router answers unavailable", async () => {
    mocks.reach.mockResolvedValueOnce(reach());
    const view = renderBadges(WALLET);
    expect(await screen.findByText("In your wallet")).toBeTruthy();

    // A refresh that fails, retries included, leaves no count standing.
    mocks.reach.mockImplementation(() =>
      Promise.reject(new BackendApiError(503, "router_unavailable", "E27", { retryAfterMs: 0 })),
    );
    await view.client.invalidateQueries();
    await waitFor(() => expect(screen.queryByText(/swap|In your wallet/)).toBeNull());
    expect(mocks.reach.mock.calls.length).toBeGreaterThan(1);
  });

  it("shows nothing outside the provider", () => {
    render(<CreditHopsBadge kind="voucher" address={HELD} />);
    expect(screen.queryByText("In your wallet")).toBeNull();
  });
});
