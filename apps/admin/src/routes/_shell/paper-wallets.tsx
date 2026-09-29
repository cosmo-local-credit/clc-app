import { createFileRoute } from "@tanstack/react-router";
import { PaperWalletsPage } from "#/features/paper-wallets/paper-wallets-page";
import { parsePaperWalletsSearch } from "#/features/paper-wallets/paper-wallets-search";

export const Route = createFileRoute("/_shell/paper-wallets")({
  validateSearch: parsePaperWalletsSearch,
  component: () => <PaperWalletsPage search={Route.useSearch()} />,
});
