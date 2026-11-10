import { type PoolPrefillSearch, parsePoolPrefill } from "@clc/core/features/pools/prefill";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { CreatePoolFlow, type PoolCreateStep } from "#/features/pools/ui";
import { carriesPrefill, useCreatePrefill } from "#/lib/navigation/create-prefill";

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
  // Each accepted prefill param in its wire form, so the router's rewrite leaves
  // the link as it arrived. Every other param stays in the URL untouched.
  validateSearch: (search): PoolPrefillSearch => parsePoolPrefill(search)?.search ?? {},
  beforeLoad: ({ params, search }) => {
    // A prefill is read on the first step only, so a later step carrying one
    // lands there before anything seeds.
    if (!isPoolCreateStep(params.step) || (params.step !== "pool" && carriesPrefill(search))) {
      throw redirect({
        to: "/pools/create/$step",
        params: { step: "pool" },
        search: true,
        replace: true,
      });
    }
  },
  component: CreatePoolRoute,
});

function CreatePoolRoute() {
  const { step } = Route.useParams();
  const prefill = useCreatePrefill(parsePoolPrefill);
  if (!isPoolCreateStep(step)) return null;
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<CreatePoolFlow step={step} prefill={prefill} />}
        desktop={<CreatePoolDesk step={step} prefill={prefill} />}
      />
    </AuthenticatedRoute>
  );
}
