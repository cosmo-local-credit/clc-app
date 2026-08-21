import { uploadImageMutationOptions } from "@clc/api/features/images/queries";
import { useMutation } from "@tanstack/react-query";

import { useAdminSession } from "#/features/auth/admin-session";
import { clcApi } from "#/lib/api";
import { storageClient } from "#/lib/storage";

/**
 * Uploads one image and resolves to the stored object.
 *
 * The shared factory in @clc/api owns the behaviour: it reads the session token
 * through the Query cache so simultaneous uploads share one request, retries a
 * retryable storage failure once, and re-reads the token once on a 401. Nothing
 * about the console differs there, so nothing is reimplemented here.
 *
 * Keyed by the operator's session address, which is what the token is a fact
 * about — so signing out drops it with the rest of the `["clc", …]` cache.
 */
export function useImageUpload() {
  const session = useAdminSession();
  const identity = session.status === "authenticated" ? session.operator.address : "";

  return useMutation(uploadImageMutationOptions(clcApi.auth, storageClient(), identity));
}
