import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";

import { apiFetch } from "../auth/client";

export async function deployVoucher(
  payload: VoucherDeployPayload,
): Promise<{ trackingId: string }> {
  const result = await apiFetch<{ trackingId?: unknown }>("/api/v2/contracts/token", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (typeof result.trackingId !== "string" || !result.trackingId) {
    throw new Error("Voucher deployment response did not include a tracking ID.");
  }
  return { trackingId: result.trackingId };
}
