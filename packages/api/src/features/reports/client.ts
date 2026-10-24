import {
  type CatalogFilter,
  type VoucherRef,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";
import {
  type ReportAttachmentKind,
  type ReportStatus,
  type ReportWrite,
  isReportStatus,
  reportWriteSchema,
} from "@clc/core/features/reports/logic";

import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";
import {
  type HexAddress,
  isPresent,
  normalizeChainId,
  normalizeHex,
  normalizeID,
  normalizeNumber,
  normalizeStringArray,
  normalizeText,
} from "../../lib/api-normalize";

export type { ReportWrite };

/**
 * A voucher a report is linked to.
 *
 * `id` and `chainId` are kept, not just the address: a write sends
 * `{chainId, address}` back, and an editor that read only the address would have
 * to guess the chain — which on this branch is not Celo.
 */
export type ReportVoucher = {
  id: string;
  chainId: number;
  address: HexAddress;
  name: string;
  symbol: string;
};

export type ReportPool = {
  id: string;
  chainId: number;
  address: HexAddress;
  name: string;
  symbol: string;
};

export type ReportImage = {
  url: string;
  /**
   * The editor's display box, and advisory: it is not a scaled version of the
   * intrinsic pair below. Rows imported from the old editor carry a 267x1000
   * display box against a 1600x747 intrinsic size.
   */
  width: number | null;
  height: number | null;
  /**
   * The intrinsic size of the stored object. For anything this app uploads these
   * are the only real dimensions — the display box stays null — so a caller
   * reserving space before the bytes arrive should read this pair first.
   */
  maxWidth: number | null;
  maxHeight: number | null;
  byteSize: number | null;
  caption: string | null;
};

/** A non-image medium: an uploaded `FILE` or an external `EMBED` player URL. */
export type ReportAttachment = {
  kind: ReportAttachmentKind;
  url: string;
  filename: string | null;
  byteSize: number | null;
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
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  vouchers: ReportVoucher[];
  pools: ReportPool[];
};

export type ReportDetail = ReportSummary & {
  body: string;
  images: ReportImage[];
  attachments: ReportAttachment[];
  hostName: string | null;
  participants: string | null;
  timeTaken: string | null;
  /**
   * Absent on the public feed's detail read, which returns approved rows only.
   * Required on the management reads, which is what `ManagedReportDetail` says.
   */
  status: ReportStatus | null;
};

/** A management summary. Status is required: a queue row must say its state. */
export type ManagedReportSummary = ReportSummary & {
  status: ReportStatus;
  authorAddress: HexAddress;
};

export type ManagedReportDetail = ReportDetail & {
  status: ReportStatus;
  authorAddress: HexAddress;
};

export type ReportCursor = {
  updatedAt: string;
  id: string;
};

export type ReportPage = {
  reports: ReportSummary[];
  next: ReportCursor | null;
};

/**
 * A management keyset position.
 *
 * Structurally the feed's cursor, and deliberately a separate name: management
 * pages walk both ways and carry two of these, so a caller holding one has to
 * know which edge it came from.
 */
export type ManagedReportCursor = {
  updatedAt: string;
  id: string;
};

/**
 * One management page and both of its edges.
 *
 * `first`/`last` rather than the feed's single `next`: send `last` with
 * `next: true` to advance and `first` with `next: false` to go back. Both are
 * null on an empty page.
 */
export type ManagedReportPage = {
  reports: ManagedReportSummary[];
  first: ManagedReportCursor | null;
  last: ManagedReportCursor | null;
  /** Rows received before defensive normalization dropped malformed entries. */
  receivedCount: number;
};

export type ManagedReportsParams = {
  perPage: number;
  cursor?: ManagedReportCursor;
  /** Direction. Only meaningful with a cursor; clc-core rejects it without one. */
  next?: boolean;
  filter?: CatalogFilter;
  status?: ReportStatus;
  /** Admin only; the author route derives the owner from the session. */
  author?: string;
};

export type ReportTagFacet = {
  tag: string;
  count: number;
};

export type ReportVoucherFacet = VoucherRef & {
  name: string;
  symbol: string;
  count: number;
  placeholder?: boolean;
};

export type ReportPoolFacet = VoucherRef & {
  name: string;
  symbol: string;
  count: number;
  placeholder?: boolean;
};

export type ReportFilter = CatalogFilter;

export type FilteredReportsParams = {
  nearby?: boolean;
  perPage: number;
  cursor?: ReportCursor;
  filter: ReportFilter;
  facets?: boolean;
};

export type FilteredReportPage = ReportPage & {
  tagFacets: ReportTagFacet[] | null;
  voucherFacets: ReportVoucherFacet[] | null;
  poolFacets: ReportPoolFacet[] | null;
};

/**
 * clc-core's request body limit, in bytes (`maxBodySize`, 1 MB).
 *
 * Enforced against the serialized write rather than against `body`'s character
 * count, because the limit covers the whole request and a character is not a
 * byte: Swahili and Serbian prose, an emoji, or fifty long image URLs all reach
 * it sooner than a length check suggests. Exceeding it silently truncates the
 * request at the proxy, which surfaces as a parse failure rather than a field
 * error.
 */
export const REPORT_PAYLOAD_MAX_BYTES = 1 << 20;

export class ReportPayloadTooLargeError extends Error {
  constructor(
    readonly byteSize: number,
    readonly maxByteSize: number = REPORT_PAYLOAD_MAX_BYTES,
  ) {
    super("This post is too large to save. Shorten the text or remove some media.");
    this.name = "ReportPayloadTooLargeError";
  }
}

type BackendFilteredReportPage = BackendReportPage & {
  tagFacets?: { tag?: unknown; count?: unknown }[] | null;
  voucherFacets?: BackendVoucherFacet[] | null;
  poolFacets?: BackendVoucherFacet[] | null;
};

type BackendReportVoucher = Partial<{
  id: string | number | null;
  chainId: string | number | null;
  address: string | null;
  name: string | null;
  symbol: string | null;
}>;

type BackendVoucherFacet = Partial<{
  chainId: string | number;
  address: string;
  name: string;
  symbol: string;
  count: string | number;
}>;

type BackendReportImage = Partial<{
  url: string | null;
  width: string | number | null;
  height: string | number | null;
  maxWidth: string | number | null;
  maxHeight: string | number | null;
  byteSize: string | number | null;
  caption: string | null;
}>;

type BackendReportAttachment = Partial<{
  kind: string | null;
  url: string | null;
  filename: string | null;
  byteSize: string | number | null;
}>;

type BackendReport = Partial<{
  id: string | number;
  title: string | null;
  body: string | null;
  description: string | null;
  imageUrl: string | null;
  locationName: string | null;
  geoLat: string | number | null;
  geoLng: string | number | null;
  periodFrom: string | null;
  periodTo: string | null;
  authorAddress: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[] | null;
  vouchers: BackendReportVoucher[] | null;
  pools: BackendReportVoucher[] | null;
  images: BackendReportImage[] | null;
  attachments: BackendReportAttachment[] | null;
  hostName: string | null;
  participants: string | null;
  timeTaken: string | null;
}>;

type BackendReportPage = {
  reports?: BackendReport[] | null;
  next?: Partial<{ updatedAt: string | null; id: string | number }> | null;
};

type BackendManagedReportPage = {
  reports?: BackendReport[] | null;
  first?: Partial<{ updatedAt: string | null; id: string | number }> | null;
  last?: Partial<{ updatedAt: string | null; id: string | number }> | null;
};

export type ReportsClient = ReturnType<typeof createReportsClient>;

export function createReportsClient(http: HttpClient) {
  /** A mutation's read-back. A 2xx with no usable post is a contract violation. */
  async function managedItem(path: string, init: RequestInit): Promise<ManagedReportDetail> {
    const result = await http.request<{ report?: BackendReport | null }>(path, init);
    const report = normalizeManagedReportDetail(result.report);
    if (!report) {
      throw new BackendApiError(NO_HTTP_STATUS, "The server returned no usable post", undefined, {
        kind: "protocol",
      });
    }
    return report;
  }

  async function managedPage(path: string, signal?: AbortSignal): Promise<ManagedReportPage> {
    const result = await http.request<BackendManagedReportPage>(path, {
      method: "GET",
      cache: "no-store",
      signal,
    });
    const received = result.reports ?? [];
    return {
      reports: received.map(normalizeManagedReportSummary).filter(isPresent),
      first: normalizeCursor(result.first),
      last: normalizeCursor(result.last),
      receivedCount: received.length,
    };
  }

  function writeInit(
    method: "POST" | "PUT",
    input: ReportWrite,
    signal?: AbortSignal,
  ): RequestInit {
    return {
      method,
      body: serializeReportWrite(input),
      cache: "no-store",
      signal,
    };
  }

  return {
    async getReports(
      params: { perPage: number; cursor?: ReportCursor; nearby?: boolean },
      signal?: AbortSignal,
    ): Promise<ReportPage> {
      const query = new URLSearchParams({ perPage: String(params.perPage) });
      if (params.nearby) query.set("nearby", "true");
      if (params.cursor) {
        query.set("cursorUpdatedAt", params.cursor.updatedAt);
        query.set("cursorId", params.cursor.id);
      }

      const result = await http.request<BackendReportPage>(`/api/v2/reports?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });

      return {
        reports: (result.reports ?? []).map(normalizeReportSummary).filter(isPresent),
        next: normalizeCursor(result.next),
      };
    },

    async getFilteredReports(
      { filter, facets, perPage, cursor, nearby }: FilteredReportsParams,
      signal?: AbortSignal,
    ): Promise<FilteredReportPage> {
      const query = new URLSearchParams({ perPage: String(perPage) });
      if (cursor) {
        query.set("cursorUpdatedAt", cursor.updatedAt);
        query.set("cursorId", cursor.id);
      }
      appendCatalogFilter(query, filter);
      if (facets) query.set("facets", "true");
      if (nearby) query.set("nearby", "true");

      const result = await http.request<BackendFilteredReportPage>(
        `/api/v2/reports?${query.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          signal,
        },
      );

      return {
        reports: (result.reports ?? []).map(normalizeReportSummary).filter(isPresent),
        next: normalizeCursor(result.next),
        tagFacets: result.tagFacets
          ? result.tagFacets.map(normalizeReportTagFacet).filter(isPresent)
          : null,
        voucherFacets: result.voucherFacets
          ? result.voucherFacets.map(normalizeReportVoucherFacet).filter(isPresent)
          : null,
        poolFacets: result.poolFacets
          ? result.poolFacets.map(normalizeReportPoolFacet).filter(isPresent)
          : null,
      };
    },

    async getReport(id: string, signal?: AbortSignal): Promise<ReportDetail> {
      const result = await http.request<{ report?: BackendReport | null }>(
        `/api/v2/reports/${encodeURIComponent(id)}`,
        { method: "GET", cache: "no-store", signal },
      );

      const report = normalizeReportDetail(result.report);
      if (!report) throw new Error("Report response did not include a valid report.");
      return report;
    },

    /** The caller's own posts in every status, newest activity first. */
    async getMyReports(
      params: ManagedReportsParams,
      signal?: AbortSignal,
    ): Promise<ManagedReportPage> {
      return managedPage(`/api/v2/users/me/reports${formatManagedQuery(params, false)}`, signal);
    },

    async getMyReport(id: string, signal?: AbortSignal): Promise<ManagedReportDetail> {
      return managedItem(`/api/v2/users/me/reports/${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });
    },

    /** Every post in every status. Superadmin only. */
    async getAdminReports(
      params: ManagedReportsParams,
      signal?: AbortSignal,
    ): Promise<ManagedReportPage> {
      return managedPage(`/api/v2/admin/reports${formatManagedQuery(params, true)}`, signal);
    },

    async getAdminReport(id: string, signal?: AbortSignal): Promise<ManagedReportDetail> {
      return managedItem(`/api/v2/admin/reports/${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });
    },

    /**
     * Creates a post. A normal user's is `SUBMITTED`, a superadmin's `APPROVED`;
     * the response says which, so nothing here predicts it.
     */
    async createReport(input: ReportWrite, signal?: AbortSignal): Promise<ManagedReportDetail> {
      return managedItem("/api/v2/reports", writeInit("POST", input, signal));
    },

    /**
     * Assign-all replacement. There is no PATCH: every key travels every time,
     * so a cleared field and a forgotten one cannot be confused.
     *
     * A normal author's edit returns the post as `SUBMITTED` — it leaves the
     * public feed until reapproved. A superadmin's preserves the status.
     */
    async updateReport(
      id: string,
      input: ReportWrite,
      signal?: AbortSignal,
    ): Promise<ManagedReportDetail> {
      return managedItem(
        `/api/v2/reports/${encodeURIComponent(id)}`,
        writeInit("PUT", input, signal),
      );
    },

    /** Sets `APPROVED` without rewriting content. There is no unapprove. */
    async approveReport(id: string, signal?: AbortSignal): Promise<ManagedReportDetail> {
      return managedItem(`/api/v2/reports/${encodeURIComponent(id)}/approve`, {
        method: "PUT",
        cache: "no-store",
        signal,
      });
    },

    /** Hard-deletes the post and its cascaded relations. Superadmin only. */
    async deleteReport(id: string, signal?: AbortSignal): Promise<string> {
      const result = await http.request<{ id?: string | number }>(
        `/api/v2/reports/${encodeURIComponent(id)}`,
        { method: "DELETE", cache: "no-store", signal },
      );
      return normalizeID(result.id) ?? id;
    },
  };
}

function appendCatalogFilter(query: URLSearchParams, filter: CatalogFilter): void {
  if (filter.term !== "") query.set("q", filter.term);
  if (filter.tags.length > 0) query.set("tags", filter.tags.join(","));
  if (filter.tags.length > 1 && filter.tagMatch === "all") query.set("tagMatch", "all");
  if (filter.vouchers.length > 0) {
    query.set("vouchers", filter.vouchers.map(serializeVoucherRef).join(","));
  }
  if (filter.vouchers.length > 1 && filter.voucherMatch === "all") {
    query.set("voucherMatch", "all");
  }
  const pools = filter.pools ?? [];
  if (pools.length > 0) {
    query.set("pools", pools.map(serializeVoucherRef).join(","));
    if (pools.length > 1 && filter.poolMatch === "all") query.set("poolMatch", "all");
  }
}

/**
 * The management list query.
 *
 * `next` is sent only alongside a cursor, because clc-core rejects a direction
 * with no position. `author` is dropped unless the route accepts it, so an
 * author parameter cannot be smuggled onto `/users/me/reports`.
 */
function formatManagedQuery(params: ManagedReportsParams, allowAuthor: boolean): string {
  const query = new URLSearchParams({ perPage: String(params.perPage) });
  if (params.cursor) {
    query.set("cursorUpdatedAt", params.cursor.updatedAt);
    query.set("cursorId", params.cursor.id);
    if (params.next !== undefined) query.set("next", params.next ? "true" : "false");
  }
  if (params.status) query.set("status", params.status);
  if (params.filter) appendCatalogFilter(query, params.filter);
  if (allowAuthor && params.author) query.set("author", params.author);
  return `?${query.toString()}`;
}

/**
 * The validated write as a JSON string, checked against the body limit first.
 *
 * Serialized once and measured, rather than estimated: the limit is on bytes of
 * the whole request, and the string that was measured is the string that is
 * sent.
 */
export function serializeReportWrite(input: ReportWrite): string {
  const normalized = reportWriteSchema.parse(input);
  const body = JSON.stringify({
    title: normalized.title,
    body: normalized.body,
    // Empty is an explicit null, like the other optional text: the editor no
    // longer asks for a summary, and `""` would store a blank string.
    description: normalized.description === "" ? null : normalized.description,
    imageUrl: normalized.imageUrl,
    geoLat: normalized.geoLat,
    geoLng: normalized.geoLng,
    // Assign-all: an empty period is an explicit null, not an omitted key.
    periodFrom: normalized.periodFrom === "" ? null : normalized.periodFrom,
    periodTo: normalized.periodTo === "" ? null : normalized.periodTo,
    hostName: normalized.hostName === "" ? null : normalized.hostName,
    participants: normalized.participants === "" ? null : normalized.participants,
    timeTaken: normalized.timeTaken === "" ? null : normalized.timeTaken,
    tags: normalized.tags,
    vouchers: normalized.vouchers.map((voucher) => ({
      chainId: voucher.chainId,
      address: voucher.address,
    })),
    pools: normalized.pools.map((pool) => ({
      chainId: pool.chainId,
      address: pool.address,
    })),
    images: normalized.images.map((image) => ({
      url: image.url,
      width: image.width,
      height: image.height,
      maxWidth: image.maxWidth,
      maxHeight: image.maxHeight,
      byteSize: image.byteSize,
      caption: image.caption,
    })),
    attachments: normalized.attachments.map((attachment) => ({
      kind: attachment.kind,
      url: attachment.url,
      filename: attachment.filename,
      byteSize: attachment.byteSize,
    })),
  });

  const byteSize = new TextEncoder().encode(body).byteLength;
  if (byteSize > REPORT_PAYLOAD_MAX_BYTES) {
    throw new ReportPayloadTooLargeError(byteSize);
  }
  return body;
}

function normalizeReportVoucherFacet(facet: BackendVoucherFacet): ReportVoucherFacet | null {
  const chainId = normalizeChainId(facet.chainId);
  const address = normalizeHex(facet.address);
  const name = normalizeText(facet.name);
  const symbol = normalizeText(facet.symbol);
  const count = normalizeNumber(facet.count);
  if (chainId === null || !address || !name || !symbol || count === null || count < 0) {
    return null;
  }
  return { chainId, address, name, symbol, count };
}

function normalizeReportPoolFacet(facet: BackendVoucherFacet): ReportPoolFacet | null {
  return normalizeReportVoucherFacet(facet);
}

function normalizeReportTagFacet(facet: { tag?: unknown; count?: unknown }): ReportTagFacet | null {
  const tag = normalizeText(facet.tag);
  const count = normalizeNumber(facet.count);
  if (!tag || count === null || count < 0) return null;
  return { tag, count };
}

function normalizeCursor(
  cursor: Partial<{ updatedAt: string | null; id: string | number }> | null | undefined,
): ReportCursor | null {
  const updatedAt = normalizeText(cursor?.updatedAt);
  if (!updatedAt || cursor?.id === undefined || cursor.id === null) return null;
  return { updatedAt, id: String(cursor.id) };
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
    createdAt: normalizeText(report.createdAt),
    updatedAt: normalizeText(report.updatedAt),
    tags: normalizeStringArray(report.tags),
    vouchers: (report.vouchers ?? []).map(normalizeReportVoucher).filter(isPresent),
    pools: (report.pools ?? []).map(normalizeReportPool).filter(isPresent),
  };
}

