import { createFileRoute } from "@tanstack/react-router";

import { OnboardingFlow } from "#/features/onboarding/ui/onboarding-flow";

export const Route = createFileRoute("/onboarding")({
	component: OnboardingFlow,
});
