import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { type ProfilePayload, submitProfile } from "@clc/api/features/auth/client";
import { authProfileQueryKeys } from "#/features/auth/hooks/use-profile";

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { address } = useConnection();

  return useMutation({
    mutationFn: (payload: ProfilePayload) => submitProfile(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: authProfileQueryKeys.current(address),
      });
    },
  });
}
