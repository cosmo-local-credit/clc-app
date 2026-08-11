import { createFileRoute } from "@tanstack/react-router";
import { VouchersPage } from "#/features/vouchers/vouchers-page";

export const Route = createFileRoute("/_shell/vouchers/")({
  component: VouchersPage,
});
