import type { UploadedImage } from "@clc/api/features/images/client";
import type { ImagePurpose } from "@clc/api/features/images/policy";
import { importImageMutationOptions } from "@clc/api/features/images/queries";
import { useMutation, useMutationState } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { authClient } from "#/lib/api/auth";
import { storageClient } from "#/lib/api/storage";

/** A form's pending import: the source it asked for and the object name it waits on. */
export type PendingImageImport = { source: string; uploadId: string };

type ImportState = {
  status: "idle" | "pending" | "success" | "error";
  submittedAt: number;
  data: UploadedImage | undefined;
};

/**
 * Runs the import a form is waiting on and reports how it ended.
 *
 * The pending import is form state, not this hook's: a form field holds it so
 * it rides the view draft across a layout switch. The mutation lives in the
 * Query cache under one key per source, so the view arriving after a switch
 * joins the running import instead of firing a second one, and reads the result
 * through `useMutationState`, since a `mutate` callback dies with the view that
 * fired it.
 *
 * `onImported` / `onFailed` are called only while `pending` still names the
 * import: a person who uploads or removes an image first clears it, and a late
 * result then matches nothing and is dropped.
 */
export function useImageImport({
  purpose,
  pending,
  onImported,
  onFailed,
}: {
  purpose: ImagePurpose;
  pending: PendingImageImport | null;
  onImported: (url: string) => void;
  onFailed: () => void;
}) {
  const { session } = useAuthStatus();
  // The storage client is resolved when an import runs, never at render: every
  // create form mounts this hook, uploads or not.
  const options = importImageMutationOptions(
    authClient,
    () => storageClient(),
    session?.address ?? "",
    { purpose, uploadId: pending?.uploadId ?? "" },
  );
  const { mutate } = useMutation(options);
  const states = useMutationState({
    filters: { mutationKey: options.mutationKey, exact: true },
    select: (mutation): ImportState => ({
      status: mutation.state.status,
      submittedAt: mutation.state.submittedAt,
      data: mutation.state.data as UploadedImage | undefined,
    }),
  });
  /**
   * The import this form fired or joined, and from when. Results submitted
   * before it are an earlier visit's, so a stale failure cannot end this one.
   */
  const run = useRef<{ uploadId: string; since: number } | null>(null);
  const callbacks = useRef({ onImported, onFailed });
  callbacks.current = { onImported, onFailed };

  useEffect(() => {
    if (!pending) return;
    if (run.current?.uploadId !== pending.uploadId) {
      const latest = states.at(-1);
      if (latest && (latest.status === "pending" || latest.status === "success")) {
        run.current = { uploadId: pending.uploadId, since: latest.submittedAt };
      } else {
        run.current = { uploadId: pending.uploadId, since: Date.now() };
        mutate({ source: pending.source, purpose, uploadId: pending.uploadId });
        return;
      }
    }
    const since = run.current.since;
    const current = states.filter((state) => state.submittedAt >= since).at(-1);
    if (current?.status === "success" && current.data)
      callbacks.current.onImported(current.data.url);
    else if (current?.status === "error") callbacks.current.onFailed();
  }, [mutate, pending, purpose, states]);
}
