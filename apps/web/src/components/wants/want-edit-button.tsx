import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { isAdminRole } from "@clc/core/features/users/roles";
import type { Want } from "@clc/core/features/wants/logic";
import { RiPencilLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";

export function WantEditButton({
  want,
  iconOnly = false,
}: {
  want: Pick<Want, "id" | "ownerAddress">;
  iconOnly?: boolean;
}) {
  const { t } = useLingui();
  const { isAuthenticated, session } = useAuthStatus();
  if (
    !isAuthenticated ||
    !session ||
    (!isAdminRole(session.role) &&
      session.address.toLowerCase() !== want.ownerAddress?.toLowerCase())
  )
    return null;

  return (
    <Button
      asChild
      tap
      variant={iconOnly ? "ghost" : "outline"}
      size={iconOnly ? "icon" : "default"}
      aria-label={iconOnly ? t`Edit Want` : undefined}
    >
      <Link to="/wallet/wants/$wantId/edit" params={{ wantId: want.id }}>
        <RiPencilLine aria-hidden="true" />
        {iconOnly ? null : <Trans>Edit Want</Trans>}
      </Link>
    </Button>
  );
}
