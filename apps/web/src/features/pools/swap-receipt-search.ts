import { z } from "zod";

import { receiptUoaSchema, receiptUoaValueSchema } from "#/features/wallet/send-receipt-search";

export const swapReceiptSearchSchema = z
  .object({
    trackingId: z.string().optional().catch(undefined),
    sendAmount: z.string().optional().catch(undefined),
    sendSymbol: z.string().optional().catch(undefined),
    sendToken: z.string().optional().catch(undefined),
    receiveAmount: z.string().optional().catch(undefined),
    receiveSymbol: z.string().optional().catch(undefined),
    receiveToken: z.string().optional().catch(undefined),
    receiveDecimals: z.number().int().min(0).max(255).optional().catch(undefined),
    poolName: z.string().optional().catch(undefined),
    sendUoaValue: receiptUoaValueSchema,
    sendUoa: receiptUoaSchema,
    sendUoaUnavailable: z.boolean().optional().catch(undefined),
    receiveUoaValue: receiptUoaValueSchema,
    receiveUoa: receiptUoaSchema,
    receiveUoaUnavailable: z.boolean().optional().catch(undefined),
  })
  .transform((receipt) => {
    const hasSendValuation = receipt.sendUoaValue !== undefined && receipt.sendUoa !== undefined;
    const hasReceiveValuation =
      receipt.receiveUoaValue !== undefined && receipt.receiveUoa !== undefined;
    return {
      ...receipt,
      sendUoaValue: hasSendValuation ? receipt.sendUoaValue : undefined,
      sendUoa: hasSendValuation ? receipt.sendUoa : undefined,
      sendUoaUnavailable:
        !hasSendValuation &&
        (receipt.sendUoaUnavailable === true ||
          receipt.sendUoaValue !== undefined ||
          receipt.sendUoa !== undefined)
          ? true
          : undefined,
      receiveUoaValue: hasReceiveValuation ? receipt.receiveUoaValue : undefined,
      receiveUoa: hasReceiveValuation ? receipt.receiveUoa : undefined,
      receiveUoaUnavailable:
        !hasReceiveValuation &&
        (receipt.receiveUoaUnavailable === true ||
          receipt.receiveUoaValue !== undefined ||
          receipt.receiveUoa !== undefined)
          ? true
          : undefined,
    };
  });
