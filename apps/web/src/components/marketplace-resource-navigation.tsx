import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import {
  RiBookOpenLine,
  RiCoupon3Line,
  RiFilter3Line,
  RiGroupLine,
  RiMap2Line,
  RiStore2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { catalogSearchForScope } from "#/lib/navigation/catalog-search";

export type MarketplaceResource = "offers" | "vouchers" | "pools" | "catalogs";

const resources = [
  {
    id: "offers",
    to: "/offers",
    label: <Trans>Offers</Trans>,
    icon: RiStore2Line,
    variant: "default",
  },
  {
    id: "vouchers",
    to: "/vouchers",
    label: <Trans>Vouchers</Trans>,
    icon: RiCoupon3Line,
    variant: "outline",
  },
  { id: "pools", to: "/pools", label: <Trans>Pools</Trans>, icon: RiGroupLine, variant: "info" },
  {
    id: "catalogs",
    to: "/catalogs",
    label: <Trans>Catalogs</Trans>,
    icon: RiBookOpenLine,
    variant: "success",
  },
] as const satisfies readonly {
  id: MarketplaceResource;
  to: "/offers" | "/vouchers" | "/pools" | "/catalogs";
  label: ReactNode;
  icon: typeof RiStore2Line;
  variant: ComponentProps<typeof Button>["variant"];
}[];

/** The same complete resource switcher on every marketplace catalog. */
export function MarketplaceResourceNavigation({
  current,
  filters,
}: {
  current: MarketplaceResource;
  /** The page's functional Filters trigger. Catalogs intentionally omits it. */
  filters?: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <nav
      className="flex w-full flex-wrap items-center justify-end gap-2"
      aria-label={t`Marketplace sections`}
    >
      {resources.map((resource) => {
        const Icon = resource.icon;
        if (resource.id === current) {
          return (
            <Button
              key={resource.id}
              variant="outline"
              disabled
              aria-current="page"
              className="h-9 bg-muted text-muted-foreground opacity-100"
            >
              <Icon className="size-4" aria-hidden="true" />
              {resource.label}
            </Button>
          );
        }
        return (
          <Button
            key={resource.id}
            asChild
            variant={resource.variant}
            className={resource.variant === "outline" ? "h-9 bg-card" : "h-9"}
          >
            {resource.id === "pools" ? (
              <Link to="/pools" search={{ creditable: false }}>
                <Icon className="size-4" aria-hidden="true" />
                {resource.label}
              </Link>
            ) : (
              <Link to={resource.to}>
                <Icon className="size-4" aria-hidden="true" />
                {resource.label}
              </Link>
            )}
          </Button>
        );
      })}
      <Button asChild variant="outline" className="h-9 bg-card">
        <Link
          to="/"
          search={(previous) => ({
            ...(current === "vouchers" ? catalogSearchForScope(previous, false) : {}),
            tab: "market",
            view: "map",
          })}
        >
          <RiMap2Line className="size-4" aria-hidden="true" />
          <Trans>Map</Trans>
        </Link>
      </Button>
      {filters ?? (
        <Button
          variant="outline"
          disabled
          className="h-9 bg-muted text-muted-foreground opacity-100"
        >
          <RiFilter3Line className="size-4" aria-hidden="true" />
          <Trans>Filters</Trans>
        </Button>
      )}
    </nav>
  );
}
