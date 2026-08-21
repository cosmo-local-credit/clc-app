import { createFileRoute } from "@tanstack/react-router";
import { VoucherPublishPage } from "#/features/vouchers/voucher-publish-page";

export const Route = createFileRoute("/_shell/vouchers/publish")({
  component: VoucherPublishPage,
});
