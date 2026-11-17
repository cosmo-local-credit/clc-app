import { poolQueryOptions } from "@clc/api/features/pools/queries";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueries } from "@tanstack/react-query";

import { ResourceOwnerContactValue } from "#/components/messaging/resource-owner-contact";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { Skeleton } from "#/components/ui/skeleton";
import { poolsClient } from "#/lib/api/pools";

type PoolOwnerContact = {
  ownerAddress: string;
  poolNames: string[];
};

/** Current owners of every Pool involved in a swap, deduplicated by owner. */
export function SwapPoolOwnerContacts({ poolAddresses }: { poolAddresses: readonly string[] }) {
  const { i18n } = useLingui();
  const addresses = uniqueAddresses(poolAddresses);
  const queries = useQueries({
    queries: addresses.map((address) => poolQueryOptions(poolsClient, address)),
  });
  const contacts = collectOwnerContacts(queries.map((query) => query.data));
  const pending = queries.some((query) => query.isPending);
  const failed = queries.filter((query) => query.isError);
  const fetchingFailed = failed.some((query) => query.isFetching);

  if (addresses.length === 0 || (!pending && failed.length === 0 && contacts.length === 0)) {
    return null;
  }

  const locale = i18n.locales?.[0] ?? i18n.locale;
  const formatter = new Intl.ListFormat(locale, { style: "short", type: "conjunction" });

  return (
    <section className="grid gap-2" aria-labelledby="swap-pool-owners-title">
      <SectionHeading id="swap-pool-owners-title" as="h3" variant="group">
        <Trans>Owner</Trans>
      </SectionHeading>
      {contacts.map((contact) => (
        <div
          key={contact.ownerAddress.toLowerCase()}
          className="min-w-0 border border-border bg-card p-3"
        >
          <p dir="auto" className="text-xs text-muted-foreground">
            {formatter.format(contact.poolNames)}
          </p>
          <ResourceOwnerContactValue ownerAddress={contact.ownerAddress} className="mt-1" />
        </div>
      ))}
      {pending ? <Skeleton className="h-20 w-full rounded-none" /> : null}
      {failed.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-3">
          <p role="alert" className="text-sm">
            <Trans>Couldn't load pools.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={fetchingFailed}
            onClick={() => void Promise.all(failed.map((query) => query.refetch()))}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function uniqueAddresses(addresses: readonly string[]) {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectOwnerContacts(
  pools: readonly ({ ownerAddress: string | null; name: string } | undefined)[],
): PoolOwnerContact[] {
  const byOwner = new Map<string, PoolOwnerContact>();
  for (const pool of pools) {
    if (!pool?.ownerAddress) continue;
    const key = pool.ownerAddress.toLowerCase();
    const existing = byOwner.get(key);
    if (existing) {
      if (!existing.poolNames.includes(pool.name)) existing.poolNames.push(pool.name);
      continue;
    }
    byOwner.set(key, { ownerAddress: pool.ownerAddress, poolNames: [pool.name] });
  }
  return [...byOwner.values()];
}
