import type { EIP7702Auth, SignedBatch } from "@clc/core/features/webauthn/index";
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import type { OtxTrackResult } from "../auth/client";

type OKResponse<T> = { ok: true; description?: string; result: T };

export class RelayerError extends Error {
  constructor(
    public readonly code: "not_found" | "verification_failed" | "conflict" | "server_error",
    public readonly description: string,
    public readonly status: number,
    /**
     * Machine-readable detail a few errors carry. A `409` for a passkey whose
     * registration is still pending holds its `trackingId`, to follow instead of
     * relaying again.
     */
    public readonly result?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export type DelegatePayload = {
  ephemeralAddress: `0x${string}`;
  authorization: EIP7702Auth;
};

export type RelayPreviewPayload = {
  userAddress: `0x${string}`;
  batchedCall: SignedBatch["batchedCall"];
  keyHash?: `0x${string}`;
  executor: `0x${string}`;
  deadline: string;
};

export type RelayPayload = {
  /**
   * Makes a submission idempotent on relayers that advertise `idempotentRelay`:
   * resending the identical signed request under the same id returns the
   * original tracking id instead of queueing a second job, and reusing the id
   * for any other request is refused with a 409. Holding the signed request is
   * the proof that lets a caller look its submission up again.
   */
  operationId?: string;
  userAddress: `0x${string}`;
  signedBatch: SignedBatch;
  signature: `0x${string}`;
  signatureType: "secp256k1" | "webauthn";
  authorization?: EIP7702Auth;
  credentialId?: string;
  publicKeyX?: string;
  publicKeyY?: string;
};

export type RelayValuationSnapshot = {
  tokenAddress: `0x${string}`;
  voucherValue: string;
  voucherUoa: string;
};

export type RelayResult = {
  trackingId: string;
  valuationSnapshots?: RelayValuationSnapshot[];
};

export type RecoverPayload = {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
};

export type RelayerHealth = {
  relayerAddress?: string;
  chainId: number;
  /** The relay honours `operationId`, so a lost response can be reconciled by resending. */
  idempotentRelay?: boolean;
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
    getHealth: () => get<RelayerHealth>("/health"),

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

    relayPreview: (payload: RelayPreviewPayload) =>
      post<{ nonce: string; digest: `0x${string}` }>("/relay/preview", payload),

    relay: async (payload: RelayPayload) => {
      const response = await post<unknown>("/relay", payload);
      return { ...response, result: parseRelayResult(response.result) };
    },
  };
}

const relayResultSchema = z.object({
  trackingId: z.string().min(1),
  valuationSnapshots: z.array(z.unknown()).optional(),
});

const relayValuationSnapshotSchema = z.object({
  tokenAddress: z.string().refine(isAddress),
  voucherValue: z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
    .refine((value) => !/^0(?:\.0+)?$/.test(value)),
  voucherUoa: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,16}$/),
});

function parseRelayResult(value: unknown): RelayResult {
  const parsed = relayResultSchema.parse(value);
  const valuationSnapshots = parsed.valuationSnapshots
    ?.map((snapshot) => relayValuationSnapshotSchema.safeParse(snapshot))
    .filter((snapshot) => snapshot.success)
    .map(({ data }) => ({
      tokenAddress: getAddress(data.tokenAddress),
      voucherValue: data.voucherValue,
      voucherUoa: data.voucherUoa,
    }));

  return {
    trackingId: parsed.trackingId,
    ...(valuationSnapshots && valuationSnapshots.length > 0 ? { valuationSnapshots } : {}),
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
          : res.status === 409
            ? "conflict"
            : "server_error";
    throw new RelayerError(code, json?.description ?? "Unknown error", res.status, json?.result);
  }
  return json as OKResponse<T>;
}

/**
 * Whether a failed `relay()` may still have queued the job.
 *
 * A 4xx is the relay refusing the request before anything was queued. Anything
 * else — no response at all, a body that is not the relay's JSON, a 5xx that a
 * gateway may have produced after the relay committed — leaves the outcome
 * unknown. An unknown outcome is reconciled by resending the same signed
 * request, never by signing a new one.
 */
export function isRelaySubmissionUncertain(error: unknown): boolean {
  if (error instanceof RelayerError) return error.status >= 500;
  return true;
}
