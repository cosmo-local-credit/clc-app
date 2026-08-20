import { useMutation } from "@tanstack/react-query";
import { authClient } from "#/lib/api/auth";

export function useBackendLogout() {
  return useMutation({ mutationFn: () => authClient.logout() });
}
