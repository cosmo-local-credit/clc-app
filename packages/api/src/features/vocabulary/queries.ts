import { queryOptions } from "@tanstack/react-query";
import type { VocabularyClient } from "./client";

export const vocabularyKeys = {
  all: ["clc", "vocabulary"] as const,
  offeringUnits: () => ["clc", "vocabulary", "offering-units"] as const,
  unitsOfAccount: () => ["clc", "vocabulary", "units-of-account"] as const,
  admin: () => ["clc", "vocabulary", "admin"] as const,
} as const;

export function offeringUnitsQueryOptions(vocabulary: VocabularyClient) {
  return queryOptions({
    queryKey: vocabularyKeys.offeringUnits(),
    queryFn: ({ signal }) => vocabulary.getOfferingUnits(signal),
    staleTime: 5 * 60_000,
  });
}

export function unitsOfAccountQueryOptions(vocabulary: VocabularyClient) {
  return queryOptions({
    queryKey: vocabularyKeys.unitsOfAccount(),
    queryFn: ({ signal }) => vocabulary.getUnitsOfAccount(signal),
    staleTime: 5 * 60_000,
  });
}

export function adminVocabularyQueryOptions(vocabulary: VocabularyClient) {
  return queryOptions({
    queryKey: vocabularyKeys.admin(),
    queryFn: ({ signal }) => vocabulary.getVocabulary(signal),
  });
}
