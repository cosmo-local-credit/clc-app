import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as string | undefined,
  connectorId: "paper-wallet" as string | undefined,
  delegation: "delegated" as "checking" | "delegated" | "not-delegated",
  mutationOptions: null as null | {
    mutationFn: (input: unknown) => Promise<unknown>;
    onSuccess: (result: unknown, input: unknown) => Promise<void>;
  },
  invalidate: vi.fn(async () => undefined),
  relayBatch: vi.fn(),
  waitRelay: vi.fn(),
  relayerClient: { kind: "relayer" },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useMutation: (options: NonNullable<typeof mocks.mutationOptions>) => {
    mocks.mutationOptions = options;
    return options;
  },
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({
    address: mocks.address,
    connector: mocks.connectorId ? { id: mocks.connectorId } : undefined,
  }),
}));
vi.mock("@clc/api/features/pools/queries", () => ({ poolKeys: { all: ["pools"] } }));
vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => mocks.relayerClient,
}));
vi.mock("#/features/ownership/api/wait-for-ownership-relay", () => ({
  waitForOwnershipRelay: mocks.waitRelay,
}));
vi.mock("#/features/webauthn/api/relay-calibur-batch", () => ({
  relayCaliburBatch: mocks.relayBatch,
}));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => mocks.delegation,
}));
vi.mock("./use-pool-fee-settings", () => ({ poolFeeSettingsQueryKeys: { all: ["fees"] } }));
vi.mock("./use-pool-registry", () => ({ poolRegistryQueryKeys: { all: ["registry"] } }));
vi.mock("./use-pool-swap-tokens", () => ({ poolSwapTokenQueryKeys: { all: ["swaps"] } }));
vi.mock("./use-pool-treasury", () => ({ poolTreasuryQueryKeys: { all: ["treasury"] } }));
vi.mock("./use-pool-quoter", () => ({ poolQuoterQueryKeys: { all: ["quoter"] } }));

import { usePoolAdminRelay } from "./use-pool-admin";

const calls = [
  {
    to: "0x2222222222222222222222222222222222222222",
    value: 0n,
    data: "0x1234",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.address = "0x1111111111111111111111111111111111111111";
  mocks.connectorId = "paper-wallet";
  mocks.delegation = "delegated";
  mocks.relayBatch.mockResolvedValue({ trackingId: "tracking-1" });
  mocks.waitRelay.mockResolvedValue({ trackingId: "tracking-1", txHash: "0xabc" });
  mocks.mutationOptions = null;
});

function options() {
  usePoolAdminRelay();
  return mocks.mutationOptions!;
}

describe("usePoolAdminRelay", () => {
  it("resumes an existing ownership relay without requesting another signature", async () => {
    const onConfirmed = vi.fn();

    await expect(
      options().mutationFn({ calls, trackingId: "tracking-existing", onConfirmed }),
    ).resolves.toEqual({ trackingId: "tracking-1", txHash: "0xabc" });

    expect(mocks.relayBatch).not.toHaveBeenCalled();
    expect(mocks.waitRelay).toHaveBeenCalledWith(mocks.relayerClient, "tracking-existing");
    expect(onConfirmed).toHaveBeenCalledWith("tracking-1", "0xabc");
  });

  it("requires a connected wallet and a completed delegation check", async () => {
    mocks.address = undefined;
    await expect(options().mutationFn(calls)).rejects.toThrow(
      "Connect your wallet to manage this pool.",
    );

    mocks.address = "0x1111111111111111111111111111111111111111";
    mocks.delegation = "checking";
    await expect(options().mutationFn(calls)).rejects.toThrow("Still checking your wallet");
  });

  it("relays a new batch, persists callbacks, and requests authorization when needed", async () => {
    mocks.delegation = "not-delegated";
    const onSubmitted = vi.fn();
    const onConfirmed = vi.fn();

    await expect(options().mutationFn({ calls, onSubmitted, onConfirmed })).resolves.toEqual({
      trackingId: "tracking-1",
      txHash: "0xabc",
    });

    expect(mocks.relayBatch).toHaveBeenCalledWith(
      {
        senderAddress: mocks.address,
        connectorId: "paper-wallet",
        calls,
        includeAuthorization: true,
      },
      mocks.relayerClient,
    );
    expect(onSubmitted).toHaveBeenCalledWith("tracking-1");
    expect(onConfirmed).toHaveBeenCalledWith("tracking-1", "0xabc");
  });

  it("refreshes every affected read while honoring deferred catalog refresh", async () => {
    const mutation = options();
    await mutation.onSuccess({}, calls);
    expect(mocks.invalidate).toHaveBeenCalledTimes(8);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["pools"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["clc", "marketplace"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["clc", "wants"] });

    mocks.invalidate.mockClear();
    await mutation.onSuccess({}, { calls, deferCatalogRefresh: true });
    expect(mocks.invalidate).toHaveBeenCalledTimes(7);
    expect(mocks.invalidate).not.toHaveBeenCalledWith({ queryKey: ["pools"] });
  });
});
