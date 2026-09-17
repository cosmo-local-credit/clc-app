import { normalizeSymbolPrefix } from "@clc/core/lib/symbol";
import type { HttpClient } from "../../client/http-client";

export type SymbolKind = "voucher" | "pool";

export type TakenSymbols = {
  kind: SymbolKind;
  prefix: string;
  taken: string[];
};

export type SymbolsClient = ReturnType<typeof createSymbolsClient>;

/**
 * Occupancy reads for the ticker generator. The backend answers which symbols
 * under a stem are already in the catalog or in an in-flight deploy; the client
 * picks. Nothing is reserved — the deploy transaction is the claim.
 */
export function createSymbolsClient(http: HttpClient) {
  return {
    async getTakenSymbols(
      kind: SymbolKind,
      prefix: string,
      init?: { signal?: AbortSignal },
    ): Promise<TakenSymbols> {
      const normalizedPrefix = normalizeSymbolPrefix(prefix);
      if (!normalizedPrefix) {
        throw new Error("Symbol prefix must be 1–6 letters or digits.");
      }
      const search = new URLSearchParams({ kind, prefix: normalizedPrefix });
      const result = await http.request<{ taken?: unknown }>(`/api/v2/symbols?${search}`, {
        method: "GET",
        cache: "no-store",
        signal: init?.signal,
      });
      const taken = Array.isArray(result.taken)
        ? result.taken.flatMap((entry) => {
            const symbol = typeof entry === "string" ? normalizeSymbolPrefix(entry) : null;
            return symbol ? [symbol] : [];
          })
        : [];
      return { kind, prefix: normalizedPrefix, taken };
    },
  };
}
