import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import {
  voucherFilteredPageQueryOptions,
  voucherQueryOptions,
} from "@clc/api/features/market/queries";
import type { MarketVoucher } from "@clc/api/features/market/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { OracleFeed } from "@clc/api/features/oracle-feeds/client";
import { oracleFeedsQueryOptions } from "@clc/api/features/oracle-feeds/queries";
import {
  findPoolVoucherFeed,
  POOL_PRICE_INDEX_DECIMALS,
  POOL_VOUCHER_CUSTOM_FEED,
  type PoolVoucherPricing,
  resolvePoolVoucherFeedAddress,
} from "@clc/core/features/pool-admin/logic";
import type { PoolPricing } from "@clc/core/features/pools/logic";
import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getAddress } from "viem";
import { z } from "zod";

import { LoadingBlock } from "#/components/admin/loading-block";
import { SectionLabel } from "#/components/admin/section-heading";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { clcApi } from "#/lib/api";
import { CHAIN_ID } from "#/lib/chain";
import { termFilter } from "#/lib/catalog-filter";
import type { PoolVoucherEdit } from "./pool-holdings-panel";
import type { SettlingVoucher } from "../use-pool-vouchers";
import { useAddPoolVoucher } from "../use-add-pool-voucher";
import { usePoolVoucherOracle } from "../use-pool-voucher-oracle";

const CANDIDATE_PAGE_SIZE = 50;

const PRICING_LABELS: Record<PoolPricing, string> = {
  relative: "Relative rates",
  oracle: "Oracle feed",
  decimal: "Decimals only",
};

const positiveDecimal = z
  .string()
  .trim()
  .refine((value) => /^\d+(\.\d+)?$/.test(value) && Number(value) > 0, {
    message: "Enter an amount greater than zero",
  });

const positiveInteger = z
  .string()
  .trim()
  .refine((value) => /^\d+$/.test(value) && Number(value) > 0, {
    message: "Enter a whole number greater than zero",
  });

/**
 * Validation branches on the pricing mode because the three quoters take
 * genuinely different inputs, and requiring an aggregator from a pool whose
 * quoter has no `setOracle` would block a legitimate submission.
 */
const formSchema = z
  .object({
    pricing: z.enum(["relative", "oracle", "decimal"]),
    exchangeRate: z.string(),
    depositCap: z.string(),
    /** A registry feed's address, `POOL_VOUCHER_CUSTOM_FEED`, or empty before a choice. */
    feed: z.string(),
    aggregatorAddress: z.string(),
    maxStaleness: z.string(),
    // Not edited: mirrored into the form so the schema can require a cap only
    // where the pool actually has a limiter to write it to.
    hasLimiter: z.boolean(),
    editing: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.hasLimiter) {
      const cap = (
        value.editing
          ? z
              .string()
              .trim()
              .regex(/^\d+(\.\d+)?$/, "Enter a credit limit of zero or more")
          : positiveDecimal
      ).safeParse(value.depositCap);
      if (!cap.success) {
        ctx.addIssue({
          code: "custom",
          path: ["depositCap"],
          message: cap.error.issues[0]?.message ?? "Enter a credit limit",
        });
      }
    }

    if (value.pricing === "relative") {
      try {
        const rate = parseTokenAmount(value.exchangeRate.trim(), POOL_PRICE_INDEX_DECIMALS);
        if (BigInt(rate) <= 0n) throw new Error("Invalid rate");
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["exchangeRate"],
          message: "Enter a positive rate with at most six decimal places",
        });
      }
    }

    if (value.pricing === "oracle") {
      if (value.feed === "") {
        ctx.addIssue({ code: "custom", path: ["feed"], message: "Choose a price feed" });
      } else if (
        resolvePoolVoucherFeedAddress({
          feed: value.feed,
          customAddress: value.aggregatorAddress,
        }) === null
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["aggregatorAddress"],
          message: "Enter the Chainlink aggregator address",
        });
      }
      if (value.maxStaleness.trim() && !positiveInteger.safeParse(value.maxStaleness).success) {
        ctx.addIssue({
          code: "custom",
          path: ["maxStaleness"],
          message: "Enter a whole number of seconds, or leave blank",
        });
      }
    }
  });

