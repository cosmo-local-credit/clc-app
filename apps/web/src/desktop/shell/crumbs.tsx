import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiArrowRightSLine } from "react-icons/ri";

import { deskCrumbIds, type DeskCrumbId, type DesktopSearch } from "#/desktop/chrome";
import {
  marketplaceSearchForScope,
  marketplaceSharedSearch,
} from "#/lib/navigation/marketplace-search";

function CrumbLabel({ id }: { id: DeskCrumbId }) {
  switch (id) {
    case "market":
      return <Trans>Market</Trans>;
    case "wallet":
      return <Trans>Wallet</Trans>;
    case "activity":
      return <Trans>Activity</Trans>;
    case "posts":
      return <Trans>Posts</Trans>;
    case "settings":
      return <Trans>Settings</Trans>;
    case "offers":
      return <Trans>Offers</Trans>;
    case "wants":
      return <Trans>Wants</Trans>;
    case "vouchers":
      return <Trans>Vouchers</Trans>;
    case "pools":
      return <Trans>Pools</Trans>;
    case "catalogs":
      return <Trans>Catalogs</Trans>;
    case "send":
      return <Trans>Send</Trans>;
    case "receive":
      return <Trans>Receive</Trans>;
    case "cash":
      return <Trans>Cash</Trans>;
    case "all-vouchers":
      return <Trans>All vouchers</Trans>;
    case "create-pool":
      return <Trans>Create pool</Trans>;
    case "create-voucher":
      return <Trans>Create voucher</Trans>;
    case "create-want":
      return <Trans>Create Want</Trans>;
    case "create-catalog":
      return <Trans>Create catalog</Trans>;
    case "my-posts":
      return <Trans>My posts</Trans>;
    case "new-post":
      return <Trans>New post</Trans>;
    case "edit-post":
      return <Trans>Edit post</Trans>;
    case "profile":
      return <Trans>Edit profile</Trans>;
    case "collect":
      return <Trans>Collect</Trans>;
  }
}

function CrumbLink({ id, children }: { id: DeskCrumbId; children: ReactNode }) {
  const className = "text-muted-foreground hover:text-foreground";
  if (id === "wallet" || id === "activity" || id === "posts" || id === "settings") {
    return (
      <Link to="/" search={{ tab: id }} className={className}>
        {children}
      </Link>
    );
  }
  if (id === "market") {
    return (
      <Link
        to="/"
        search={(previous) => ({
          ...marketplaceSharedSearch(previous),
          tab: "market",
          view: "map",
        })}
        className={className}
      >
        {children}
      </Link>
    );
  }
  if (
    id === "offers" ||
    id === "wants" ||
    id === "vouchers" ||
    id === "pools" ||
    id === "catalogs"
  ) {
    return (
      <Link
        to="/market"
        search={(previous) => ({
          ...marketplaceSearchForScope(marketplaceSharedSearch(previous), id),
          view: "list",
        })}
        className={className}
      >
        {children}
      </Link>
    );
  }
  if (id === "send") {
    return (
      <Link to="/wallet/send" className={className}>
        {children}
      </Link>
    );
  }
  if (id === "receive") {
    return (
      <Link to="/wallet/receive" className={className}>
        {children}
      </Link>
    );
  }
  if (id === "cash") {
    return (
      <Link to="/wallet/cash" className={className}>
        {children}
      </Link>
    );
  }
  if (id === "all-vouchers") {
    return (
      <Link to="/wallet/vouchers" className={className}>
        {children}
      </Link>
    );
  }
  if (id === "create-pool") {
    return (
      <Link to="/pools/create/$step" params={{ step: "pool" }} className={className}>
        {children}
      </Link>
    );
  }
  if (id === "create-voucher") {
    return (
      <Link to="/vouchers/create/$step" params={{ step: "voucher" }} className={className}>
        {children}
      </Link>
    );
  }
  if (id === "create-want") {
    return (
      <Link to="/wallet/wants/new" className={className}>
        {children}
      </Link>
    );
  }
  if (id === "create-catalog") {
    return (
      <Link to="/catalogs/create" className={className}>
        {children}
      </Link>
    );
  }
  if (id === "my-posts") {
    return (
      <Link to="/posts/mine" className={className}>
        {children}
      </Link>
    );
  }
  if (id === "new-post") {
    return (
      <Link to="/posts/new" className={className}>
        {children}
      </Link>
    );
  }
  if (id === "profile") {
    return (
      <Link to="/settings/profile" className={className}>
        {children}
      </Link>
    );
  }
  return <span className={className}>{children}</span>;
}

export function DeskCrumbs({
  pathname,
  search,
  trail,
}: {
  pathname: string;
  search: DesktopSearch;
  trail: string | null;
}) {
  const ids = deskCrumbIds(pathname, search);
  const items: ReactNode[] = ids.map((id, index) => {
    const last = index === ids.length - 1 && !trail;
    const label = <CrumbLabel id={id} />;
    return (
      <span key={id} className="inline-flex items-center gap-1.5">
        {index > 0 ? (
          <RiArrowRightSLine className="size-3 text-muted-foreground" aria-hidden="true" />
        ) : null}
        {last ? (
          <span className="font-semibold text-foreground">{label}</span>
        ) : (
          <CrumbLink id={id}>{label}</CrumbLink>
        )}
      </span>
    );
  });
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 truncate text-sm">
      {items}
      {trail ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <RiArrowRightSLine className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate font-semibold text-foreground">{trail}</span>
        </span>
      ) : null}
    </nav>
  );
}
