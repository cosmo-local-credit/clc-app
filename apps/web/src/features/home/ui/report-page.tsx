import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { RiArrowRightSLine, RiCloseLine, RiNavigationLine } from "react-icons/ri";

import { formatByteSize } from "@clc/core/features/reports/logic";
import { getLocaleDirection, type SupportedLocale } from "@clc/i18n/locales";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "#/components/ui/carousel";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { InfoRow } from "#/components/ui/info-row";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { SectionHeading } from "#/components/ui/section-heading";
import { Skeleton } from "#/components/ui/skeleton";
import { TagBadge } from "#/components/ui/tag-badge";
import { BackChevron, EllipsizedAddress } from "#/components/wallet";
import type { ReportAttachment, ReportDetail, ReportImage } from "@clc/api/features/reports/client";
import { useReport, useReportLocation } from "#/features/home/hooks/use-reports";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { openDefaultMaps } from "#/lib/default-maps";
import { formatReportDate, formatReportPeriod } from "#/lib/report-display";

export function ReportPage({ reportId }: { reportId: string }) {
  const { t, i18n } = useLingui();
  const auth = useAuthStatus();
  const reportQuery = useReport(reportId);
  const report = reportQuery.data;
  const locationQuery = useReportLocation(report?.lat, report?.lng);

  if (reportQuery.isPending) return <ReportLoadingShell />;
  if (reportQuery.isError) {
    return (
      <ReportShell message={t`Couldn't load this post.`}>
        <Button
          variant="outline"
          size="lg"
          pending={reportQuery.isFetching}
          onClick={() => void reportQuery.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      </ReportShell>
    );
  }
  if (!report) return <ReportShell message={t`Post not found.`} />;

  const updated = formatReportDate(report.updatedAt, i18n.locales?.[0] ?? i18n.locale);
  const hasCoordinates = typeof report.lat === "number" && typeof report.lng === "number";
  const coordinateLabel = hasCoordinates ? `${report.lat}, ${report.lng}` : null;
  const locationLabel = locationQuery.data?.locationName ?? report.locationName ?? coordinateLabel;
  const isAuthor =
    auth.isAuthenticated &&
    !!auth.address &&
    !!report.authorAddress &&
    auth.address.toLowerCase() === report.authorAddress.toLowerCase();

  return (
    <div className="space-y-3">
      <BackChevron label={t`Posts`} to="/" search={{ tab: "posts" }} />

      <article className="space-y-6">
        <header className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 flex-1 font-heading text-[1.75rem] font-bold leading-tight [overflow-wrap:anywhere]">
              {report.title}
            </h1>
            {isAuthor ? (
              <Button asChild variant="outline" tap>
                <Link to="/posts/$reportId/edit" params={{ reportId: report.id }}>
                  <Trans>Edit</Trans>
                </Link>
              </Button>
            ) : null}
          </div>

          {updated || locationLabel ? (
            <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs leading-5">
              {updated && report.updatedAt ? (
                <span className="inline-flex items-center gap-1">
                  <Trans>Updated</Trans>
                  <time dateTime={report.updatedAt}>{updated}</time>
                </span>
              ) : null}
              {updated && locationLabel ? <span aria-hidden="true">·</span> : null}
              {locationLabel ? <span>{locationLabel}</span> : null}
            </p>
          ) : null}

          {report.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {report.tags.map((tag) => (
                <TagBadge
                  key={tag}
                  tag={tag}
                  labelClassName="block min-w-0 truncate"
                  className="max-w-full overflow-hidden"
                />
              ))}
            </div>
          ) : null}
        </header>

        {report.images.length > 0 ? (
          <ReportGallery images={report.images} title={report.title} />
        ) : null}

        {report.description ? (
          <p dir="auto" className="whitespace-pre-wrap leading-6 [overflow-wrap:anywhere]">
            {report.description}
          </p>
        ) : null}

        {/* Description is feed copy and stays a plain paragraph; only `body` is
            markdown. Most imported posts have no body at all. */}
        {report.body ? <MarkdownContent>{report.body}</MarkdownContent> : null}

        <ReportDetails report={report} />
        <ReportAttachments report={report} />
        <ReportLocation report={report} label={locationLabel} />
        <RelatedVouchers report={report} />
        <ReportProvenance report={report} />
      </article>
    </div>
  );
}

