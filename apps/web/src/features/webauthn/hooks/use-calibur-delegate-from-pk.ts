import { eip7702AuthMessage } from "@clc/core/features/webauthn/index";
import { useMutation } from "@tanstack/react-query";
import { createPublicClient, http, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "wagmi/chains";

import type { RelayerClient } from "#/features/webauthn/api/relayer-client";

const CALIBUR_ADDRESS = (import.meta.env.VITE_CALIBUR_ADDRESS ??
  "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85") as `0x${string}`;
const CHAIN_ID = BigInt(import.meta.env.VITE_CHAIN_ID ?? "42220");
const PUBLIC_RPC_URL =
  (import.meta.env.VITE_PUBLIC_RPC_URL as string | undefined) ?? "https://forno.celo.org";
const DELEGATION_TIMEOUT_MS = 120_000;
const DELEGATION_POLL_MS = 2_000;

const publicClient = createPublicClient({
  chain: celo,
  transport: http(PUBLIC_RPC_URL),
});

async function waitForDelegation(address: `0x${string}`): Promise<void> {
  const expectedCode = `0xef0100${CALIBUR_ADDRESS.slice(2)}`.toLowerCase();
  const deadline = Date.now() + DELEGATION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const code = await publicClient.getCode({ address });
    if (code?.toLowerCase() === expectedCode) return;
    await new Promise((resolve) => setTimeout(resolve, DELEGATION_POLL_MS));
  }

  throw new Error("Smart wallet activation was accepted but not confirmed on-chain.");
}

export function useCaliburDelegateFromPk(client: RelayerClient) {
  return useMutation({
    mutationFn: async ({ privateKey }: { privateKey: `0x${string}` }) => {
      const account = privateKeyToAccount(privateKey);
      const {
        result: { nonce: nonceStr },
      } = await client.getEOANonce(account.address);
      const authMsg = eip7702AuthMessage({
        chainId: CHAIN_ID,
        contractAddress: CALIBUR_ADDRESS,
        nonce: BigInt(nonceStr),
      });
      const authSig = parseSignature(await account.sign({ hash: authMsg }));

      const result = await client.delegate({
        ephemeralAddress: account.address,
        authorization: {
          chainId: CHAIN_ID.toString(),
          contractAddress: CALIBUR_ADDRESS,
          nonce: String(nonceStr),
          yParity: Number(authSig.yParity),
          r: authSig.r,
          s: authSig.s,
        },
      });

      await waitForDelegation(account.address);
      return result;
    },
  });
}
