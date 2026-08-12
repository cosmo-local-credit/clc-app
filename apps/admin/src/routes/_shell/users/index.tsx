import { createFileRoute } from "@tanstack/react-router";
import { UsersPage } from "#/features/users/users-page";
import { parseUsersSearch } from "#/features/users/users-search";

export const Route = createFileRoute("/_shell/users/")({
  validateSearch: parseUsersSearch,
  component: () => <UsersPage search={Route.useSearch()} />,
});
