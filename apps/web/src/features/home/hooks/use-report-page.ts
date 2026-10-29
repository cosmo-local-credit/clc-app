import type { ReportAttachment } from "@clc/api/features/reports/client";
import { formatByteSize } from "@clc/core/features/reports/logic";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import type { CarouselApi } from "#/components/ui/carousel";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useReport, useReportLocation } from "#/features/home/hooks/use-reports";
import { useMyPost } from "#/features/posts/hooks/use-my-posts";
import { formatReportDate } from "#/lib/report-display";

/**
 * Everything a post's page reads: the post, whether the reader wrote it, and
 * the date and place lines derived from it.
 */
export function useReportPage(reportId: string) {
  const { i18n } = useLingui();
  const auth = useAuthStatus();
  const reportQuery = useReport(reportId);
  const ownedReportQuery = useMyPost(reportId);
  const report = reportQuery.data;
  const locationQuery = useReportLocation(report?.lat, report?.lng, auth.isAuthenticated);

  const updated = report
    ? formatReportDate(report.updatedAt, i18n.locales?.[0] ?? i18n.locale)
    : null;
  const hasCoordinates = typeof report?.lat === "number" && typeof report?.lng === "number";
  const coordinateLabel = hasCoordinates ? `${report?.lat}, ${report?.lng}` : null;
  const locationLabel =
    locationQuery.data?.locationName ?? report?.locationName ?? coordinateLabel ?? null;
  // Public Post data deliberately contains no author address. The private
  // owner endpoint is the authorization-aware source for showing Edit; its
  // expected 404 for another person's Post stays invisible on this page.
  const isAuthor = Boolean(report) && ownedReportQuery.data?.id === report?.id;

  return {
    reportQuery,
    report,
    isAuthenticated: auth.isAuthenticated,
    isAuthor,
    updated,
    locationLabel,
  };
}

export function useCarouselPosition(
  api: CarouselApi | undefined,
  initialPosition: number,
  syncOnMount = true,
): number {
  const [current, setCurrent] = useState(initialPosition);

  useEffect(() => {
    if (!api) return;
    const sync = () => setCurrent(api.selectedScrollSnap() + 1);
    if (syncOnMount) sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => {
      api.off("select", sync);
      api.off("reInit", sync);
    };
  }, [api, syncOnMount]);

  return current;
}

/**
 * A filename when the upload recorded one, otherwise the host — a bare CDN URL
 * says nothing about what it is, and the whole path would not fit at 360px.
 */
export function attachmentLabel(attachment: ReportAttachment): string {
  if (attachment.filename) return attachment.filename;
  try {
    return new URL(attachment.url).host;
  } catch {
    return attachment.url;
  }
}

export function attachmentMeta(
  attachment: ReportAttachment,
  labels: { file: string; embed: string },
): string {
  const kind = attachment.kind === "FILE" ? labels.file : labels.embed;
  const size = formatByteSize(attachment.byteSize);
  return size ? `${kind} · ${size}` : kind;
}
