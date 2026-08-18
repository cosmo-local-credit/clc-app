import { createFileRoute } from "@tanstack/react-router";
import { UserDetailPage } from "#/features/users/user-detail-page";
import { parseUserDetailSearch } from "#/features/users/user-detail-search";

export const Route = createFileRoute("/_shell/users/$address")({
  validateSearch: parseUserDetailSearch,
  component: UserDetailRoute,
});

function UserDetailRoute() {
  const { address } = Route.useParams();
  const search = Route.useSearch();
  return <UserDetailPage address={address} search={search} />;
}