/**
 * Adds one voucher to a pool and configures how the pool treats it.
 *
 * Three contracts change together — the registry admits the token, the limiter
 * caps what the pool may hold of it, and the quoter learns to price it — and
 * they are relayed as one batch so a voucher is never admitted without a price.
 * The calls are built in @clc/core and signed with whatever key the operator
 * loaded at sign-in.
 *
 * The pricing fields follow the pool's own quoter. Where clc-core recorded which
 * one was deployed the mode is fixed and stated; where it did not — imported
 * pools, and anything published before the field existed — the operator chooses,
 * because the three quoters are indistinguishable from their addresses and
 * signing the wrong setter either reverts or prices a token at a rate nobody
 * picked.
 */
export function AddPoolVoucherSheet({
  pool,
  poolVouchers,
  open,
  onClose,
  onAdded,
  onUpdated,
  edit,
}: {
  pool: UserPool;
  edit?: PoolVoucherEdit;
  poolVouchers: PoolVoucher[];
  open: boolean;
  onClose: () => void;
  /**
   * The transaction confirmed. The catalog has not caught up yet — that happens
   * when clc-core projects the chain events — so the screen behind this sheet
   * takes the token address and waits for the row rather than refetching once
   * and showing the composition as it was.
   */
  onAdded: (tokenAddress: string) => void;
  onUpdated?: (expected: Pick<SettlingVoucher, "expectedCapRaw" | "expectedOracleAddress">) => void;
}) {
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Pick<
    MarketVoucher,
    "address" | "name" | "symbol"
  > | null>(
    edit
      ? { address: edit.voucher.tokenAddress, name: edit.voucher.name, symbol: edit.voucher.symbol }
      : null,
  );
  const addVoucher = useAddPoolVoucher();

  const knownPricing = pool.quoterType;
  const hasLimiter = pool.limiterAddress !== null;

  // Only the selected voucher's decimals are needed, and the catalog list does
  // not carry them, so the detail is fetched once a voucher is chosen rather
  // than for every candidate in the list.
  const detailQuery = useQuery({
    ...voucherQueryOptions(clcApi.market, selected?.address),
    enabled: open && !edit && !!selected,
  });
  const decimals = edit?.voucher.decimals ?? detailQuery.data?.decimals ?? null;

  const feedsQuery = useQuery({
    ...oracleFeedsQueryOptions(clcApi.oracleFeeds, pool.chainId ?? CHAIN_ID),
    enabled: open && knownPricing !== "relative" && knownPricing !== "decimal",
  });
  const feeds = feedsQuery.data ?? [];
  // The chain, not the catalog, is what an edit compares against: the indexer
  // can lag a feed just set and never records the per-feed bound.
  const onChain = usePoolVoucherOracle(
    pool,
    edit?.voucher.tokenAddress,
    open && !!edit && knownPricing === "oracle",
  );
  // Held until a fresh read has seeded the form: cached data from an earlier
  // visit may already be out of date while its refresh is in flight.
  const readingFeed =
    !!edit && knownPricing === "oracle" && (onChain.isPending || onChain.isFetching);
  // The feed fields as the chain seeded them. A later refresh does not move
  // this, so an untouched feed is never compared against a newer chain value
  // and written back over it.
  const feedBaseline = useRef<{
    feed: string;
    aggregatorAddress: string;
    maxStaleness: string;
  } | null>(null);

  const form = useForm({
    defaultValues: {
      // With no recorded quoter, oracle is the offered default because it is what
      // every pool this console publishes with a price feed uses — but it is a
      // default the operator can see and change, not an assumption.
      pricing: (knownPricing ?? "oracle") as PoolPricing,
      depositCap:
        edit?.capRaw !== null && edit?.capRaw !== undefined && decimals !== null
          ? formatTokenAmount(edit.capRaw, decimals, decimals)
          : "",
      exchangeRate: edit?.ratePpm
        ? formatTokenAmount(edit.ratePpm, POOL_PRICE_INDEX_DECIMALS, POOL_PRICE_INDEX_DECIMALS)
        : "",
      // The catalog's view until the chain read lands; see the effect below.
      ...feedFields(edit?.voucher.oracleAddress ?? null, !!edit?.voucher.oracleFeedId),
      maxStaleness: "",
      hasLimiter,
      editing: !!edit,
    },
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      if (!selected) return;
      if (hasLimiter && decimals === null) {
        toast.error("This voucher's decimals are unknown, so a cap cannot be scaled.");
        return;
      }

      // Scaled here rather than inline so the guard above is what narrows it: a
      // pool with no limiter sends no cap at all, and one with a limiter cannot
      // reach this line without decimals.
      try {
        const parsedCapRaw =
          hasLimiter && decimals !== null
            ? parseTokenAmount(value.depositCap.trim(), decimals)
            : undefined;
        // An edit carries an indexer snapshot. Only write fields the operator
        // changed, or a rate-only edit could restore a cap that is already stale.
        const depositCapRaw =
          edit &&
          parsedCapRaw !== undefined &&
          edit.capRaw !== null &&
          BigInt(parsedCapRaw) === BigInt(edit.capRaw)
            ? undefined
            : parsedCapRaw;
        const proposedPricing = toPricing(value);
        const baseline = feedBaseline.current;
        const feedUntouched =
          baseline !== null &&
          value.feed === baseline.feed &&
          value.aggregatorAddress === baseline.aggregatorAddress &&
          value.maxStaleness === baseline.maxStaleness;
        const current = onChain.data;
        const currentAggregator = current
          ? current.aggregator
          : (edit?.voucher.oracleAddress ?? null);
        const pricing =
          edit &&
          ((proposedPricing.kind === "relative" &&
            edit.ratePpm !== null &&
            BigInt(proposedPricing.exchangeRatePpm) === BigInt(edit.ratePpm)) ||
            (proposedPricing.kind === "oracle" && feedUntouched) ||
            (proposedPricing.kind === "oracle" &&
              currentAggregator !== null &&
              getAddress(proposedPricing.aggregatorAddress) === getAddress(currentAggregator) &&
              // The two-argument overload resets the bound to the global one,
              // so a blank field is a change only where a bound is set now.
              (current
                ? (proposedPricing.maxStalenessSeconds ?? "0") === current.maxStalenessSeconds
                : proposedPricing.maxStalenessSeconds === undefined)) ||
            proposedPricing.kind === "decimal")
            ? undefined
            : proposedPricing;
        if (edit && depositCapRaw === undefined && pricing === undefined) {
          toast.info("No changes to save.");
          return;
        }
        const result = await addVoucher.mutateAsync({
          poolAddress: pool.address,
          tokenAddress: selected.address,
          registryAddress: pool.tokenRegistryAddress,
          limiterAddress: pool.limiterAddress,
          quoterAddress: pool.quoterAddress,
          register: !edit,
          ...(depositCapRaw === undefined ? {} : { depositCapRaw }),
          ...(pricing === undefined ? {} : { pricing }),
        });
        toast.success(`${selected.symbol} ${edit ? "updated in" : "added to"} ${pool.name}.`, {
          description: `Confirmed in ${formatVoucherAddress(result.txHash as `0x${string}`)}`,
        });
        if (edit)
          onUpdated?.({
            ...(depositCapRaw === undefined ? {} : { expectedCapRaw: depositCapRaw }),
            ...(pricing?.kind === "oracle"
              ? { expectedOracleAddress: pricing.aggregatorAddress }
              : {}),
          });
        else onAdded(selected.address);
        close();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The transaction failed.");
      }
    },
  });

  // Seeds the feed and its bound from the chain once both reads have settled,
  // unless the operator has already started on them.
  const [seeded, setSeeded] = useState(false);
  const feedsSettled = !feedsQuery.isPending || feedsQuery.fetchStatus === "idle";
  useEffect(() => {
    if (seeded || !onChain.data || onChain.isFetching || !feedsSettled) return;
    setSeeded(true);
    const touched = (["feed", "aggregatorAddress", "maxStaleness"] as const).some(
      (name) => form.getFieldMeta(name)?.isDirty,
    );
    if (touched) return;
    const { aggregator, maxStalenessSeconds } = onChain.data;
    const fields = feedFields(aggregator, !!findPoolVoucherFeed(feedsQuery.data ?? [], aggregator));
    const maxStaleness = maxStalenessSeconds === "0" ? "" : maxStalenessSeconds;
    form.setFieldValue("feed", fields.feed);
    form.setFieldValue("aggregatorAddress", fields.aggregatorAddress);
    form.setFieldValue("maxStaleness", maxStaleness);
    feedBaseline.current = { ...fields, maxStaleness };
  }, [seeded, onChain.data, onChain.isFetching, feedsSettled, feedsQuery.data, form]);

  function close() {
    if (addVoucher.isPending) return;
    form.reset();
    setSelected(null);
    setTerm("");
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <SheetContent className="bg-card w-full shadow-none data-[side=right]:sm:max-w-[30rem]">
        <SheetHeader className="border-border border-b">
          <SheetTitle>{edit ? "Configure voucher" : "Add a voucher"}</SheetTitle>
          <SheetDescription>{pool.name}</SheetDescription>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {selected ? (
              <SelectedVoucher
                voucher={selected}
                decimals={decimals}
                loadingDecimals={!edit && detailQuery.isPending}
                onChange={edit ? undefined : () => setSelected(null)}
              />
            ) : (
              <VoucherPicker
                term={term}
                onTerm={setTerm}
                excluded={poolVouchers}
                onSelect={setSelected}
              />
            )}

            {selected ? (
              <>
                <div className="border-border flex flex-col gap-3 border-t pt-4">
                  <SectionLabel>Credit limit</SectionLabel>
                  {hasLimiter ? (
                    <form.Field name="depositCap">
                      {(field) => (
                        <Field
                          htmlFor={field.name}
                          label={`Credit limit in ${selected.symbol}`}
                          error={getFieldError(field.state.meta.errors)}
                        >
                          <Input
                            id={field.name}
                            inputMode="decimal"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            className="font-data"
                          />
                        </Field>
                      )}
                    </form.Field>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      This pool has no limiter on record, so deposits are uncapped and no cap can be
                      written.
                    </p>
                  )}
                </div>

                <div className="border-border flex flex-col gap-3 border-t pt-4">
                  <SectionLabel>Pricing</SectionLabel>

                  {knownPricing ? (
                    <p className="text-sm font-medium">{PRICING_LABELS[knownPricing]}</p>
                  ) : (
                    <form.Field name="pricing">
                      {(field) => (
                        <Field
                          htmlFor={field.name}
                          label="Quoter"
                          error={getFieldError(field.state.meta.errors)}
                        >
                          <Select
                            value={field.state.value}
                            onValueChange={(next) => field.handleChange(next as PoolPricing)}
                          >
                            <SelectTrigger id={field.name}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(PRICING_LABELS) as PoolPricing[]).map((kind) => (
                                <SelectItem key={kind} value={kind}>
                                  {PRICING_LABELS[kind]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </form.Field>
                  )}

                  <form.Subscribe selector={(state) => state.values.pricing}>
                    {(pricing) =>
                      pricing === "relative" ? (
                        <form.Field name="exchangeRate">
                          {(field) => (
                            <Field
                              htmlFor={field.name}
                              label="Exchange rate"
                              error={getFieldError(field.state.meta.errors)}
                            >
                              <Input
                                id={field.name}
                                inputMode="decimal"
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(event) => field.handleChange(event.target.value)}
                                className="font-data"
                              />
                            </Field>
                          )}
                        </form.Field>
                      ) : pricing === "oracle" ? (
                        <>
                          <form.Field name="feed">
                            {(field) => (
                              <Field
                                htmlFor={field.name}
                                label="Price feed"
                                error={getFieldError(field.state.meta.errors)}
                              >
                                <FeedSelect
                                  id={field.name}
                                  value={field.state.value}
                                  feeds={feeds}
                                  onChange={(next) => {
                                    field.handleChange(next);
                                    const registered = feeds.find((feed) => feed.address === next);
                                    if (registered)
                                      form.setFieldValue(
                                        "maxStaleness",
                                        registered.maxStalenessSeconds
                                          ? String(registered.maxStalenessSeconds)
                                          : "",
                                      );
                                  }}
                                />
                                <FeedsStatus
                                  query={feedsQuery}
                                  reading={readingFeed}
                                  chainUnread={onChain.isError}
                                />
                              </Field>
                            )}
                          </form.Field>

                          <form.Subscribe selector={(state) => state.values.feed}>
                            {(feed) =>
                              feed === POOL_VOUCHER_CUSTOM_FEED ? (
                                <form.Field name="aggregatorAddress">
                                  {(field) => (
                                    <Field
                                      htmlFor={field.name}
                                      label="Aggregator address"
                                      error={getFieldError(field.state.meta.errors)}
                                    >
                                      <Input
                                        id={field.name}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(event) => field.handleChange(event.target.value)}
                                        className="font-data"
                                      />
                                    </Field>
                                  )}
                                </form.Field>
                              ) : null
                            }
                          </form.Subscribe>

                          <form.Field name="maxStaleness">
                            {(field) => (
                              <Field
                                htmlFor={field.name}
                                label="Freshness bound (seconds)"
                                hint="Optional."
                                error={getFieldError(field.state.meta.errors)}
                              >
                                <Input
                                  id={field.name}
                                  inputMode="numeric"
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={(event) => field.handleChange(event.target.value)}
                                  className="font-data"
                                />
                              </Field>
                            )}
                          </form.Field>
                        </>
                      ) : null
                    }
                  </form.Subscribe>
                </div>
              </>
            ) : null}
          </div>

          <div className="border-border bg-card sticky bottom-0 flex items-center justify-end gap-2 border-t p-4">
            {addVoucher.isPending ? (
              <p className="text-muted-foreground mr-auto text-xs">Waiting for the chain…</p>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              {/* Named plainly: the operator is about to be asked for a signature,
                  and a button that says "Save" would not prepare them for it.
                  A cap typed in token units is meaningless until the voucher's
                  decimals are known, and the read is fast enough that blocking
                  submit is better than scaling by a guess. */}
              <Button
                type="submit"
                disabled={
                  !selected ||
                  (!edit && detailQuery.isPending) ||
                  readingFeed ||
                  addVoucher.isPending
                }
              >
                {addVoucher.isPending ? "Waiting…" : edit ? "Sign and update" : "Sign and add"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function toPricing(value: {
  pricing: PoolPricing;
  feed: string;
  aggregatorAddress: string;
  maxStaleness: string;
  exchangeRate: string;
}): PoolVoucherPricing {
  if (value.pricing === "decimal") return { kind: "decimal" };
  if (value.pricing === "relative")
    return {
      kind: "relative",
      exchangeRatePpm: parseTokenAmount(value.exchangeRate.trim(), POOL_PRICE_INDEX_DECIMALS),
    };
  const aggregatorAddress = resolvePoolVoucherFeedAddress({
    feed: value.feed,
    customAddress: value.aggregatorAddress,
  });
  if (!aggregatorAddress) throw new Error("Choose a price feed.");
  const staleness = value.maxStaleness.trim();
  return {
    kind: "oracle",
    aggregatorAddress,
    ...(staleness ? { maxStalenessSeconds: staleness } : {}),
  };
}

/**
 * The feed fields that name an aggregator: its registry entry when it has one,
 * otherwise the custom address, so an unverified feed is shown and replaceable.
 */
function feedFields(
  aggregator: string | null,
  registered: boolean,
): { feed: string; aggregatorAddress: string } {
  if (!aggregator) return { feed: "", aggregatorAddress: "" };
  if (registered) return { feed: getAddress(aggregator), aggregatorAddress: "" };
  return { feed: POOL_VOUCHER_CUSTOM_FEED, aggregatorAddress: aggregator };
}

function feedLabel(feed: OracleFeed): string {
  return feed.description ?? feed.name;
}

function FeedSelect({
  id,
  value,
  feeds,
  onChange,
}: {
  id: string;
  value: string;
  feeds: OracleFeed[];
  onChange: (next: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(String(next ?? ""))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {(current: string) => {
            if (current === POOL_VOUCHER_CUSTOM_FEED) return "Custom address";
            if (!current) return <span className="text-muted-foreground">Choose a feed</span>;
            const feed = feeds.find((entry) => entry.address === current);
            return feed ? (
              feedLabel(feed)
            ) : (
              <span className="font-data">{formatVoucherAddress(current as `0x${string}`)}</span>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {feeds.map((feed) => (
          <SelectItem key={feed.id} value={feed.address}>
            <span className="flex w-full items-center justify-between gap-3">
              <span className="font-mono">{feedLabel(feed)}</span>
              <span className="font-data text-muted-foreground text-xs">
                {formatVoucherAddress(feed.address)}
              </span>
            </span>
          </SelectItem>
        ))}
        <SelectItem value={POOL_VOUCHER_CUSTOM_FEED}>Custom address</SelectItem>
      </SelectContent>
    </Select>
  );
}

function FeedsStatus({
  query,
  reading,
  chainUnread,
}: {
  query: UseQueryResult<OracleFeed[]>;
  reading: boolean;
  chainUnread: boolean;
}) {
  return (
    <>
      {reading ? <p className="text-muted-foreground text-xs">Reading the current feed…</p> : null}
      {chainUnread ? (
        <p role="status" className="text-muted-foreground text-xs">
          Could not read the current feed on chain.
        </p>
      ) : null}
      {query.isPending ? (
        <p className="text-muted-foreground text-xs">Loading price feeds…</p>
      ) : query.isError ? (
        <div className="flex items-center justify-between gap-2">
          <p role="alert" className="text-destructive text-xs">
            Could not load price feeds.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : query.data?.length === 0 ? (
        <p role="status" className="text-muted-foreground text-xs">
          No verified feeds on this chain.
        </p>
      ) : null}
    </>
  );
}

function SelectedVoucher({
  voucher,
  decimals,
  loadingDecimals,
  onChange,
}: {
  voucher: Pick<MarketVoucher, "address" | "name" | "symbol">;
  decimals: number | null;
  loadingDecimals: boolean;
  onChange?: () => void;
}) {
  return (
    <div className="border-border flex items-start justify-between gap-3 border p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{voucher.name}</p>
        <p className="text-muted-foreground font-mono text-xs">{voucher.symbol}</p>
        <p className="font-data text-muted-foreground mt-1 text-xs">
          {formatVoucherAddress(voucher.address)}
          {loadingDecimals ? " · reading decimals" : decimals === null ? "" : ` · ${decimals} dp`}
        </p>
      </div>
      {onChange ? (
        <Button type="button" variant="outline" size="sm" onClick={onChange}>
          Change
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Candidates are searched at the endpoint rather than filtered in the browser, so
 * the list answers for the whole catalog. Vouchers the pool already allows are
 * removed: `TokenUniqueSymbolIndex.add` reverts on a token the registry holds,
 * which would take the cap and price in the same batch down with it.
 */
function VoucherPicker({
  term,
  onTerm,
  excluded,
  onSelect,
}: {
  term: string;
  onTerm: (term: string) => void;
  excluded: PoolVoucher[];
  onSelect: (voucher: MarketVoucher) => void;
}) {
  const query = useQuery(
    voucherFilteredPageQueryOptions(clcApi.market, {
      perPage: CANDIDATE_PAGE_SIZE,
      filter: termFilter(term),
    }),
  );

  const held = new Set(excluded.map((voucher) => voucher.tokenAddress.toLowerCase()));
  const candidates = (query.data?.vouchers ?? []).filter(
    (voucher) => !held.has(voucher.address.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      <Field htmlFor="voucher-search" label="Search vouchers" error={null}>
        <Input
          id="voucher-search"
          value={term}
          placeholder="Name, symbol, address"
          onChange={(event) => onTerm(event.target.value)}
        />
      </Field>

      {query.isPending ? (
        <LoadingBlock rows={4} />
      ) : query.isError ? (
        <p className="text-destructive text-sm">Could not load the voucher catalog.</p>
      ) : candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {term ? "No voucher matches this search." : "Every catalogued voucher is already here."}
        </p>
      ) : (
        <ul className="divide-border border-border flex max-h-72 flex-col divide-y overflow-y-auto border">
          {candidates.map((voucher) => (
            <li key={voucher.id}>
              <button
                type="button"
                onClick={() => onSelect(voucher)}
                className="hover:bg-accent/60 focus-visible:ring-ring flex w-full items-center justify-between gap-3 px-3 py-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{voucher.name}</span>
                  <span className="font-data text-muted-foreground block text-xs">
                    {formatVoucherAddress(voucher.address)}
                  </span>
                </span>
                <Badge variant="outline" className="shrink-0 font-mono text-xs">
                  {voucher.symbol}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * `htmlFor` is passed rather than read off the child's props: one of these fields
 * is a Select, whose id belongs to the trigger inside it, and introspecting the
 * wrapper would leave that control with no accessible name.
 */
function Field({
  htmlFor,
  label,
  hint,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
