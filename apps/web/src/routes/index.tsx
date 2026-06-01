import { createFileRoute } from "@tanstack/react-router";
import { useAccount } from "wagmi";

import { HomePage } from "#/components/home-page";
import { type HomeTab, parseHomeTab } from "#/features/home/ui/tabs";
import { LandingPage } from "#/features/onboarding/ui/landing-page";

export const Route = createFileRoute("/")({
	validateSearch: (search): { tab?: HomeTab } => ({
		tab: parseHomeTab(search.tab),
	}),
	component: IndexPage,
});

function IndexPage() {
	const { isConnected } = useAccount();
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	if (isConnected) {
		return (
			<HomePage
				activeTab={tab}
				onTabChange={(nextTab) => {
					void navigate({ to: "/", search: { tab: nextTab }, replace: true });
				}}
			/>
		);
	}
	return <LandingPage />;
}
