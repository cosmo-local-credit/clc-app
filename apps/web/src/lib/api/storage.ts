import { createImageUploadClient, type ImageUploadClient } from "@clc/api/features/images/client";

/**
 * The image upload service, built on first use.
 *
 * Env is read here rather than in @clc/api, like the clc-core client beside it.
 * Unlike that one it is *not* constructed at module load: uploads are optional
 * everywhere they appear, and createImageUploadClient rejects an empty base URL,
 * so an eager build would turn a missing VITE_STORAGE_URL into a blank screen
 * instead of a hidden button.
 */
const baseUrl = (import.meta.env.VITE_STORAGE_URL ?? "").trim();

/** Whether uploads can be offered at all. Screens hide the affordance when false. */
export const isStorageConfigured = baseUrl !== "";

let client: ImageUploadClient | null = null;

export function storageClient(): ImageUploadClient {
  if (!client) client = createImageUploadClient({ baseUrl });
  return client;
}
