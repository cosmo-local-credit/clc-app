import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { CreatePoolFlow, type PoolCreateStep } from "#/features/pools/ui";

const CreatePoolDesk = lazy(() =>
  import("#/desktop/pools/create-pool-desk").then((module) => ({
    default: module.CreatePoolDesk,
  })),
);

const STEPS: readonly string[] = ["pool", "place", "review"];

function isPoolCreateStep(step: string): step is PoolCreateStep {
  return STEPS.includes(step);
}

export const Route = createFileRoute("/pools/create/$step")({
  staticData: { desktop: "fill" },
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
      <LayoutSwitch
        mobile={<CreatePoolFlow step={step} />}
        desktop={<CreatePoolDesk step={step} />}
      />
    </AuthenticatedRoute>
  );
}
