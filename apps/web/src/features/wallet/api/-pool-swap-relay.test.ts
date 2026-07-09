import {
  swapPoolWithdrawToRecipientAbi,
  swapPoolWithdrawToSenderAbi,
} from "@clc/core/features/pool-swaps/logic";
import { storePrivateKey } from "#/connectors/privateKey";
import { decodeFunctionData } from "viem";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { relayPoolDeposit, relayPoolSwapExactInput } from "./pool-swap-relay";

const RELAYER = "0x1234567890123456789012345678901234567890" as const;
const USER = "0x8fd379246834eac74B8419FfdA202CF8051F7A03" as const;
const PRIVATE_KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const DIGEST = `0x${"11".repeat(32)}` as const;
const POOL_1 = "0x1111111111111111111111111111111111111111" as const;
const POOL_2 = "0x2222222222222222222222222222222222222222" as const;
const TOKEN_A = "0x3333333333333333333333333333333333333333" as const;
const TOKEN_B = "0x4444444444444444444444444444444444444444" as const;
const TOKEN_C = "0x5555555555555555555555555555555555555555" as const;
const RECIPIENT = "0x6666666666666666666666666666666666666666" as const;

function createClientStub(): RelayerClient {
  return {
    getHealth: vi.fn().mockResolvedValue({ result: { chainId: 42220, relayerAddress: RELAYER } }),
    getEOANonce: vi.fn().mockResolvedValue({ result: { nonce: "5" } }),
    getCaliburNonce: vi.fn(),
    trackRelay: vi.fn(),
    delegate: vi.fn(),
    getWebAuthnChallenge: vi.fn(),
    recoverWebAuthn: vi.fn(),
    relayPreview: vi.fn().mockResolvedValue({ result: { nonce: "9", digest: DIGEST } }),
    relay: vi.fn().mockResolvedValue({ result: { trackingId: "tracking-1" } }),
  };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("pool swap relays", () => {
  it("submits deposit calls as a revert-on-failure batch preview", async () => {
    const client = createClientStub();
    storePrivateKey(PRIVATE_KEY);

    await expect(
      relayPoolDeposit(
        {
          senderAddress: USER,
          poolAddress: POOL_1,
          tokenAddress: TOKEN_A,
          amountRaw: "1000",
        },
        client,
      ),
    ).resolves.toEqual({ trackingId: "tracking-1", signatureType: "secp256k1" });

    expect(client.relayPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        userAddress: USER,
        batchedCall: expect.objectContaining({
          calls: expect.arrayContaining([
            expect.objectContaining({ to: TOKEN_A, value: "0" }),
            expect.objectContaining({ to: POOL_1, value: "0" }),
          ]),
          revertOnFailure: true,
        }),
      }),
    );
  });

  it("relays a multi-hop route with the recipient overload only on the final hop", async () => {
    const client = createClientStub();
    storePrivateKey(PRIVATE_KEY);

    await relayPoolSwapExactInput(
      {
        senderAddress: USER,
        path: [
          { poolAddress: POOL_1, tokenIn: TOKEN_A, tokenOut: TOKEN_B },
          { poolAddress: POOL_2, tokenIn: TOKEN_B, tokenOut: TOKEN_C },
        ],
        hopAmountIns: ["100", "95"],
        recipientAddress: RECIPIENT,
      },
      client,
    );

    const previewPayload = vi.mocked(client.relayPreview).mock.calls[0][0];
    expect(previewPayload.batchedCall.revertOnFailure).toBe(true);
    expect(previewPayload.batchedCall.calls).toHaveLength(6);
    expect(
      decodeFunctionData({
        abi: swapPoolWithdrawToSenderAbi,
        data: previewPayload.batchedCall.calls[2].data,
      }).args,
    ).toEqual([TOKEN_B, TOKEN_A, 100n]);
    expect(
      decodeFunctionData({
        abi: swapPoolWithdrawToRecipientAbi,
        data: previewPayload.batchedCall.calls[5].data,
      }).args,
    ).toEqual([TOKEN_C, TOKEN_B, 95n, RECIPIENT]);
  });
});
