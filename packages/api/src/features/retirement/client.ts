import { z } from "zod";
import type { HttpClient } from "../../client/http-client";
import { normalizeMarketVoucherDetail } from "../market/client";
import { normalizeUserPool } from "../pools/client";

const resourceTypeSchema = z.enum(["voucher", "pool"]);
const statusSchema = z.enum(["pending", "approved", "rejected", "cancelled", "invalidated"]);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const rawAmountSchema = z.string().regex(/^\d+$/);

const previewSchema = z
  .object({
    resourceType: resourceTypeSchema,
    resourceAddress: addressSchema,
    chainId: z.number().int().positive(),
    ownerAddress: addressSchema,
    active: z.boolean(),
    symbol: z.string(),
    decimals: z.number().int().min(0).max(255),
    amountOutsideOwnerRaw: rawAmountSchema.nullable(),
    positiveTokenCount: z.number().int().nonnegative().nullable(),
    hasPositiveBalances: z.boolean(),
    blockNumber: rawAmountSchema,
    checkedAt: z.string(),
    coverage: z.enum(["total-supply", "known-tokens"]),
    coverageNote: z.string().nullable(),
  })
  .refine(
    (preview) =>
      preview.resourceType === "voucher"
        ? preview.amountOutsideOwnerRaw !== null
        : preview.positiveTokenCount !== null,
    "The balance check is incomplete.",
  );

const requestSchema = z.object({
  id: z.number().int().positive(),
  resourceType: resourceTypeSchema,
  resourceAddress: addressSchema,
  resourceName: z.string(),
  symbol: z.string(),
  chainId: z.number().int().positive(),
  requesterAddress: addressSchema,
  ownerAddress: addressSchema,
  reason: z.string(),
  status: statusSchema,
  requestedAt: z.string(),
  decisionAt: z.string().nullable(),
  decisionBy: addressSchema.nullable(),
  decisionReason: z.string().nullable(),
  snapshot: previewSchema,
  decisionSnapshot: previewSchema.nullable(),
});

const eventSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["requested", "approved", "rejected", "cancelled", "invalidated", "restored"]),
  actorAddress: addressSchema,
  reason: z.string(),
  createdAt: z.string(),
  requestId: z.number().int().positive().nullable(),
});

const requestsSchema = z
  .array(requestSchema)
  .nullable()
  .transform((value) => value ?? []);
const eventsSchema = z
  .array(eventSchema)
  .nullable()
  .transform((value) => value ?? []);

export type RetirementResourceType = z.infer<typeof resourceTypeSchema>;
export type RetirementRequestStatus = z.infer<typeof statusSchema>;
export type RetirementPreview = z.infer<typeof previewSchema>;
export type RetirementRequest = z.infer<typeof requestSchema>;
export type RetirementEvent = z.infer<typeof eventSchema>;
export type AdminRetirementListParams = {
  status?: RetirementRequestStatus | "all";
  resourceType?: RetirementResourceType;
  cursor?: number;
  perPage?: number;
  /** Absent on the first page. `true` walks older ids; `false` walks newer ones. */
  next?: boolean;
};
export type RetirementClient = ReturnType<typeof createRetirementClient>;

function resourcePath(type: RetirementResourceType, address: string) {
  return `/api/v2/${type === "voucher" ? "vouchers" : "pools"}/${encodeURIComponent(address)}`;
}

