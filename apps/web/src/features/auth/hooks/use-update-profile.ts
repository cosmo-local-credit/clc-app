import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { type ProfilePayload } from "@clc/api/features/auth/client";
import { authProfileQueryKeys } from "#/features/auth/hooks/use-profile";
import { clcApi } from "#/lib/api";

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { address } = useConnection();

  return useMutation({
    mutationFn: (payload: ProfilePayload) => clcApi.auth.submitProfile(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: authProfileQueryKeys.current(address),
      });
    },
  });
}
