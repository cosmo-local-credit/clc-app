import { hasPoolOracleBaseCurrency, type PoolPricing } from "@clc/core/features/pools/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { findUnitOfAccountOption } from "@clc/core/lib/currencies";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { RiArrowDownSLine } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import { Textarea } from "#/components/ui/textarea";
import { SendRecipientField } from "#/desktop/wallet/send-recipient-field";
import { DeskTitle } from "#/desktop/ui/page";
import { cn } from "#/lib/utils";
import {
  CreatePoolFormFoot,
  type CreatePoolController,
  FIELDS_CLEAR_OF_FOOT,
  PoolHelpDesk,
} from "./create-pool-parts";
import { UnitComboboxDesk } from "./unit-combobox-desk";

/**
 * Whether a value in Advanced is not the default, so the section has to be
 * open for it to be seen. The symbol does not count: it is derived from the
 * name, and a person who has not looked at it has not chosen it.
 */
function advancedHoldsNonDefault(values: {
  pricing: PoolPricing;
  feePolicyDefault: string;
  feesDecoupled: boolean;
  feeAddress: string;
}) {
  return (
    values.pricing !== "relative" ||
    Number(values.feePolicyDefault) > 0 ||
    values.feesDecoupled ||
    values.feeAddress.trim() !== ""
  );
}

/**
 * Step 1: name, unit, description, then Advanced. Advanced starts folded and
 * says what it holds while it is; it opens for a restored draft, for a value
 * that is not the default, and when Next is refused for a field inside it.
 */
