import type { UserPool } from "@clc/api/features/pools/client";
import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense } from "react";
import { RiNavigationLine } from "react-icons/ri";
import { toast } from "sonner";

import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { Button } from "#/components/ui/button";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { Skeleton } from "#/components/ui/skeleton";
import { FullValue } from "#/desktop/ui/full-value";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskPanel, DeskSection, deskSectionLinkClass } from "#/desktop/ui/page";
import { openDefaultMaps } from "#/lib/default-maps";

export type PoolPrivateInfo = {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  retry: () => void;
};

/** Contacts and terms are read to be used, so a long one wraps rather than being cut. */
const linkClass =
  "block font-sans font-normal underline underline-offset-2 [overflow-wrap:anywhere]";

/** The pool's record: about, contacts, terms and where it is. */
export function PoolInfoDesk({
  pool,
  privateInfo,
}: {
  pool: UserPool;
  privateInfo?: PoolPrivateInfo;
}) {
  return (
    <div>
      <AuthenticatedDetailsGate className="border border-border bg-card p-4">
        {privateInfo?.isPending ? (
          <p aria-busy="true" className="text-sm text-muted-foreground">
            <Trans>Loading pool information…</Trans>
          </p>
        ) : privateInfo?.isError ? (
          <DeskPanel className="flex items-center justify-between gap-3 text-sm">
            <p role="alert">
              <Trans>Couldn't load pool information.</Trans>
            </p>
            <Button variant="outline" pending={privateInfo.isFetching} onClick={privateInfo.retry}>
              <Trans>Retry</Trans>
            </Button>
          </DeskPanel>
        ) : (
          <PoolInfoBody pool={pool} />
        )}
      </AuthenticatedDetailsGate>
    </div>
  );
}

function PoolInfoBody({ pool }: { pool: UserPool }) {
  const { t } = useLingui();
  const hasCoordinates = typeof pool.geoLat === "number" && typeof pool.geoLng === "number";
  const locationLabel =
    pool.locationName ?? (hasCoordinates ? `${pool.geoLat}, ${pool.geoLng}` : null);
  const copyAddress = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy contract address`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Contract address copied`))
      .catch(() => toast.error(t`Couldn't copy contract address`));
  };
  const termsUrl = pool.terms && isHttpUrl(pool.terms) ? pool.terms : null;

  return (
    <div className="grid grid-cols-1 items-start gap-6 @min-[44rem]:grid-cols-2">
      <div className="grid min-w-0 gap-6">
        {pool.description ? (
          <DeskSection title={<Trans>About</Trans>}>
            <DeskPanel>
              <p
                dir="auto"
                className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]"
              >
                {pool.description}
              </p>
            </DeskPanel>
          </DeskSection>
        ) : null}
        <DeskSection title={<Trans>Details</Trans>}>
          <DeskKV
            labelWidth="140px"
            rows={[
              [
                <Trans key="label">Contract address</Trans>,
                <FullValue
                  key="value"
                  value={pool.address}
                  copyLabel={t`Copy contract address`}
                  onCopy={copyAddress}
                />,
              ],
              [<Trans key="label">Unit of account</Trans>, pool.unitOfAccount ?? "—"],
              pool.email
                ? [
                    <Trans key="label">Email</Trans>,
                    <a key="value" href={`mailto:${pool.email}`} className={linkClass}>
                      {pool.email}
                    </a>,
                  ]
                : null,
              pool.website
                ? [
                    <Trans key="label">Website</Trans>,
                    <a
                      key="value"
                      href={pool.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={linkClass}
                    >
                      {pool.website}
                    </a>,
                  ]
                : null,
              pool.phone
                ? [
                    <Trans key="label">Phone</Trans>,
                    <a key="value" href={`tel:${pool.phone}`} className={linkClass}>
                      {pool.phone}
                    </a>,
                  ]
                : null,
              termsUrl
                ? [
                    <Trans key="label">Terms</Trans>,
                    <a
                      key="value"
                      href={termsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={linkClass}
                    >
                      {termsUrl}
                    </a>,
                  ]
                : null,
            ]}
          />
        </DeskSection>
        {pool.terms && !termsUrl ? (
          <DeskSection title={<Trans>Terms</Trans>}>
            <DeskPanel>
              <MarkdownContent>{pool.terms}</MarkdownContent>
            </DeskPanel>
          </DeskSection>
        ) : null}
      </div>
      {locationLabel ? (
        <DeskSection
          title={<Trans>Location</Trans>}
          action={
            <button
              type="button"
              className={deskSectionLinkClass("inline-flex items-center gap-1")}
              onClick={() =>
                openDefaultMaps({ label: pool.locationName, lat: pool.geoLat, lng: pool.geoLng })
              }
            >
              <RiNavigationLine className="size-3.5" aria-hidden="true" />
              <Trans>Open in Maps</Trans>
            </button>
          }
        >
          <DeskPanel className="grid gap-3">
            <p dir="auto" className="text-sm font-semibold [overflow-wrap:anywhere]">
              {locationLabel}
            </p>
            {hasCoordinates && pool.geoLat !== null && pool.geoLng !== null ? (
              <Suspense fallback={<Skeleton className="h-56 w-full rounded-none" />}>
                <LocationMap
                  lat={pool.geoLat}
                  lng={pool.geoLng}
                  markerResource="pool"
                  className="h-56 rounded-none border-0"
                />
              </Suspense>
            ) : null}
          </DeskPanel>
        </DeskSection>
      ) : null}
    </div>
  );
}
