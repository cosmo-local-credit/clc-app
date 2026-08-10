import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CreatePoolFlow, type PoolCreateStep } from "#/features/pools/ui";

const STEPS: readonly string[] = ["pool", "place", "review"];

function isPoolCreateStep(step: string): step is PoolCreateStep {
  return STEPS.includes(step);
}

export const Route = createFileRoute("/pools/create/$step")({
  beforeLoad: ({ params }) => {
    if (!isPoolCreateStep(params.step)) {
      throw redirect({ to: "/pools/create/$step", params: { step: "pool" }, replace: true });
    }
  },
  component: CreatePoolRoute,
});

function CreatePoolRoute() {
  const { step } = Route.useParams();
  if (!isPoolCreateStep(step)) return null;
  return (
    <AuthenticatedRoute>
      <CreatePoolFlow step={step} />
    </AuthenticatedRoute>
  );
}
