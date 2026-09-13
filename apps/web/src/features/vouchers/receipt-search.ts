import { z } from "zod";

const AMOUNT = /^\d+(?:\.\d+)?$/;

/**
 * Search params of the deployment receipt.
 *
 * The router JSON-parses every search value, so an amount written into a URL
 * by hand or by string concatenation (`?mintAmount=2000`) arrives as a number,
 * while one the router serialised itself arrives as a string. Both are the
 * same amount; the page wants it as the decimal string the issuer typed.
 */
export const voucherReceiptSearchSchema = z.object({
  trackingId: z.string().min(1).optional().catch(undefined),
  mintTrackingId: z.string().min(1).optional().catch(undefined),
  mintAmount: z
    .union([z.string(), z.number()])
    .transform((value) => String(value))
    .pipe(z.string().regex(AMOUNT))
    .optional()
    .catch(undefined),
});

export type VoucherReceiptSearch = z.infer<typeof voucherReceiptSearchSchema>;
