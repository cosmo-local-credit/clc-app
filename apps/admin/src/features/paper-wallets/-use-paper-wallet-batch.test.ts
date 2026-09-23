import { EMPTY_PAPER_WALLET_RECIPIENT } from "@clc/core/features/paper-wallet-batch/logic";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  provision: vi.fn(),
  encryptKeys: vi.fn(),
}));

vi.mock("#/lib/api", () => ({ clcApi: { auth: {}, admin: {} } }));
vi.mock("#/lib/paper-wallet", () => ({ PAPER_WALLET_ORIGIN: "https://app.test" }));
vi.mock("./encrypt-keys", () => ({ encryptKeys: mocks.encryptKeys }));
vi.mock("@clc/api/features/paper-wallet-batch/provision", () => ({
  provisionPaperWallet: mocks.provision,
  describeProvisionError: (error: unknown) => (error as Error).message,
}));

import { usePaperWalletBatch } from "./use-paper-wallet-batch";

const recipients = [
  { ...EMPTY_PAPER_WALLET_RECIPIENT, name: "A" },
  { ...EMPTY_PAPER_WALLET_RECIPIENT, name: "B" },
  { ...EMPTY_PAPER_WALLET_RECIPIENT, name: "C" },
];

describe("usePaperWalletBatch", () => {
  beforeEach(() => {
    mocks.provision.mockReset();
    mocks.encryptKeys.mockReset();
    mocks.provision.mockImplementation(async ({ privateKey }) => ({ address: privateKey }));
  });

  it("registers every wallet and keeps raw-key QR links out of state", async () => {
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(recipients, { kind: "none" }));

    expect(result.current.phase).toBe("done");
    expect(result.current.wallets.map((wallet) => wallet.status)).toEqual([
      "ready",
      "ready",
      "ready",
    ]);
    expect(mocks.provision).toHaveBeenCalledTimes(3);
    expect(mocks.provision.mock.calls[0]?.[0]).toMatchObject({
      recipient: recipients[0],
      siwe: { statement: "Sign up for CLC App" },
    });
    const key = mocks.provision.mock.calls.find(([input]) => input.recipient.name === "A")?.[0]
      .privateKey as string;
    expect(result.current.qrUrlFor(0)).toBe(`https://app.test/?w=${key}`);
    expect(JSON.stringify(result.current.wallets)).not.toContain(key.slice(2));
  });

  it("encrypts with the batch password before registering", async () => {
    mocks.encryptKeys.mockImplementation(async (keys: string[], _passphrase, onEncrypted) => {
      keys.forEach((_, index) => onEncrypted(index, `6Pencrypted${index}`));
    });
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(recipients, { kind: "password", passphrase: "secret1" }));

    expect(mocks.encryptKeys).toHaveBeenCalledWith(
      expect.any(Array),
      "secret1",
      expect.any(Function),
    );
    expect(result.current.encrypted).toBe(3);
    expect(result.current.qrUrlFor(2)).toBe("https://app.test/?w=6Pencrypted2");
  });

  it("marks a refused signup as failed and retries only the failures", async () => {
    mocks.provision.mockImplementation(async ({ recipient, privateKey }) => {
      if (recipient.name === "B") throw new Error("Email already belongs to another account");
      return { address: privateKey };
    });
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(recipients, { kind: "none" }));

    expect(result.current.wallets[1]).toMatchObject({
      status: "failed",
      error: "Email already belongs to another account",
    });

    mocks.provision.mockClear();
    mocks.provision.mockImplementation(async ({ privateKey }) => ({ address: privateKey }));
    act(() => result.current.retryFailed());
    await waitFor(() => expect(result.current.wallets[1]?.status).toBe("ready"));
    expect(mocks.provision).toHaveBeenCalledTimes(1);
  });

  it("abandons the batch when encryption fails, before anything is registered", async () => {
    mocks.encryptKeys.mockRejectedValue(new Error("out of memory"));
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(recipients, { kind: "password", passphrase: "secret1" }));

    expect(result.current.phase).toBe("idle");
    expect(result.current.wallets).toEqual([]);
    expect(result.current.fatalError).toBe("out of memory");
    expect(mocks.provision).not.toHaveBeenCalled();
  });
});
