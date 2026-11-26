import {
  type RegionInput,
  regionCountryBoundarySchema,
  regionCountrySchema,
  regionSchema,
} from "@clc/core/features/regions/logic";
import { z } from "zod";
import { getAddress } from "viem";
import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";

const adminPath = "/api/v2/admin/regions";
const regionsResult = z.object({ regions: z.array(regionSchema) });
const regionResult = z.object({ region: regionSchema });
const countriesResult = z.object({ countries: z.array(regionCountrySchema) });
const countryResult = z.object({ country: regionCountryBoundarySchema });

export type RegionsClient = ReturnType<typeof createRegionsClient>;

export function createRegionsClient(http: HttpClient) {
  async function request<S extends z.ZodType>(
    schema: S,
    path: string,
    options: RequestInit,
  ): Promise<z.infer<S>> {
    const response = schema.safeParse(
      await http.request<unknown>(path, {
        ...options,
        credentials: "include",
        cache: "no-store",
      }),
    );
    if (!response.success) {
      throw new BackendApiError(NO_HTTP_STATUS, "Invalid region response", undefined, {
        kind: "protocol",
      });
    }
    return response.data;
  }

  const regionPath = (id: string) => `${adminPath}/${encodeURIComponent(id)}`;
  // Core resolves a preset's canonical boundary. Sending the preview would let
  // clients accidentally redefine the country or exceed the write body limit.
  const regionBody = (input: RegionInput & { revision?: number }) =>
    JSON.stringify(input.countryCode ? { ...input, boundary: undefined } : input);
  return {
    async list(signal?: AbortSignal) {
      return (await request(regionsResult, adminPath, { method: "GET", signal })).regions;
    },
    async myRegions(signal?: AbortSignal) {
      return (await request(regionsResult, "/api/v2/regions/me", { method: "GET", signal }))
        .regions;
    },
    async countries(signal?: AbortSignal) {
      return (await request(countriesResult, `${adminPath}/countries`, { method: "GET", signal }))
        .countries;
    },
    async country(code: string, signal?: AbortSignal) {
      return (
        await request(countryResult, `${adminPath}/countries/${encodeURIComponent(code)}`, {
          method: "GET",
          signal,
        })
      ).country;
    },
    async create(input: RegionInput, signal?: AbortSignal) {
      return (
        await request(regionResult, adminPath, {
          method: "POST",
          body: regionBody(input),
          signal,
        })
      ).region;
    },
    async update(id: string, input: RegionInput & { revision: number }, signal?: AbortSignal) {
      return (
        await request(regionResult, regionPath(id), {
          method: "PUT",
          body: regionBody(input),
          signal,
        })
      ).region;
    },
    async setAssignment(
      id: string,
      address: string,
      assigned: boolean,
      confirmGlobalConversion = false,
      signal?: AbortSignal,
    ) {
      return (
        await request(
          regionResult,
          `${regionPath(id)}/assignments/${encodeURIComponent(getAddress(address))}`,
          { method: "PUT", body: JSON.stringify({ assigned, confirmGlobalConversion }), signal },
        )
      ).region;
    },
  };
}
