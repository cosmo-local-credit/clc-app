import { createClient, fallback, http } from "viem";
import { celo, celoAlfajores, gnosis } from "viem/chains";
import { CHAIN_ID } from "./chain";

const chains = [gnosis, celo, celoAlfajores];
const clients = new Map<number, ReturnType<typeof createChainClient>>();

function createChainClient(chainId: number) {
  const chain = chains.find((candidate) => candidate.id === chainId);
  if (!chain) throw new Error(`Chain ${chainId} is not supported for contract reads.`);
  return createClient({
    chain,
    transport: fallback(
      chain.rpcUrls.default.http.map((url) => http(url, { timeout: 4_000, retryCount: 0 })),
      { retryCount: 0 },
    ),
  });
}

/** Undecorated clients: each reader imports only the viem actions it needs. */
export function getChainClient(chainId = CHAIN_ID) {
  const existing = clients.get(chainId);
  if (existing) return existing;
  const client = createChainClient(chainId);
  clients.set(chainId, client);
  return client;
}
