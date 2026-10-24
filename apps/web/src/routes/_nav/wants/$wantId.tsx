import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { WantDetailPage } from "#/features/wants/ui/want-detail-page";

const searchSchema = z.object({
  from: z.enum(["market", "wallet"]).optional().catch(undefined),
  poolAddress: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_nav/wants/$wantId")({
  staticData: { navOwner: "market" },
  validateSearch: searchSchema,
  component: WantRoute,
});

function WantRoute() {
  const search = Route.useSearch();
  return (
    <WantDetailPage
      id={Route.useParams().wantId}
      from={search.from}
      poolAddress={search.poolAddress}
    />
  );
}
