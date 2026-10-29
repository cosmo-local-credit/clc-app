import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { ProfileEditPage } from "#/features/auth/ui/profile-edit-page";

const ProfileDesk = lazy(() =>
  import("#/desktop/account/profile-desk").then((module) => ({ default: module.ProfileDesk })),
);

export const Route = createFileRoute("/settings/profile")({
  staticData: { desktop: "fill" },
  component: ProfileSettingsRoute,
});

function ProfileSettingsRoute() {
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<ProfileEditPage />} desktop={<ProfileDesk />} />
    </AuthenticatedRoute>
  );
}
