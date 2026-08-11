import { createFileRoute } from "@tanstack/react-router";
import { UserDetailPage } from "#/features/users/user-detail-page";

export const Route = createFileRoute("/_shell/users/$address")({
  component: () => <UserDetailPage address={Route.useParams().address} />,
});
