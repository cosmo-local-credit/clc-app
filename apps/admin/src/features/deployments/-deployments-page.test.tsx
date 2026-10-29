import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const api = vi.hoisted(() => ({
  listDeployments: vi.fn(),
  upgradeToken: vi.fn(),
  upgradePool: vi.fn(),
  getDeploymentContract: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock("#/lib/api", () => ({ clcApi: { admin: api, deployments: api } }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: api.success, info: api.info, error: api.error } }));

import { DeploymentsPage } from "./deployments-page";

const ADDRESS = "0x0000000000000000000000000000000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  api.listDeployments.mockResolvedValue({
    deployments: [
      {
        id: 1,
        userId: 1,
        trackingId: "deployment-1",
        resourceType: "POOL",
        createdAt: "2026-10-25T10:00:00Z",
        ethereumAddress: ADDRESS,
        userName: "Owner",
      },
    ],
    first: 1,
    last: 1,
    receivedCount: 1,
  });
  api.getDeploymentContract.mockResolvedValue({
    address: ADDRESS,
    symbol: "POOL",
    status: "CONFIRMED",
  });
});

describe("DeploymentsPage", () => {
  it("does not announce a queued upgrade when the backend found no upgrade tasks", async () => {
    api.upgradePool.mockResolvedValue({
      upgrades: [],
      skipped: [
        { type: "SWAPPOOL", address: ADDRESS, reason: "already on the current implementation" },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DeploymentsPage search={{ perPage: 10 }} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Upgrade" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Upgrade" }));
    await waitFor(() => expect(api.upgradePool).toHaveBeenCalledWith(ADDRESS));
    await waitFor(() =>
      expect(api.info).toHaveBeenCalledWith(
        "No upgrade tasks queued",
        expect.objectContaining({
          description: expect.stringContaining("already on the current implementation"),
        }),
      ),
    );
    expect(api.success).not.toHaveBeenCalled();
  });

  it("queues a token upgrade and reports its tracking id", async () => {
    api.listDeployments.mockResolvedValue({
      deployments: [
        {
          id: 2,
          userId: 1,
          trackingId: "deployment-2",
          resourceType: "TOKEN",
          createdAt: "2026-10-25T10:00:00Z",
          ethereumAddress: ADDRESS,
          userName: "Owner",
        },
      ],
      first: 2,
      last: 2,
      receivedCount: 1,
    });
    api.upgradeToken.mockResolvedValue({ trackingId: "upgrade-2", address: ADDRESS });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DeploymentsPage search={{ perPage: 10 }} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Upgrade" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Upgrade" }),
    );
    await waitFor(() => expect(api.upgradeToken).toHaveBeenCalledWith(ADDRESS));
    expect(api.success).toHaveBeenCalledWith("Upgrade queued upgrade-2");
  });

  it("keeps upgrade failures visible to the operator", async () => {
    api.upgradePool.mockRejectedValue(new Error("upgrade unavailable"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DeploymentsPage search={{ perPage: 10 }} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Upgrade" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Upgrade" }),
    );
    await waitFor(() => expect(api.error).toHaveBeenCalledWith("upgrade unavailable"));
  });
});
