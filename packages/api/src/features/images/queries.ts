/**
 * Query identity and option factories for image upload.
 *
 * The upload token is server state even though its endpoint is a POST: it is safe
 * to re-read, and two simultaneous uploads should share one request rather than
 * asking twice. Keeping it in the Query cache — and only there — is what bounds
 * its lifetime to the tab.
 */

import { mutationOptions, queryOptions } from "@tanstack/react-query";

import { backendRetryDelayMs, isRetryableBackendError } from "../../client/errors";
import type { AuthClient } from "../auth/client";
import {
  type ImageUploadClient,
  type UploadImageInput,
  isRetryableStorageError,
  isStorageUnauthorized,
} from "./client";

export const imageKeys = {
  all: ["clc", "images"] as const,
  /**
   * Keyed by the session address, never the connector address: apps/web can hold
   * a connected wallet with no backend session and treats that as a guest, so
   * keying on the wallet would file one account's token under another's key.
   */
  token: (identity: string) => ["clc", "images", "token", identity.toLowerCase()] as const,
} as const;

/**
 * Reads a copy of the session token that JavaScript can send to storage.
 *
 * The token is the 30-day session, so there is no expiry race to manage and
 * nothing to refresh on a timer — hence `staleTime: Infinity`. What matters
 * instead is that the copy never outlives the session it came from: it is removed
 * at every identity boundary, dropped by `gcTime` in an idle tab, and marked
 * `sensitive` so a future persister can exclude it.
 *
 * Never call this from a route loader or during SSR. apps/web dehydrates
 * successful queries into the HTML, and this one must not appear there.
 */
export function storageTokenQueryOptions(auth: AuthClient, identity: string) {
  return queryOptions({
    queryKey: imageKeys.token(identity),
    queryFn: () => auth.getStorageToken(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
    retryDelay: (attempt, error) => backendRetryDelayMs(error, attempt),
    meta: { sensitive: true },
  });
}

/**
 * Uploads one file and resolves to the stored object.
 *
 * There is no `onSuccess` cache work on purpose: a stored object is not yet part
 * of any entity, so nothing in the profile, voucher, pool or report caches may
 * move until a clc-core write succeeds. The caller keeps the returned
 * `UploadedImage` in its draft and sends the URL with the domain mutation.
 *
 * A 401 is handled once inside the mutation function — the cached token is
 * dropped and re-read, then the upload is retried. Query's own retry can re-enter
 * this path for a retryable failure, so one user action can reach two token reads;
 * a second 401 most often means the session itself is gone.
 */
export function uploadImageMutationOptions(
  auth: AuthClient,
  storage: ImageUploadClient,
  identity: string,
) {
  return mutationOptions({
    mutationKey: [...imageKeys.all, "upload", identity.toLowerCase()] as const,
    // Uploading needs the network now. A paused mutation holding a File is not
    // durable across a reload, so it must not pretend to be queued.
    networkMode: "online" as const,
    gcTime: 60_000,
    mutationFn: async (input: UploadImageInput, context) => {
      const tokenOptions = storageTokenQueryOptions(auth, identity);
      const session = await context.client.fetchQuery(tokenOptions);

      try {
        return await storage.upload(input, session.token);
      } catch (error) {
        if (!isStorageUnauthorized(error)) throw error;

        context.client.removeQueries({ queryKey: tokenOptions.queryKey, exact: true });
        const refreshed = await context.client.fetchQuery(tokenOptions);
        return storage.upload(input, refreshed.token);
      }
    },
    retry: (failureCount: number, error: unknown) =>
      failureCount < 1 && isRetryableStorageError(error),
  });
}
