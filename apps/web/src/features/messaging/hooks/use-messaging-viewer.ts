import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { MESSAGING_ENABLED } from "#/lib/messaging-config";

/**
 * The signed-in address messaging reads as, or undefined for a guest, an
 * undecided session, or a build with messaging off. Every messaging query is
 * keyed by it and disabled without it.
 */
export function useMessagingViewer(): `0x${string}` | undefined {
  const auth = useAuthStatus();
  return MESSAGING_ENABLED && auth.isAuthenticated ? auth.address : undefined;
}
