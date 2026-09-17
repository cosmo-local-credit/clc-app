import { createFileRoute } from "@tanstack/react-router";
import { VocabularyPage } from "#/features/vocabulary/vocabulary-page";

export const Route = createFileRoute("/_shell/vocabulary")({
  component: VocabularyPage,
});
