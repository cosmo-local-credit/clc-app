import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { WantFormPage } from "#/features/wants/ui/want-form-page";

const WantFormDesk = lazy(() =>
  import("#/desktop/wants/want-form-desk").then((module) => ({ default: module.WantFormDesk })),
);

export const Route = createFileRoute("/wallet/wants/new")({
  staticData: { desktop: "fill" },
  component: NewWantRoute,
});

function NewWantRoute() {
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<WantFormPage />} desktop={<WantFormDesk />} />
    </AuthenticatedRoute>
  );
}
