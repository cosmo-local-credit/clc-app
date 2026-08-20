import { isTerminalOtxFailure } from "@clc/core/lib/otx";

import { BackendApiError } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";

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

export type SigninSiwePayload = {
  message: string;
  signature: string;
};

export type SigninResult = {
  userId: number;
  role: string;
};

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

export type SessionResult = {
  address: string;
  chainId: number;
  /**
   * The signed-in user's role, e.g. "USER" or "SUPERADMIN".
   *
   * Optional because a backend older than the change that added it omits the
   * field entirely. A client that authorizes on role must treat `undefined` as
   * "cannot determine" rather than "not privileged" — silently denying a real
   * superadmin is the worse failure.
   */
  role?: string;
};

export type ProfilePayload = {
  name: string;
  email: string;
  phone: string;
  country: string;
  locationName?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  clearLocation?: boolean;
  /**
   * A URL replaces, `null` clears, omitting the key preserves.
   *
   * clc-core cannot distinguish an absent field from a JSON `null` — both decode
   * to a nil pointer, and nil means preserve, which is what protects an avatar
   * from a client that knows nothing about it. So `null` is sent as the backend's
   * clearing sentinel, `""`, rather than as JSON null, which would silently do
   * nothing. See submitProfile.
   */
  avatarUrl?: string | null;
};

export type ProfileResult = {
  address: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  locationName?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  /** Absent from a backend that predates avatars, so optional rather than nullable. */
  avatarUrl?: string | null;
  createdAt: string;
};

/**
 * What `POST /auth/profile` answers with: the saved row, minus `createdAt`, which
 * the update projection does not carry.
 */
export type SavedProfile = Omit<ProfileResult, "createdAt">;

/**
 * A copy of the session token that JavaScript can send to storage-server.
 *
 * This is the same 30-day session JWT the cookie carries, not a scoped grant, so
 * it must live only in the in-memory Query cache — never `localStorage`,
 * `sessionStorage`, Zustand, a URL, or a dehydrated SSR payload — and it must be
 * dropped at every identity boundary. clc-core accepts a user JWT in an
 * `Authorization` header as well as in the cookie, so a leaked copy is API access
 * until it expires.
 */
export type StorageTokenResult = {
  token: string;
  expiresAt: string;
};

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

export type OtxTrackingOutcome =
  | { kind: "pending" }
  | { kind: "success"; otx: OtxRecord }
  | { kind: "error"; error: string };

const TRACKING_TIMEOUT_MS = 120_000;
export const TRACKING_POLL_MS = 2_000;

export type AuthClient = {
  getSiweNonce(): Promise<string>;
  signupWithSiwe(payload: SignupSiwePayload): Promise<SignupResult>;
  signinWithSiwe(payload: SigninSiwePayload): Promise<SigninResult>;
  signinWithWebAuthn(payload: WebAuthnAssertionPayload): Promise<WebAuthnSigninResult>;
  logout(): Promise<void>;
  getSession(): Promise<SessionResult | null>;
  submitProfile(payload: ProfilePayload): Promise<SavedProfile>;
  getProfile(): Promise<ProfileResult>;
  getStorageToken(): Promise<StorageTokenResult>;
  trackOtx(trackingId: string): Promise<OtxTrackResult>;
  waitForTrackingCompletion(
    trackingId: string,
    options?: {
      timeoutMs?: number;
      pollMs?: number;
      sleep?: (ms: number) => Promise<void>;
    },
  ): Promise<OtxRecord>;
};

export function createAuthClient(http: HttpClient): AuthClient {
  async function trackOtx(trackingId: string): Promise<OtxTrackResult> {
    return http.request<OtxTrackResult>(`/api/v2/otx/track/${trackingId}`, { method: "GET" });
  }

  return {
    trackOtx,

    async getSiweNonce(): Promise<string> {
      const data = await http.request<{ nonce: string }>("/auth/nonce", {
        method: "POST",
        body: JSON.stringify({}),
      });
      return data.nonce;
    },

    async signupWithSiwe(payload: SignupSiwePayload): Promise<SignupResult> {
      try {
        return await http.request<SignupResult>("/auth/signup", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (err) {
        // 409 means the *address* is already registered only when the backend
        // says so explicitly (code E17 = email conflict, a different identity
        // entirely). Swallowing an email conflict here would make the caller
        // sign in as this (never-persisted) address, which 404s.
        if (err instanceof BackendApiError && err.status === 409 && err.code !== "E17") {
          return { userId: null, status: "REGISTERED", role: "USER", alreadyRegistered: true };
        }
        throw err;
      }
    },

    async signinWithSiwe(payload: SigninSiwePayload): Promise<SigninResult> {
      return http.request<SigninResult>("/auth/signin", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    // Passkey sign-in. The WebAuthn assertion is itself the authentication, so no
    // SIWE signature is involved — the backend verifies the assertion against the
    // stored credential and issues the session cookie. Mirrors signinWithSiwe's
    // error contract: 404 (not registered), 403 (pending/rejected), 401 (assertion
    // failed).
    async signinWithWebAuthn(payload: WebAuthnAssertionPayload): Promise<WebAuthnSigninResult> {
      return http.request<WebAuthnSigninResult>("/auth/webauthn/verify", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    async logout(): Promise<void> {
      await http.request<Record<string, never>>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
    },

    async getSession(): Promise<SessionResult | null> {
      return http.request<SessionResult | null>("/auth/session", { method: "GET" });
    },

    // Returns the saved row rather than discarding it, so a caller can seed the
    // profile query instead of refetching what it just wrote.
    async submitProfile(payload: ProfilePayload): Promise<SavedProfile> {
      return http.request<SavedProfile>("/auth/profile", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          country: payload.country,
          locationName: payload.locationName,
          geoLat: payload.geoLat,
          geoLng: payload.geoLng,
          ...(payload.clearLocation ? { clearLocation: true } : {}),
          // Omitted stays omitted, so the field is only ever sent deliberately.
          // `null` becomes "": clc-core decodes JSON null to the same nil pointer
          // as an absent key, and nil preserves the stored avatar.
          ...(payload.avatarUrl === undefined ? {} : { avatarUrl: payload.avatarUrl ?? "" }),
        }),
      });
    },

    async getProfile(): Promise<ProfileResult> {
      return http.request<ProfileResult>("/auth/profile", { method: "GET" });
    },

    async getStorageToken(): Promise<StorageTokenResult> {
      return http.request<StorageTokenResult>("/auth/storage-token", {
        method: "POST",
        body: JSON.stringify({}),
      });
    },

    async waitForTrackingCompletion(
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
    },
  };
}

/** Pure: derives the caller-facing outcome from a tracking response. */
export function getTrackingOutcome(result: OtxTrackResult | undefined): OtxTrackingOutcome {
  const otx = result?.otx ?? [];
  const currentChain = otx.filter((entry) => !entry.replaced);
  const active = (currentChain.length > 0 ? currentChain : otx).at(-1);

  const success = [...otx].reverse().find((entry) => entry.status === "SUCCESS");
  if (success) {
    return { kind: "success", otx: success };
  }

  const status = active?.status ?? "";
  if (active && isTerminalOtxFailure(status)) {
    return { kind: "error", error: `Transaction failed on-chain (${status}).` };
  }

  return { kind: "pending" };
}
