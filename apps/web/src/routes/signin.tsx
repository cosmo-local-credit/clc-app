import { createFileRoute } from "@tanstack/react-router";
import { SigninFlow } from "#/features/signin/ui/signin-flow";

export const Route = createFileRoute("/signin")({ component: SigninFlow });
