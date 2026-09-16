import type { ManagedReportsParams } from "@clc/api/features/reports/client";
import { myReportQueryOptions, myReportsQueryOptions } from "@clc/api/features/reports/queries";
import { useQuery } from "@tanstack/react-query";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { reportsClient } from "#/lib/api/reports";

/** One screenful. The author's own list is not a browsing surface. */
const MY_POSTS_PAGE_SIZE = 20;

/**
 * Every post the signed-in author has written, in any status.
 *
 * Keyed on the backend session's address, never the wallet connector's: this app
 * can hold a connected wallet with no session, and keying on the wallet would
 * file one account's drafts under another's key.
 */
export function useMyPosts(params: Partial<ManagedReportsParams> = {}) {
  const { session } = useAuthStatus();

  return useQuery(
    myReportsQueryOptions(reportsClient, session?.address, {
      perPage: MY_POSTS_PAGE_SIZE,
      ...params,
    }),
  );
}

/** One of the author's own posts, in any status — what the editor loads. */
export function useMyPost(id: string | undefined) {
  const { session } = useAuthStatus();

  return useQuery(myReportQueryOptions(reportsClient, session?.address, id));
}
