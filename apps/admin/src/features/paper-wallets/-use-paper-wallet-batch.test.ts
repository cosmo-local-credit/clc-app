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

const entries = (passphrase: string | null) =>
  recipients.map((recipient) => ({ recipient, passphrase }));

describe("usePaperWalletBatch", () => {
  beforeEach(() => {
    mocks.provision.mockReset();
    mocks.encryptKeys.mockReset();
    mocks.provision.mockImplementation(async ({ privateKey }) => ({ address: privateKey }));
  });

  it("registers every wallet and keeps raw-key QR links out of state", async () => {
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(entries(null)));

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

  it("encrypts with the batch password", async () => {
    mocks.encryptKeys.mockImplementation(async (jobs: unknown[], onEncrypted) => {
      jobs.forEach((_, index) => onEncrypted(index, `6Pencrypted${index}`));
    });
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(entries("secret1")));

    expect(mocks.encryptKeys.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ passphrase: "secret1" }),
      expect.objectContaining({ passphrase: "secret1" }),
      expect.objectContaining({ passphrase: "secret1" }),
    ]);
    expect(result.current.encrypted).toBe(3);
    expect(result.current.toEncrypt).toBe(3);
    expect(result.current.qrUrlFor(2)).toBe("https://app.test/?w=6Pencrypted2");
  });

  it("uses each card's address as its signup placeholder name", async () => {
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(entries(null), { useAddressAsName: true }));

    for (const wallet of result.current.wallets) {
      expect(wallet.recipient.name).toBe(wallet.address);
      expect(mocks.provision).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: { ...EMPTY_PAPER_WALLET_RECIPIENT, name: wallet.address },
        }),
      );
    }
  });

  it("encrypts only the wallets that carry their own password", async () => {
    mocks.encryptKeys.mockImplementation(async (jobs: unknown[], onEncrypted) => {
      jobs.forEach((_, index) => onEncrypted(index, `6Pencrypted${index}`));
    });
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() =>
      result.current.start([
        { recipient: recipients[0]!, passphrase: "alpha1" },
        { recipient: recipients[1]!, passphrase: null },
        { recipient: recipients[2]!, passphrase: "gamma3" },
      ]),
    );

    expect(mocks.encryptKeys.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ passphrase: "alpha1" }),
      expect.objectContaining({ passphrase: "gamma3" }),
    ]);
    expect(result.current.toEncrypt).toBe(2);
    expect(result.current.qrUrlFor(0)).toBe("https://app.test/?w=6Pencrypted0");
    expect(result.current.qrUrlFor(2)).toBe("https://app.test/?w=6Pencrypted1");
    const rawKey = mocks.provision.mock.calls.find(([input]) => input.recipient.name === "B")?.[0]
      .privateKey as string;
    expect(result.current.qrUrlFor(1)).toBe(`https://app.test/?w=${rawKey}`);
  });

  it("marks a refused signup as failed and retries only the failures", async () => {
    mocks.provision.mockImplementation(async ({ recipient, privateKey }) => {
      if (recipient.name === "B") throw new Error("Email already belongs to another account");
      return { address: privateKey };
    });
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(entries(null)));

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

  it("registers a row as soon as its key is encrypted, while later keys still encrypt", async () => {
    let finishEncryption!: () => void;
    mocks.encryptKeys.mockImplementation(async (jobs: unknown[], onEncrypted) => {
      onEncrypted(0, "6Pencrypted0");
      await new Promise<void>((resolve) => {
        finishEncryption = resolve;
      });
      jobs.slice(1).forEach((_, index) => onEncrypted(index + 1, `6Pencrypted${index + 1}`));
    });
    const { result } = renderHook(() => usePaperWalletBatch());
    let started!: Promise<void>;
    act(() => {
      started = result.current.start(entries("secret1"), { encryptWorkers: 2 });
    });

    await waitFor(() => expect(result.current.wallets[0]?.status).toBe("ready"));
    expect(result.current.phase).toBe("preparing");
    expect(result.current.wallets.slice(1).map((wallet) => wallet.status)).toEqual([
      "preparing",
      "preparing",
    ]);
    expect(mocks.encryptKeys.mock.calls[0]?.[2]).toEqual({ maxWorkers: 2 });

    await act(async () => {
      finishEncryption();
      await started;
    });
    expect(result.current.phase).toBe("done");
    expect(result.current.wallets.map((wallet) => wallet.status)).toEqual([
      "ready",
      "ready",
      "ready",
    ]);
  });

  it("keeps registered rows when encryption fails mid-batch and retries only the rest", async () => {
    mocks.encryptKeys.mockImplementationOnce(async (_jobs: unknown[], onEncrypted) => {
      onEncrypted(0, "6Pencrypted0");
      throw new Error("out of memory");
    });
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(entries("secret1")));

    expect(result.current.phase).toBe("done");
    expect(result.current.wallets[0]?.status).toBe("ready");
    expect(result.current.wallets[1]).toMatchObject({
      status: "failed",
      error: "Encryption failed: out of memory",
    });
    expect(result.current.qrUrlFor(1)).toBeNull();
    expect(mocks.provision).toHaveBeenCalledTimes(1);

    mocks.encryptKeys.mockImplementation(async (jobs: unknown[], onEncrypted) => {
      jobs.forEach((_, index) => onEncrypted(index, `6Pretry${index}`));
    });
    act(() => result.current.retryFailed());
    await waitFor(() => expect(result.current.phase).toBe("done"));
    await waitFor(() =>
      expect(result.current.wallets.every((wallet) => wallet.status === "ready")).toBe(true),
    );
    // The retry encrypted the two missing keys with the same passphrase, and
    // registered only them.
    expect(mocks.encryptKeys.mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({ passphrase: "secret1" }),
      expect.objectContaining({ passphrase: "secret1" }),
    ]);
    expect(mocks.provision).toHaveBeenCalledTimes(3);
    expect(result.current.qrUrlFor(2)).toBe("https://app.test/?w=6Pretry1");
  });

  it("maps a prepared link back to its row", async () => {
    const { result } = renderHook(() => usePaperWalletBatch());
    await act(() => result.current.start(entries(null)));
    const url = result.current.qrUrlFor(1) as string;
    expect(result.current.rowForUrl(url)).toBe(1);
    expect(result.current.rowForUrl("https://app.test/?w=other")).toBeNull();
  });
});
