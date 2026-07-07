import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { type ProfilePayload, submitProfile } from "#/features/auth/api/client";
import { authProfileQueryKeys } from "#/features/auth/hooks/use-profile";

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  return useMutation({
    mutationFn: (payload: ProfilePayload) => submitProfile(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: authProfileQueryKeys.current(address),
      });
    },
  });
}
