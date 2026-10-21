import type { UserPool } from "@clc/api/features/pools/client";
import type { Client } from "viem";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  block: vi.fn(),
  bytecode: vi.fn(),
  multicall: vi.fn(),
  client: vi.fn(),
  relay: vi.fn(),
  readConfirmedOwner: vi.fn(),
  ownershipTransfer: vi.fn(),
}));
vi.mock("viem/actions", () => ({
  readContract: mocks.read,
  getBlockNumber: mocks.block,
  getBytecode: mocks.bytecode,
  multicall: mocks.multicall,
}));
vi.mock("wagmi", () => ({ useClient: mocks.client }));
vi.mock("#/features/ownership/hooks/use-asset-owner", () => ({
  readConfirmedAssetOwner: mocks.readConfirmedOwner,
}));
vi.mock("#/features/ownership/hooks/use-ownership-transfer", () => ({
  useOwnershipTransfer: mocks.ownershipTransfer,
}));
vi.mock("./use-pool-admin", () => ({ usePoolAdminRelay: () => ({ mutateAsync: mocks.relay }) }));
import {
  preparePoolOwnershipTransfer,
  usePoolOwnershipTransfer,
} from "./use-pool-ownership-transfer";
const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const pool = {
  chainId: 100,
  address: A(1),
  tokenRegistryAddress: A(2),
  limiterAddress: A(3),
  feePolicyAddress: A(4),
  quoterAddress: A(5),
  protocolFeeControllerAddress: A(6),
  quoterType: "relative",
  ownerAddress: A(7),
} as UserPool;
const input = { assetAddress: pool.address, ownerAddress: A(7), newOwnerAddress: A(8) };
const client = { chain: { id: 100 } } as Client;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.block.mockResolvedValue(42n);
  mocks.bytecode.mockResolvedValue("0x1234");
  mocks.multicall.mockResolvedValue([{ status: "failure" }]);
  mocks.client.mockReturnValue(client);
  mocks.relay.mockResolvedValue({ txHash: A(10) });
  mocks.readConfirmedOwner.mockResolvedValue(A(8));
  mocks.ownershipTransfer.mockReturnValue({ mutateAsync: vi.fn() });
  mocks.read.mockImplementation(async (_client, call) => {
    if (call.functionName === "owner") return A(7);
    if (call.functionName === "priceIndex") return 1_000_000n;
    if (call.functionName === "baseCurrency") return A(9);
    return {
      tokenRegistry: A(2),
      tokenLimiter: A(3),
      feePolicy: A(4),
      quoter: A(5),
      protocolFeeController: A(6),
    }[call.functionName as string];
  });
});
describe("pool ownership preflight", () => {
  it("reads all current wiring and owners at one uncached block before returning one batch", async () => {
    expect(await preparePoolOwnershipTransfer(client, pool, input)).toHaveLength(5);
    expect(mocks.block).toHaveBeenCalledWith(client, { cacheTime: 0 });
    expect(mocks.read.mock.calls).toHaveLength(11);
    for (const [, call] of mocks.read.mock.calls) expect(call.blockNumber).toBe(42n);
    expect(
      mocks.read.mock.calls
        .filter(([, call]) => call.functionName === "owner")
        .map(([, call]) => call.address),
    ).toEqual([A(2), A(3), A(4), A(5), A(1)]);
  });
  it("does not omit an owned quoter mislabeled as decimal", async () => {
    mocks.multicall.mockResolvedValue([{ status: "success", result: A(7) }]);
    await expect(
      preparePoolOwnershipTransfer(client, { ...pool, quoterType: "decimal" }, input),
    ).rejects.toThrow(/decimal quoter has an owner/);
  });
  it("rejects a decimal quoter without deployed bytecode", async () => {
    mocks.bytecode.mockResolvedValue("0x");

    await expect(
      preparePoolOwnershipTransfer(client, { ...pool, quoterType: "decimal" }, input),
    ).rejects.toThrow(/no contract code/);
  });

  it("verifies oracle pricing and reports pricing implementation read failures", async () => {
    await expect(
      preparePoolOwnershipTransfer(client, { ...pool, quoterType: "oracle" }, input),
    ).resolves.toHaveLength(5);
    expect(mocks.read).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ functionName: "baseCurrency", blockNumber: 42n }),
    );

    const normal = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation((configuredClient, call) => {
      if (call.functionName === "priceIndex") throw new Error("RPC unavailable");
      return normal(configuredClient, call);
    });
    await expect(preparePoolOwnershipTransfer(client, pool, input)).rejects.toThrow(
      /Could not verify the recorded pricing implementation/,
    );
  });
  it("rejects catalog wiring drift and divided ownership", async () => {
    const normal = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation((client, call) =>
      call.functionName === "tokenLimiter" ? A(99) : normal(client, call),
    );
    await expect(preparePoolOwnershipTransfer(client, pool, input)).rejects.toThrow(
      /differs from its catalog/,
    );
    mocks.read.mockImplementation((client, call) =>
      call.functionName === "owner" && call.address === A(4) ? A(99) : normal(client, call),
    );
    await expect(preparePoolOwnershipTransfer(client, pool, input)).rejects.toThrow(
      /different owner/,
    );
  });
  it("blocks missing dependencies, unknown pricing, chain and catalog owner mismatches before signing", async () => {
    await expect(
      preparePoolOwnershipTransfer(client, pool, { ...input, assetAddress: A(99) }),
    ).rejects.toThrow(/does not match this pool/);
    await expect(
      preparePoolOwnershipTransfer(client, { ...pool, limiterAddress: null }, input),
    ).rejects.toThrow(/no limiter/);
    await expect(
      preparePoolOwnershipTransfer(client, { ...pool, quoterType: null }, input),
    ).rejects.toThrow(/unknown/);
    await expect(
      preparePoolOwnershipTransfer(client, { ...pool, chainId: 42220 }, input),
    ).rejects.toThrow(/configured chain/);
    await expect(
      preparePoolOwnershipTransfer(client, { ...pool, ownerAddress: A(99) }, input),
    ).rejects.toThrow(/catalog owner/);
  });

  it("submits the relay and verifies every transferred contract at the confirmed block", async () => {
    usePoolOwnershipTransfer(pool);
    const [, submit] = mocks.ownershipTransfer.mock.calls[0];

    await expect(submit(input)).resolves.toEqual({ txHash: A(10) });

    expect(mocks.relay).toHaveBeenCalledWith({ ...input, deferCatalogRefresh: true });
    expect(mocks.readConfirmedOwner).toHaveBeenCalledTimes(5);
    expect(mocks.readConfirmedOwner).toHaveBeenCalledWith(client, pool.address, { txHash: A(10) });
  });

  it("allows a settled relay response even if a confirmation read fails", async () => {
    mocks.readConfirmedOwner.mockRejectedValue(new Error("RPC unavailable"));
    usePoolOwnershipTransfer(pool);
    const [, submit] = mocks.ownershipTransfer.mock.calls[0];

    await expect(submit(input)).resolves.toEqual({ txHash: A(10) });
  });

  it("rejects preflight when the configured chain client is unavailable", async () => {
    mocks.client.mockReturnValue(undefined);
    usePoolOwnershipTransfer(pool);
    const [, , prepare] = mocks.ownershipTransfer.mock.calls[0];

    await expect(prepare(input)).rejects.toThrow("The configured chain is unavailable.");
  });
});
