import type { SymbolKind } from "@clc/api/features/symbols/client";
import { takenSymbolsQueryOptions } from "@clc/api/features/symbols/queries";
import { candidatesFromName, pickAvailableSymbol, symbolStemFromName } from "@clc/core/lib/symbol";
import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { symbolsClient } from "#/lib/api/symbols";

export type SymbolCheck =
  | { ok: true; symbol: string }
  /** Every candidate is taken, or a hand-typed symbol is. */
  | { ok: false };

/**
 * Derives a symbol from the name so the issuer never has to invent one.
 *
 * The field stays derived until the user edits it away from the suggestion;
 * clearing it hands control back. Occupancy is advisory — the deploy is the
 * claim — so a lookup that fails still yields the bare stem rather than an
 * empty field.
 */
export function useSuggestedSymbol({
  kind,
  initialSymbol,
}: {
  kind: SymbolKind;
  initialSymbol: string;
}) {
  const queryClient = useQueryClient();
  // A restored draft already carries a symbol the user reviewed; leave it alone.
  const source = useRef<"auto" | "manual">(initialSymbol ? "manual" : "auto");
  const lastSuggestion = useRef<string | undefined>(undefined);
  const requestSeq = useRef(0);

  async function takenUnder(prefix: string): Promise<ReadonlySet<string>> {
    try {
      const result = await queryClient.fetchQuery(
        takenSymbolsQueryOptions(symbolsClient, kind, prefix),
      );
      return new Set(result.taken);
    } catch {
      return new Set();
    }
  }

  return {
    /**
     * The symbol to write for `name`, or `undefined` when the field is the
     * user's now, the name yields nothing, or a newer suggestion superseded
     * this one while it was in flight.
     */
    async suggest(name: string): Promise<string | undefined> {
      if (source.current === "manual") return undefined;
      const stem = symbolStemFromName(name);
      if (!stem) return undefined;
      const seq = ++requestSeq.current;
      const picked = pickAvailableSymbol(candidatesFromName(name), await takenUnder(stem));
      if (seq !== requestSeq.current) return undefined;
      if (picked) lastSuggestion.current = picked;
      return picked;
    },

    /** Call with every symbol edit so a typed value stops the auto-fill. */
    track(symbol: string) {
      source.current = symbol === "" || symbol === lastSuggestion.current ? "auto" : "manual";
      // A typed value also cancels any suggestion still in flight.
      if (source.current === "manual") requestSeq.current += 1;
    },

    /**
     * Submit re-check. A derived symbol that was taken since the blur bumps to
     * the next free candidate; a hand-typed one is never rewritten.
     */
    async confirm(name: string, symbol: string): Promise<SymbolCheck> {
      if (source.current === "manual") {
        const taken = await takenUnder(symbol);
        return taken.has(symbol) ? { ok: false } : { ok: true, symbol };
      }
      const stem = symbolStemFromName(name);
      if (!stem) return { ok: true, symbol };
      const taken = await takenUnder(stem);
      if (!taken.has(symbol)) return { ok: true, symbol };
      const next = pickAvailableSymbol(candidatesFromName(name), taken);
      if (!next) return { ok: false };
      lastSuggestion.current = next;
      return { ok: true, symbol: next };
    },
  };
}
