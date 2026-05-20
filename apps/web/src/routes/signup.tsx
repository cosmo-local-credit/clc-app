import { createFileRoute } from "@tanstack/react-router";
import { SignupPage } from "#/components/signup-page";

export const Route = createFileRoute("/signup")({
	component: SignupPage,
});
