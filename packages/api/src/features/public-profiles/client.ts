import {
  profileActivitySchema,
  profileResourceSchema,
  publicProfileDetailsSchema,
  publicProfileIdentitySchema,
  publicProfileSchema,
  type ProfileSection,
} from "@clc/core/features/public-profiles/logic";
import { z } from "zod";
import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";

const profileResult = z.object({ profile: publicProfileSchema });
const detailsResult = z.object({ details: publicProfileDetailsSchema });
const resourcePage = z.object({
  items: z.array(profileResourceSchema),
  nextCursor: z.string().nullish(),
});
const activityPage = z.object({
  items: z.array(profileActivitySchema),
  nextCursor: z.string().nullish(),
});
const identitiesResult = z.object({ profiles: z.array(publicProfileIdentitySchema) });
export type ProfileResourceKind = "voucher" | "pool" | "want" | "catalog" | "post";
export type PublicProfilesClient = ReturnType<typeof createPublicProfilesClient>;

export function createPublicProfilesClient(http: HttpClient) {
  async function read<S extends z.ZodType>(
    schema: S,
    path: string,
    signal?: AbortSignal,
    privateRead = false,
  ) {
    const result = schema.safeParse(
      await http.request<unknown>(path, {
        method: "GET",
        credentials: privateRead ? "include" : "omit",
        cache: "no-store",
        signal,
      }),
    );
    if (!result.success) {
      throw new BackendApiError(NO_HTTP_STATUS, "Invalid profile response", undefined, {
        kind: "protocol",
      });
    }
    return result.data;
  }
  const base = (address: string) => `/api/v2/profiles/${encodeURIComponent(address.toLowerCase())}`;
  function pagePath(address: string, section: ProfileSection, cursor?: string) {
    const params = new URLSearchParams({ perPage: "20" });
    if (cursor) params.set("cursor", cursor);
    return `${base(address)}/${section}?${params}`;
  }
  return {
    async detail(address: string, signal?: AbortSignal) {
      return (await read(profileResult, base(address), signal)).profile;
    },
    async details(address: string, signal?: AbortSignal) {
      return (await read(detailsResult, `${base(address)}/details`, signal, true)).details;
    },
    resources(
      address: string,
      section: Exclude<ProfileSection, "activity">,
      cursor?: string,
      signal?: AbortSignal,
    ) {
      return read(resourcePage, pagePath(address, section, cursor), signal);
    },
    activity(address: string, cursor?: string, signal?: AbortSignal) {
      return read(activityPage, pagePath(address, "activity", cursor), signal);
    },
    async forResource(kind: ProfileResourceKind, id: string, signal?: AbortSignal) {
      return (
        await read(
          identitiesResult,
          `/api/v2/profiles/resource/${kind}/${encodeURIComponent(id)}`,
          signal,
        )
      ).profiles;
    },
  };
}
