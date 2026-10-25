import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { WantFormPage } from "#/features/wants/ui/want-form-page";

export const Route = createFileRoute("/wallet/wants/$wantId/edit")({ component: EditWantRoute });

function EditWantRoute() {
  return (
    <AuthenticatedRoute>
      <WantFormPage id={Route.useParams().wantId} />
    </AuthenticatedRoute>
  );
}
