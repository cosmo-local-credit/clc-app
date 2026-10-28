import { createFileRoute } from "@tanstack/react-router";
import { ProtocolPage } from "#/features/protocol/protocol-page";

export const Route = createFileRoute("/_shell/protocol")({
  component: ProtocolPage,
});
