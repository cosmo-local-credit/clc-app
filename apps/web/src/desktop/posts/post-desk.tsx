import type { ReportDetail, ReportImage } from "@clc/api/features/reports/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, Suspense, useEffect, useState } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine, RiCloseLine } from "react-icons/ri";

import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { Skeleton } from "#/components/ui/skeleton";
import { TagBadge } from "#/components/ui/tag-badge";
import { PoolLogo, VoucherAvatar } from "#/components/wallet";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskKV } from "#/desktop/ui/kv";
import {
  DeskCanvas,
  DeskDetail,
  DeskPanel,
  DeskRowList,
  DeskSection,
  DeskTitleRow,
} from "#/desktop/ui/page";
import {
  attachmentLabel,
  attachmentMeta,
  useReportPage,
} from "#/features/home/hooks/use-report-page";
import { openDefaultMaps } from "#/lib/default-maps";
import { formatReportDate, formatReportPeriod } from "#/lib/report-display";

/**
 * A post as a reading column — title, meta line, tags, gallery, text — with
 * its metadata in the side column, so the story isn't broken up by it.
 */
export function PostDesk({ reportId }: { reportId: string }) {
  const { t } = useLingui();
  const { reportQuery, report, isAuthenticated, isAuthor, updated, locationLabel } =
    useReportPage(reportId);
  useDeskTrailLabel(report?.title);

  if (reportQuery.isPending) {
    return (
      <DeskCanvas width="read" className="grid-cols-[minmax(0,720px)]">
        <div aria-busy="true" aria-label={t`Loading post…`} className="grid gap-4">
          <Skeleton className="h-9 w-4/5 rounded-none" />
          <Skeleton className="h-4 w-2/5 rounded-none" />
          <Skeleton className="aspect-video w-full rounded-none" />
        </div>
      </DeskCanvas>
    );
  }

  if (reportQuery.isError || !report) {
    return (
      <DeskCanvas width="read" className="grid-cols-[minmax(0,720px)]">
        <DeskPanel className="grid justify-items-start gap-3">
          <p className="text-muted-foreground text-sm">
            {reportQuery.isError ? t`Couldn't load this post.` : t`Post not found.`}
          </p>
          {reportQuery.isError ? (
            <Button
              variant="outline"
              pending={reportQuery.isFetching}
              onClick={() => void reportQuery.refetch()}
            >
              <Trans>Retry</Trans>
            </Button>
          ) : null}
        </DeskPanel>
      </DeskCanvas>
    );
  }

  const placeShown = isAuthenticated && locationLabel;

  return (
    <DeskDetail
      main={
        <article className="grid min-w-0 max-w-[720px] gap-3.5">
          <DeskTitleRow
            title={report.title}
            wrap
            actions={
              isAuthor ? (
                <Button asChild variant="outline">
                  <Link to="/posts/$reportId/edit" params={{ reportId: report.id }}>
                    <Trans>Edit</Trans>
                  </Link>
                </Button>
              ) : null
            }
          />

          {updated || placeShown ? (
            <p className="text-muted-foreground text-xs">
              {updated && report.updatedAt ? (
                <>
                  <Trans>Updated</Trans> <time dateTime={report.updatedAt}>{updated}</time>
                </>
              ) : null}
              {updated && placeShown ? " · " : null}
              {placeShown ? <span>{locationLabel}</span> : null}
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

          {report.images.length > 0 ? (
            <PostGallery images={report.images} title={report.title} />
          ) : null}

          {report.description ? (
            <p
              dir="auto"
              className="whitespace-pre-wrap font-medium leading-6 [overflow-wrap:anywhere]"
            >
              {report.description}
            </p>
          ) : null}

          {/* Description is feed copy and stays a plain paragraph; only `body` is
              markdown. */}
          {report.body ? <MarkdownContent>{report.body}</MarkdownContent> : null}
        </article>
      }
      side={<PostSide report={report} locationLabel={locationLabel} />}
    />
  );
}

function PostSide({
  report,
  locationLabel,
}: {
  report: ReportDetail;
  locationLabel: string | null;
}) {
  const { t, i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const period = formatReportPeriod(report.periodFrom, report.periodTo, locale);
  const created = formatReportDate(report.createdAt, locale);
  const hasDetails = Boolean(period || report.hostName || report.participants || report.timeTaken);
  const hasCoordinates = typeof report.lat === "number" && typeof report.lng === "number";
  const hasLocation = hasCoordinates || Boolean(report.locationName);

  return (
    <div className="grid min-w-0 gap-6">
      {hasDetails ? (
        <DeskSection title={t`Report details`}>
          <DeskKV
            labelWidth="120px"
            rows={[
              period ? [t`Report period`, period] : null,
              report.hostName
                ? [t`Host`, <span className="font-sans">{report.hostName}</span>]
                : null,
              report.participants ? [t`Participants`, report.participants] : null,
              report.timeTaken ? [t`Duration`, report.timeTaken] : null,
            ]}
          />
        </DeskSection>
      ) : null}

      {hasLocation ? (
        <DeskSection title={t`Location`}>
          <div className="border border-border bg-card">
            <AuthenticatedDetailsGate className="p-4">
              {hasCoordinates && report.lat !== null && report.lng !== null ? (
                <Suspense fallback={<Skeleton className="h-36 w-full rounded-none" />}>
                  <LocationMap
                    lat={report.lat}
                    lng={report.lng}
                    className="h-36 rounded-none border-0"
                  />
                </Suspense>
              ) : null}
              <div className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="min-w-0 text-xs [overflow-wrap:anywhere]">{locationLabel}</span>
                {hasCoordinates ? (
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() =>
                      openDefaultMaps({ label: locationLabel, lat: report.lat, lng: report.lng })
                    }
                  >
                    <Trans>Open in Maps</Trans>
                  </Button>
                ) : null}
              </div>
            </AuthenticatedDetailsGate>
          </div>
        </DeskSection>
      ) : null}

      {report.vouchers.length > 0 ? (
        <DeskSection title={t`Related vouchers`}>
          <DeskRowList>
            {report.vouchers.map((voucher) => (
              <Link
                key={voucher.address}
                to="/vouchers/$voucherAddress"
                params={{ voucherAddress: voucher.address }}
                search={{ from: "posts", reportId: report.id }}
                className="block outline-none hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
              >
                <DetailRow
                  lead={
                    <VoucherAvatar
                      address={voucher.address}
                      symbol={voucher.symbol}
                      iconUrl={null}
                      size={28}
                    />
                  }
                  title={voucher.name}
                  trail={
                    <Badge variant="outline" size="sm" className="shrink-0 font-mono">
                      {voucher.symbol}
                    </Badge>
                  }
                />
              </Link>
            ))}
          </DeskRowList>
        </DeskSection>
      ) : null}

      {report.pools.length > 0 ? (
        <DeskSection title={t`Related pools`}>
          <DeskRowList>
            {report.pools.map((pool) => (
              <Link
                key={`${pool.chainId}:${pool.address}`}
                to="/pools/$poolAddress"
                params={{ poolAddress: pool.address }}
                search={{}}
                className="block outline-none hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
              >
                <DetailRow
                  lead={<PoolLogo imageUrl={null} name={pool.name} seed={pool.address} size={28} />}
                  title={pool.name}
                  trail={
                    <Badge variant="outline" size="sm" className="shrink-0 font-mono text-info">
                      {pool.symbol}
                    </Badge>
                  }
                />
              </Link>
            ))}
          </DeskRowList>
        </DeskSection>
      ) : null}

      {report.attachments.length > 0 ? (
        <DeskSection title={t`Links`}>
          <DeskRowList>
            {report.attachments.map((attachment) => (
              <a
                key={`${attachment.kind}:${attachment.url}`}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block outline-none hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
              >
                <DetailRow
                  title={attachmentLabel(attachment)}
                  trail={
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {attachmentMeta(attachment, { file: t`File`, embed: t`Link` })}
                    </span>
                  }
                />
              </a>
            ))}
          </DeskRowList>
        </DeskSection>
      ) : null}

      {created ? (
        <DeskSection title={t`Report provenance`}>
          <DeskKV
            rows={[[t`Created`, <time dateTime={report.createdAt ?? undefined}>{created}</time>]]}
          />
        </DeskSection>
      ) : null}
    </div>
  );
}

/**
 * A row of the side column. The name sits on a post's detail page to be read
 * and checked, so it wraps; list cards elsewhere truncate.
 */
function DetailRow({
  lead,
  title,
  trail,
}: {
  lead?: ReactNode;
  title: ReactNode;
  trail?: ReactNode;
}) {
  return (
    <div className="flex min-h-14 min-w-0 items-center gap-3 px-3.5 py-2.5">
      {lead}
      <div className="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">{title}</div>
      {trail}
    </div>
  );
}

/**
 * One wide image at a time with its "n / N" counter; clicking it opens the
 * full-screen viewer at that image.
 */
function PostGallery({ images, title }: { images: ReportImage[]; title: string }) {
  const { t } = useLingui();
  const [index, setIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const image = images[index] ?? images[0];
  if (!image) return null;
  const many = images.length > 1;
  const current = index + 1;

  return (
    <>
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <button
          type="button"
          aria-label={t`View image full screen`}
          onClick={() => setViewerIndex(index)}
          className="block size-full outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
        >
          <ProgressiveImage
            key={image.url}
            src={image.url}
            alt={title}
            width={image.width ?? undefined}
            height={image.height ?? undefined}
            loading="eager"
            fetchPriority="high"
            className="size-full object-cover"
          />
        </button>
        {many ? (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={t`Previous image`}
              className="absolute top-1/2 start-3 -translate-y-1/2"
              onClick={() => setIndex((current) => (current - 1 + images.length) % images.length)}
            >
              <RiArrowLeftSLine className="rtl:-scale-x-100" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t`Next image`}
              className="absolute top-1/2 end-3 -translate-y-1/2"
              onClick={() => setIndex((current) => (current + 1) % images.length)}
            >
              <RiArrowRightSLine className="rtl:-scale-x-100" aria-hidden="true" />
            </Button>
            <p
              aria-live="polite"
              className="absolute end-3 bottom-3 bg-card px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums"
            >
              <Trans>
                {current} / {images.length}
              </Trans>
            </p>
          </>
        ) : null}
      </div>
      {viewerIndex === null ? null : (
        <PostImageViewer
          images={images}
          title={title}
          initialIndex={viewerIndex}
          onClose={(last) => {
            setIndex(last);
            setViewerIndex(null);
          }}
        />
      )}
    </>
  );
}

/** The full-screen viewer: uncropped, with arrow keys stepping through. */
function PostImageViewer({
  images,
  title,
  initialIndex,
  onClose,
}: {
  images: ReportImage[];
  title: string;
  initialIndex: number;
  onClose: (index: number) => void;
}) {
  const { t } = useLingui();
  const [index, setIndex] = useState(initialIndex);
  const image = images[index] ?? images[0];
  const many = images.length > 1;
  const current = index + 1;

  useEffect(() => {
    if (!many) return;
    const step = (event: KeyboardEvent) => {
      const rtl = document.documentElement.dir === "rtl";
      if (event.key === "ArrowRight") {
        setIndex((current) => (current + (rtl ? -1 : 1) + images.length) % images.length);
      } else if (event.key === "ArrowLeft") {
        setIndex((current) => (current + (rtl ? 1 : -1) + images.length) % images.length);
      }
    };
    window.addEventListener("keydown", step);
    return () => window.removeEventListener("keydown", step);
  }, [many, images.length]);

  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose(index);
      }}
    >
      <DialogPortal>
        <DialogBackdrop className="bg-black" />
        <DialogContent className="top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-black p-0 shadow-none transition-opacity data-[ending-style]:scale-100 data-[starting-style]:scale-100">
          <DialogTitle className="sr-only">
            <Trans>Report images</Trans>
          </DialogTitle>
          {image ? (
            <ProgressiveImage
              key={image.url}
              src={image.url}
              alt={title}
              width={image.width ?? undefined}
              height={image.height ?? undefined}
              loading="eager"
              className="size-full object-contain"
              skeletonClassName="bg-white/10"
            />
          ) : null}
          {many ? (
            <>
              <button
                type="button"
                aria-label={t`Previous image`}
                onClick={() => setIndex((current) => (current - 1 + images.length) % images.length)}
                className="absolute top-1/2 start-4 flex size-11 -translate-y-1/2 items-center justify-center border border-white/30 bg-black/70 text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <RiArrowLeftSLine className="size-6 rtl:-scale-x-100" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t`Next image`}
                onClick={() => setIndex((current) => (current + 1) % images.length)}
                className="absolute top-1/2 end-4 flex size-11 -translate-y-1/2 items-center justify-center border border-white/30 bg-black/70 text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <RiArrowRightSLine className="size-6 rtl:-scale-x-100" aria-hidden="true" />
              </button>
              <p
                aria-live="polite"
                className="absolute end-4 bottom-4 bg-black/70 px-2 py-1 font-mono text-white text-xs tabular-nums"
              >
                <Trans>
                  {current} / {images.length}
                </Trans>
              </p>
            </>
          ) : null}
          <DialogClose
            aria-label={t`Close`}
            className="absolute top-4 end-4 z-10 flex size-11 items-center justify-center border border-white/30 bg-black/70 text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <RiCloseLine className="size-6" aria-hidden="true" />
          </DialogClose>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