export function createRetirementClient(http: HttpClient) {
  const get = <T>(path: string, signal?: AbortSignal) =>
    http.request<T>(path, { method: "GET", cache: "no-store", signal });
  const write = <T>(path: string, method: "PUT" | "POST", body: unknown) =>
    http.request<T>(path, { method, cache: "no-store", body: JSON.stringify(body) });
  const requestResult = async (result: Promise<{ request: unknown }>) =>
    requestSchema.parse((await result).request);

  return {
    async preview(type: RetirementResourceType, address: string, signal?: AbortSignal) {
      const result = await get<{ preview: unknown }>(
        `${resourcePath(type, address)}/retirement-preview`,
        signal,
      );
      return previewSchema.parse(result.preview);
    },
    async listMine(signal?: AbortSignal) {
      const result = await get<{ requests: unknown }>(
        "/api/v2/users/me/retirement-requests",
        signal,
      );
      return requestsSchema.parse(result.requests);
    },
    async listResource(type: RetirementResourceType, address: string, signal?: AbortSignal) {
      const result = await get<{ requests: unknown }>(
        `${resourcePath(type, address)}/retirement-requests`,
        signal,
      );
      return requestsSchema.parse(result.requests);
    },
    create(type: RetirementResourceType, address: string, body: { reason: string }) {
      return requestResult(
        write(`${resourcePath(type, address)}/retirement-requests`, "POST", body),
      );
    },
    cancel(id: number) {
      return requestResult(write(`/api/v2/retirement-requests/${id}/cancel`, "PUT", {}));
    },
    async listAdmin(params: AdminRetirementListParams = {}, signal?: AbortSignal) {
      const query = new URLSearchParams();
      if (params.status !== undefined) query.set("status", params.status);
      if (params.resourceType !== undefined) query.set("resourceType", params.resourceType);
      if (params.perPage !== undefined) query.set("perPage", String(params.perPage));
      if (params.cursor !== undefined) query.set("cursor", String(params.cursor));
      if (params.next !== undefined) query.set("next", params.next ? "true" : "false");
      const result = await get<unknown>(
        `/api/v2/admin/retirement-requests${query.size ? `?${query}` : ""}`,
        signal,
      );
      const page = z
        .object({
          requests: requestsSchema,
          pendingCount: z.number().int().nonnegative(),
          first: z.number().int().nonnegative().optional(),
          last: z.number().int().nonnegative().optional(),
        })
        .parse(result);
      return {
        requests: page.requests,
        pendingCount: page.pendingCount,
        first: page.first ?? 0,
        last: page.last ?? 0,
        receivedCount: page.requests.length,
      };
    },
    async getAdminRequest(id: number, signal?: AbortSignal) {
      const result = await get<unknown>(`/api/v2/admin/retirement-requests/${id}`, signal);
      return z.object({ request: requestSchema, events: eventsSchema }).parse(result);
    },
    async adminResourceHistory(
      type: RetirementResourceType,
      address: string,
      signal?: AbortSignal,
    ) {
      const path = resourcePath(type, address).replace("/api/v2/", "/api/v2/admin/");
      return z
        .object({ requests: requestsSchema, events: eventsSchema })
        .parse(await get<unknown>(`${path}/retirement-history`, signal));
    },
    approve(id: number, body: { acknowledgeBalances: boolean; reason?: string }) {
      return requestResult(write(`/api/v2/admin/retirement-requests/${id}/approve`, "PUT", body));
    },
    reject(id: number, body: { reason: string }) {
      return requestResult(write(`/api/v2/admin/retirement-requests/${id}/reject`, "PUT", body));
    },
    async restore(type: RetirementResourceType, address: string, body: { reason: string }) {
      const path = resourcePath(type, address).replace("/api/v2/", "/api/v2/admin/");
      if (type === "pool") {
        const result = await write<{ pool: Parameters<typeof normalizeUserPool>[0] }>(
          `${path}/restore`,
          "PUT",
          body,
        );
        const pool = normalizeUserPool(result.pool);
        if (!pool) throw new Error("Pool restore response did not include a valid address.");
        return pool;
      }
      const result = await write<{ voucher: Parameters<typeof normalizeMarketVoucherDetail>[0] }>(
        `${path}/restore`,
        "PUT",
        body,
      );
      const voucher = normalizeMarketVoucherDetail(result.voucher);
      if (!voucher) throw new Error("Voucher restore response did not include a valid address.");
      return voucher;
    },
  };
}
