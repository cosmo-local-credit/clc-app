import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiCheckLine, RiStackLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import { Toggle } from "#/components/ui/toggle";
import {
  MARKET_MAP_RESOURCE_KINDS,
  type MarketMapResourceKind,
} from "#/features/home/hooks/use-market-map-resource-selection";
import { cn } from "#/lib/utils";
import { DeskChip } from "#/desktop/ui/segment";

/** The saved map selection, as `useMarketMapResourceSelection` returns it. */
export type MapLayers = {
  selected: readonly MarketMapResourceKind[];
  allSelected: boolean;
  isDefault: boolean;
  toggle: (kind: MarketMapResourceKind) => void;
  toggleAll: () => void;
  reset: () => void;
};

/**
 * The resource types the All map draws, as a popover under a chip: the phone
 * map's five toggles (Vouchers, Wants, Pools, Catalogs, Posts) with a way back
 * to the defaults. It decides what is on the map only. The scope tabs beside it
 * choose which marketplace category the results are about, so the two stay
 * apart: a category scope draws its own resource and has no layers to pick.
 */
export function MapLayersChip({ layers }: { layers: MapLayers }) {
  const { t } = useLingui();
  const labels: Record<MarketMapResourceKind, string> = {
    voucher: t`Vouchers`,
    want: t`Wants`,
    pool: t`Pools`,
    catalog: t`Catalogs`,
    post: t`Posts`,
  };
  const count = layers.selected.length;
  const total = MARKET_MAP_RESOURCE_KINDS.length;
  const empty = count === 0;
  const [open, setOpen] = useState(false);
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <DeskChip on={open}>
        <PopoverTrigger>
          <RiStackLine aria-hidden="true" />
          <Trans>Layers</Trans>
          <span
            aria-hidden="true"
            className={cn(
              "min-w-4 px-1 text-center font-mono text-2xs font-semibold",
              open ? "bg-background text-foreground" : "bg-foreground text-background",
            )}
          >
            {count}
          </span>
        </PopoverTrigger>
      </DeskChip>
      <PopoverContent align="start" className="grid w-80 gap-4 p-0">
        <div className="flex h-12 items-center justify-between gap-3 border-border border-b px-4">
          <PopoverTitle className="font-heading text-base font-semibold">
            <Trans>Show on map</Trans>
          </PopoverTitle>
          <span className="text-xs text-muted-foreground">
            <Trans>
              {count} of {total}
            </Trans>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 px-4" role="group" aria-label={t`Types on the map`}>
          {MARKET_MAP_RESOURCE_KINDS.map((kind) => {
            const pressed = layers.selected.includes(kind);
            return (
              <Toggle
                key={kind}
                variant="outline"
                pressed={pressed}
                onPressedChange={() => layers.toggle(kind)}
                className="justify-start gap-1.5 data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
              >
                {pressed ? <RiCheckLine aria-hidden="true" /> : null}
                {labels[kind]}
              </Toggle>
            );
          })}
        </div>
        {empty ? (
          <p role="status" className="px-4 text-sm text-muted-foreground">
            <Trans>Choose a resource type to show it on the map.</Trans>
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-border border-t px-4 py-3">
          <Button variant="outline" disabled={layers.allSelected} onClick={layers.toggleAll}>
            <Trans>Show all</Trans>
          </Button>
          <Button variant="outline" disabled={layers.isDefault} onClick={layers.reset}>
            <Trans>Reset</Trans>
          </Button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
