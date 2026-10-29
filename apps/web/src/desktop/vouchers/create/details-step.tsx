import { formatOfferingDisplayPrice } from "@clc/core/features/market/logic";
import {
  voucherDescriptionSchema,
  voucherNameSchema,
  voucherPriceSchema,
  voucherSupplySchema,
  voucherSymbolSchema,
} from "@clc/core/features/vouchers/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { normalizeUnitOfAccount } from "@clc/core/lib/currencies";
import { validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiArrowDownSLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { useUnitOfAccountOptions } from "#/components/ui/unit-of-account-combobox";
import { DeskTitle } from "#/desktop/ui/page";
import { VOUCHER_FORM_DEFAULTS } from "#/features/vouchers/hooks/use-create-voucher-form";
import { DeskSearchPicker } from "#/desktop/ui/search-picker";
import { VoucherHelp } from "./voucher-help";
import { FormFoot, type VoucherWizard } from "./wizard-bits";

/**
 * Step 1, Voucher: name, opening supply, description, then Advanced. Advanced
 * is controlled by the wizard, which opens it for a restored draft and when
 * Next is refused for a field inside it; every setting in it is kept.
 */
export function DetailsStep({
  wizard,
  advanced,
}: {
  wizard: VoucherWizard;
  advanced: { open: boolean; onOpenChange: (open: boolean) => void };
}) {
  const { t } = useLingui();
  const { form } = wizard;
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <DeskTitle>
          <Trans>Create voucher</Trans>
        </DeskTitle>
        <VoucherHelp />
      </div>

      {/* Next refuses a taken name: goToPlace awaits validateField(_, "submit"). */}
      <form.Field
        name="name"
        asyncDebounceMs={400}
        validators={{
          onBlur: voucherNameSchema,
          onSubmit: voucherNameSchema,
          onChangeAsync: wizard.checkNameAvailable,
          onSubmitAsync: wizard.checkNameAvailable,
        }}
      >
        {(field) => (
          <Field
            label={t`Name`}
            htmlFor="voucher-name"
            error={getFieldError(field.state.meta.errors)}
            hint={field.state.meta.isValidating ? t`Checking availability…` : undefined}
          >
            <Input
              id="voucher-name"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={() => {
                field.handleBlur();
                wizard.suggestSymbolFor(field.state.value);
              }}
              placeholder={t`e.g. Community Market`}
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>

      <form.Field
        name="supply"
        validators={{
          onBlur: voucherSupplySchema(VOUCHER_FORM_DEFAULTS.decimals),
          onSubmit: voucherSupplySchema(VOUCHER_FORM_DEFAULTS.decimals),
        }}
      >
        {(field) => (
          <div className="grid gap-1">
            <Field
              label={t`Create vouchers`}
              htmlFor="voucher-supply"
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id="voucher-supply"
                dir="ltr"
                inputMode="decimal"
                className="font-mono"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
              />
            </Field>
            <form.Subscribe
              selector={(state) =>
                [
                  state.values.supply,
                  state.values.price,
                  state.values.unitOfAccount,
                  state.values.name,
                ] as const
              }
            >
              {([supply, price, unit, name]) => {
                const value = formatOfferingDisplayPrice(supply, price, unit, name);
                return value ? (
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    <Trans>
                      Value: {value.value} {value.unit} of offerings
                    </Trans>
                  </p>
                ) : null;
              }}
            </form.Subscribe>
          </div>
        )}
      </form.Field>

      <form.Field
        name="description"
        validators={{ onBlur: voucherDescriptionSchema, onSubmit: voucherDescriptionSchema }}
      >
        {(field) => (
          <Field
            label={t`Description`}
            htmlFor="voucher-description"
            error={getFieldError(field.state.meta.errors)}
          >
            <Textarea
              id="voucher-description"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              placeholder={t`Tell people about your business...`}
              maxLength={500}
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>

      <details
        open={advanced.open}
        className="group border-border border-t"
        onToggle={(event) => {
          advanced.onOpenChange(event.currentTarget.open);
          if (event.currentTarget.open) void wizard.fillSuggestedSymbol();
        }}
      >
        <summary className="flex h-11 cursor-pointer list-none items-center gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <Trans>Advanced</Trans>
          {/* Closed, the section says what it currently holds. */}
          <form.Subscribe
            selector={(state) =>
              [state.values.symbol, state.values.price, state.values.unitOfAccount] as const
            }
          >
            {([symbol, price, unit]) => (
              <span
                dir="ltr"
                className="min-w-0 flex-1 truncate text-end font-mono text-xs font-normal text-muted-foreground group-open:hidden"
              >
                {symbol ? `${symbol} · ` : ""}
                {`${price.trim() || "—"} ${unit}`}
              </span>
            )}
          </form.Subscribe>
          <RiArrowDownSLine
            aria-hidden="true"
            className="ms-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="grid gap-[18px] pt-1">
          <form.Field
            name="symbol"
            validators={{ onBlur: voucherSymbolSchema, onSubmit: voucherSymbolSchema }}
          >
            {(field) => (
              <Field
                label={t`Symbol`}
                htmlFor="voucher-symbol"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id="voucher-symbol"
                  dir="ltr"
                  className="font-mono"
                  value={field.state.value}
                  onChange={(event) => {
                    const symbol = event.target.value.toUpperCase();
                    field.handleChange(symbol);
                    wizard.trackSymbol(symbol);
                  }}
                  onBlur={field.handleBlur}
                  placeholder={t`e.g. MARKET`}
                  maxLength={6}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
              </Field>
            )}
          </form.Field>

          <div className="@container">
            <div className="grid grid-cols-1 items-start gap-3 @min-[30rem]:grid-cols-2">
              <form.Field
                name="price"
                validators={{ onBlur: voucherPriceSchema, onSubmit: voucherPriceSchema }}
              >
                {(field) => (
                  <Field
                    label={t`Price`}
                    htmlFor="voucher-price"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="voucher-price"
                      dir="ltr"
                      inputMode="decimal"
                      className="font-mono"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="unitOfAccount">
                {(field) => (
                  <Field label={t`Priced in`} htmlFor="voucher-currency">
                    <UnitPicker value={field.state.value} onValueChange={field.handleChange} />
                  </Field>
                )}
              </form.Field>
            </div>
          </div>

          <form.Subscribe
            selector={(state) =>
              [state.values.name, state.values.price, state.values.unitOfAccount] as const
            }
          >
            {([name, price, unit]) => (
              <p className="-mt-2 font-mono text-xs text-muted-foreground tabular-nums">
                {`1 ${name.trim() || t`voucher`} = ${price || "—"} ${unit}`}
              </p>
            )}
          </form.Subscribe>
        </div>
      </details>

      <FormFoot>
        <Button type="button" pending={wizard.advancing} onClick={() => void wizard.goToPlace()}>
          <Trans>Next</Trans>
        </Button>
      </FormFoot>
    </>
  );
}

function UnitPicker({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useLingui();
  const { options, vocabulary } = useUnitOfAccountOptions(value);
  const selected = options.find((option) => option.value === value)?.label ?? value;
  return (
    <div className="grid gap-1">
      <DeskSearchPicker
        id="voucher-currency"
        options={options}
        value={value}
        onValueChange={onValueChange}
        trigger={<span className="truncate">{selected}</span>}
        searchLabel={t`Search units of account`}
        emptyMessage={t`No units of account found`}
        createLabel={(next) => t`Add “${next}”`}
        normalizeCustomValue={normalizeUnitOfAccount}
        validateCustomValue={validateCustomUnit}
      />
      {vocabulary.isError ? (
        <div className="flex items-center justify-between gap-2 text-xs text-destructive">
          <span>{t`Couldn't load units of account.`}</span>
          <Button type="button" variant="ghost" onClick={() => void vocabulary.refetch()}>
            {t`Retry`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
