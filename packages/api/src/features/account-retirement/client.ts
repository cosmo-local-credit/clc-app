import {
  accountLifecycleEventSchema,
  accountLifecycleStateSchema,
  accountRetirementPreviewSchema,
  moderationEventSchema,
} from "@clc/core/features/account-retirement/logic";
import { z } from "zod";

import type { HttpClient } from "../../client/http-client";

const eventsSchema = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullable()
    .transform((value) => value ?? []);

const adminAccountRetirementSchema = accountLifecycleStateSchema.extend({
  events: eventsSchema(accountLifecycleEventSchema),
  preview: accountRetirementPreviewSchema,
});

export type AccountRetirementClient = ReturnType<typeof createAccountRetirementClient>;

/** The caller's own retirement, and operators' retire, restore and moderation history. */
export function createAccountRetirementClient(http: HttpClient) {
  const get = <T>(path: string, signal?: AbortSignal) =>
    http.request<T>(path, { method: "GET", cache: "no-store", signal });
  const send = <T>(path: string, method: "POST" | "PUT", body?: unknown) =>
    http.request<T>(path, {
      method,
      cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const adminPath = (address: string) => `/api/v2/admin/users/${encodeURIComponent(address)}`;

  return {
    async preview(signal?: AbortSignal) {
      const result = await get<{ preview: unknown }>("/api/v2/users/me/retirement/preview", signal);
      return accountRetirementPreviewSchema.parse(result.preview);
    },
    async retire(body: { acknowledged: true; reason?: string }) {
      return accountLifecycleStateSchema.parse(
        await send<unknown>("/api/v2/users/me/retirement", "POST", body),
      );
    },
    async restore() {
      return accountLifecycleStateSchema.parse(
        await send<unknown>("/api/v2/users/me/retirement/restore", "POST"),
      );
    },
    async adminGet(address: string, signal?: AbortSignal) {
      return adminAccountRetirementSchema.parse(
        await get<unknown>(`${adminPath(address)}/retirement`, signal),
      );
    },
    async adminRetire(address: string, body: { reason?: string } = {}) {
      return accountLifecycleStateSchema.parse(
        await send<unknown>(`${adminPath(address)}/retirement`, "POST", body),
      );
    },
    async adminRestore(address: string) {
      return accountLifecycleStateSchema.parse(
        await send<unknown>(`${adminPath(address)}/retirement/restore`, "POST"),
      );
    },
    async moderationHistory(address: string, signal?: AbortSignal) {
      const result = await get<{ events: unknown }>(
        `${adminPath(address)}/moderation-history`,
        signal,
      );
      return eventsSchema(moderationEventSchema).parse(result.events);
    },
  };
}
