import { useLingui } from "@lingui/react/macro";

import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  CATALOG_VISIBILITIES,
  type CatalogVisibility,
  useHydratedCatalogVisibility,
} from "#/features/home/state/catalog-visibility";
import { cn } from "#/lib/utils";

export function VisibilitySelector({ triggerClassName }: { triggerClassName?: string }) {
  const { t } = useLingui();
  const { visibility, setVisibility } = useHydratedCatalogVisibility();
  const labels: Record<CatalogVisibility, string> = {
    global: t`Global`,
    "1000": t`1,000 km`,
    "500": t`500 km`,
    "100": t`100 km`,
    "50": t`50 km`,
  };

  return (
    <SelectRoot
      items={Object.fromEntries(CATALOG_VISIBILITIES.map((value) => [value, labels[value]]))}
      value={visibility}
      onValueChange={(next) => {
        if (CATALOG_VISIBILITIES.some((value) => value === next)) {
          setVisibility(next as CatalogVisibility);
        }
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