export function PoolStepDesk({
  pool,
  advancedOpen,
  onAdvancedOpenChange,
}: {
  pool: CreatePoolController;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const { form, validators, activeChainId, hasOracle, fillSuggestedSymbol } = pool;

  useEffect(() => {
    // Back from a later step: a value set in Advanced is shown, not hidden.
    if (advancedHoldsNonDefault(form.state.values)) onAdvancedOpenChange(true);
    // The symbol is filled once the name is known; open on arrival, it is
    // visible, so fill it now rather than on Next.
    if (advancedOpen) void fillSuggestedSymbol();
    // Once per visit to the step.
  }, []);

  const pricingLabel = (pricing: PoolPricing) =>
    pricing === "relative"
      ? t`Relative pricing`
      : pricing === "oracle"
        ? t`Oracle pricing`
        : t`Equal value`;

  return (
    <div className={cn("grid min-w-0 content-start gap-[18px]", FIELDS_CLEAR_OF_FOOT)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <DeskTitle>
          <Trans>Create pool</Trans>
        </DeskTitle>
        <PoolHelpDesk />
      </div>

      <form.Field name="name" asyncDebounceMs={400} validators={validators.name}>
        {(field) => (
          <Field
            label={t`Name`}
            htmlFor="pool-name"
            error={getFieldError(field.state.meta.errors)}
            hint={field.state.meta.isValidating ? t`Checking availability…` : undefined}
          >
            <Input
              id="pool-name"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={() => {
                field.handleBlur();
                pool.suggestSymbolFor(field.state.value);
              }}
              placeholder={t`Enter pool name`}
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.pricing}>
        {(pricing) => (
          <form.Field name="unitOfAccount" validators={validators.unitOfAccount(pricing)}>
            {(field) => (
              <Field
                label={t`Unit of account`}
                htmlFor="pool-unit"
                error={getFieldError(field.state.meta.errors)}
              >
                <UnitComboboxDesk
                  id="pool-unit"
                  value={field.state.value}
                  onValueChange={(unit) => {
                    field.handleChange(unit);
                    pool.syncPricingToUnit(unit);
                  }}
                  onBlur={field.handleBlur}
                  ariaInvalid={field.state.meta.errors.length > 0}
                />
              </Field>
            )}
          </form.Field>
        )}
      </form.Subscribe>

      <form.Field name="description" validators={validators.description}>
        {(field) => (
          <Field
            label={t`Description`}
            htmlFor="pool-description"
            error={getFieldError(field.state.meta.errors)}
          >
            <Textarea
              id="pool-description"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              placeholder={t`Describe your pool`}
              maxLength={500}
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>

      <details
        open={advancedOpen}
        className="group border-border border-t"
        onToggle={(event) => {
          onAdvancedOpenChange(event.currentTarget.open);
          if (event.currentTarget.open) void fillSuggestedSymbol();
        }}
      >
        <summary className="flex h-11 cursor-pointer list-none items-center gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <Trans>Advanced</Trans>
          {/* Closed, the section says what it currently holds. */}
          <form.Subscribe
            selector={(state) =>
              [state.values.symbol, state.values.pricing, state.values.feePolicyDefault] as const
            }
          >
            {([symbol, pricing, fee]) => (
              <span className="min-w-0 flex-1 truncate text-end text-xs font-normal text-muted-foreground group-open:hidden">
                {symbol ? (
                  <>
                    <span dir="ltr" className="font-mono">
                      {symbol}
                    </span>
                    {" · "}
                  </>
                ) : null}
                {pricingLabel(pricing)}
                {" · "}
                <Trans>Swap fee</Trans>{" "}
                <span dir="ltr" className="font-mono">
                  {`${fee.trim() || "0"}%`}
                </span>
              </span>
            )}
          </form.Subscribe>
          <RiArrowDownSLine
            aria-hidden="true"
            className="ms-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <div id="pool-advanced" className="grid gap-[18px] pt-1">
          <form.Field name="symbol" validators={validators.symbol}>
            {(field) => (
              <Field
                label={t`Symbol`}
                htmlFor="pool-symbol"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id="pool-symbol"
                  dir="ltr"
                  className="font-mono"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(pool.normalizeSymbol(event.target.value))}
                  onBlur={field.handleBlur}
                  placeholder={t`Enter pool symbol, eg. ABC1`}
                  maxLength={6}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.unitOfAccount}>
            {(unit) => (
              <form.Field name="pricing">
                {(field) => (
                  <div className="grid gap-1.5">
                    <span id="pool-pricing-label" className="font-medium text-sm">
                      <Trans>Pricing</Trans>
                    </span>
                    <RadioGroup
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value === "relative" || value === "oracle" || value === "decimal") {
                          field.handleChange(value);
                        }
                      }}
                      aria-labelledby="pool-pricing-label"
                      className="gap-2"
                    >
                      <PricingCard
                        value="relative"
                        title={t`Relative pricing`}
                        description={t`Uses voucher rates set for this pool`}
                        isDefault
                      />
                      <PricingCard
                        value="decimal"
                        title={t`Equal value`}
                        description={t`Vouchers swap one for one`}
                      />
                      {hasOracle ? (
                        <PricingCard
                          value="oracle"
                          title={t`Oracle pricing`}
                          description={t`Follows live price feeds for the selected currency`}
                          disabled={!hasPoolOracleBaseCurrency(unit, activeChainId)}
                        />
                      ) : null}
                    </RadioGroup>
                    {!findUnitOfAccountOption(unit) ? (
                      <p className="text-muted-foreground text-xs">
                        <Trans>
                          Custom units have no price feed. Relative pricing is used instead.
                        </Trans>
                      </p>
                    ) : null}
                  </div>
                )}
              </form.Field>
            )}
          </form.Subscribe>

          <div className="grid grid-cols-2 items-start gap-4">
            <form.Field name="feePolicyDefault" validators={validators.feePolicyDefault}>
              {(field) => (
                <Field
                  label={t`Swap fee (%)`}
                  htmlFor="pool-swap-fee"
                  error={getFieldError(field.state.meta.errors)}
                >
                  <Input
                    id="pool-swap-fee"
                    dir="ltr"
                    inputMode="decimal"
                    className="font-mono"
                    value={field.state.value}
                    onChange={(event) => {
                      const fee = event.target.value;
                      field.handleChange(fee);
                      pool.syncFeeFields(fee);
                    }}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => Number(state.values.feePolicyDefault) > 0}>
              {(hasFee) =>
                hasFee ? (
                  <form.Field name="feesDecoupled">
                    {(field) => (
                      <label
                        htmlFor="pool-fees-decoupled"
                        className="mt-[26px] flex h-9 cursor-pointer items-center gap-2.5 text-sm"
                      >
                        <Checkbox
                          id="pool-fees-decoupled"
                          checked={field.state.value}
                          onCheckedChange={(checked) => field.handleChange(checked)}
                        />
                        <Trans>Take fees separately</Trans>
                      </label>
                    )}
                  </form.Field>
                ) : null
              }
            </form.Subscribe>
          </div>

          {/* Any non-zero fee is paid to `feeAddress`, decoupled or not. */}
          <form.Subscribe selector={(state) => Number(state.values.feePolicyDefault) > 0}>
            {(hasFee) =>
              hasFee ? (
                <form.Field name="feeAddress" validators={validators.feeAddress}>
                  {(field) => (
                    <Field
                      label={t`Fee recipient`}
                      htmlFor="pool-fee-address"
                      hint={t`Defaults to your wallet.`}
                      error={getFieldError(field.state.meta.errors)}
                    >
                      <FeeRecipientDesk
                        value={field.state.value}
                        onValueChange={field.handleChange}
                      />
                    </Field>
                  )}
                </form.Field>
              ) : null
            }
          </form.Subscribe>
        </div>
      </details>

      <CreatePoolFormFoot>
        <Button type="button" pending={pool.advancing} onClick={() => void pool.goToPlace()}>
          <Trans>Next</Trans>
        </Button>
      </CreatePoolFormFoot>
    </div>
  );
}

/** A pricing choice as a bordered card; the selected card takes the primary edge. */
function PricingCard({
  value,
  title,
  description,
  isDefault = false,
  disabled = false,
}: {
  value: PoolPricing;
  title: string;
  description: string;
  isDefault?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[16px_minmax(0,1fr)] gap-2.5 border border-foreground/25 bg-card p-3 has-data-[checked]:border-primary has-data-[checked]:shadow-[inset_0_0_0_1px_var(--color-primary)] has-data-[disabled]:cursor-default has-data-[disabled]:opacity-50">
      <RadioGroupItem value={value} className="mt-0.5" disabled={disabled} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <strong className="font-semibold text-sm">{title}</strong>
          {isDefault ? (
            <Badge variant="outline" size="sm">
              <Trans>Default</Trans>
            </Badge>
          ) : null}
        </span>
        <span className="mt-0.5 block text-muted-foreground text-xs">{description}</span>
      </span>
    </label>
  );
}

/**
 * The fee recipient: the typed text stays what was typed, while the form holds
 * the address it resolves to (a username, phone, pasted or scanned address).
 */
function FeeRecipientDesk({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState(value);
  return (
    <SendRecipientField
      id="pool-fee-address"
      allowPools={false}
      value={query}
      onValueChange={(next) => {
        setQuery(next);
        onValueChange(next);
      }}
      onRecipientChange={(recipient) => {
        if (recipient) onValueChange(recipient.address);
      }}
      ariaLabel={t`Fee recipient`}
    />
  );
}
