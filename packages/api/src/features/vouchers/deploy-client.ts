import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";

import type { HttpClient } from "../../client/http-client";

export function createVoucherDeployClient(http: HttpClient) {
  return {
    async deployVoucher(payload: VoucherDeployPayload): Promise<{ trackingId: string }> {
      const result = await http.request<{ trackingId?: unknown }>("/api/v2/contracts/token", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (typeof result.trackingId !== "string" || !result.trackingId) {
        throw new Error("Voucher deployment response did not include a tracking ID.");
      }
      return { trackingId: result.trackingId };
    },
  };
}
