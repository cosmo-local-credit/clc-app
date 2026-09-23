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
import { encryptKeys } from "./encrypt-keys";

export type Protection = { kind: "password"; passphrase: string } | { kind: "none" };

type BatchWalletStatus = "queued" | "registering" | "ready" | "failed";

export type BatchWallet = {
  id: number;
  address: `0x${string}`;
  recipient: PaperWalletRecipient;
  status: BatchWalletStatus;
  error?: string;
  /** The account exists but its phone, country or currency was not saved. */
  profileWarning?: string;
};

export type BatchPhase = "idle" | "encrypting" | "registering" | "done";

/**
 * Registration runs two at a time: fast enough for a few hundred cards, and
 * gentle on the auth endpoints, which every wallet hits twice.
 */
const REGISTER_CONCURRENCY = 2;

/**
 * One operator-issued batch of paper wallets, from key generation to "ready to
 * print".
 *
 * The private keys, and the QR links that carry them, live in refs and nowhere
 * else — never in React state that devtools would show, never in storage, never
 * in a request. They exist until the page is left or the batch is reset, which
 * is why the page warns before leaving with an unprinted batch.
 */
export function usePaperWalletBatch() {
  const keysRef = useRef(new Map<number, `0x${string}`>());
  const qrUrlsRef = useRef(new Map<number, string>());
  const [wallets, setWallets] = useState<BatchWallet[]>([]);
  const [phase, setPhase] = useState<BatchPhase>("idle");
  const [encrypted, setEncrypted] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const patch = useCallback((id: number, update: Partial<BatchWallet>) => {
    setWallets((current) =>
      current.map((wallet) => (wallet.id === id ? { ...wallet, ...update } : wallet)),
    );
  }, []);

  const register = useCallback(
    async (targets: readonly BatchWallet[]) => {
      setPhase("registering");
      const siwe = {
        domain: window.location.host,
        uri: window.location.origin,
        chainId: CHAIN_ID,
        // The holder's own signup, signed with their key; the same statement
        // apps/web uses, since this is that registration done on their behalf.
        statement: "Sign up for CLC App",
      };
      let next = 0;
      const lane = async () => {
        while (next < targets.length) {
          const wallet = targets[next++] as BatchWallet;
          const privateKey = keysRef.current.get(wallet.id);
          if (!privateKey) continue;
          patch(wallet.id, { status: "registering", error: undefined });
          try {
            const result = await provisionPaperWallet({
              auth: clcApi.auth,
              admin: clcApi.admin,
              privateKey,
              recipient: wallet.recipient,
              siwe,
            });
            patch(wallet.id, { status: "ready", profileWarning: result.profileError });
          } catch (error) {
            patch(wallet.id, { status: "failed", error: describeProvisionError(error) });
          }
        }
      };
      await Promise.all(Array.from({ length: REGISTER_CONCURRENCY }, lane));
      setPhase("done");
    },
    [patch],
  );

  const start = useCallback(
    async (recipients: readonly PaperWalletRecipient[], protection: Protection) => {
      setFatalError(null);
      setEncrypted(0);
      keysRef.current = new Map();
      qrUrlsRef.current = new Map();
      const created: BatchWallet[] = recipients.map((recipient, id) => {
        const privateKey = generatePrivateKey();
        keysRef.current.set(id, privateKey);
        if (protection.kind === "none") {
          qrUrlsRef.current.set(id, buildPaperWalletUrl(PAPER_WALLET_ORIGIN, privateKey));
        }
        return {
          id,
          address: privateKeyToAccount(privateKey).address,
          recipient,
          status: "queued",
        };
      });
      setWallets(created);

      if (protection.kind === "password") {
        setPhase("encrypting");
        try {
          await encryptKeys(
            created.map((wallet) => keysRef.current.get(wallet.id) as `0x${string}`),
            protection.passphrase,
            (index, payload) => {
              qrUrlsRef.current.set(index, buildPaperWalletUrl(PAPER_WALLET_ORIGIN, payload));
              setEncrypted((count) => count + 1);
            },
          );
        } catch (error) {
          // Nothing has been registered yet, so there is nothing to strand.
          keysRef.current = new Map();
          qrUrlsRef.current = new Map();
          setWallets([]);
          setPhase("idle");
          setFatalError(error instanceof Error ? error.message : "Encryption failed");
          return;
        }
      }

      await register(created);
    },
    [register],
  );

  const retryFailed = useCallback(() => {
    const failed = wallets.filter((wallet) => wallet.status === "failed");
    if (failed.length > 0) void register(failed);
  }, [register, wallets]);

  const qrUrlFor = useCallback((id: number) => qrUrlsRef.current.get(id) ?? null, []);

  const reset = useCallback(() => {
    keysRef.current = new Map();
    qrUrlsRef.current = new Map();
    setWallets([]);
    setEncrypted(0);
    setFatalError(null);
    setPhase("idle");
  }, []);

  // Keys are forgotten with the component.
  useEffect(
    () => () => {
      keysRef.current.clear();
      qrUrlsRef.current.clear();
    },
    [],
  );

  return { wallets, phase, encrypted, fatalError, start, retryFailed, reset, qrUrlFor };
}
