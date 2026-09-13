import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import {
  voucherFilteredPageQueryOptions,
  voucherQueryOptions,
} from "@clc/api/features/market/queries";
import type { MarketVoucher } from "@clc/api/features/market/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { PoolVoucherPricing } from "@clc/core/features/pool-admin/logic";
import type { PoolPricing } from "@clc/core/features/pools/logic";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
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
import { termFilter } from "#/lib/catalog-filter";
import { useAddPoolVoucher } from "../use-add-pool-voucher";

const CANDIDATE_PAGE_SIZE = 50;

const PRICING_LABELS: Record<PoolPricing, string> = {
  relative: "Relative rates",
  oracle: "Oracle feed",
  decimal: "Decimals only",
};

const addressField = z
  .string()
  .trim()
  .refine((value) => /^0x[0-9a-fA-F]{40}$/.test(value), { message: "Enter a contract address" });

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
    pricing: z.enum(["oracle", "decimal"]),
    depositCap: z.string(),
    aggregatorAddress: z.string(),
    maxStaleness: z.string(),
    // Not edited: mirrored into the form so the schema can require a cap only
    // where the pool actually has a limiter to write it to.
    hasLimiter: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.hasLimiter) {
      const cap = positiveDecimal.safeParse(value.depositCap);
      if (!cap.success) {
        ctx.addIssue({
          code: "custom",
          path: ["depositCap"],
          message: cap.error.issues[0]?.message ?? "Enter a deposit cap",
        });
      }
    }

    if (value.pricing === "oracle") {
      if (!addressField.safeParse(value.aggregatorAddress).success) {
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
}: {
  pool: UserPool;
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
}) {
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<MarketVoucher | null>(null);
  const addVoucher = useAddPoolVoucher();

  // A pool still on the retired RelativeQuoter cannot be configured from here.
  // Registering the voucher without a rate would not leave it unpriced — the
  // quoter reads an unset token as parity — so the pool would quietly start
  // quoting a 1:1 nobody chose. Refusing the whole batch is the honest outcome.
  const legacyQuoter = pool.quoterType === "relative";
  const knownPricing: PoolPricing | null =
    pool.quoterType === "oracle" || pool.quoterType === "decimal" ? pool.quoterType : null;
  const hasLimiter = pool.limiterAddress !== null;

  // Only the selected voucher's decimals are needed, and the catalog list does
  // not carry them, so the detail is fetched once a voucher is chosen rather
  // than for every candidate in the list.
  const detailQuery = useQuery(voucherQueryOptions(clcApi.market, selected?.address));
  const decimals = detailQuery.data?.decimals ?? null;

  const form = useForm({
    defaultValues: {
      // With no recorded quoter, oracle is the offered default because it is what
      // every pool this console publishes with a price feed uses — but it is a
      // default the operator can see and change, not an assumption.
      pricing: (knownPricing ?? "oracle") as PoolPricing,
      depositCap: "",
      aggregatorAddress: "",
      maxStaleness: "",
      hasLimiter,
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
      const depositCapRaw =
        hasLimiter && decimals !== null
          ? parseTokenAmount(value.depositCap.trim(), decimals)
          : undefined;

      try {
        const result = await addVoucher.mutateAsync({
          poolAddress: pool.address,
          tokenAddress: selected.address,
          registryAddress: pool.tokenRegistryAddress,
          limiterAddress: pool.limiterAddress,
          quoterAddress: pool.quoterAddress,
          register: true,
          ...(depositCapRaw === undefined ? {} : { depositCapRaw }),
          pricing: toPricing(value),
        });
        toast.success(`${selected.symbol} added to ${pool.name}.`, {
          description: `Confirmed in ${formatVoucherAddress(result.txHash as `0x${string}`)}`,
        });
        onAdded(selected.address);
        close();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The transaction failed.");
      }
    },
  });

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
          <SheetTitle>Add a voucher</SheetTitle>
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
                loadingDecimals={detailQuery.isPending}
                onChange={() => setSelected(null)}
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
                  <SectionLabel>Deposit cap</SectionLabel>
                  {hasLimiter ? (
                    <form.Field name="depositCap">
                      {(field) => (
                        <Field
                          htmlFor={field.name}
                          label={`Cap in ${selected.symbol}`}
                          hint="The most the pool may hold of this voucher."
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

                  {legacyQuoter ? (
                    <p className="text-destructive text-sm">
                      This pool prices with the retired RelativeQuoter, whose rates are maintained
                      by hand. The console cannot set one, and adding a voucher without it would
                      quote the pair at parity.
                    </p>
                  ) : knownPricing ? (
                    <p className="text-sm">
                      This pool quotes with{" "}
                      <span className="font-medium">{PRICING_LABELS[knownPricing]}</span>.
                    </p>
                  ) : (
                    <form.Field name="pricing">
                      {(field) => (
                        <Field
                          htmlFor={field.name}
                          label="Quoter"
                          hint="The catalog does not record which quoter this pool was published with."
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
                      legacyQuoter ? null : pricing === "oracle" ? (
                        <>
                          <form.Field name="aggregatorAddress">
                            {(field) => (
                              <Field
                                htmlFor={field.name}
                                label="Aggregator address"
                                hint="The Chainlink feed this voucher is priced from."
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

                          <form.Field name="maxStaleness">
                            {(field) => (
                              <Field
                                htmlFor={field.name}
                                label="Freshness bound (seconds)"
                                hint="Optional. Blank keeps the quoter's global bound."
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
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          A decimal quoter prices every pair from token decimals, so there is
                          nothing to set for this voucher.
                        </p>
                      )
                    }
                  </form.Subscribe>
                </div>
              </>
            ) : null}
          </div>

          <div className="border-border bg-card sticky bottom-0 flex items-center justify-between gap-2 border-t p-4">
            {/* Named plainly: the operator is about to be asked for a signature,
                and a button that says "Save" would not prepare them for it. */}
            <p className="text-muted-foreground text-xs">
              {addVoucher.isPending ? "Waiting for the chain…" : "Signs one on-chain transaction."}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              {/* A cap typed in token units is meaningless until the voucher's
                  decimals are known, and the read is fast enough that blocking
                  submit is better than scaling by a guess. */}
              <Button
                type="submit"
                disabled={
                  !selected || legacyQuoter || detailQuery.isPending || addVoucher.isPending
                }
              >
                {addVoucher.isPending ? "Adding…" : "Sign and add"}
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
  aggregatorAddress: string;
  maxStaleness: string;
}): PoolVoucherPricing {
  if (value.pricing === "decimal") return { kind: "decimal" };
  const staleness = value.maxStaleness.trim();
  return {
    kind: "oracle",
    aggregatorAddress: value.aggregatorAddress.trim() as `0x${string}`,
    ...(staleness ? { maxStalenessSeconds: staleness } : {}),
  };
}

function SelectedVoucher({
  voucher,
  decimals,
  loadingDecimals,
  onChange,
}: {
  voucher: MarketVoucher;
  decimals: number | null;
  loadingDecimals: boolean;
  onChange: () => void;
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
      <Button type="button" variant="outline" size="sm" onClick={onChange}>
        Change
      </Button>
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
