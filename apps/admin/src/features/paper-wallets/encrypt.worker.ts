import { encryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";

export type EncryptRequest = { id: number; privateKey: `0x${string}`; passphrase: string };
export type EncryptResponse =
  | { id: number; ok: true; payload: string }
  | { id: number; ok: false; error: string };

/** The worker global, typed structurally: the console compiles against the DOM lib only. */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EncryptRequest>) => void) | null;
  postMessage(message: EncryptResponse): void;
};

// BIP38's scrypt step takes most of a second per key and would freeze the
// console for minutes on a large batch if it ran on the main thread.
scope.onmessage = async (event) => {
  const { id, privateKey, passphrase } = event.data;
  try {
    const payload = await encryptPaperWalletPrivateKey(privateKey, passphrase);
    scope.postMessage({ id, ok: true, payload } satisfies EncryptResponse);
  } catch (error) {
    scope.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Encryption failed",
    } satisfies EncryptResponse);
  }
};
