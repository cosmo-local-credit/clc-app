import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { RiArrowRightSLine, RiSearchLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { UserPool } from "#/features/pools/api/pools-client";
import { usePoolVouchers } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { PoolLogo } from "./pool-logo";

export function PoolsPage() {
  const { t } = useLingui();
  const poolsQuery = useUserPoolsInfinite();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pools = poolsQuery.data?.pages.flatMap((page) => page.pools) ?? [];

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !poolsQuery.hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && !poolsQuery.isFetchingNextPage) {
        void poolsQuery.fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [poolsQuery.fetchNextPage, poolsQuery.hasNextPage, poolsQuery.isFetchingNextPage]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1>
          <Trans>Pools</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Explore community pools and their vouchers.</Trans>
        </p>
      </div>

      <div className="relative">
        <RiSearchLine
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          readOnly
          aria-label={t`Search pools`}
          placeholder={t`Search pools`}
          className="h-11 rounded-none bg-card pl-9"
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 rounded-none bg-card px-3">
          <Trans>Near me</Trans>
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 rounded-none bg-card px-3">
          <Trans>Most active</Trans>
        </Button>
      </div>

      {poolsQuery.isPending ? (
        <div className="border border-border bg-card p-3 text-muted-foreground text-sm">
          <Trans>Loading pools…</Trans>
        </div>
      ) : null}

      {poolsQuery.isError ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <p className="text-muted-foreground text-sm">
            <Trans>Couldn't load pools.</Trans>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-card"
            onClick={() => poolsQuery.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}

      {poolsQuery.isSuccess ? (
        <>
          <p className="text-muted-foreground text-xs">
            <Trans>{pools.length} pools</Trans>
          </p>
          {pools.length === 0 ? (
            <div className="border border-border bg-card p-3 text-muted-foreground text-sm">
              <Trans>No pools yet.</Trans>
            </div>
          ) : (
            <section className="border border-border bg-card" aria-label={t`Pools list`}>
              {pools.map((pool, index) => (
                <PoolRow key={pool.address} pool={pool} isLast={index === pools.length - 1} />
              ))}
              <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
              {poolsQuery.isFetchingNextPage ? (
                <div className="p-3 text-center text-muted-foreground text-xs">
                  <Trans>Loading more…</Trans>
                </div>
              ) : null}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function PoolRow({ pool, isLast }: { pool: UserPool; isLast: boolean }) {
  const vouchers = usePoolVouchers(pool);
  return (
    <Link
      to="/pools/$poolAddress"
      params={{ poolAddress: pool.address }}
      className={[
        "flex w-full items-center gap-3 p-3 text-left active:bg-muted",
        isLast ? "" : "border-b border-border",
      ].join(" ")}
    >
      <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={42} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate font-bold text-sm tracking-tight">{pool.name}</p>
        <p className="mt-1 text-primary text-[0.6875rem] font-semibold">
          {vouchers.length === 1 ? (
            <Trans>1 voucher</Trans>
          ) : (
            <Trans>{vouchers.length} vouchers</Trans>
          )}
        </p>
      </div>
      <RiArrowRightSLine className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
