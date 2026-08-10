import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { type VoucherCreateStep, CreateVoucherFlow } from "#/features/vouchers/ui";

const STEPS: readonly string[] = ["voucher", "place", "review"];

function isVoucherCreateStep(step: string): step is VoucherCreateStep {
  return STEPS.includes(step);
}

export const Route = createFileRoute("/vouchers/create/$step")({
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
      <CreateVoucherFlow step={step} />
    </AuthenticatedRoute>
  );
}
