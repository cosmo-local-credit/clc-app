import type { RelayerClient } from "@clc/api/features/relayer/client";
import { resolveRelyingPartyId } from "@clc/core/features/webauthn/rp-id";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { storeWebAuthnCredential } from "#/lib/webauthn-storage";

const { requestWebAuthnAssertion } = vi.hoisted(() => ({
  requestWebAuthnAssertion: vi.fn(),
}));

vi.mock("#/features/webauthn/hooks/credential", () => ({ requestWebAuthnAssertion }));

import { sendCaliburTransaction } from "./use-calibur-transaction";

const USER = "0x8fd379246834eac74B8419FfdA202CF8051F7A03" as const;
const RELAYER = "0x1234567890123456789012345678901234567890" as const;

afterEach(() => {
  localStorage.clear();
  requestWebAuthnAssertion.mockReset();
});

describe("sendCaliburTransaction", () => {
  it("requests the stored passkey from the configured relying party", async () => {
    storeWebAuthnCredential({
      credentialId: "AQIDBA",
      keyHash: `0x${"aa".repeat(32)}`,
      publicKeyX: "1",
      publicKeyY: "2",
      address: USER,
    });
    requestWebAuthnAssertion.mockRejectedValue(new Error("stop after credential lookup"));

    const client = {
      getHealth: vi.fn().mockResolvedValue({ result: { relayerAddress: RELAYER } }),
      getCaliburNonce: vi.fn().mockResolvedValue({ result: { nonce: "0" } }),
    } as unknown as RelayerClient;

    await expect(sendCaliburTransaction([], client)).rejects.toThrow(
      "stop after credential lookup",
    );

    expect(requestWebAuthnAssertion).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        rpId: resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID),
      }),
    });
  });
});
