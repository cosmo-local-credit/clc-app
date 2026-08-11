import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ReportsClient } from "./client";

export const reportKeys = {
  all: ["clc", "reports"] as const,
  list: (perPage: number) => ["clc", "reports", "list", perPage] as const,
  detail: (id: string) => ["clc", "reports", "detail", id] as const,
} as const;

export function reportListQueryOptions(reports: ReportsClient, perPage: number) {
  return queryOptions({
    queryKey: reportKeys.list(perPage),
    queryFn: ({ signal }) => reports.getReports({ perPage }, signal),
    placeholderData: keepPreviousData,
  });
}

export function reportQueryOptions(reports: ReportsClient, id: string) {
  return queryOptions({
    queryKey: reportKeys.detail(id),
    queryFn: ({ signal }) => reports.getReport(id, signal),
    enabled: id !== "",
  });
}
