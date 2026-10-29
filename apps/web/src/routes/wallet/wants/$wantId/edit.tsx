import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { WantFormPage } from "#/features/wants/ui/want-form-page";

const WantFormDesk = lazy(() =>
  import("#/desktop/wants/want-form-desk").then((module) => ({ default: module.WantFormDesk })),
);

export const Route = createFileRoute("/wallet/wants/$wantId/edit")({
  staticData: { desktop: "fill" },
  component: EditWantRoute,
});

function EditWantRoute() {
  const wantId = Route.useParams().wantId;
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<WantFormPage id={wantId} />}
        desktop={<WantFormDesk wantId={wantId} />}
      />
    </AuthenticatedRoute>
  );
}
