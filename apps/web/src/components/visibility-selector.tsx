import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiMapPinRangeLine } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { RadioGroup, RadioGroupRow } from "#/components/ui/radio-group";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { SettingsSheet } from "#/components/ui/settings-sheet";
import {
  CATALOG_VISIBILITIES,
  type CatalogVisibility,
  useHydratedCatalogVisibility,
} from "#/features/home/state/catalog-visibility";
import { cn } from "#/lib/utils";

function useVisibilityLabels(): Record<CatalogVisibility, string> {
  const { t } = useLingui();
  return {
    global: t`Global`,
    "1000": t`1,000 km`,
    "500": t`500 km`,
    "100": t`100 km`,
    "50": t`50 km`,
  };
}

function isCatalogVisibility(value: unknown): value is CatalogVisibility {
  return CATALOG_VISIBILITIES.some((visibility) => visibility === value);
}

export function VisibilitySelector({ triggerClassName }: { triggerClassName?: string }) {
  const { t } = useLingui();
  const { visibility, setVisibility } = useHydratedCatalogVisibility();
  const labels = useVisibilityLabels();

  return (
    <SelectRoot
      items={Object.fromEntries(CATALOG_VISIBILITIES.map((value) => [value, labels[value]]))}
      value={visibility}
      onValueChange={(next) => {
        if (isCatalogVisibility(next)) setVisibility(next);
      }}
    >
      <SelectTrigger
        aria-label={t`Visibility`}
        className={cn(
          "h-9 w-auto border-border font-medium text-foreground text-xs",
          triggerClassName,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATALOG_VISIBILITIES.map((value) => (
          <SelectItem key={value} value={value}>
            {labels[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}

/**
 * Settings row for the catalog radius. Carries the `#visibility` anchor the
 * catalogs page's radius link scrolls to.
 */
export function VisibilitySettingsRow() {
  const { t } = useLingui();
  const { visibility, setVisibility } = useHydratedCatalogVisibility();
  const labels = useVisibilityLabels();
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionRow
        id="visibility"
        className="scroll-mt-4"
        icon={<RiMapPinRangeLine className="size-4" aria-hidden="true" />}
        label={t`Visibility`}
        value={labels[visibility]}
        onClick={() => setOpen(true)}
      />
      <SettingsSheet open={open} onOpenChange={setOpen} title={t`Visibility`}>
        <RadioGroup
          aria-label={t`Visibility`}
          value={visibility}
          onValueChange={(next) => {
            if (!isCatalogVisibility(next)) return;
            setVisibility(next);
            setOpen(false);
          }}
          className="gap-0 border border-border bg-card"
        >
          {CATALOG_VISIBILITIES.map((value) => (
            <RadioGroupRow key={value} value={value} label={labels[value]} />
          ))}
        </RadioGroup>
      </SettingsSheet>
    </>
  );
}
