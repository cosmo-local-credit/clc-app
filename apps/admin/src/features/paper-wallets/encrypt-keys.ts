import { encryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";

import type { EncryptRequest, EncryptResponse } from "./encrypt.worker";

/** scrypt at N = 2^15 holds 32 MiB per key, so a few workers is plenty. */
const MAX_WORKERS = 4;

/**
 * BIP38-encrypts each key with the batch passphrase, in order, calling
 * `onEncrypted` as each finishes.
 *
 * Runs on a small pool of Web Workers. Where workers are unavailable (tests,
 * very old browsers) it falls back to the main thread one key at a time.
 */
export async function encryptKeys(
  keys: readonly `0x${string}`[],
  passphrase: string,
  onEncrypted: (index: number, payload: string) => void,
): Promise<void> {
  if (typeof Worker === "undefined") {
    for (const [index, key] of keys.entries()) {
      onEncrypted(index, await encryptPaperWalletPrivateKey(key, passphrase));
    }
    return;
  }

  const workerCount = Math.max(
    1,
    Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 2) - 1, keys.length),
  );
  const workers = Array.from(
    { length: workerCount },
    () => new Worker(new URL("./encrypt.worker.ts", import.meta.url), { type: "module" }),
  );
  let next = 0;

  try {
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolve, reject) => {
            const dispatch = () => {
              if (next >= keys.length) {
                resolve();
                return;
              }
              const id = next++;
              worker.postMessage({
                id,
                privateKey: keys[id] as `0x${string}`,
                passphrase,
              } satisfies EncryptRequest);
            };
            worker.onmessage = (event: MessageEvent<EncryptResponse>) => {
              const response = event.data;
              if (!response.ok) {
                reject(new Error(response.error));
                return;
              }
              onEncrypted(response.id, response.payload);
              dispatch();
            };
            worker.onerror = (event) => reject(new Error(event.message || "Encryption failed"));
            dispatch();
          }),
      ),
    );
  } finally {
    for (const worker of workers) worker.terminate();
  }
}
