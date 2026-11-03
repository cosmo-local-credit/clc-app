import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAddress } from "viem";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { useRotationSession } from "#/features/key-rotation/state/rotation-session";
import { KeyRotationPage } from "#/features/key-rotation/ui/key-rotation-page";
import { KEY_ROTATION_ENABLED } from "#/lib/key-rotation-config";

const searchSchema = z.object({
  /** A sign-in card this account replaced, to move what is left on it. */
  from: z
    .string()
    .refine((value) => isAddress(value))
    .transform((value) => value as `0x${string}`)
    .optional()
    .catch(undefined),
});

// Outside the tab shell, like the create wizards: a tab tap leaves the route,
// and leaving drops the new card's key before anything has moved to it.
export const Route = createFileRoute("/settings/sign-in-card")({
  validateSearch: searchSchema,
  beforeLoad: () => {
    if (!KEY_ROTATION_ENABLED)
      throw redirect({ to: "/", search: { tab: "settings" }, replace: true });
  },
  // Both cards' keys are held in memory only while this screen is in use.
  onLeave: () => useRotationSession.getState().clear(),
  component: SignInCardRoute,
});

function SignInCardRoute() {
  const { from } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <KeyRotationPage from={from} />
    </AuthenticatedRoute>
  );
}
