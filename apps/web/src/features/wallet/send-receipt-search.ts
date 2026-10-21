import { z } from "zod";
import { normalizeUnitOfAccount } from "@clc/core/lib/currencies";

export const receiptUoaValueSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/)
  .optional()
  .catch(undefined);

export const receiptUoaSchema = z
  .string()
  .transform(normalizeUnitOfAccount)
  .pipe(z.string().min(1).max(32))
  .optional()
  .catch(undefined);

/**
 * Reload-safe receipt state. The valuation is an informational snapshot only;
 * the relay and transaction remain authoritative for the transferred amount.
 */
export const sendReceiptSearchSchema = z
  .object({
    token: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .optional()
      .catch(undefined),
    trackingId: z.string().optional().catch(undefined),
    recipient: z.string().optional().catch(undefined),
    recipientLabel: z.string().optional().catch(undefined),
    amount: z.string().optional().catch(undefined),
    symbol: z.string().optional().catch(undefined),
    uoaValue: receiptUoaValueSchema,
    uoa: receiptUoaSchema,
    uoaUnavailable: z.boolean().optional().catch(undefined),
    /** Pool the send started from, so Done returns there instead of the wallet. */
    returnPool: z.string().optional().catch(undefined),
  })
  .transform(({ uoaValue, uoa, uoaUnavailable, ...receipt }) => {
    const hasValuation = uoaValue !== undefined && uoa !== undefined;
    return {
      ...receipt,
      uoaValue: hasValuation ? uoaValue : undefined,
      uoa: hasValuation ? uoa : undefined,
      uoaUnavailable: !hasValuation && uoaUnavailable === true ? true : undefined,
    };
  });
