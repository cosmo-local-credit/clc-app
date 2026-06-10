import type { WebAuthnCredential } from "@clc/core/features/webauthn/index";

const STORAGE_KEY = "clc_webauthn";

function store(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function storeWebAuthnCredential(cred: Omit<WebAuthnCredential, "stale">): void {
  const record: WebAuthnCredential = { ...cred, stale: false };
  store()?.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function getWebAuthnCredential(): WebAuthnCredential | null {
  const raw = store()?.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebAuthnCredential;
  } catch {
    return null;
  }
}

export function hasWebAuthnCredential(): boolean {
  return getWebAuthnCredential() !== null;
}

export function markWebAuthnStale(): void {
  const cred = getWebAuthnCredential();
  if (!cred) return;
  store()?.setItem(STORAGE_KEY, JSON.stringify({ ...cred, stale: true }));
}

export function clearWebAuthnCredential(): void {
  store()?.removeItem(STORAGE_KEY);
}
