import type { RelayerClient, RelayPayload } from "@clc/api/features/relayer/client";
import { computeEIP712Digest } from "@clc/core/features/webauthn/logic";
import { bytesToHex, decodeAbiParameters, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/features/webauthn/api/sign-digest", () => ({
  signDigestWithPasskey: vi.fn(),
}));

import { CHAIN_ID_BIGINT } from "#/lib/chain";
import { CALIBUR_ADDRESS } from "#/lib/relayer-config";
import { creditQuoteFixture, FIXTURE } from "./-credit-quote-fixture";
import { CreditQuoteRefusedError, relayCreditQuote } from "./relay-credit-quote";

const account = privateKeyToAccount(`0x${"42".repeat(32)}`);
const WALLET = account.address;
const NOW = 1_794_567_590;

function relayer() {
  const relay = vi.fn(async (payload: RelayPayload) => ({
    ok: true as const,
    result: {
      trackingId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      operationId: payload.operationId,
    },
  }));
  const getEOANonce = vi.fn(async () => ({ ok: true as const, result: { nonce: "0" } }));
  const relayPreview = vi.fn();
  return {
    client: { relay, getEOANonce, relayPreview } as unknown as RelayerClient,
    relay,
    getEOANonce,
    relayPreview,
  };
}

function input(fixture: ReturnType<typeof creditQuoteFixture>) {
  return {
    quote: fixture.quote,
    request: fixture.request,
    reviewed: { amountIn: fixture.quote.amountIn, minAmountOut: fixture.quote.minAmountOut },
    wallet: WALLET,
    signer: { kind: "secp256k1" as const, account, keyHash: fixture.request.keyHash },
    chainId: CHAIN_ID_BIGINT,
    caliburAddress: CALIBUR_ADDRESS,
    relayerAddress: FIXTURE.relayer,
    nowSeconds: NOW,
  };
}

describe("relayCreditQuote", () => {
  it("signs the app's own digest of the checked batch and relays it under an operationId", async () => {
    const fixture = creditQuoteFixture({ wallet: WALLET, nowSeconds: NOW });
    const { client, relay, relayPreview } = relayer();

    await expect(relayCreditQuote(input(fixture), client)).resolves.toEqual({
      trackingId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    });

    expect(relayPreview).not.toHaveBeenCalled();
    const payload = relay.mock.calls[0]![0];
    expect(payload.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.userAddress).toBe(WALLET);
    expect(payload.signatureType).toBe("secp256k1");
    expect(payload.authorization).toBeUndefined();
    expect(payload.signedBatch.batchedCall.calls).toEqual(fixture.quote.batch.batchedCall.calls);
    const own = bytesToHex(
      computeEIP712Digest(payload.signedBatch, WALLET, CALIBUR_ADDRESS, CHAIN_ID_BIGINT),
    );
    const [signature] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes" }],
      payload.signature,
    );
    expect(await recoverAddress({ hash: own, signature })).toBe(WALLET);
  });

  it("attaches the EIP-7702 authorization on a first relay", async () => {
    const fixture = creditQuoteFixture({ wallet: WALLET, nowSeconds: NOW, delegated: false });
    const { client, relay, getEOANonce } = relayer();
    await relayCreditQuote(input(fixture), client);
    expect(getEOANonce).toHaveBeenCalledWith(WALLET);
    expect(relay.mock.calls[0]![0].authorization).toMatchObject({
      contractAddress: CALIBUR_ADDRESS,
      nonce: "0",
    });
  });

  it("refuses a tampered batch without signing or relaying", async () => {
    const fixture = creditQuoteFixture({
      wallet: WALLET,
      nowSeconds: NOW,
      tamper: (hops) =>
        hops.map((hop, i) => (i === 1 ? { ...hop, recipient: FIXTURE.attacker } : hop)),
    });
    const { client, relay } = relayer();
    const sign = vi.spyOn(account, "sign");
    const error = await relayCreditQuote(input(fixture), client).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CreditQuoteRefusedError);
    expect((error as CreditQuoteRefusedError).check).toBe("final_recipient");
    expect(sign).not.toHaveBeenCalled();
    expect(relay).not.toHaveBeenCalled();
    sign.mockRestore();
  });

  it("refuses a quote asked for another key", async () => {
    const fixture = creditQuoteFixture({ wallet: WALLET, nowSeconds: NOW });
    const { client, relay } = relayer();
    const mismatched = {
      ...input(fixture),
      signer: { kind: "secp256k1" as const, account, keyHash: `0x${"7f".repeat(32)}` as const },
    };
    await expect(relayCreditQuote(mismatched, client)).rejects.toMatchObject({ check: "signer" });
    expect(relay).not.toHaveBeenCalled();
  });

  it("will not let a passkey sign for a wallet that has not delegated", async () => {
    const keyHash = `0x${"7f".repeat(32)}` as const;
    const fixture = creditQuoteFixture({
      wallet: WALLET,
      nowSeconds: NOW,
      delegated: false,
      keyHash,
    });
    const { client, relay } = relayer();
    await expect(
      relayCreditQuote(
        {
          ...input(fixture),
          signer: { kind: "webauthn", credentialId: "cred", keyHash, address: WALLET },
        },
        client,
      ),
    ).rejects.toThrow(/Sign-in Card/);
    expect(relay).not.toHaveBeenCalled();
  });
});
