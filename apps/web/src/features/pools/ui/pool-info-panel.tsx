import type { UserPool } from "@clc/api/features/pools/client";
import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense } from "react";
import { RiNavigationLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { InfoRow } from "#/components/ui/info-row";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { Skeleton } from "#/components/ui/skeleton";
import { openDefaultMaps } from "#/lib/default-maps";

export function PoolInfoPanel({ pool }: { pool: UserPool }) {
  const { t } = useLingui();
  const hasCoordinates = typeof pool.geoLat === "number" && typeof pool.geoLng === "number";
  const locationLabel =
    pool.locationName ?? (hasCoordinates ? `${pool.geoLat}, ${pool.geoLng}` : null);

  function copyAddress(value: string) {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy contract address`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Contract address copied`))
      .catch(() => toast.error(t`Couldn't copy contract address`));
  }

  return (
    <div id="pool-panel-info" role="tabpanel" aria-labelledby="pool-tab-info" className="space-y-3">
      {pool.description ? (
        <div className="border border-border bg-card p-4">
          <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">
            {pool.description}
          </p>
        </div>
      ) : null}

      <dl className="border border-border bg-card">
        <InfoRow label={t`Contract address`}>
          <CopyableInfoValue
            value={pool.address}
            label={t`Copy contract address`}
            onCopy={copyAddress}
          />
        </InfoRow>
        <InfoRow label={t`Unit of account`}>{pool.unitOfAccount ?? "—"}</InfoRow>
        {pool.email ? (
          <InfoRow label={t`Email`}>
            <a
              href={`mailto:${pool.email}`}
              className="max-w-full truncate underline underline-offset-2"
            >
              {pool.email}
            </a>
          </InfoRow>
        ) : null}
        {pool.website ? (
          <InfoRow label={t`Website`}>
            <a
              href={pool.website}
              target="_blank"
              rel="noreferrer noopener"
              className="max-w-full truncate underline underline-offset-2"
            >
              {pool.website}
            </a>
          </InfoRow>
        ) : null}
        {pool.phone ? (
          <InfoRow label={t`Phone`}>
            <a
              href={`tel:${pool.phone}`}
              className="max-w-full truncate underline underline-offset-2"
            >
              {pool.phone}
            </a>
          </InfoRow>
        ) : null}
        {pool.terms && isHttpUrl(pool.terms) ? (
          <InfoRow label={t`Terms`}>
            <a
              href={pool.terms}
              target="_blank"
              rel="noreferrer noopener"
              className="max-w-full truncate underline underline-offset-2"
            >
              {pool.terms}
            </a>
          </InfoRow>
        ) : null}
      </dl>

      {pool.terms && !isHttpUrl(pool.terms) ? (
        <div className="border border-border bg-card p-4">
          <p className="text-sm font-semibold leading-snug">
            <Trans>Terms</Trans>
          </p>
          <MarkdownContent className="mt-2">{pool.terms}</MarkdownContent>
        </div>
      ) : null}

      {locationLabel ? (
        <div className="border border-border bg-card p-4">
          <p className="text-sm font-semibold leading-snug">{locationLabel}</p>
          {hasCoordinates && pool.geoLat !== null && pool.geoLng !== null ? (
            <Suspense fallback={<Skeleton className="mt-3 h-36 w-full rounded-none" />}>
              <LocationMap
                lat={pool.geoLat}
                lng={pool.geoLng}
                markerResource="pool"
                className="mt-3 h-36 rounded-none border-0"
              />
            </Suspense>
          ) : null}
          <Button
            variant="outline"
            tap
            className="mt-3 w-full"
            onClick={() =>
              openDefaultMaps({ label: pool.locationName, lat: pool.geoLat, lng: pool.geoLng })
            }
          >
            <RiNavigationLine className="size-4" aria-hidden="true" />
            <Trans>Open in Maps</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
