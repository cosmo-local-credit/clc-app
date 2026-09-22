import { normalizeDeployName } from "@clc/core/lib/deploy-name";
import type { HttpClient } from "../../client/http-client";

export type NameKind = "voucher" | "pool";

export type NameAvailability = {
  kind: NameKind;
  /** The normalized form the backend actually compared. */
  name: string;
  available: boolean;
};

export type NamesClient = ReturnType<typeof createNamesClient>;

/**
 * Occupancy reads for voucher and pool display names. The backend answers
 * whether a label is already in the catalog or in an in-flight deploy. Nothing
 * is reserved — the deploy transaction is the claim, and it re-runs the check.
 */
export function createNamesClient(http: HttpClient) {
  return {
    async getNameAvailability(
      kind: NameKind,
      name: string,
      init?: { signal?: AbortSignal; exclude?: string },
    ): Promise<NameAvailability> {
      const normalized = normalizeDeployName(name);
      if (!normalized) {
        throw new Error("A name to check is required.");
      }
      const search = new URLSearchParams({ kind, name: normalized });
      if (init?.exclude) search.set("exclude", init.exclude);

      const result = await http.request<{ name?: unknown; available?: unknown }>(
        `/api/v2/names?${search}`,
        { method: "GET", cache: "no-store", signal: init?.signal },
      );
      return {
        kind,
        name: typeof result.name === "string" ? result.name : normalized,
        // This check is advisory. An answer we cannot read must not be the
        // reason someone is told their name is taken.
        available: result.available !== false,
      };
    },
  };
}
