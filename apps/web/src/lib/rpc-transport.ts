import { fallback, http } from "viem";

export const RPC_REQUEST_TIMEOUT_MS = 4_000;

const RPC_RANK_INTERVAL_MS = 60_000;
const RPC_RANK_SAMPLE_COUNT = 5;
const RPC_RANK_TIMEOUT_MS = 1_000;

export function resolveRpcUrls({
  primary,
  fallbacks,
  defaults,
}: {
  primary: string | undefined;
  fallbacks: string | undefined;
  defaults: readonly string[];
}): string[] {
  const candidates = [primary, ...(fallbacks?.split(",") ?? []), ...defaults];
  const urls: string[] = [];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value || urls.includes(value)) continue;

    let protocol: string;
    try {
      protocol = new URL(value).protocol;
    } catch {
      throw new Error(`Invalid public RPC URL: ${value}`);
    }
    if (protocol !== "http:" && protocol !== "https:") {
      throw new Error(`Public RPC URL must use http:// or https://: ${value}`);
    }

    urls.push(value);
  }

  if (urls.length === 0) throw new Error("At least one public RPC URL is required.");
  return urls;
}

/**
 * Creates one bounded RPC transport shared by public reads and locally signed
 * paper-wallet writes. A failed endpoint is tried once before moving to the
 * next one; retrying the whole list would reintroduce minute-long waits when an
 * ISP blackholes every configured host.
 *
 * Ranking is enabled only for the singleton browser public client. Connector
 * wallet clients leave it off because each `getProvider()` creates a client and
 * every ranked transport owns a background probe loop.
 */
export function createRpcTransport(urls: readonly string[], options: { rank?: boolean } = {}) {
  if (urls.length === 0) throw new Error("At least one public RPC URL is required.");

  return fallback(
    urls.map((url) =>
      http(url, {
        retryCount: 0,
        timeout: RPC_REQUEST_TIMEOUT_MS,
      }),
    ),
    {
      retryCount: 0,
      rank:
        options.rank && urls.length > 1
          ? {
              interval: RPC_RANK_INTERVAL_MS,
              ping: ({ transport }) => transport.request({ method: "eth_blockNumber" }),
              sampleCount: RPC_RANK_SAMPLE_COUNT,
              timeout: RPC_RANK_TIMEOUT_MS,
            }
          : false,
    },
  );
}
