import { createFileRoute } from "@tanstack/react-router";
import { parseAccountSearch } from "#/features/users/account-search";
import { UsersPage } from "#/features/users/users-page";

export const Route = createFileRoute("/_shell/users/")({
  validateSearch: parseAccountSearch,
  component: () => <UsersPage search={Route.useSearch()} />,
});
