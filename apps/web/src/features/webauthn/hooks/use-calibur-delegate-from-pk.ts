import { eip7702AuthMessage, isEip7702Delegated } from "@clc/core/features/webauthn/index";
import { useMutation } from "@tanstack/react-query";
import { createPublicClient, http, parseSignature } from "viem";
import type { PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "wagmi/chains";

import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { CALIBUR_ADDRESS } from "#/lib/backend-config";

const CHAIN_ID = BigInt(import.meta.env.VITE_CHAIN_ID ?? "42220");
const PUBLIC_RPC_URL =
  (import.meta.env.VITE_PUBLIC_RPC_URL as string | undefined) ?? "https://forno.celo.org";
export const DELEGATION_TIMEOUT_MS = 120_000;
export const DELEGATION_POLL_MS = 2_000;

const defaultPublicClient = createPublicClient({
  chain: celo,
  transport: http(PUBLIC_RPC_URL),
});

export async function waitForDelegation(
  address: `0x${string}`,
  viemClient: Pick<PublicClient, "getCode"> = defaultPublicClient,
  timeoutMs = DELEGATION_TIMEOUT_MS,
  pollMs = DELEGATION_POLL_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const code = await viemClient.getCode({ address });
    if (isEip7702Delegated(code, CALIBUR_ADDRESS)) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
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
