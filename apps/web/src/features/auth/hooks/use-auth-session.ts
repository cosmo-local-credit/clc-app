import { useMutation } from "@tanstack/react-query";
import { clcApi } from "#/lib/api";

export function useBackendLogout() {
  return useMutation({ mutationFn: () => clcApi.auth.logout() });
}
