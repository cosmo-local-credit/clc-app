import {
  base64UrlToBytes,
  buildCaliburNonce,
  bytesToBase64Url,
  computeEIP712Digest,
  eip7702AuthMessage,
  encodeRegisterCalldata,
  encodeWebAuthnAuth,
  normalizeS,
  parseDERSignature,
  webAuthnKeyHash,
} from "@clc/core/features/webauthn/index";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { encodeAbiParameters, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { RelayerClient } from "@clc/api/features/relayer/client";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { assertWebAuthnSupported } from "#/features/webauthn/hooks/browser-support";
import { createWebAuthnPasskey } from "#/features/webauthn/hooks/credential";
import { resolveRelyingPartyId } from "@clc/core/features/webauthn/rp-id";
import { storeWebAuthnCredential } from "#/lib/webauthn-storage";

const CALIBUR_ADDRESS = (import.meta.env.VITE_CALIBUR_ADDRESS ??
  "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85") as `0x${string}`;
const CHAIN_ID = BigInt(import.meta.env.VITE_CHAIN_ID ?? "42220");
const RELYING_PARTY_ID = resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID);
const RELYING_PARTY_NAME = import.meta.env.VITE_RELYING_PARTY_NAME ?? "CLC";

export type UpgradeStep =
  | "idle"
  | "authorizing"
  | "creating-passkey"
  | "registering"
  | "confirming"
  | "done"
  | "error";

type PendingUpgrade = {
  trackingId: string;
  credentialId: string;
  keyHash: `0x${string}`;
  publicKeyX: string;
  publicKeyY: string;
  address: `0x${string}`;
};

/**
 * Upgrades an existing secp256k1 paper-wallet key to a Calibur smart account.
 *
 * `upgradeAndLink` performs EIP-7702 delegation + WebAuthn passkey registration
 * in a single relay call. After success the caller should connect with
 * `caliburConnector`.
 */
export function useCaliburFromPk(pk: `0x${string}`, client: RelayerClient) {
  const [step, setStep] = useState<UpgradeStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingUpgrade, setPendingUpgrade] = useState<PendingUpgrade | null>(null);
  const tracking = useOtxTracking(pendingUpgrade?.trackingId ?? null, {
    queryKey: "relayer-track",
    queryFn: async (trackingId) => (await client.trackRelay(trackingId)).result,
  });

  useEffect(() => {
    if (!pendingUpgrade) return;

    if (tracking.outcome.kind === "success") {
      storeWebAuthnCredential({
        credentialId: pendingUpgrade.credentialId,
        keyHash: pendingUpgrade.keyHash,
        publicKeyX: pendingUpgrade.publicKeyX,
        publicKeyY: pendingUpgrade.publicKeyY,
        address: pendingUpgrade.address,
      });
      setPendingUpgrade(null);
      setStep("done");
      return;
    }

    if (tracking.outcome.kind === "error") {
      setPendingUpgrade(null);
      setError(tracking.outcome.error);
      setStep("error");
    }
  }, [pendingUpgrade, tracking.outcome]);

  const upgradeAndLink = useMutation({
    mutationFn: async () => {
      setError(null);
      setPendingUpgrade(null);
      assertWebAuthnSupported("create");

      const account = privateKeyToAccount(pk);

      setStep("authorizing");
      const {
        result: { nonce: nonceStr },
      } = await client.getEOANonce(account.address);
      const authMsg = eip7702AuthMessage({
        chainId: CHAIN_ID,
        contractAddress: CALIBUR_ADDRESS,
        nonce: BigInt(nonceStr),
      });
      const authSig = parseSignature(await account.sign({ hash: authMsg }));

      setStep("creating-passkey");
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = await createWebAuthnPasskey({
        publicKey: {
          challenge,
          rp: { id: RELYING_PARTY_ID, name: RELYING_PARTY_NAME },
          user: {
            id: new TextEncoder().encode(account.address),
            name: account.address,
            displayName: "CLC wallet",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            userVerification: "required",
          },
          attestation: "none",
        },
      });

      const { x, y } = await extractP256Coords(
        credential.response as AuthenticatorAttestationResponse,
      );
      const keyHash = webAuthnKeyHash(x, y);

      setStep("registering");
      const registerCalldata = encodeRegisterCalldata(x, y);
      const [caliburNonceResponse, healthResponse] = await Promise.all([
        client.getCaliburNonce(account.address),
        client.getHealth(),
      ]);
      const caliburNonceStr = caliburNonceResponse.result.nonce;
      const relayerAddress = healthResponse.result.relayerAddress;
      if (!relayerAddress) {
        throw new Error("Relayer health response is missing relayerAddress");
      }
      const executor = relayerAddress as `0x${string}`;

      const signedBatch = {
        batchedCall: {
          calls: [{ to: account.address, value: "0", data: registerCalldata }],
          revertOnFailure: true,
        },
        nonce: String(caliburNonceStr),
        keyHash: `0x${"00".repeat(32)}` as `0x${string}`,
        executor,
        deadline: "0",
      };

      const digest = computeEIP712Digest(signedBatch, account.address, CALIBUR_ADDRESS, CHAIN_ID);
      const rawSig = await account.sign({
        hash: `0x${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`,
      });
      const wrappedSig = encodeAbiParameters(
        [{ type: "bytes" }, { type: "bytes" }],
        [rawSig, "0x"],
      );

      const {
        result: { trackingId },
      } = await client.relay({
        userAddress: account.address,
        signedBatch,
        signature: wrappedSig,
        signatureType: "secp256k1",
        authorization: {
          chainId: CHAIN_ID.toString(),
          contractAddress: CALIBUR_ADDRESS,
          nonce: String(nonceStr),
          yParity: Number(authSig.yParity),
          r: authSig.r,
          s: authSig.s,
        },
        credentialId: credential.id,
        publicKeyX: x.toString(),
        publicKeyY: y.toString(),
      });

      setPendingUpgrade({
        trackingId,
        credentialId: credential.id,
        keyHash,
        publicKeyX: x.toString(),
        publicKeyY: y.toString(),
        address: account.address,
      });

      setStep("confirming");
    },
    onError: (err) => {
      setPendingUpgrade(null);
      setError(err instanceof Error ? err.message : "Upgrade failed");
      setStep("error");
    },
  });

  return { step, error, upgradeAndLink };
}

async function extractP256Coords(
  response: AuthenticatorAttestationResponse,
): Promise<{ x: bigint; y: bigint }> {
  if (response.getPublicKey) {
    const spki = response.getPublicKey();
    if (spki) {
      const cryptoKey = await crypto.subtle.importKey(
        "spki",
        spki,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"],
      );
      const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);
      if (!jwk.x || !jwk.y) throw new Error("JWK missing x/y coordinates");
      const x = BigInt(
        "0x" + base64UrlToBytes(jwk.x).reduce((h, b) => h + b.toString(16).padStart(2, "0"), ""),
      );
      const y = BigInt(
        "0x" + base64UrlToBytes(jwk.y).reduce((h, b) => h + b.toString(16).padStart(2, "0"), ""),
      );
      return { x, y };
    }
  }
  throw new Error("Cannot extract P-256 key: getPublicKey() not available");
}

// Suppress unused import warnings
void buildCaliburNonce;
void bytesToBase64Url;
void encodeWebAuthnAuth;
void normalizeS;
void parseDERSignature;
