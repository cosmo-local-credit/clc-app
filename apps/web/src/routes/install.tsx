import { createFileRoute } from "@tanstack/react-router";
import { InstallPage } from "#/features/install/ui/install-page";

export const Route = createFileRoute("/install")({ component: InstallPage });