/**
 * Every image in the report, in document order. The detail carousel keeps its
 * compact crop; tapping any slide opens an uncropped, full-screen Embla
 * carousel at that same index.
 */
function ReportGallery({ images, title }: { images: ReportImage[]; title: string }) {
  const { t, i18n } = useLingui();
  const direction = getLocaleDirection(i18n.locale as SupportedLocale);
  const [api, setApi] = useState<CarouselApi>();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const current = useCarouselPosition(api, 1);

  const viewer =
    viewerIndex === null ? null : (
      <ReportImageViewer
        images={images}
        title={title}
        initialIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    );

  if (images.length === 1 && images[0]) {
    return (
      <>
        <ReportSlide image={images[0]} title={title} eager onOpen={() => setViewerIndex(0)} />
        {viewer}
      </>
    );
  }

  return (
    <>
      <Carousel
        setApi={setApi}
        opts={{ align: "start" }}
        direction={direction}
        aria-label={t`Report images`}
      >
        <CarouselContent className="-ms-2">
          {images.map((image, index) => (
            <CarouselItem key={image.url} className="ps-2">
              <ReportSlide
                image={image}
                title={title}
                eager={index === 0}
                onOpen={() => setViewerIndex(index)}
              />
            </CarouselItem>
          ))}
        </CarouselContent>

        <CarouselPrevious
          label={t`Previous image`}
          tap
          className="start-2 border-transparent bg-background/80 text-foreground"
        />
        <CarouselNext
          label={t`Next image`}
          tap
          className="end-2 border-transparent bg-background/80 text-foreground"
        />
        <p
          aria-live="polite"
          className="absolute end-2 bottom-2 bg-background/80 px-2 py-0.5 text-2xs font-semibold tabular-nums"
        >
          <Trans>
            {current} / {images.length}
          </Trans>
        </p>
      </Carousel>
      {viewer}
    </>
  );
}

function ReportSlide({
  image,
  title,
  eager,
  onOpen,
}: {
  image: ReportImage;
  title: string;
  eager: boolean;
  onOpen: () => void;
}) {
  const { t } = useLingui();

  return (
    <button
      type="button"
      aria-label={t`View image full screen`}
      className="relative block h-56 w-full overflow-hidden bg-muted text-start outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      onClick={onOpen}
    >
      <ProgressiveImage
        src={image.url}
        alt={title}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        className="size-full object-cover"
      />
    </button>
  );
}

function ReportImageViewer({
  images,
  title,
  initialIndex,
  onClose,
}: {
  images: ReportImage[];
  title: string;
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useLingui();

  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogBackdrop className="bg-black" />
        <DialogContent className="top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-black p-0 shadow-none transition-opacity data-[ending-style]:scale-100 data-[starting-style]:scale-100">
          <DialogTitle className="sr-only">
            <Trans>Report images</Trans>
          </DialogTitle>

          {images.length === 1 && images[0] ? (
            <FullScreenImage image={images[0]} title={title} eager />
          ) : (
            <FullScreenCarousel images={images} title={title} initialIndex={initialIndex} />
          )}

          <DialogClose
            aria-label={t`Close`}
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] end-3 z-10 flex size-11 items-center justify-center border border-white/30 bg-black/70 text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <RiCloseLine className="size-6" aria-hidden="true" />
          </DialogClose>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}

