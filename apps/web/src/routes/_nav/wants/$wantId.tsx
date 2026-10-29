import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";
import { LayoutSwitch } from "#/desktop/switch";
import { WantDetailPage } from "#/features/wants/ui/want-detail-page";

const WantDetailDesk = lazy(() =>
  import("#/desktop/wants/want-detail-desk").then((module) => ({
    default: module.WantDetailDesk,
  })),
);

const searchSchema = z.object({
  from: z.enum(["market", "wallet"]).optional().catch(undefined),
  poolAddress: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_nav/wants/$wantId")({
  staticData: { navOwner: "market", desktop: "fill" },
  validateSearch: searchSchema,
  component: WantRoute,
});

function WantRoute() {
  const search = Route.useSearch();
  const page = (
    <WantDetailPage
      id={Route.useParams().wantId}
      from={search.from}
      poolAddress={search.poolAddress}
    />
  );
  return (
    <LayoutSwitch mobile={page} desktop={<WantDetailDesk wantId={Route.useParams().wantId} />} />
  );
}
