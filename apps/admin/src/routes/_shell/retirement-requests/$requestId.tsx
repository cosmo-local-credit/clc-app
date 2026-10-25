import { createFileRoute } from "@tanstack/react-router";
import { RetirementRequestPage } from "#/features/retirement/retirement-request-page";

export const Route = createFileRoute("/_shell/retirement-requests/$requestId")({
  component: () => <RetirementRequestPage requestId={Route.useParams().requestId} />,
});
