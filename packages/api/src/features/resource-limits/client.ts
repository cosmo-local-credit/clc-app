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

export function createResourceLimitsClient(http: HttpClient) {
  return {
    async usage(signal?: AbortSignal): Promise<ResourceUsage> {
      const result = await http.request<{ usage: unknown }>("/api/v2/users/me/resource-usage", {
        method: "GET",
        cache: "no-store",
        signal,
      });
      return usageSchema.parse(result.usage);
    },
  };
}
