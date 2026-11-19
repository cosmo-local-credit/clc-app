import type { Want } from "@clc/core/features/wants/logic";

import { OwnerMessageButton } from "#/components/messaging/resource-owner-contact";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";

/** The primary contact action on a public Want. */
export function WantMessageButton({ want }: { want: Want }) {
  const auth = useAuthStatus();
  if (want.status !== "OPEN" || !want.ownerAddress) return null;
  return (
    <OwnerMessageButton
      ownerAddress={want.ownerAddress}
      excludeAddress={auth.isAuthenticated ? auth.session?.address : undefined}
      context={{ kind: "want", resourceId: want.id }}
    />
  );
}
