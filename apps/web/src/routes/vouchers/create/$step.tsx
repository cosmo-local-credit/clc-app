import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { type VoucherCreateStep, CreateVoucherFlow } from "#/features/vouchers/ui";

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
  beforeLoad: ({ params }) => {
    if (!isVoucherCreateStep(params.step)) {
      throw redirect({ to: "/vouchers/create/$step", params: { step: "voucher" }, replace: true });
    }
  },
  component: CreateVoucherRoute,
});

function CreateVoucherRoute() {
  const { step } = Route.useParams();
  // beforeLoad redirects anything else, so this only narrows the param type.
  if (!isVoucherCreateStep(step)) return null;
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<CreateVoucherFlow step={step} />}
        desktop={<CreateVoucherDesk step={step} />}
      />
    </AuthenticatedRoute>
  );
}
