import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { ProfileEditPage } from "#/features/auth/ui/profile-edit-page";

export const Route = createFileRoute("/settings_/profile")({
  component: ProfileSettingsRoute,
});

function ProfileSettingsRoute() {
  return (
    <AuthenticatedRoute>
      <ProfileEditPage />
    </AuthenticatedRoute>
  );
}
