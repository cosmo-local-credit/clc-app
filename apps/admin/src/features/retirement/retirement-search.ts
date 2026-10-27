import type {
  RetirementRequestStatus,
  RetirementResourceType,
} from "@clc/api/features/retirement/client";

export const RETIREMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "invalidated",
  "all",
] as const;

export type RetirementSearch = {
  status?: RetirementRequestStatus | "all";
  resourceType?: RetirementResourceType;
  cursor?: number;
};

export function parseRetirementSearch(search: Record<string, unknown>): RetirementSearch {
  const status = RETIREMENT_STATUSES.find((value) => value === search.status);
  const resourceType =
    search.resourceType === "voucher" || search.resourceType === "pool"
      ? search.resourceType
      : undefined;
  const cursor = Number(search.cursor);
  return {
    ...(status && status !== "pending" ? { status } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(Number.isSafeInteger(cursor) && cursor > 0 ? { cursor } : {}),
  };
}
