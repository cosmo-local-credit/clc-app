import { queryOptions } from "@tanstack/react-query";
import type { VocabularyClient } from "./client";

export const vocabularyKeys = {
  all: ["clc", "vocabulary"] as const,
  offeringUnits: () => ["clc", "vocabulary", "offering-units"] as const,
  custom: () => ["clc", "vocabulary", "custom"] as const,
} as const;

export function offeringUnitsQueryOptions(vocabulary: VocabularyClient) {
  return queryOptions({
    queryKey: vocabularyKeys.offeringUnits(),
    queryFn: ({ signal }) => vocabulary.getOfferingUnits(signal),
    staleTime: 5 * 60_000,
  });
}

export function customVocabularyQueryOptions(vocabulary: VocabularyClient) {
  return queryOptions({
    queryKey: vocabularyKeys.custom(),
    queryFn: ({ signal }) => vocabulary.getCustomVocabulary(signal),
  });
}
