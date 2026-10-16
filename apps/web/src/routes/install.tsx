import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { InstallPage } from "#/features/install/ui/install-page";

const searchSchema = z.object({
  /** Screen Install was opened from; Settings gets its own way back. */
  from: z.enum(["settings"]).optional().catch(undefined),
});

export const Route = createFileRoute("/install")({
  validateSearch: searchSchema,
  component: InstallRoute,
});

function InstallRoute() {
  const { from } = Route.useSearch();
  return <InstallPage from={from} />;
}
