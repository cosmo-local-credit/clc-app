import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog } from "@base-ui/react/dialog";
import { useDeferredValue, useState } from "react";

import { marketplaceInfiniteQueryOptions } from "@clc/api/features/marketplace/queries";
import { recipientLabel } from "@clc/api/features/recipients/client";
import { recipientSearchQueryOptions } from "@clc/api/features/recipients/queries";
import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Input } from "#/components/ui/input";
import { usePaletteStore } from "#/desktop/palette-store";
import { marketplaceClient } from "#/lib/api/marketplace";
import { recipientsClient } from "#/lib/api/recipients";

export function CommandPalette() {
  const { t } = useLingui();
  const open = usePaletteStore((state) => state.open);
  const setOpen = usePaletteStore((state) => state.setOpen);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const people = useQuery({
    ...recipientSearchQueryOptions(recipientsClient, deferred),
    enabled: open && deferred.length >= 2,
  });
  const market = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, { q: deferred, perPage: 8 }),
    enabled: open && deferred.length >= 2,
  });
  const results = market.data?.pages.flatMap((page) => page.results) ?? [];
  const needle = deferred.toLowerCase();
  const commands = [
    { id: "send", label: t`Send`, run: () => navigate({ to: "/wallet/send" }) },
    { id: "receive", label: t`Receive`, run: () => navigate({ to: "/wallet/receive" }) },
    {
      id: "swap",
      label: t`Swap`,
      run: () => navigate({ to: "/market", search: { scope: "pools" } }),
    },
    {
      id: "create",
      label: t`Create voucher`,
      run: () => navigate({ to: "/vouchers/create/$step", params: { step: "voucher" } }),
    },
    {
      id: "settings",
      label: t`Settings`,
      run: () => navigate({ to: "/", search: { tab: "settings" } }),
    },
  ].filter((command) => !needle || command.label.toLowerCase().includes(needle));

  function go(run: () => void) {
    setOpen(false);
    setQuery("");
    run();
  }

  function openResult(result: MarketplaceResult) {
    if (result.kind === "pool" && result.address) {
      go(() => navigate({ to: "/pools/$poolAddress", params: { poolAddress: result.address } }));
      return;
    }
    if (result.kind === "voucher" && result.address) {
      go(() =>
        navigate({ to: "/vouchers/$voucherAddress", params: { voucherAddress: result.address } }),
      );
      return;
    }
    if (result.kind === "offering") {
      go(() =>
        navigate({
          to: "/vouchers/$voucherAddress",
          params: { voucherAddress: result.voucherAddress },
        }),
      );
      return;
    }
    if (result.kind === "catalog") {
      go(() => navigate({ to: "/catalogs/$catalogId", params: { catalogId: result.id } }));
      return;
    }
    go(() => navigate({ to: "/wants/$wantId", params: { wantId: result.id } }));
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup className="fixed top-[12%] left-1/2 z-50 flex max-h-[70dvh] w-[min(36rem,calc(100vw-4rem))] -translate-x-1/2 flex-col border border-border bg-card">
          <Dialog.Title className="sr-only">
            <Trans>Search the marketplace</Trans>
          </Dialog.Title>
          <div className="border-border border-b p-3">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t`Search the marketplace`}
              aria-label={t`Search the marketplace`}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {commands.length > 0 ? (
              <ul>
                {commands.map((command) => (
                  <li key={command.id}>
                    <button
                      type="button"
                      className="flex h-10 w-full items-center px-3 text-start text-sm hover:bg-muted"
                      onClick={() => go(command.run)}
                    >
                      {command.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {people.data && people.data.length > 0 ? (
              <ul>
                {people.data.map((person) => (
                  <li key={person.address}>
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-between gap-3 px-3 text-start text-sm hover:bg-muted"
                      onClick={() =>
                        go(() => {
                          if (person.kind === "pool") {
                            void navigate({
                              to: "/pools/$poolAddress",
                              params: { poolAddress: person.address },
                            });
                            return;
                          }
                          void navigate({ to: "/wallet/send", search: { to: person.address } });
                        })
                      }
                    >
                      <span className="truncate">{recipientLabel(person)}</span>
                      <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                        {formatVoucherAddress(person.address)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {results.length > 0 ? (
              <ul>
                {results.map((result) => (
                  <li key={`${result.kind}-${result.id}`}>
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-between gap-3 px-3 text-start text-sm hover:bg-muted"
                      onClick={() => openResult(result)}
                    >
                      <span className="truncate">{result.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{result.kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
