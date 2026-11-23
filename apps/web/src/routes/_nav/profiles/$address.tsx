import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { LayoutSwitch } from "#/desktop/switch";
import { PublicProfilePage } from "#/features/public-profiles/ui/public-profile-page";

const PublicProfileDesk = lazy(() =>
  import("#/desktop/profiles/public-profile-desk").then((module) => ({
    default: module.PublicProfileDesk,
  })),
);

export const Route = createFileRoute("/_nav/profiles/$address")({
  staticData: { navOwner: "market", desktop: "fill" },
  component: PublicProfileRoute,
});

function PublicProfileRoute() {
  const { address } = Route.useParams();
  return (
    <LayoutSwitch
      mobile={<PublicProfilePage address={address} />}
      desktop={<PublicProfileDesk address={address} />}
    />
  );
}
