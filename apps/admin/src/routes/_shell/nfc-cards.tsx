import { createFileRoute } from "@tanstack/react-router";
import { NfcCardsPage } from "#/features/nfc-cards/nfc-cards-page";

export const Route = createFileRoute("/_shell/nfc-cards")({
  component: NfcCardsPage,
});
