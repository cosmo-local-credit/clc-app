import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiAddLine, RiSubtractLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import type { MarketMapZoomControls } from "./market-map";

export function MarketMapControls({
  location,
  zoom,
}: {
  location: ReactNode;
  zoom: MarketMapZoomControls | null;
}) {
  const { t } = useLingui();
  const zoomInLabel = t`Zoom in`;
  const zoomOutLabel = t`Zoom out`;

  return (
    <div data-slot="market-map-controls" className="flex flex-col gap-2">
      {location}
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className="pointer-events-auto bg-card"
        aria-label={zoomInLabel}
        title={zoomInLabel}
        disabled={!zoom?.canZoomIn}
        onClick={zoom?.zoomIn}
      >
        <RiAddLine className="size-5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className="pointer-events-auto bg-card"
        aria-label={zoomOutLabel}
        title={zoomOutLabel}
        disabled={!zoom?.canZoomOut}
        onClick={zoom?.zoomOut}
      >
        <RiSubtractLine className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );
}