/**
 * A complete post.
 *
 * Every assign-all field is kept, including `body` and `attachments`. An editor
 * built on a lossy detail would send back a document missing whatever this
 * dropped, and `PUT` would erase it.
 */
function normalizeReportDetail(report: BackendReport | null | undefined): ReportDetail | null {
  if (!report) return null;
  const summary = normalizeReportSummary(report);
  if (!summary) return null;

  return {
    ...summary,
    body: typeof report.body === "string" ? report.body : "",
    images: (report.images ?? []).map(normalizeReportImage).filter(isPresent),
    attachments: (report.attachments ?? []).map(normalizeReportAttachment).filter(isPresent),
    hostName: normalizeText(report.hostName),
    participants: normalizeText(report.participants),
    timeTaken: normalizeText(report.timeTaken),
    status: isReportStatus(report.status) ? report.status : null,
  };
}

/**
 * A management summary. A row whose status is missing or unrecognised is dropped
 * rather than defaulted: a queue must not show a post in a state nobody chose,
 * and `receivedCount` reports the gap.
 */
function normalizeManagedReportSummary(report: BackendReport): ManagedReportSummary | null {
  const summary = normalizeReportSummary(report);
  const authorAddress = normalizeHex(report.authorAddress);
  if (!summary || !authorAddress || !isReportStatus(report.status)) return null;
  return { ...summary, authorAddress, status: report.status };
}

