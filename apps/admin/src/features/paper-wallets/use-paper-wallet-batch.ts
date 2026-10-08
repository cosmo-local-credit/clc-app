import type { PaperWalletRecipient } from "@clc/core/features/paper-wallet-batch/logic";
import { buildPaperWalletUrl } from "@clc/core/features/wallet/paper-wallet";
import {
  describeProvisionError,
  provisionPaperWallet,
} from "@clc/api/features/paper-wallet-batch/provision";
import { useCallback, useEffect, useRef, useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { clcApi } from "#/lib/api";
import { CHAIN_ID } from "#/lib/chain";
import { PAPER_WALLET_ORIGIN } from "#/lib/paper-wallet";
import { type EncryptJob, encryptKeys } from "./encrypt-keys";

/** One card to issue. A null passphrase puts the raw key in the QR. */
export type BatchEntry = { recipient: PaperWalletRecipient; passphrase: string | null };

/**
 * Registration status only. Whether a card was physically written is a
 * separate fact, tracked by the NFC writer: an account existing proves nothing
 * about its card.
 *
 * `preparing` is a key being encrypted; `queued` has its payload ready and
 * waits for a registration lane; `ready` is registered.
 */
type BatchWalletStatus = "queued" | "preparing" | "registering" | "ready" | "failed";

export type BatchWallet = {
  id: number;
  address: `0x${string}`;
  recipient: PaperWalletRecipient;
  status: BatchWalletStatus;
  error?: string;
  /** The account exists but its phone, country or currency was not saved. */
  profileWarning?: string;
};

export type BatchPhase = "idle" | "preparing" | "done";

export type BatchStartOptions = {
  /**
   * Encryption workers. A phone writing NFC cards starts with fewer than a
   * desktop, since each scrypt job holds 32 MiB.
   */
  encryptWorkers?: number;
};

/**
 * Registration runs two at a time: fast enough for a few hundred cards, and
 * gentle on the auth endpoints, which every wallet hits twice.
 */
const REGISTER_CONCURRENCY = 2;

/**
 * One operator-issued batch of paper wallets, from key generation to "ready to
 * print" or "ready to write".
 *
 * Preparation is a pipeline per row: a row is registered as soon as its payload
 * exists, so the first cards can be issued while later keys are still being
 * encrypted. A failure stays on the row it happened to.
 *
 * The private keys, their passphrases and the links that carry them live in
 * refs and nowhere else — never in React state that devtools would show, never
 * in storage, never in a request. They exist until the page is left or the
 * batch is reset, which is why the page warns before leaving an unissued batch.
 */
export function usePaperWalletBatch() {
  const keysRef = useRef(new Map<number, `0x${string}`>());
  const passphrasesRef = useRef(new Map<number, string>());
  const qrUrlsRef = useRef(new Map<number, string>());
  const encryptWorkersRef = useRef<number | undefined>(undefined);
  const runRef = useRef(0);
  const [wallets, setWallets] = useState<BatchWallet[]>([]);
  const [phase, setPhase] = useState<BatchPhase>("idle");
  const [encrypted, setEncrypted] = useState(0);
  const [toEncrypt, setToEncrypt] = useState(0);

  const patch = useCallback((ids: ReadonlySet<number>, update: Partial<BatchWallet>) => {
    if (ids.size === 0) return;
    setWallets((current) =>
      current.map((wallet) => (ids.has(wallet.id) ? { ...wallet, ...update } : wallet)),
    );
  }, []);

  const run = useCallback(
    async (targets: readonly BatchWallet[]) => {
      const runId = ++runRef.current;
      setPhase("preparing");
      const siwe = {
        domain: window.location.host,
        uri: window.location.origin,
        chainId: CHAIN_ID,
        // The holder's own signup, signed with their key; the same statement
        // apps/web uses, since this is that registration done on their behalf.
        statement: "Sign up for CLC App",
      };
      const byId = new Map(targets.map((wallet) => [wallet.id, wallet]));
      const queue: number[] = [];
      const jobs: EncryptJob[] = [];
      const jobIds: number[] = [];
      for (const wallet of targets) {
        const privateKey = keysRef.current.get(wallet.id);
        if (!privateKey) continue;
        if (qrUrlsRef.current.has(wallet.id)) {
          queue.push(wallet.id);
          continue;
        }
        const passphrase = passphrasesRef.current.get(wallet.id);
        if (passphrase) {
          jobs.push({ privateKey, passphrase });
          jobIds.push(wallet.id);
          continue;
        }
        qrUrlsRef.current.set(wallet.id, buildPaperWalletUrl(PAPER_WALLET_ORIGIN, privateKey));
        queue.push(wallet.id);
      }
      patch(new Set(queue), { status: "queued", error: undefined });
      patch(new Set(jobIds), { status: "preparing", error: undefined });
      setEncrypted(0);
      setToEncrypt(jobs.length);

      // Registration lanes wait on this queue while encryption is still adding
      // to it, and drain it once encryption has finished either way.
      let encrypting = jobs.length > 0;
      const waiting: Array<() => void> = [];
      const wake = () => {
        for (const resume of waiting.splice(0)) resume();
      };
      const take = async (): Promise<number | null> => {
        for (;;) {
          const next = queue.shift();
          if (next !== undefined) return next;
          if (!encrypting) return null;
          await new Promise<void>((resolve) => waiting.push(resolve));
        }
      };

      const lane = async () => {
        for (let id = await take(); id !== null; id = await take()) {
          const wallet = byId.get(id);
          const privateKey = keysRef.current.get(id);
          if (!wallet || !privateKey) continue;
          patch(new Set([id]), { status: "registering", error: undefined });
          try {
            const result = await provisionPaperWallet({
              auth: clcApi.auth,
              admin: clcApi.admin,
              privateKey,
              recipient: wallet.recipient,
              siwe,
            });
            patch(new Set([id]), { status: "ready", profileWarning: result.profileError });
          } catch (error) {
            patch(new Set([id]), { status: "failed", error: describeProvisionError(error) });
          }
        }
      };

      const encryption =
        jobs.length === 0
          ? Promise.resolve()
          : encryptKeys(
              jobs,
              (index, payload) => {
                const id = jobIds[index] as number;
                qrUrlsRef.current.set(id, buildPaperWalletUrl(PAPER_WALLET_ORIGIN, payload));
                setEncrypted((count) => count + 1);
                patch(new Set([id]), { status: "queued" });
                queue.push(id);
                wake();
              },
              { maxWorkers: encryptWorkersRef.current },
            )
              .catch((error: unknown) => {
                // Rows already encrypted carry on to registration; only the
                // ones without a payload fail, and a retry encrypts them again.
                const message = error instanceof Error ? error.message : "Encryption failed";
                patch(new Set(jobIds.filter((id) => !qrUrlsRef.current.has(id))), {
                  status: "failed",
                  error: `Encryption failed: ${message}`,
                });
              })
              .finally(() => {
                encrypting = false;
                wake();
              });

      await Promise.all([
        encryption,
        ...Array.from({ length: REGISTER_CONCURRENCY }, () => lane()),
      ]);
      if (runRef.current === runId) setPhase("done");
    },
    [patch],
  );

  const start = useCallback(
    async (entries: readonly BatchEntry[], options: BatchStartOptions = {}) => {
      keysRef.current = new Map();
      passphrasesRef.current = new Map();
      qrUrlsRef.current = new Map();
      encryptWorkersRef.current = options.encryptWorkers;
      const created: BatchWallet[] = entries.map(({ recipient, passphrase }, id) => {
        const privateKey = generatePrivateKey();
        keysRef.current.set(id, privateKey);
        if (passphrase) passphrasesRef.current.set(id, passphrase);
        return {
          id,
          address: privateKeyToAccount(privateKey).address,
          recipient,
          status: "queued",
        };
      });
      setWallets(created);
      await run(created);
    },
    [run],
  );

  const retryFailed = useCallback(() => {
    const failed = wallets.filter((wallet) => wallet.status === "failed");
    if (failed.length > 0) void run(failed);
  }, [run, wallets]);

  const qrUrlFor = useCallback((id: number) => qrUrlsRef.current.get(id) ?? null, []);

  /** The row whose prepared link this is, for recognising a card already issued. */
  const rowForUrl = useCallback((url: string) => {
    for (const [id, candidate] of qrUrlsRef.current) {
      if (candidate === url) return id;
    }
    return null;
  }, []);

  const reset = useCallback(() => {
    runRef.current += 1;
    keysRef.current = new Map();
    passphrasesRef.current = new Map();
    qrUrlsRef.current = new Map();
    setWallets([]);
    setEncrypted(0);
    setToEncrypt(0);
    setPhase("idle");
  }, []);

  // Keys are forgotten with the component.
  useEffect(
    () => () => {
      keysRef.current.clear();
      passphrasesRef.current.clear();
      qrUrlsRef.current.clear();
    },
    [],
  );

  return {
    wallets,
    phase,
    encrypted,
    toEncrypt,
    start,
    retryFailed,
    reset,
    qrUrlFor,
    rowForUrl,
  };
}
