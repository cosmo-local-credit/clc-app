import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { TopUpPage } from "#/features/wallet/ui";

const TopUpDesk = lazy(() =>
  import("#/desktop/wallet/top-up-desk").then((module) => ({ default: module.TopUpDesk })),
);

export const Route = createFileRoute("/wallet/top-up")({
  staticData: { desktop: "fill" },
  // Desktop inspector state: the open ramp form, or a history row by kind-reference.
  validateSearch: (
    search: Record<string, unknown>,
  ): { sheet?: "add" | "withdraw"; tx?: string } => ({
    sheet: search.sheet === "add" || search.sheet === "withdraw" ? search.sheet : undefined,
    tx: typeof search.tx === "string" && search.tx.length > 0 ? search.tx : undefined,
  }),
  component: TopUpRoute,
});

function TopUpRoute() {
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<TopUpPage />} desktop={<TopUpDesk />} />
    </AuthenticatedRoute>
  );
}
