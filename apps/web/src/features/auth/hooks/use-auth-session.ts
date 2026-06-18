import { useMutation } from "@tanstack/react-query";

import { logout } from "../api/client";

export function useBackendLogout() {
  return useMutation({ mutationFn: logout });
}
