import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { RiArrowRightSLine, RiCloseLine, RiNavigationLine } from "react-icons/ri";

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
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { Skeleton } from "#/components/ui/skeleton";
import { TagBadge } from "#/components/ui/tag-badge";
import { BackChevron, EllipsizedAddress } from "#/components/wallet";
import type { ReportDetail, ReportImage } from "#/features/home/api/reports-client";
import { useReport, useReportLocation } from "#/features/home/hooks/use-reports";
import { openDefaultMaps } from "#/lib/default-maps";
import { formatReportDate, formatReportPeriod } from "./report-display";

export function ReportPage({ reportId }: { reportId: string }) {
  const { t, i18n } = useLingui();
  const reportQuery = useReport(reportId);
  const report = reportQuery.data;
  const locationQuery = useReportLocation(report?.lat, report?.lng);

  if (reportQuery.isPending) return <ReportLoadingShell />;
  if (reportQuery.isError) {
    return (
      <ReportShell message={t`Couldn't load this post.`}>
        <Button
          variant="outline"
          size="sm"
          className="bg-card"
          onClick={() => reportQuery.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      </ReportShell>
    );
  }
  if (!report) return <ReportShell message={t`Post not found.`} />;

  const updated = formatReportDate(report.updatedAt, i18n.locale);
  const hasCoordinates = typeof report.lat === "number" && typeof report.lng === "number";
  const coordinateLabel = hasCoordinates ? `${report.lat}, ${report.lng}` : null;
  const locationLabel = locationQuery.data?.locationName ?? report.locationName ?? coordinateLabel;

  return (
    <div className="space-y-3">
      <BackChevron label={t`Posts`} to="/" search={{ tab: "posts" }} />

      <article className="space-y-6">
        <header className="space-y-2">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight [overflow-wrap:anywhere]">
            {report.title}
          </h1>

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
          <p className="whitespace-pre-wrap text-[0.9375rem] leading-6 [overflow-wrap:anywhere]">
            {report.description}
          </p>
        ) : null}

        <ReportDetails report={report} />
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
  const { t } = useLingui();
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
      <Carousel setApi={setApi} opts={{ align: "start" }} aria-label={t`Report images`}>
        <CarouselContent className="-ml-2">
          {images.map((image, index) => (
            <CarouselItem key={image.url} className="pl-2">
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
          className="left-2 size-11 border-transparent bg-background/80 text-foreground"
        />
        <CarouselNext
          label={t`Next image`}
          className="right-2 size-11 border-transparent bg-background/80 text-foreground"
        />
        <p
          aria-live="polite"
          className="absolute right-2 bottom-2 bg-background/80 px-2 py-0.5 font-mono text-[0.6875rem] font-semibold tabular-nums"
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
      className="relative block h-56 w-full overflow-hidden bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 flex size-11 items-center justify-center border border-white/30 bg-black/70 text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
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
  const { t } = useLingui();
  const [api, setApi] = useState<CarouselApi>();
  const current = useCarouselPosition(api, initialIndex + 1, false);

  return (
    <Carousel
      setApi={setApi}
      opts={{ align: "start", startIndex: initialIndex }}
      aria-label={t`Report images`}
      className="h-dvh"
    >
      <CarouselContent className="ml-0 h-dvh">
        {images.map((image, index) => (
          <CarouselItem key={image.url} className="h-dvh pl-0">
            <FullScreenImage image={image} title={title} eager={index === initialIndex} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious
        label={t`Previous image`}
        className="left-3 size-11 border-white/30 bg-black/70 text-white"
      />
      <CarouselNext
        label={t`Next image`}
        className="right-3 size-11 border-white/30 bg-black/70 text-white"
      />
      <p
        aria-live="polite"
        className="absolute right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/70 px-2 py-1 font-mono text-white text-xs tabular-nums"
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
  const period = formatReportPeriod(report.periodFrom, report.periodTo, i18n.locale);
  const hasDetails = Boolean(period || report.hostName || report.participants || report.timeTaken);
  if (!hasDetails) return null;

  return (
    <section aria-labelledby="report-details-heading">
      <h2
        id="report-details-heading"
        className="font-heading text-[1.125rem] font-semibold leading-snug"
      >
        <Trans>Report details</Trans>
      </h2>
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

function RelatedVouchers({ report }: { report: ReportDetail }) {
  if (report.vouchers.length === 0) return null;

  return (
    <section aria-labelledby="related-vouchers-heading">
      <h2
        id="related-vouchers-heading"
        className="font-heading text-[1.125rem] font-semibold leading-snug"
      >
        <Trans>Related vouchers</Trans>
      </h2>
      <div className="mt-2 border border-border bg-card">
        {report.vouchers.map((voucher) => (
          <Link
            key={voucher.address}
            to="/vouchers/$voucherAddress"
            params={{ voucherAddress: voucher.address }}
            className="flex min-h-12 items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 active:bg-muted"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{voucher.name}</span>
            <Badge
              variant="outline"
              className="h-5 max-w-20 truncate px-1.5 font-mono text-[0.625rem] text-info"
            >
              {voucher.symbol}
            </Badge>
            <RiArrowRightSLine
              className="size-4 shrink-0 text-muted-foreground"
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
  const created = formatReportDate(report.createdAt, i18n.locale);

  return (
    <section aria-labelledby="report-provenance-heading">
      <h2
        id="report-provenance-heading"
        className="font-heading text-[1.125rem] font-semibold leading-snug"
      >
        <Trans>Report provenance</Trans>
      </h2>
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
      <h2
        id="report-location-heading"
        className="font-heading text-[1.125rem] font-semibold leading-snug"
      >
        <Trans>Location</Trans>
      </h2>
      <div className="mt-2 border border-border bg-card p-4">
        <p className="font-heading text-sm font-semibold leading-snug">{label}</p>
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
              className="mt-3 h-11 w-full bg-card"
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
