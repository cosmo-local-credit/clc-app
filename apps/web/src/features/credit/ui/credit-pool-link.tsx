import { Link } from "@tanstack/react-router";
import { Fragment, type MouseEvent } from "react";

import { cn } from "#/lib/utils";

/** A Pool name inside a selectable route. Its click must not choose the route. */
export function CreditPoolLink({
  address,
  name,
  className,
}: {
  address: string;
  name: string;
  className?: string;
}) {
  return (
    <Link
      to="/pools/$poolAddress"
      params={{ poolAddress: address }}
      className={cn("underline underline-offset-2 hover:text-primary", className)}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => event.stopPropagation()}
    >
      {name}
    </Link>
  );
}

export function CreditPoolLinks({
  pools,
  className,
}: {
  pools: readonly { address: string; name: string }[];
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1", className)}>
      {pools.map((pool, index) => (
        <Fragment key={`${pool.address}-${index}`}>
          {index > 0 ? <span aria-hidden="true">→</span> : null}
          <CreditPoolLink address={pool.address} name={pool.name} />
        </Fragment>
      ))}
    </span>
  );
}
