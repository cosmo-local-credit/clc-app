import type { LocationInput } from "@clc/core/features/location/logic";
import { API_URL } from "#/lib/backend-config";

type ApiOk<T> = {
  ok: true;
  description?: string;
  result: T;
};

type ApiErr = {
  ok: false;
  description?: string;
  code?: string;
};

export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly description: string,
    public readonly code?: string,
  ) {
    super(description);
    this.name = "BackendApiError";
  }
}

export function formatBackendApiError(err: BackendApiError): string {
  return err.code ? `${err.code}: ${err.description}` : err.description;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });

  const text = await res.text();
  let body: ApiOk<T> | ApiErr | T | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as ApiOk<T> | ApiErr | T;
    } catch {
      throw new BackendApiError(res.status, res.statusText || "Non-JSON response from server");
    }
  }

  if (!res.ok) {
    const errBody = body as ApiErr | null;
    throw new BackendApiError(
      res.status,
      errBody?.description ?? (res.statusText || "Request failed"),
      errBody?.code,
    );
  }

  if (body && typeof body === "object" && "ok" in body) {
    const envelope = body as ApiOk<T> | ApiErr;
    if (!envelope.ok) {
      throw new BackendApiError(200, envelope.description ?? "Request failed", envelope.code);
    }
    return envelope.result;
  }

  return body as T;
}

export async function getSiweNonce(): Promise<string> {
  const data = await apiFetch<{ nonce: string }>("/auth/nonce", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.nonce;
}

export type SignupSiwePayload = {
  message: string;
  signature: string;
  name: string;
  email: string;
};

export type SignupResult = {
  userId: number | null;
  status: string;
  role: string;
  alreadyRegistered?: boolean;
};

export async function signupWithSiwe(payload: SignupSiwePayload): Promise<SignupResult> {
  try {
    return await apiFetch<SignupResult>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 409) {
      return { userId: null, status: "REGISTERED", role: "USER", alreadyRegistered: true };
    }
    throw err;
  }
}

export type SigninSiwePayload = {
  message: string;
  signature: string;
};

export type SigninResult = {
  userId: number;
  role: string;
};

export async function signinWithSiwe(payload: SigninSiwePayload): Promise<SigninResult> {
  return apiFetch<SigninResult>("/auth/signin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type WebAuthnAssertionPayload = {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
};

export type WebAuthnSigninResult = {
  userId: number;
  role: string;
  address: string;
  keyHash: string;
  publicKeyX: string;
  publicKeyY: string;
};

// Passkey sign-in. The WebAuthn assertion is itself the authentication, so no
// SIWE signature is involved — the backend verifies the assertion against the
// stored credential and issues the session cookie. Mirrors signinWithSiwe's
// error contract: 404 (not registered), 403 (pending/rejected), 401 (assertion
// failed).
export async function signinWithWebAuthn(
  payload: WebAuthnAssertionPayload,
): Promise<WebAuthnSigninResult> {
  return apiFetch<WebAuthnSigninResult>("/auth/webauthn/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout(): Promise<void> {
  await apiFetch<Record<string, never>>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type SessionResult = {
  address: string;
  chainId: number;
};

export async function getSession(): Promise<SessionResult | null> {
  return apiFetch<SessionResult | null>("/auth/session", { method: "GET" });
}

export type ProfilePayload = {
  name: string;
  email: string;
  phone: string;
  location: LocationInput;
};

export async function submitProfile(payload: ProfilePayload): Promise<void> {
  await apiFetch("/auth/profile", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      country: payload.location.country,
    }),
  });
}

export type ProfileResult = {
  address: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  createdAt: string;
};

export async function getProfile(): Promise<ProfileResult> {
  return apiFetch<ProfileResult>("/auth/profile", { method: "GET" });
}

export type OtxRecord = {
  id: number;
  trackingId: string;
  otxType: string;
  txHash: string;
  nonce: number;
  replaced: boolean;
  createdAt: string;
  status?: string;
};

export type OtxTrackResult = {
  otx: OtxRecord[];
};

export const TRACKING_TIMEOUT_MS = 120_000;
export const TRACKING_POLL_MS = 2_000;

const NON_TERMINAL_OTX_STATUSES = new Set(["PENDING", "IN_NETWORK", ""]);

export type OtxTrackingOutcome =
  | { kind: "pending" }
  | { kind: "success"; otx: OtxRecord }
  | { kind: "error"; error: string };

export async function trackOtx(trackingId: string): Promise<OtxTrackResult> {
  return apiFetch<OtxTrackResult>(`/api/v2/otx/track/${trackingId}`, { method: "GET" });
}

export function getTrackingOutcome(result: OtxTrackResult | undefined): OtxTrackingOutcome {
  const otx = result?.otx ?? [];
  const currentChain = otx.filter((entry) => !entry.replaced);
  const active = (currentChain.length > 0 ? currentChain : otx).at(-1);

  const success = [...otx].reverse().find((entry) => entry.status === "SUCCESS");
  if (success) {
    return { kind: "success", otx: success };
  }

  const status = active?.status ?? "";
  if (active && !NON_TERMINAL_OTX_STATUSES.has(status)) {
    return { kind: "error", error: `Transaction failed on-chain (${status}).` };
  }

  return { kind: "pending" };
}

export async function waitForTrackingCompletion(
  trackingId: string,
  options: {
    timeoutMs?: number;
    pollMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<OtxRecord> {
  const timeoutMs = options.timeoutMs ?? TRACKING_TIMEOUT_MS;
  const pollMs = options.pollMs ?? TRACKING_POLL_MS;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await trackOtx(trackingId);
    const outcome = getTrackingOutcome(result);
    if (outcome.kind === "success") return outcome.otx;
    if (outcome.kind === "error") {
      throw new Error(outcome.error);
    }

    await sleep(pollMs);
  }

  throw new Error("Transaction was accepted but not confirmed on-chain.");
}
