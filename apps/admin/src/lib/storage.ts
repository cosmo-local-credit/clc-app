import { createImageUploadClient, type ImageUploadClient } from "@clc/api/features/images/client";

/**
 * The image upload service, built on first use.
 *
 * Env is read here, not in @clc/api, matching the clc-core client in ./api.
 * Deliberately lazy: createImageUploadClient rejects an empty base URL, so an
 * eager build would turn a missing VITE_STORAGE_URL into a console that will not
 * load, rather than one whose image controls are simply absent.
 */
const baseUrl = (import.meta.env.VITE_STORAGE_URL ?? "").trim();

/** Whether image controls can be offered. Screens hide them when false. */
export const isStorageConfigured = baseUrl !== "";

let client: ImageUploadClient | null = null;

export function storageClient(): ImageUploadClient {
  if (!client) client = createImageUploadClient({ baseUrl });
  return client;
}
