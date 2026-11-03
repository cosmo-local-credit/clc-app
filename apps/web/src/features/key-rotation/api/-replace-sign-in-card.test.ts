import type { AuthClient } from "@clc/api/features/auth/client";
import type { RelayerClient } from "@clc/api/features/relayer/client";
import { buildKeyRotationStatement } from "@clc/core/features/key-rotation/logic";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { collectWebAuthnAssertion } = vi.hoisted(() => ({ collectWebAuthnAssertion: vi.fn() }));
vi.mock("#/features/webauthn/hooks/assertion", () => ({ collectWebAuthnAssertion }));

import { replaceSignInCard } from "./replace-sign-in-card";

const OLD_KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const NEW_KEY = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const OLD = privateKeyToAccount(OLD_KEY).address;
const NEW = privateKeyToAccount(NEW_KEY).address;
const SIWE = { domain: "app.example", uri: "https://app.example", chainId: 100 };

function auth() {
  let nonce = 0;
  return {
    getSiweNonce: vi.fn(async () => `rotationnonce${(nonce += 1)}`),
    rotateKey: vi.fn().mockResolvedValue({ address: NEW }),
  } as unknown as AuthClient & { rotateKey: ReturnType<typeof vi.fn> };
}

afterEach(() => collectWebAuthnAssertion.mockReset());

describe("replaceSignInCard", () => {
  it("has both cards sign the same rotation statement over their own nonces", async () => {
    const client = auth();
    await replaceSignInCard({
      auth: client,
      relayer: {} as RelayerClient,
      oldAddress: OLD,
      newKey: NEW_KEY,
      proof: { kind: "card", key: OLD_KEY },
      siwe: SIWE,
    });

    const [payload] = client.rotateKey.mock.calls[0] as [
      {
        old: { siwe: { message: string; signature: `0x${string}` } };
        new: { message: string; signature: `0x${string}` };
      },
    ];
    const statement = buildKeyRotationStatement(OLD, NEW);
    expect(payload.old.siwe.message).toContain(`\n\n${statement}\n\n`);
    expect(payload.new.message).toContain(`\n\n${statement}\n\n`);
    expect(payload.old.siwe.message).not.toEqual(payload.new.message);
    await expect(
      verifyMessage({
        address: OLD,
        message: payload.old.siwe.message,
        signature: payload.old.siwe.signature,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyMessage({
        address: NEW,
        message: payload.new.message,
        signature: payload.new.signature,
      }),
    ).resolves.toBe(true);
  });

  it("confirms with the passkey when the account has one", async () => {
    const client = auth();
    const assertion = {
      credentialId: "cred",
      authenticatorData: "a",
      clientDataJSON: "c",
      signature: "s",
    };
    collectWebAuthnAssertion.mockResolvedValue(assertion);

    await replaceSignInCard({
      auth: client,
      relayer: {} as RelayerClient,
      oldAddress: OLD,
      newKey: NEW_KEY,
      proof: { kind: "passkey" },
      siwe: SIWE,
    });

    expect(client.rotateKey).toHaveBeenCalledWith(
      expect.objectContaining({ old: { webauthn: assertion } }),
    );
  });

  it("refuses a card that is not the account's", async () => {
    const client = auth();
    await expect(
      replaceSignInCard({
        auth: client,
        relayer: {} as RelayerClient,
        oldAddress: OLD,
        newKey: NEW_KEY,
        proof: { kind: "card", key: NEW_KEY },
        siwe: SIWE,
      }),
    ).rejects.toThrow();
    expect(client.rotateKey).not.toHaveBeenCalled();
  });
});
