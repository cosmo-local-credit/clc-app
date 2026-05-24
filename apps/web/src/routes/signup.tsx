import { createFileRoute } from "@tanstack/react-router";
import { SignupFlow } from "#/features/signup/ui/signup-flow";

export const Route = createFileRoute("/signup")({
	component: SignupFlow,
});
