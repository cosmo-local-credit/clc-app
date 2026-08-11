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
  createdAt: string;
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
  submitProfile(payload: ProfilePayload): Promise<void>;
  getProfile(): Promise<ProfileResult>;
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

    async submitProfile(payload: ProfilePayload): Promise<void> {
      await http.request("/auth/profile", {
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
        }),
      });
    },

    async getProfile(): Promise<ProfileResult> {
      return http.request<ProfileResult>("/auth/profile", { method: "GET" });
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
