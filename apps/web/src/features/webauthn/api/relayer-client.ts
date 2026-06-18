import type { EIP7702Auth, SignedBatch } from "@clc/core/features/webauthn/index";
import type { OtxTrackResult } from "#/features/auth/api/client";

type OKResponse<T> = { ok: true; description?: string; result: T };

export class RelayerError extends Error {
  constructor(
    public readonly code: "not_found" | "verification_failed" | "server_error",
    public readonly description: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

export type DelegatePayload = {
  ephemeralAddress: `0x${string}`;
  authorization: EIP7702Auth;
};

export type RelayPayload = {
  userAddress: `0x${string}`;
  signedBatch: SignedBatch;
  signature: `0x${string}`;
  signatureType: "secp256k1" | "webauthn";
  authorization?: EIP7702Auth;
  credentialId?: string;
  publicKeyX?: string;
  publicKeyY?: string;
};

export type RecoverPayload = {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
};

export function createRelayerClient(baseUrl: string) {
  const get = async <T>(path: string): Promise<OKResponse<T>> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
    });
    return handleResponse<T>(res);
  };

  const post = async <T>(path: string, body: unknown): Promise<OKResponse<T>> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return handleResponse<T>(res);
  };

  return {
    getHealth: () => get<{ relayerAddress?: string; chainId: number }>("/health"),

    getEOANonce: (address: string) => get<{ nonce: string }>(`/nonce/${address}`),

    getCaliburNonce: (address: string, keyHash?: string) =>
      get<{ nonce: string }>(
        keyHash ? `/calibur-nonce/${address}/${keyHash}` : `/calibur-nonce/${address}`,
      ),

    trackRelay: (trackingId: string) => get<OtxTrackResult>(`/track/${trackingId}`),

    delegate: (payload: DelegatePayload) => post<{ trackingId: string }>("/delegate", payload),

    getWebAuthnChallenge: () => get<{ challenge: string }>("/webauthn/challenge"),

    recoverWebAuthn: (payload: RecoverPayload) =>
      post<{
        address: string;
        keyHash: string;
        publicKeyX: string;
        publicKeyY: string;
      }>("/webauthn/recover", payload),

    relay: (payload: RelayPayload) => post<{ trackingId: string }>("/relay", payload),
  };
}

export type RelayerClient = ReturnType<typeof createRelayerClient>;

async function handleResponse<T>(res: Response): Promise<OKResponse<T>> {
  const json = await res.json();
  if (!res.ok) {
    const code =
      res.status === 404
        ? "not_found"
        : res.status === 401
          ? "verification_failed"
          : "server_error";
    throw new RelayerError(code, json?.description ?? "Unknown error", res.status);
  }
  return json as OKResponse<T>;
}
