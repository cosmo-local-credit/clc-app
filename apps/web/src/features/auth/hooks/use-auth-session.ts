import { useMutation } from "@tanstack/react-query";

import { logout } from "@clc/api/features/auth/client";

export function useBackendLogout() {
  return useMutation({ mutationFn: logout });
}
