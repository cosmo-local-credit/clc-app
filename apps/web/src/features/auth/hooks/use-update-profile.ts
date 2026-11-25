import { publicProfileKeys } from "@clc/api/features/public-profiles/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  ProfilePayload,
  ProfileResult,
  ProfileVisibilityPayload,
} from "@clc/api/features/auth/client";
import { authKeys } from "@clc/api/features/auth/queries";
import { recipientKeys } from "@clc/api/features/recipients/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { wantKeys } from "@clc/api/features/wants/queries";
import { authClient } from "#/lib/api/auth";

/**
 * Every write of the account's own profile, the username's included: a view
 * that mounts while one is still in flight (the phone/desktop swap) can see it.
 */
export const updateProfileMutationKey = ["auth", "profile", "update"] as const;

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: updateProfileMutationKey,
    mutationFn: (payload: ProfilePayload | ProfileVisibilityPayload) =>
      authClient.submitProfile(payload),
    onSuccess: (saved) => {
      // A response can arrive after the wallet changed.
      const profileKey = authKeys.profile(saved.address);
      // Merged into whatever is cached rather than written over it: the update
      // projection carries every editable field but not `createdAt`, so replacing
      // the entry would drop it. Returns undefined when nothing is cached, which
      // leaves the cache alone instead of seeding a partial row nobody is watching.
      queryClient.setQueryData<ProfileResult>(profileKey, (cached) =>
        cached ? { ...cached, ...saved } : undefined,
      );
      // Still invalidated, for the same missing `createdAt`: a screen that mounts
      // on a cold cache must read the whole row from the backend.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: publicProfileKeys.all }),
        queryClient.invalidateQueries({ queryKey: profileKey }),
        queryClient.invalidateQueries({ queryKey: recipientKeys.all }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
        queryClient.invalidateQueries({ queryKey: wantKeys.all }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey.some((part) => typeof part === "string" && part.startsWith("nearby:")),
        }),
      ]);
    },
  });
}
