import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import type { ProfilePayload, ProfileResult } from "@clc/api/features/auth/client";
import { authKeys } from "@clc/api/features/auth/queries";
import { recipientKeys } from "@clc/api/features/recipients/queries";
import { authClient } from "#/lib/api/auth";

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { address } = useConnection();

  return useMutation({
    mutationFn: (payload: ProfilePayload) => authClient.submitProfile(payload),
    onSuccess: (saved) => {
      // Merged into whatever is cached rather than written over it: the update
      // projection carries every editable field but not `createdAt`, so replacing
      // the entry would drop it. Returns undefined when nothing is cached, which
      // leaves the cache alone instead of seeding a partial row nobody is watching.
      queryClient.setQueryData<ProfileResult>(authKeys.profile(address), (cached) =>
        cached ? { ...cached, ...saved } : undefined,
      );
      // Still invalidated, for the same missing `createdAt`: a screen that mounts
      // on a cold cache must read the whole row from the backend.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: authKeys.profile(address) }),
        queryClient.invalidateQueries({ queryKey: recipientKeys.all }),
      ]);
    },
  });
}
