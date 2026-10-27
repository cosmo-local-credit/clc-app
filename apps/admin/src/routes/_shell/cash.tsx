import { createFileRoute } from "@tanstack/react-router";
import { CashPage, parseCashSearch } from "#/features/cash/cash-page";

export const Route = createFileRoute("/_shell/cash")({
  validateSearch: parseCashSearch,
  component: function CashRoute() {
    return <CashPage search={Route.useSearch()} />;
  },
});
