import { createFileRoute, Navigate } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CreateVoucherFlow } from "#/features/vouchers/ui";

export const Route = createFileRoute("/vouchers/create/$step")({
  component: CreateVoucherRoute,
});

function CreateVoucherRoute() {
  const { step } = Route.useParams();
  if (step !== "voucher" && step !== "place" && step !== "review") {
    return <Navigate to="/vouchers/create/$step" params={{ step: "voucher" }} replace />;
  }
  return (
    <AuthenticatedRoute>
      <CreateVoucherFlow step={step} />
    </AuthenticatedRoute>
  );
}
