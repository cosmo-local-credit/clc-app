import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const OnboardingFlow = lazy(() =>
	import("#/features/onboarding/ui/onboarding-flow").then((module) => ({
		default: module.OnboardingFlow,
	})),
);

export const Route = createFileRoute("/onboarding")({
	component: OnboardingRoutePage,
});

function OnboardingRoutePage() {
	return (
		<Suspense fallback={<OnboardingFallback />}>
			<OnboardingFlow />
		</Suspense>
	);
}

function OnboardingFallback() {
	return <div className="min-h-[100svh] bg-background" />;
}
