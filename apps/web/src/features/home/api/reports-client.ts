import type { CatalogFilter } from "@clc/core/features/catalog/logic";

import { apiFetch } from "#/features/auth/api/client";
import {
  type HexAddress,
  isPresent,
  normalizeHex,
  normalizeNumber,
  normalizeStringArray,
  normalizeText,
} from "#/lib/api-normalize";

/** A voucher a report is linked to, as the feed and detail cards render it. */
export type ReportVoucher = {
  address: HexAddress;
  name: string;
  symbol: string;
};

export type ReportImage = {
  url: string;
  width: number | null;
  height: number | null;
};

export type ReportSummary = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  authorAddress: HexAddress | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  vouchers: ReportVoucher[];
};

export type ReportDetail = ReportSummary & {
  images: ReportImage[];
  hostName: string | null;
  participants: string | null;
  timeTaken: string | null;
};

export type ReportCursor = {
  updatedAt: string;
  id: string;
};

export type ReportPage = {
  reports: ReportSummary[];
  next: ReportCursor | null;
};

export type ReportTagFacet = {
  tag: string;
  count: number;
};

export type FilteredReportsParams = {
  perPage: number;
  cursor?: ReportCursor;
  filter: CatalogFilter;
  facets?: boolean;
};

export type FilteredReportPage = ReportPage & {
  tagFacets: ReportTagFacet[] | null;
};

type BackendFilteredReportPage = BackendReportPage & {
  tagFacets?: { tag?: unknown; count?: unknown }[] | null;
};

type BackendReportVoucher = Partial<{
  address: string | null;
  name: string | null;
  symbol: string | null;
}>;

type BackendReportImage = Partial<{
  url: string | null;
  width: string | number | null;
  height: string | number | null;
}>;

type BackendReport = Partial<{
  id: string | number;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  locationName: string | null;
  geoLat: string | number | null;
  geoLng: string | number | null;
  periodFrom: string | null;
  periodTo: string | null;
  authorAddress: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[] | null;
  vouchers: BackendReportVoucher[] | null;
  images: BackendReportImage[] | null;
  hostName: string | null;
  participants: string | null;
  timeTaken: string | null;
}>;

type BackendReportPage = {
  reports?: BackendReport[] | null;
  next?: Partial<{ updatedAt: string | null; id: string | number }> | null;
};

export async function getReports(
  params: { perPage: number; cursor?: ReportCursor },
  signal?: AbortSignal,
): Promise<ReportPage> {
  const query = new URLSearchParams({ perPage: String(params.perPage) });
  if (params.cursor) {
    query.set("cursorUpdatedAt", params.cursor.updatedAt);
    query.set("cursorId", params.cursor.id);
  }

  const result = await apiFetch<BackendReportPage>(`/api/v2/reports?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  return {
    reports: (result.reports ?? []).map(normalizeReportSummary).filter(isPresent),
    next: normalizeCursor(result.next),
  };
}

export async function getFilteredReports(
  { filter, facets, perPage, cursor }: FilteredReportsParams,
  signal?: AbortSignal,
): Promise<FilteredReportPage> {
  const query = new URLSearchParams({ perPage: String(perPage) });
  if (cursor) {
    query.set("cursorUpdatedAt", cursor.updatedAt);
    query.set("cursorId", cursor.id);
  }
  if (filter.term !== "") query.set("q", filter.term);
  if (filter.tags.length > 0) query.set("tags", filter.tags.join(","));
  if (filter.tags.length > 1 && filter.tagMatch === "all") query.set("tagMatch", "all");
  if (facets) query.set("facets", "true");

  const result = await apiFetch<BackendFilteredReportPage>(`/api/v2/reports?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  return {
    reports: (result.reports ?? []).map(normalizeReportSummary).filter(isPresent),
    next: normalizeCursor(result.next),
    tagFacets: result.tagFacets
      ? result.tagFacets.map(normalizeReportTagFacet).filter(isPresent)
      : null,
  };
}

function normalizeReportTagFacet(facet: { tag?: unknown; count?: unknown }): ReportTagFacet | null {
  const tag = normalizeText(facet.tag);
  const count = normalizeNumber(facet.count);
  if (!tag || count === null || count < 0) return null;
  return { tag, count };
}

export async function getReport(id: string, signal?: AbortSignal): Promise<ReportDetail> {
  const result = await apiFetch<{ report?: BackendReport | null }>(
    `/api/v2/reports/${encodeURIComponent(id)}`,
    { method: "GET", cache: "no-store", signal },
  );

  const report = normalizeReportDetail(result.report);
  if (!report) throw new Error("Report response did not include a valid report.");
  return report;
}

function normalizeCursor(next: BackendReportPage["next"] | undefined): ReportCursor | null {
  const updatedAt = normalizeText(next?.updatedAt);
  if (!updatedAt || next?.id === undefined || next.id === null) return null;
  return { updatedAt, id: String(next.id) };
}

function normalizeReportSummary(report: BackendReport): ReportSummary | null {
  if (report.id === undefined || report.id === null) return null;

  const lat = normalizeCoordinate(report.geoLat, 90);
  const lng = normalizeCoordinate(report.geoLng, 180);
  const hasLocation = lat !== null && lng !== null;

  return {
    id: String(report.id),
    title: normalizeText(report.title) ?? "Untitled report",
    description: normalizeText(report.description) ?? "",
    imageUrl: normalizeImageUrl(report.imageUrl),
    locationName: normalizeText(report.locationName),
    lat: hasLocation ? lat : null,
    lng: hasLocation ? lng : null,
    periodFrom: normalizeText(report.periodFrom),
    periodTo: normalizeText(report.periodTo),
    authorAddress: normalizeHex(report.authorAddress),
    createdAt: normalizeText(report.createdAt),
    updatedAt: normalizeText(report.updatedAt),
    tags: normalizeStringArray(report.tags),
    vouchers: (report.vouchers ?? []).map(normalizeReportVoucher).filter(isPresent),
  };
}

function normalizeReportDetail(report: BackendReport | null | undefined): ReportDetail | null {
  if (!report) return null;
  const summary = normalizeReportSummary(report);
  if (!summary) return null;

  return {
    ...summary,
    images: (report.images ?? []).map(normalizeReportImage).filter(isPresent),
    hostName: normalizeText(report.hostName),
    participants: normalizeText(report.participants),
    timeTaken: normalizeText(report.timeTaken),
  };
}

function normalizeReportVoucher(voucher: BackendReportVoucher): ReportVoucher | null {
  const address = normalizeHex(voucher.address);
  if (!address) return null;
  return {
    address,
    name: normalizeText(voucher.name) ?? "Community Voucher",
    symbol: normalizeText(voucher.symbol) ?? "VOUCHER",
  };
}

function normalizeReportImage(image: BackendReportImage): ReportImage | null {
  const url = normalizeImageUrl(image.url);
  if (!url) return null;
  return {
    url,
    width: normalizeNumber(image.width),
    height: normalizeNumber(image.height),
  };
}

function normalizeImageUrl(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeCoordinate(value: unknown, bound: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= -bound && value <= bound ? value : null;
}
