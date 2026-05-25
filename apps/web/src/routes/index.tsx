import { createFileRoute } from "@tanstack/react-router";
import { useAccount } from "wagmi";

import { HomePage } from "#/components/home-page";
import { LandingPage } from "#/features/onboarding/ui/landing-page";

export const Route = createFileRoute("/")({ component: IndexPage });

function IndexPage() {
	const { isConnected, status } = useAccount();

	if (status === "connecting" || status === "reconnecting") return null;

	if (isConnected) return <HomePage />;
	return <LandingPage />;
}
