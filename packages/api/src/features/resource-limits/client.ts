import { z } from "zod";
import type { HttpClient } from "../../client/http-client";

const quotaSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  unlimited: z.boolean(),
  canCreate: z.boolean(),
});
const usageSchema = z.object({
  vouchers: quotaSchema,
  pools: quotaSchema,
  catalogs: quotaSchema,
  offers: quotaSchema,
  wants: quotaSchema,
});
export type ResourceUsage = z.infer<typeof usageSchema>;
export type ResourceKind = keyof ResourceUsage;
export type ResourceUsageRequest = { voucher?: string };

export function createResourceLimitsClient(http: HttpClient) {
  return {
    async usage(request: ResourceUsageRequest = {}, signal?: AbortSignal): Promise<ResourceUsage> {
      const query = new URLSearchParams();
      if (request.voucher?.trim()) query.set("voucher", request.voucher.trim());
      const suffix = query.size ? `?${query}` : "";
      const result = await http.request<{ usage: unknown }>(
        `/api/v2/users/me/resource-usage${suffix}`,
        {
          method: "GET",
          cache: "no-store",
          signal,
        },
      );
      return usageSchema.parse(result.usage);
    },
  };
}
