import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import {
  RiBookOpenLine,
  RiCoupon3Line,
  RiFilter3Line,
  RiGroupLine,
  RiMap2Line,
  RiSearch2Line,
  RiStore2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  marketplaceSearchForScope,
  pickMarketplaceSearch,
} from "#/lib/navigation/marketplace-search";

export type MarketplaceResource = "all" | "offers" | "vouchers" | "pools" | "catalogs" | "map";

const resources = [
  { id: "all", label: <Trans>All</Trans>, title: "All", icon: RiSearch2Line, variant: "outline" },
  {
    id: "offers",
    label: <Trans>Offers</Trans>,
    title: "Offers",
    icon: RiStore2Line,
    variant: "offer",
  },
  {
    id: "vouchers",
    label: <Trans>Voucher</Trans>,
    title: "Voucher",
    icon: RiCoupon3Line,
    variant: "voucher",
  },
  { id: "pools", label: <Trans>Pools</Trans>, title: "Pools", icon: RiGroupLine, variant: "info" },
  {
    id: "catalogs",
    label: <Trans>Catalogs</Trans>,
    title: "Catalogs",
    icon: RiBookOpenLine,
    variant: "success",
  },
  { id: "map", label: <Trans>Map</Trans>, title: "Map", icon: RiMap2Line, variant: "outline" },
] as const satisfies readonly {
  id: MarketplaceResource;
  label: ReactNode;
  title: string;
  icon: typeof RiStore2Line;
  variant: ComponentProps<typeof Button>["variant"];
}[];

export function MarketplaceResourceNavigation({
  current,
  credit,
  filters,
}: {
  current: MarketplaceResource;
  credit?: ReactNode;
  filters?: ReactNode;
}) {
  const { t } = useLingui();
  const activeControlRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeControlRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, []);
  const titleFor = (resource: MarketplaceResource) => {
    if (resource === "all") return t`All`;
    if (resource === "offers") return t`Offers`;
    if (resource === "vouchers") return t`Voucher`;
    if (resource === "pools") return t`Pools`;
    if (resource === "catalogs") return t`Catalogs`;
    return t`Map`;
  };
  return (
    <nav className="flex w-full items-center gap-1 pb-1" aria-label={t`Marketplace sections`}>
      <span className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {resources.map((resource) => {
          const Icon = resource.icon;
          const active = resource.id === current;
          const inactiveClass =
            resource.id === "offers"
              ? "border-offer bg-card text-offer hover:bg-offer/10"
              : resource.id === "vouchers"
                ? "border-voucher bg-card text-voucher hover:bg-voucher/10"
                : resource.id === "pools"
                  ? "border-info bg-card text-info hover:bg-info/10"
                  : resource.id === "catalogs"
                    ? "border-success bg-card text-success hover:bg-success/10"
                    : "bg-card";
          const content = (
            <>
              <Icon className="size-5" aria-hidden="true" />
              <span className="sr-only">{resource.label}</span>
            </>
          );
          if (active) {
            return (
              <Button
                key={resource.id}
                ref={activeControlRef}
                variant={resource.variant}
                disabled
                aria-current="page"
                title={titleFor(resource.id)}
                className="size-11 opacity-100"
              >
                {content}
              </Button>
            );
          }
          if (resource.id === "map") {
            return (
              <Button key={resource.id} asChild variant="outline" className="size-11 bg-card">
                <Link
                  to="/"
                  title={t`Map`}
                  search={(previous) => {
                    const state = pickMarketplaceSearch(previous);
                    return {
                      q: state.q,
                      tags: state.tags,
                      tagMatch: state.tagMatch,
                      creditable: state.creditable,
                    };
                  }}
                >
                  {content}
                </Link>
              </Button>
            );
          }
          const scope = resource.id === "all" ? null : resource.id;
          return (
            <Button
              key={resource.id}
              asChild
              variant="outline"
              className={`size-11 ${inactiveClass}`}
            >
              <Link
                to="/market"
                title={titleFor(resource.id)}
                search={(previous) =>
                  marketplaceSearchForScope(pickMarketplaceSearch(previous), scope)
                }
              >
                {content}
              </Link>
            </Button>
          );
        })}
      </span>
      <span className="ms-auto flex shrink-0 items-center gap-1">
        {credit}
        {filters ?? (
          <Button
            variant="outline"
            disabled
            className="size-11 bg-muted opacity-100"
            title={t`Filters`}
          >
            <RiFilter3Line className="size-5" aria-hidden="true" />
            <span className="sr-only">
              <Trans>Filters</Trans>
            </span>
          </Button>
        )}
      </span>
    </nav>
  );
}
