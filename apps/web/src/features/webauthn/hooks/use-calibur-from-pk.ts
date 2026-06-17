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
import { useState } from "react";
import { createPublicClient, encodeAbiParameters, http, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "wagmi/chains";

import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { assertWebAuthnSupported } from "#/features/webauthn/hooks/browser-support";
import { resolveRelyingPartyId } from "#/features/webauthn/hooks/rp-id";
import { storeWebAuthnCredential } from "#/lib/webauthn-storage";

const CALIBUR_ADDRESS = (import.meta.env.VITE_CALIBUR_ADDRESS ??
  "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85") as `0x${string}`;
const CHAIN_ID = BigInt(import.meta.env.VITE_CHAIN_ID ?? "42220");
const PUBLIC_RPC_URL =
  (import.meta.env.VITE_PUBLIC_RPC_URL as string | undefined) ?? "https://forno.celo.org";
const RELYING_PARTY_ID = resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID);
const RELYING_PARTY_NAME = import.meta.env.VITE_RELYING_PARTY_NAME ?? "CLC";

const publicClient = createPublicClient({
  chain: celo,
  transport: http(PUBLIC_RPC_URL),
});

export type UpgradeStep =
  | "idle"
  | "authorizing"
  | "creating-passkey"
  | "registering"
  | "done"
  | "error";

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

  const upgradeAndLink = useMutation({
    mutationFn: async () => {
      setError(null);
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
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { id: RELYING_PARTY_ID, name: RELYING_PARTY_NAME },
          user: {
            id: new TextEncoder().encode(account.address),
            name: account.address,
            displayName: "CLC wallet",
          },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            userVerification: "required",
          },
          attestation: "none",
        },
      })) as PublicKeyCredential;

      if (!credential) throw new Error("Passkey creation cancelled");

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
        result: { txHash },
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

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        timeout: 120_000,
      });
      if (receipt.status !== "success") {
        throw new Error("Passkey registration transaction failed on-chain");
      }

      storeWebAuthnCredential({
        credentialId: credential.id,
        keyHash,
        publicKeyX: x.toString(),
        publicKeyY: y.toString(),
        address: account.address,
      });

      setStep("done");
    },
    onError: (err) => {
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
