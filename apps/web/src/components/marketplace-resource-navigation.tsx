import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import {
  RiBookOpenLine,
  RiCoupon3Line,
  RiGroupLine,
  RiMap2Line,
  RiStore2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { catalogSearchForScope } from "#/lib/navigation/catalog-search";

export type MarketplaceResource = "offers" | "vouchers" | "pools" | "catalogs";

/** The same resource switcher on every marketplace catalog. */
export function MarketplaceResourceNavigation({ current }: { current: MarketplaceResource }) {
  const { t } = useLingui();
  return (
    <nav className="flex flex-wrap gap-2" aria-label={t`Marketplace sections`}>
      {current !== "offers" ? (
        <Button asChild className="h-9">
          <Link to="/offers">
            <RiStore2Line className="size-4" aria-hidden="true" />
            <Trans>Offers</Trans>
          </Link>
        </Button>
      ) : null}
      {current !== "vouchers" ? (
        <Button asChild variant="outline" className="h-9 bg-card">
          <Link to="/vouchers">
            <RiCoupon3Line className="size-4" aria-hidden="true" />
            <Trans>Vouchers</Trans>
          </Link>
        </Button>
      ) : null}
      {current !== "pools" ? (
        <Button asChild variant="info" className="h-9">
          <Link to="/pools" search={{ creditable: false }}>
            <RiGroupLine className="size-4" aria-hidden="true" />
            <Trans>Pools</Trans>
          </Link>
        </Button>
      ) : null}
      {current !== "catalogs" ? (
        <Button asChild variant="success" className="h-9">
          <Link to="/catalogs">
            <RiBookOpenLine className="size-4" aria-hidden="true" />
            <Trans>Catalogs</Trans>
          </Link>
        </Button>
      ) : null}
      {current === "offers" || current === "vouchers" ? (
        <Button asChild variant="outline" size="icon-lg" className="h-9 w-9 bg-card">
          <Link
            to="/"
            search={(previous) => ({
              ...(current === "vouchers" ? catalogSearchForScope(previous, false) : {}),
              tab: "market",
              view: "map",
            })}
            aria-label={t`Map`}
          >
            <RiMap2Line className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
