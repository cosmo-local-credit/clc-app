import { createFileRoute } from "@tanstack/react-router";
import { UsersPage } from "#/features/users/users-page";
import { parseTableSearch } from "#/lib/table-search";

export const Route = createFileRoute("/_shell/users/")({
  validateSearch: parseTableSearch,
  component: () => <UsersPage search={Route.useSearch()} />,
});
