import {
  type Want,
  type WantWrite,
  wantContactFrom,
  wantSchema,
  wantWriteSchema,
} from "@clc/core/features/wants/logic";
import { z } from "zod";
import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";

const cursorSchema = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform(Number);
const wantPageSchema = z.object({
  wants: z.array(wantSchema),
  first: cursorSchema.default(0),
  last: cursorSchema.default(0),
  tagFacets: z
    .array(z.object({ tag: z.string(), count: z.number().int().nonnegative() }))
    .optional(),
});
const wantResultSchema = z.object({ want: wantSchema });

export type WantPage = z.infer<typeof wantPageSchema>;
export type WantsClient = ReturnType<typeof createWantsClient>;
export type WantsParams = {
  cursor?: number;
  next?: boolean;
  perPage?: number;
  q?: string;
  tags?: readonly string[];
  tagMatch?: "any" | "all";
  facets?: boolean;
  nearby?: boolean;
  bbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  pools?: readonly { chainId: number; address: string }[];
};

function withContact(want: Want): Want {
  return { ...want, contact: wantContactFrom(want) };
}

export function createWantsClient(http: HttpClient) {
  async function read<S extends z.ZodType>(schema: S, path: string, init: RequestInit) {
    const parsed = schema.safeParse(
      await http.request<unknown>(path, { cache: "no-store", ...init }),
    );
    if (!parsed.success) {
      throw new BackendApiError(NO_HTTP_STATUS, "Invalid Want response", undefined, {
        kind: "protocol",
      });
    }
    return parsed.data;
  }

  function listPath(base: string, params: WantsParams) {
    const query = new URLSearchParams({ perPage: String(params.perPage ?? 20) });
    if (params.cursor) query.set("cursor", String(params.cursor));
    if (params.cursor && params.next !== undefined) query.set("next", String(params.next));
    if (params.q?.trim()) query.set("q", params.q.trim());
    if (params.tags?.length) query.set("tags", params.tags.join(","));
    if (params.tagMatch === "all" && (params.tags?.length ?? 0) > 1) query.set("tagMatch", "all");
    if (params.facets) query.set("facets", "true");
    if (params.nearby) query.set("nearby", "true");
    if (params.bbox)
      query.set(
        "bbox",
        [params.bbox.minLng, params.bbox.minLat, params.bbox.maxLng, params.bbox.maxLat].join(","),
      );
    if (params.pools?.length)
      query.set("pools", params.pools.map((pool) => `${pool.chainId}:${pool.address}`).join(","));
    return `${base}?${query}`;
  }

  return {
    async list(params: WantsParams, signal?: AbortSignal): Promise<WantPage> {
      const page = await read(wantPageSchema, listPath("/api/v2/wants", params), {
        method: "GET",
        credentials: params.nearby ? "include" : "omit",
        signal,
      });
      return { ...page, wants: page.wants.map(withContact) };
    },
    async pool(poolAddress: string, params: WantsParams, signal?: AbortSignal): Promise<WantPage> {
      const page = await read(
        wantPageSchema,
        listPath(`/api/v2/pools/${encodeURIComponent(poolAddress)}/wants`, params),
        { method: "GET", credentials: "omit", signal },
      );
      return { ...page, wants: page.wants.map(withContact) };
    },
    async mine(params: WantsParams, signal?: AbortSignal): Promise<WantPage> {
      const page = await read(wantPageSchema, listPath("/api/v2/users/me/wants", params), {
        method: "GET",
        signal,
      });
      return { ...page, wants: page.wants.map(withContact) };
    },
    async detail(id: string, signal?: AbortSignal): Promise<Want> {
      const result = await read(wantResultSchema, `/api/v2/wants/${encodeURIComponent(id)}`, {
        method: "GET",
        credentials: "omit",
        signal,
      });
      return withContact(result.want);
    },
    async create(input: WantWrite, signal?: AbortSignal): Promise<Want> {
      return save("/api/v2/users/me/wants", "POST", input, signal);
    },
    async update(id: string, input: WantWrite, signal?: AbortSignal): Promise<Want> {
      return save(`/api/v2/users/me/wants/${encodeURIComponent(id)}`, "PUT", input, signal);
    },
    async reopen(id: string, input: WantWrite, signal?: AbortSignal): Promise<Want> {
      return save(`/api/v2/users/me/wants/${encodeURIComponent(id)}/reopen`, "POST", input, signal);
    },
    close(id: string, signal?: AbortSignal) {
      return http.request(`/api/v2/users/me/wants/${encodeURIComponent(id)}/close`, {
        method: "POST",
        signal,
      });
    },
    remove(id: string, signal?: AbortSignal) {
      return http.request(`/api/v2/users/me/wants/${encodeURIComponent(id)}`, {
        method: "DELETE",
        signal,
      });
    },
  };

  async function save(
    path: string,
    method: "POST" | "PUT",
    input: WantWrite,
    signal?: AbortSignal,
  ) {
    const parsed = wantWriteSchema.parse(input);
    const result = await read(wantResultSchema, path, {
      method,
      body: JSON.stringify({
        ...parsed,
        locationName: parsed.location.locationName,
        geoLat: parsed.location.lat,
        geoLng: parsed.location.lng,
        location: undefined,
      }),
      signal,
    });
    return withContact(result.want);
  }
}
