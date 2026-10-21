import {
  offeringUnitsQueryOptions,
  unitsOfAccountQueryOptions,
} from "@clc/api/features/vocabulary/queries";
import { useQuery } from "@tanstack/react-query";
import { vocabularyClient } from "#/lib/api/vocabulary";

export function useOfferingUnits() {
  return useQuery(offeringUnitsQueryOptions(vocabularyClient));
}

export function useUnitsOfAccount() {
  return useQuery(unitsOfAccountQueryOptions(vocabularyClient));
}
