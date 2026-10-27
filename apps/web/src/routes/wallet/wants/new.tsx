import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { WantFormPage } from "#/features/wants/ui/want-form-page";

export const Route = createFileRoute("/wallet/wants/new")({ component: NewWantRoute });

function NewWantRoute() {
  return (
    <AuthenticatedRoute>
      <WantFormPage />
    </AuthenticatedRoute>
  );
}
