import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ code: vi.fn(), block: vi.fn(), read: vi.fn() }));
vi.mock("viem/actions", () => ({
  getCode: mocks.code,
  getBlockNumber: mocks.block,
  readContract: mocks.read,
}));
vi.mock("wagmi", () => ({ useClient: () => undefined }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => ({}) }));
vi.mock("./use-asset-owner", () => ({ useAssetOwner: () => undefined }));
vi.mock("#/lib/safe-config", () => ({ SAFE_OWNERSHIP_ENABLED: true }));

import { readAssetOwnerInfo } from "./use-asset-owner-info";

const OWNER = "0x1111111111111111111111111111111111111111";
const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000a2";

function answers(values: { VERSION?: unknown; getOwners?: unknown; getThreshold?: unknown }) {
  mocks.read.mockImplementation(
    async (_client: unknown, { functionName }: { functionName: string }) => {
      const value = values[functionName as keyof typeof values];
      if (value instanceof Error) throw value;
      return value;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.block.mockResolvedValue(1234n);
});

describe("readAssetOwnerInfo", () => {
  it("treats empty code as an EOA without probing", async () => {
    mocks.code.mockResolvedValue(undefined);
    await expect(readAssetOwnerInfo({} as never, OWNER)).resolves.toEqual({
      kind: "eoa",
      owner: OWNER,
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("keeps a Calibur-delegated EOA an EOA", async () => {
    mocks.code.mockResolvedValue(`0xef0100${"ab".repeat(20)}`);
    await expect(readAssetOwnerInfo({} as never, OWNER)).resolves.toEqual({
      kind: "eoa",
      owner: OWNER,
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("reads a supported Safe's signers and threshold at one block", async () => {
    mocks.code.mockResolvedValue("0x6080");
    answers({ VERSION: "1.3.0", getOwners: [A, B], getThreshold: 2n });
    await expect(readAssetOwnerInfo({} as never, OWNER)).resolves.toEqual({
      kind: "safe",
      owner: OWNER,
      signers: [A, B],
      threshold: 2,
    });
    for (const [, params] of mocks.read.mock.calls) expect(params.blockNumber).toBe(1234n);
  });

  it.each([["a contract that fails the probe", { VERSION: new Error("reverted") }]])(
    "is unsupported for %s",
    async (_name, values) => {
      mocks.code.mockResolvedValue("0x6080");
      answers(values as never);
      await expect(readAssetOwnerInfo({} as never, OWNER)).resolves.toEqual({
        kind: "unsupported",
        owner: OWNER,
      });
    },
  );

  it("recognizes custom multisigs without a version or threshold getter", async () => {
    mocks.code.mockResolvedValue("0x6080");
    answers({ getOwners: [A, B], getThreshold: new Error("execution reverted") });
    await expect(readAssetOwnerInfo({} as never, OWNER)).resolves.toEqual({
      kind: "safe",
      owner: OWNER,
      signers: [A, B],
      threshold: null,
    });
  });

  it.each([0n, 3n])(
    "retains signer permissions with an unusable threshold %s",
    async (threshold) => {
      mocks.code.mockResolvedValue("0x6080");
      answers({ getOwners: [A, B], getThreshold: threshold });
      await expect(readAssetOwnerInfo({} as never, OWNER)).resolves.toMatchObject({
        kind: "safe",
        signers: [A, B],
        threshold: null,
      });
    },
  );
});
