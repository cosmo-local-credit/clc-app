/**
 * Query identity and option factories for image upload.
 *
 * The upload token is server state even though its endpoint is a POST: it is safe
 * to re-read, and two simultaneous uploads should share one request rather than
 * asking twice. Keeping it in the Query cache — and only there — is what bounds
 * its lifetime to the tab.
 */

import { mutationOptions, type QueryClient, queryOptions } from "@tanstack/react-query";

import { backendRetryDelayMs, isRetryableBackendError } from "../../client/errors";
import type { AuthClient } from "../auth/client";
import type { ImagePurpose } from "./policy";
import {
  type ImageUploadClient,
  type ImportImageInput,
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
 * Runs one storage request with the cached token, dropping and re-reading it
 * once on a 401.
 */
async function withStorageToken<T>(
  auth: AuthClient,
  identity: string,
  client: QueryClient,
  run: (token: string) => Promise<T>,
): Promise<T> {
  const tokenOptions = storageTokenQueryOptions(auth, identity);
  const session = await client.fetchQuery(tokenOptions);
  try {
    return await run(session.token);
  } catch (error) {
    if (!isStorageUnauthorized(error)) throw error;
    client.removeQueries({ queryKey: tokenOptions.queryKey, exact: true });
    const refreshed = await client.fetchQuery(tokenOptions);
    return run(refreshed.token);
  }
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
 *
 * `storage` is a getter, read only when an upload runs: the app's client rejects
 * an unset storage URL, and a screen that merely offers uploads must still render
 * without one.
 */
export function uploadImageMutationOptions(
  auth: AuthClient,
  storage: () => ImageUploadClient,
  identity: string,
) {
  return mutationOptions({
    mutationKey: [...imageKeys.all, "upload", identity.toLowerCase()] as const,
    // Uploading needs the network now. A paused mutation holding a File is not
    // durable across a reload, so it must not pretend to be queued.
    networkMode: "online" as const,
    gcTime: 60_000,
    mutationFn: (input: UploadImageInput, context) =>
      withStorageToken(auth, identity, context.client, (token) => storage().upload(input, token)),
    retry: (failureCount: number, error: unknown) =>
      failureCount < 1 && isRetryableStorageError(error),
  });
}

/**
 * The key an import of one source for one purpose runs under, so every view of
 * a form finds the same mutation: a layout switch while it runs joins it
 * through `useMutationState` instead of firing a second request.
 */
export function importImageMutationKey(purpose: ImagePurpose, uploadId: string) {
  return [...imageKeys.all, "import", purpose, uploadId] as const;
}

/**
 * Has storage-server import one image from an allowlisted source.
 *
 * Same token handling as an upload: read through the Query cache, one re-read
 * on a 401, and one retry of a retryable failure. Like an upload it moves no
 * entity cache; the form holds the stored URL until a clc-core write sends it.
 */
export function importImageMutationOptions(
  auth: AuthClient,
  storage: () => ImageUploadClient,
  identity: string,
  input: { purpose: ImagePurpose; uploadId: string },
) {
  return mutationOptions({
    mutationKey: importImageMutationKey(input.purpose, input.uploadId),
    networkMode: "online" as const,
    // A finished import is what a later mount of the same link applies without
    // asking again, so it outlives the view that fired it for a while.
    gcTime: 5 * 60_000,
    mutationFn: (variables: ImportImageInput, context) =>
      withStorageToken(auth, identity, context.client, (token) =>
        storage().import(variables, token),
      ),
    retry: (failureCount: number, error: unknown) =>
      failureCount < 1 && isRetryableStorageError(error),
  });
}