function normalizeManagedReportDetail(
  report: BackendReport | null | undefined,
): ManagedReportDetail | null {
  const detail = normalizeReportDetail(report);
  const authorAddress = normalizeHex(report?.authorAddress);
  if (!detail || !authorAddress || detail.status === null) return null;
  return { ...detail, authorAddress, status: detail.status };
}

function normalizeReportVoucher(voucher: BackendReportVoucher): ReportVoucher | null {
  const address = normalizeHex(voucher.address);
  const id = normalizeID(voucher.id);
  const chainId = normalizeChainId(voucher.chainId);
  if (!address || !id || chainId === null) return null;
  return {
    id,
    chainId,
    address,
    name: normalizeText(voucher.name) ?? "Community Voucher",
    symbol: normalizeText(voucher.symbol) ?? "VOUCHER",
  };
}

function normalizeReportPool(pool: BackendReportVoucher): ReportPool | null {
  const address = normalizeHex(pool.address);
  const id = normalizeID(pool.id);
  const chainId = normalizeChainId(pool.chainId);
  if (!address || !id || chainId === null) return null;
  return {
    id,
    chainId,
    address,
    name: normalizeText(pool.name) ?? "Community Pool",
    symbol: normalizeText(pool.symbol) ?? "POOL",
  };
}

function normalizeReportImage(image: BackendReportImage): ReportImage | null {
  const url = normalizeImageUrl(image.url);
  if (!url) return null;
  return {
    url,
    width: normalizeNumber(image.width),
    height: normalizeNumber(image.height),
    maxWidth: normalizeNumber(image.maxWidth),
    maxHeight: normalizeNumber(image.maxHeight),
    byteSize: normalizeNumber(image.byteSize),
    caption: normalizeText(image.caption),
  };
}

function normalizeReportAttachment(attachment: BackendReportAttachment): ReportAttachment | null {
  const url = normalizeImageUrl(attachment.url);
  const kind = attachment.kind === "FILE" || attachment.kind === "EMBED" ? attachment.kind : null;
  if (!url || !kind) return null;
  return {
    kind,
    url,
    filename: normalizeText(attachment.filename),
    byteSize: normalizeNumber(attachment.byteSize),
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
