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
import { useRef, useState } from "react";
import { createPublicClient, encodeAbiParameters, http, parseSignature } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { celo } from "wagmi/chains";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { assertWebAuthnSupported } from "#/features/webauthn/hooks/browser-support";
import { resolveRelyingPartyId } from "#/features/webauthn/hooks/rp-id";
import { storeWebAuthnCredential } from "#/lib/webauthn-storage";

export type SignupStep =
  | "idle"
  | "generating-key"
  | "creating-passkey"
  | "registering"
  | "done"
  | "error";

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

export function useCaliburSignup(client: RelayerClient) {
  const [step, setStep] = useState<SignupStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const ephemeralKeyRef = useRef<`0x${string}` | null>(null);

  const signup = useMutation({
    mutationFn: async () => {
      setError(null);
      assertWebAuthnSupported("create");

      setStep("generating-key");
      const pk = generatePrivateKey();
      ephemeralKeyRef.current = pk;
      const account = privateKeyToAccount(pk);

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
      ephemeralKeyRef.current = null;
      setStep("done");
    },
    onError: (err) => {
      ephemeralKeyRef.current = null;
      setError(err instanceof Error ? err.message : "Signup failed");
      setStep("error");
    },
  });

  return { step, error, signup };
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
  return extractFromAuthData(new Uint8Array(response.attestationObject ?? new ArrayBuffer(0)));
}

function extractFromAuthData(attestation: Uint8Array): {
  x: bigint;
  y: bigint;
} {
  const authData = parseAuthData(attestation);
  if (!authData || authData.length < 55) throw new Error("Cannot parse authData");
  const credIdLen = (authData[53] << 8) | authData[54];
  const coseStart = 55 + credIdLen;
  const { x, y } = parseCoseKey(authData.slice(coseStart));
  if (!x || !y) throw new Error("Cannot extract P-256 key from COSE");
  return {
    x: BigInt(`0x${Array.from(x, (b) => b.toString(16).padStart(2, "0")).join("")}`),
    y: BigInt(`0x${Array.from(y, (b) => b.toString(16).padStart(2, "0")).join("")}`),
  };
}

function parseAuthData(attestation: Uint8Array): Uint8Array | null {
  let i = 0;
  if (attestation[i++] !== 0xa3) return null;
  while (i < attestation.length - 8) {
    if (
      attestation[i] === 0x68 &&
      attestation[i + 1] === 0x61 &&
      attestation[i + 2] === 0x75 &&
      attestation[i + 3] === 0x74 &&
      attestation[i + 4] === 0x68 &&
      attestation[i + 5] === 0x44 &&
      attestation[i + 6] === 0x61 &&
      attestation[i + 7] === 0x74 &&
      attestation[i + 8] === 0x61
    ) {
      i += 9;
      if (attestation[i] === 0x58) return attestation.slice(i + 2, i + 2 + attestation[i + 1]);
      if (attestation[i] === 0x59)
        return attestation.slice(i + 3, i + 3 + ((attestation[i + 1] << 8) | attestation[i + 2]));
    }
    i++;
  }
  return null;
}

function parseCoseKey(coseKey: Uint8Array): {
  x: Uint8Array | null;
  y: Uint8Array | null;
} {
  let i = 0;
  let x: Uint8Array | null = null;
  let y: Uint8Array | null = null;
  if ((coseKey[i] & 0xf0) === 0xa0) i++;
  else if (coseKey[i] === 0xb8 || coseKey[i] === 0xb9) i += 2;
  while (i < coseKey.length - 1) {
    let key: number | null = null;
    if (coseKey[i] === 0x21) key = -2;
    else if (coseKey[i] === 0x22) key = -3;
    i++;
    if (key === -2 || key === -3) {
      if (coseKey[i] === 0x58 && coseKey[i + 1] === 0x20) {
        const coord = coseKey.slice(i + 2, i + 34);
        if (key === -2) x = coord;
        else y = coord;
        i += 34;
      } else i++;
    } else {
      if ((coseKey[i] & 0xe0) === 0x40) i += 1 + (coseKey[i] & 0x1f);
      else if (coseKey[i] === 0x58) i += 2 + coseKey[i + 1];
      else i++;
    }
  }
  return { x, y };
}

// Suppress unused import warning — bytesToBase64Url used in tx hook
void bytesToBase64Url;
void normalizeS;
void parseDERSignature;
void encodeWebAuthnAuth;
void buildCaliburNonce;
