import { resolveMarkerStyle } from "@clc/core/features/markers/logic";
import { Trans } from "@lingui/react/macro";
import { Suspense, useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import { DeskEyebrow } from "#/desktop/ui/page";
import type { VoucherWizard } from "./wizard-bits";

/**
 * The right column of the wizard: the voucher as the map and the Market list
 * will show it, redrawn from the form as the issuer types.
 */
export function CreateVoucherPreview({
  wizard,
  showMap,
}: {
  wizard: VoucherWizard;
  showMap: boolean;
}) {
  const { form } = wizard;
  // The map is WebGL and client-only; the server render keeps its box.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <form.Subscribe
      selector={(state) =>
        [
          state.values.name,
          state.values.symbol,
          state.values.iconUrl,
          state.values.location,
          state.values.markerIcon,
          state.values.markerColor,
        ] as const
      }
    >
      {([name, symbol, iconUrl, location, markerIcon, markerColor]) => {
        const title = name.trim();
        const seed = (symbol || title || "voucher").toLowerCase();
        const initials =
          title
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0] ?? "")
            .join("")
            .toUpperCase() || "?";
        const place = location?.locationName.split(",")[0]?.trim();
        const mapBox = <div className="h-[180px] w-full border border-border bg-card" />;
        return (
          <div className="grid content-start gap-2.5">
            {showMap ? (
              <>
                <DeskEyebrow>
                  <Trans>Preview · Map</Trans>
                </DeskEyebrow>
                {mounted ? (
                  <Suspense fallback={mapBox}>
                    <LocationMap
                      lat={location?.lat ?? null}
                      lng={location?.lng ?? null}
                      markerStyle={resolveMarkerStyle({
                        kind: "voucher",
                        markerIcon,
                        markerColor,
                      })}
                      className="h-[180px]"
                    />
                  </Suspense>
                ) : (
                  mapBox
                )}
              </>
            ) : null}
            <DeskEyebrow className={showMap ? "mt-3.5" : undefined}>
              <Trans>Preview · Market</Trans>
            </DeskEyebrow>
            <div className="flex min-h-[61px] min-w-0 items-center gap-3 border border-border bg-card px-3.5 py-2.5">
              {iconUrl ? (
                <span className="relative block size-[34px] shrink-0 overflow-hidden bg-muted">
                  <ProgressiveImage src={iconUrl} alt="" className="size-full object-cover" />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-[34px] shrink-0 items-center justify-center font-heading text-2xs font-bold text-white"
                  style={{ background: hueFromSeed(seed) }}
                >
                  {initials}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-sm font-semibold">
                  {title || <Trans>Voucher Name</Trans>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {symbol ? (
                    <span className="font-mono" dir="ltr">
                      {symbol}
                    </span>
                  ) : null}
                  {symbol && place ? " · " : null}
                  {place}
                </span>
              </span>
              <Badge size="sm" variant="outline">
                <Trans>Voucher</Trans>
              </Badge>
            </div>
          </div>
        );
      }}
    </form.Subscribe>
  );
}
