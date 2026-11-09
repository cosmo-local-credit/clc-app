import {
  wantContactQueryOptions,
  wantCreatorPoolsInfiniteQueryOptions,
  wantCreatorVouchersInfiniteQueryOptions,
} from "@clc/api/features/wants/queries";
import type { Want } from "@clc/core/features/wants/logic";
import { useLingui } from "@lingui/react/macro";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { wantsClient } from "#/lib/api/wants";

/** The Want's contact details, readable only by a signed-in viewer. */
export function useWantContact(wantId: string) {
  const auth = useAuthStatus();
  return useQuery({
    ...wantContactQueryOptions(wantsClient, wantId, auth.session?.address),
    retry: false,
  });
}

/** The vouchers and pools of the Want's creator, each paged. */
export function useWantCreatorResources(wantId: string) {
  const vouchers = useInfiniteQuery(wantCreatorVouchersInfiniteQueryOptions(wantsClient, wantId));
  const pools = useInfiniteQuery(wantCreatorPoolsInfiniteQueryOptions(wantsClient, wantId));
  return { vouchers, pools };
}

/** Share the Want's link, or copy it where the Web Share API is missing. */
export function useWantShare(want: Pick<Want, "id" | "name">) {
  const { t } = useLingui();
  return async () => {
    const url = new URL(`/wants/${want.id}`, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: want.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t`Link copied`);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      toast.error(t`Couldn't share this Want.`);
    }
  };
}
