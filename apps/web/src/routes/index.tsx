import { createFileRoute } from "@tanstack/react-router";

import { HomeRoutePage } from "#/components/home-route-page";
import { type HomeTab, parseHomeTab } from "#/features/home/ui/tabs";

export const Route = createFileRoute("/")({
  validateSearch: (search): { tab?: HomeTab } => ({
    tab: parseHomeTab(search.tab),
  }),
  component: IndexPage,
});

function IndexPage() {
  const { tab } = Route.useSearch();

  return <HomeRoutePage activeTab={tab ?? "wallet"} />;
}
