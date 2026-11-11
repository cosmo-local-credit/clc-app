import {
  type VoucherPrefillSearch,
  parseVoucherPrefill,
} from "@clc/core/features/vouchers/prefill";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { type VoucherCreateStep, CreateVoucherFlow } from "#/features/vouchers/ui";
import { carriesPrefill, useCreatePrefill } from "#/lib/navigation/create-prefill";

const CreateVoucherDesk = lazy(() =>
  import("#/desktop/vouchers/create-voucher-desk").then((module) => ({
    default: module.CreateVoucherDesk,
  })),
);

const STEPS: readonly string[] = ["voucher", "place", "review"];

function isVoucherCreateStep(step: string): step is VoucherCreateStep {
  return STEPS.includes(step);
}

export const Route = createFileRoute("/vouchers/create/$step")({
  staticData: { desktop: "fill" },
  // Each accepted prefill param in its wire form, so the router's rewrite leaves
  // the link as it arrived. Every other param stays in the URL untouched.
  validateSearch: (search): VoucherPrefillSearch => parseVoucherPrefill(search)?.search ?? {},
  beforeLoad: ({ params, search }) => {
    // A prefill is read on the first step only, so a later step carrying one
    // lands there before anything seeds.
    if (
      !isVoucherCreateStep(params.step) ||
      (params.step !== "voucher" && carriesPrefill(search))
    ) {
      throw redirect({
        to: "/vouchers/create/$step",
        params: { step: "voucher" },
        search: true,
        replace: true,
      });
    }
  },
  component: CreateVoucherRoute,
});

function CreateVoucherRoute() {
  const { step } = Route.useParams();
  const prefill = useCreatePrefill(parseVoucherPrefill);
  // beforeLoad redirects anything else, so this only narrows the param type.
  if (!isVoucherCreateStep(step)) return null;
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<CreateVoucherFlow step={step} prefill={prefill} />}
        desktop={<CreateVoucherDesk step={step} prefill={prefill} />}
      />
    </AuthenticatedRoute>
  );
}
