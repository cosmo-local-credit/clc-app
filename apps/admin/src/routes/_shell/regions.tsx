import { createFileRoute } from "@tanstack/react-router";
import { RegionsPage } from "#/features/regions/regions-page";

export const Route = createFileRoute("/_shell/regions")({
  component: RegionsPage,
});
