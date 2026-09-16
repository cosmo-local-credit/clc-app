import { uploadImageMutationOptions } from "@clc/api/features/images/queries";
import { useMutation } from "@tanstack/react-query";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { authClient } from "#/lib/api/auth";
import { storageClient } from "#/lib/api/storage";

/**
 * Uploads one image and resolves to the stored object.
 *
 * The shared factory in @clc/api owns the behaviour: it reads the session token
 * through the Query cache so simultaneous uploads share one request, retries a
 * retryable storage failure once, and re-reads the token once on a 401. Nothing
 * about this app differs there, so nothing is reimplemented here.
 *
 * Keyed by the backend session's address, never the wallet connector's: this app
 * can hold a connected wallet with no session and treats that as a guest, so
 * keying on the wallet would file one account's token under another's key.
 */
export function useImageUpload() {
  const { session } = useAuthStatus();

  return useMutation(
    uploadImageMutationOptions(authClient, storageClient(), session?.address ?? ""),
  );
}
