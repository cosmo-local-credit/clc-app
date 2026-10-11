import {
  catalogIdSchema,
  catalogKindSchema,
  catalogMemberSchema,
  catalogSchema,
  catalogWriteSchema,
  type CatalogKind,
  type CatalogWrite,
} from "@clc/core/features/catalogs/logic";
import { z } from "zod";
import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";

const catalogPageSchema = z.object({
  catalogs: z.array(catalogSchema),
  nextCursor: z.string().nullable(),
});
const memberPageSchema = z.object({
  items: z.array(catalogMemberSchema),
  nextCursor: z.string().nullable(),
});
const savedSchema = z.object({ catalog: catalogSchema });
const membershipSchema = z.object({ added: z.boolean() });
export type CatalogsClient = ReturnType<typeof createCatalogsClient>;

export function createCatalogsClient(http: HttpClient) {
  async function read<S extends z.ZodType>(
    schema: S,
    path: string,
    init: RequestInit,
  ): Promise<z.output<S>> {
    const result = schema.safeParse(
      await http.request<unknown>(path, { cache: "no-store", ...init }),
    );
    if (!result.success)
      throw new BackendApiError(NO_HTTP_STATUS, "Invalid catalog response", undefined, {
        kind: "protocol",
      });
    return result.data;
  }
  function memberPath(id: string, kind: CatalogKind, resourceId: string) {
    return `/api/v2/catalogs/${catalogIdSchema.parse(id)}/${catalogKindSchema.parse(kind) === "pool" ? "pools" : "vouchers"}/${catalogIdSchema.parse(resourceId)}`;
  }
  return {
    list(
      params: { cursor?: string; nearby?: boolean; perPage?: number; q?: string },
      signal?: AbortSignal,
    ) {
      const query = new URLSearchParams({ perPage: String(params.perPage ?? 20) });
      if (params.cursor) query.set("cursor", params.cursor);
      if (params.nearby) query.set("nearby", "true");
      if (params.q?.trim()) query.set("q", params.q.trim());
      return read(catalogPageSchema, `/api/v2/catalogs?${query}`, {
        method: "GET",
        credentials: params.nearby ? "include" : "omit",
        signal,
      });
    },
    mine(signal?: AbortSignal) {
      return read(catalogPageSchema, "/api/v2/users/me/catalogs", { method: "GET", signal });
    },
    async detail(id: string, signal?: AbortSignal) {
      return (
        await read(savedSchema, `/api/v2/catalogs/${catalogIdSchema.parse(id)}`, {
          method: "GET",
          credentials: "omit",
          signal,
        })
      ).catalog;
    },
    members(id: string, kind: CatalogKind, cursor?: string, signal?: AbortSignal) {
      const query = new URLSearchParams({ perPage: "20" });
      if (cursor) query.set("cursor", cursor);
      return read(
        memberPageSchema,
        `/api/v2/catalogs/${catalogIdSchema.parse(id)}/${catalogKindSchema.parse(kind) === "pool" ? "pools" : "vouchers"}?${query}`,
        { method: "GET", credentials: "omit", signal },
      );
    },
    async create(input: CatalogWrite, signal?: AbortSignal) {
      return (
        await read(savedSchema, "/api/v2/catalogs", {
          method: "POST",
          body: JSON.stringify(catalogWriteSchema.parse(input)),
          signal,
        })
      ).catalog;
    },
    async update(id: string, input: CatalogWrite, signal?: AbortSignal) {
      return (
        await read(savedSchema, `/api/v2/catalogs/${catalogIdSchema.parse(id)}`, {
          method: "PUT",
          body: JSON.stringify(catalogWriteSchema.parse(input)),
          signal,
        })
      ).catalog;
    },
    membership(id: string, kind: CatalogKind, resourceId: string, signal?: AbortSignal) {
      const query = new URLSearchParams({
        kind: catalogKindSchema.parse(kind),
        resourceId: catalogIdSchema.parse(resourceId),
      });
      return read(
        membershipSchema,
        `/api/v2/catalogs/${catalogIdSchema.parse(id)}/membership?${query}`,
        { method: "GET", signal },
      );
    },
    setMember(id: string, kind: CatalogKind, resourceId: string, added: boolean) {
      return read(membershipSchema, memberPath(id, kind, resourceId), {
        method: added ? "PUT" : "DELETE",
      });
    },
  };
}
