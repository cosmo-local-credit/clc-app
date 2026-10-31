import type {
  RetirementRequestStatus,
  RetirementResourceType,
} from "@clc/api/features/retirement/client";
import { type TableSearch, parseTableSearch } from "#/lib/table-search";

export const RETIREMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "invalidated",
  "all",
] as const;

export type RetirementSearch = TableSearch & {
  status?: RetirementRequestStatus | "all";
  resourceType?: RetirementResourceType;
};

export function parseRetirementSearch(search: Record<string, unknown>): RetirementSearch {
  const status = RETIREMENT_STATUSES.find((value) => value === search.status);
  const resourceType =
    search.resourceType === "voucher" || search.resourceType === "pool"
      ? search.resourceType
      : undefined;
  return {
    ...parseTableSearch(search),
    ...(status && status !== "pending" ? { status } : {}),
    ...(resourceType ? { resourceType } : {}),
  };
}
