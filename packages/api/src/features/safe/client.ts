import {
  assetOwnerInfoSchema,
  safeConfirmationSchema,
  safeTransactionSchema,
  type SafeTransaction,
} from "@clc/core/features/safe/logic";
import { z } from "zod";
import type { HttpClient } from "../../client/http-client";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hexSchema = z.string().regex(/^0x([a-fA-F0-9]{2})*$/);

/** A Safe transaction as clc-core's Transaction Service proxy reports it. */
const safeProposalSchema = safeTransactionSchema.extend({
  safe: addressSchema,
  safeTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  confirmations: z.array(safeConfirmationSchema.extend({ submittedAt: z.string() })),
  confirmationsRequired: z.number().int().min(1),
  isExecuted: z.boolean(),
  isSuccessful: z.boolean().nullable(),
  transactionHash: hexSchema.nullable(),
});
export type SafeProposal = z.infer<typeof safeProposalSchema>;

const pendingSchema = z.object({ results: z.array(safeProposalSchema) });

export type ProposeSafeTransactionInput = {
  safe: `0x${string}`;
  safeTxHash: `0x${string}`;
  sender: `0x${string}`;
  signature: `0x${string}`;
  tx: SafeTransaction;
};

export function createSafeClient(http: HttpClient) {
  return {
    async owner(address: string, signal?: AbortSignal) {
      return assetOwnerInfoSchema.parse(
        await http.request<unknown>(`/api/v2/owners/${encodeURIComponent(address)}`, {
          method: "GET",
          signal,
          cache: "no-store",
        }),
      );
    },
    async propose(input: ProposeSafeTransactionInput) {
      return safeProposalSchema.parse(
        await http.request<unknown>("/api/v2/safe/proposals", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    },
    /** Adds the signed-in signer's confirmation; clc-core re-checks policy and signature. */
    async confirm(input: { safeTxHash: `0x${string}`; signature: `0x${string}` }) {
      return safeProposalSchema.parse(
        await http.request<unknown>("/api/v2/safe/confirmations", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    },
    async pending(safe: string, signal?: AbortSignal) {
      const result = await http.request<unknown>(
        `/api/v2/safe/${encodeURIComponent(safe)}/pending`,
        { method: "GET", signal, cache: "no-store" },
      );
      return pendingSchema.parse(result).results;
    },
  };
}

export type SafeClient = ReturnType<typeof createSafeClient>;