function FullScreenCarousel({
  images,
  title,
  initialIndex,
}: {
  images: ReportImage[];
  title: string;
  initialIndex: number;
}) {
  const { t, i18n } = useLingui();
  const direction = getLocaleDirection(i18n.locale as SupportedLocale);
  const [api, setApi] = useState<CarouselApi>();
  const current = useCarouselPosition(api, initialIndex + 1, false);

  return (
    <Carousel
      setApi={setApi}
      opts={{ align: "start", startIndex: initialIndex }}
      direction={direction}
      aria-label={t`Report images`}
      className="h-dvh"
    >
      <CarouselContent className="ms-0 h-dvh">
        {images.map((image, index) => (
          <CarouselItem key={image.url} className="h-dvh ps-0">
            <FullScreenImage image={image} title={title} eager={index === initialIndex} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious
        label={t`Previous image`}
        size="icon-lg"
        className="start-3 border-white/30 bg-black/70 text-white"
      />
      <CarouselNext
        label={t`Next image`}
        size="icon-lg"
        className="end-3 border-white/30 bg-black/70 text-white"
      />
      <p
        aria-live="polite"
        className="absolute end-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/70 px-2 py-1 text-white text-xs tabular-nums"
      >
        <Trans>
          {current} / {images.length}
        </Trans>
      </p>
    </Carousel>
  );
}

function FullScreenImage({
  image,
  title,
  eager,
}: {
  image: ReportImage;
  title: string;
  eager: boolean;
}) {
  return (
    <span className="relative block h-dvh w-full bg-black">
      <ProgressiveImage
        src={image.url}
        alt={title}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        loading={eager ? "eager" : "lazy"}
        className="size-full object-contain"
        skeletonClassName="bg-white/10"
      />
    </span>
  );
}

function useCarouselPosition(
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

function ReportDetails({ report }: { report: ReportDetail }) {
  const { t, i18n } = useLingui();
  const period = formatReportPeriod(
    report.periodFrom,
    report.periodTo,
    i18n.locales?.[0] ?? i18n.locale,
  );
  const hasDetails = Boolean(period || report.hostName || report.participants || report.timeTaken);
  if (!hasDetails) return null;

  return (
    <section aria-labelledby="report-details-heading">
      <SectionHeading id="report-details-heading">
        <Trans>Report details</Trans>
      </SectionHeading>
      <dl className="mt-2 border border-border bg-card">
        {period ? <InfoRow label={t`Report period`}>{period}</InfoRow> : null}
        {report.hostName ? (
          <InfoRow label={t`Host`}>
            <span className="truncate">{report.hostName}</span>
          </InfoRow>
        ) : null}
        {report.participants ? (
          <InfoRow label={t`Participants`}>{report.participants}</InfoRow>
        ) : null}
        {report.timeTaken ? <InfoRow label={t`Duration`}>{report.timeTaken}</InfoRow> : null}
      </dl>
    </section>
  );
}

/**
 * Files and embeds on the post.
 *
 * A filename when the upload recorded one, otherwise the host — a bare CDN URL
 * says nothing about what it is, and the whole path would not fit at 360px.
 */
function ReportAttachments({ report }: { report: ReportDetail }) {
  const { t } = useLingui();
  if (report.attachments.length === 0) return null;

  return (
    <section aria-labelledby="report-attachments-heading">
      <SectionHeading id="report-attachments-heading">
        <Trans>Links</Trans>
      </SectionHeading>
      <ul className="mt-2 border border-border bg-card">
        {report.attachments.map((attachment) => (
          <li
            key={`${attachment.kind}:${attachment.url}`}
            className="border-b border-border last:border-b-0"
          >
            <a
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center gap-2 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{attachmentLabel(attachment)}</span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {attachmentMeta(attachment, {
                  file: t`File`,
                  embed: t`Link`,
                })}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function attachmentLabel(attachment: ReportAttachment): string {
  if (attachment.filename) return attachment.filename;
  try {
    return new URL(attachment.url).host;
  } catch {
    return attachment.url;
  }
}

function attachmentMeta(
  attachment: ReportAttachment,
  labels: { file: string; embed: string },
): string {
  const kind = attachment.kind === "FILE" ? labels.file : labels.embed;
  const size = formatByteSize(attachment.byteSize);
  return size ? `${kind} · ${size}` : kind;
}

function RelatedVouchers({ report }: { report: ReportDetail }) {
  if (report.vouchers.length === 0) return null;

  return (
    <section aria-labelledby="related-vouchers-heading">
      <SectionHeading id="related-vouchers-heading">
        <Trans>Related vouchers</Trans>
      </SectionHeading>
      <div className="mt-2 border border-border bg-card">
        {report.vouchers.map((voucher) => (
          <Link
            key={voucher.address}
            to="/vouchers/$voucherAddress"
            params={{ voucherAddress: voucher.address }}
            search={{ from: "posts", reportId: report.id }}
            className="flex min-h-12 w-full items-center gap-2 border-b border-border px-3 py-2 text-start last:border-b-0 active:bg-muted"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{voucher.name}</span>
            <Badge variant="outline" size="sm" className="max-w-20 truncate font-mono text-info">
              {voucher.symbol}
            </Badge>
            <RiArrowRightSLine
              className="rtl:-scale-x-100 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

function ReportProvenance({ report }: { report: ReportDetail }) {
  const { t, i18n } = useLingui();
  const created = formatReportDate(report.createdAt, i18n.locales?.[0] ?? i18n.locale);

  return (
    <section aria-labelledby="report-provenance-heading">
      <SectionHeading id="report-provenance-heading">
        <Trans>Report provenance</Trans>
      </SectionHeading>
      <dl className="mt-2 border border-border bg-card">
        <InfoRow label={t`Author`}>
          {report.authorAddress ? <EllipsizedAddress address={report.authorAddress} /> : "—"}
        </InfoRow>
        {created ? (
          <InfoRow label={t`Created`}>
            <time dateTime={report.createdAt ?? undefined}>{created}</time>
          </InfoRow>
        ) : null}
      </dl>
    </section>
  );
}

function ReportLocation({ report, label }: { report: ReportDetail; label: string | null }) {
  const hasCoordinates = typeof report.lat === "number" && typeof report.lng === "number";
  if (!label) return null;

  return (
    <section aria-labelledby="report-location-heading">
      <SectionHeading id="report-location-heading">
        <Trans>Location</Trans>
      </SectionHeading>
      <div className="mt-2 border border-border bg-card p-4">
        <p className="text-sm font-semibold leading-snug">{label}</p>
        {hasCoordinates && report.lat !== null && report.lng !== null ? (
          <>
            <Suspense fallback={<Skeleton className="mt-3 h-36 w-full rounded-none" />}>
              <LocationMap
                lat={report.lat}
                lng={report.lng}
                className="mt-3 h-36 rounded-none border-0"
              />
            </Suspense>
            <Button
              variant="outline"
              tap
              className="mt-3 w-full"
              onClick={() => openDefaultMaps({ label, lat: report.lat, lng: report.lng })}
            >
              <RiNavigationLine className="size-4" aria-hidden="true" />
              <Trans>Open in Maps</Trans>
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}

function ReportLoadingShell() {
  const { t } = useLingui();

  return (
    <div className="space-y-3">
      <BackChevron label={t`Posts`} to="/" search={{ tab: "posts" }} />
      <div aria-busy="true" aria-label={t`Loading post…`} className="space-y-4">
        <Skeleton className="h-8 w-4/5 rounded-none" />
        <Skeleton className="h-4 w-2/5 rounded-none" />
        <Skeleton className="h-56 w-full rounded-none" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full rounded-none" />
          <Skeleton className="h-4 w-11/12 rounded-none" />
          <Skeleton className="h-4 w-3/4 rounded-none" />
        </div>
      </div>
    </div>
  );
}

function ReportShell({ message, children }: { message: string; children?: ReactNode }) {
  const { t } = useLingui();
  return (
    <div className="space-y-3">
      <BackChevron label={t`Posts`} to="/" search={{ tab: "posts" }} />
      <p className="border border-border bg-card p-3 text-muted-foreground text-sm">{message}</p>
      {children}
    </div>
  );
}
