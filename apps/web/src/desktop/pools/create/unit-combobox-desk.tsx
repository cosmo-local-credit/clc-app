import { Combobox } from "@base-ui/react/combobox";
import { validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { normalizeUnitOfAccount, type UnitOfAccount } from "@clc/core/lib/currencies";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiArrowDownSLine, RiCheckLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { useUnitOfAccountOptions } from "#/components/ui/unit-of-account-combobox";

/**
 * The unit-of-account picker as a desktop dropdown: a 36px field whose list
 * floats under it. Typing filters; a unit no list offers can be added when it
 * passes the custom-unit rules, as on the phone.
 */
export function UnitComboboxDesk({
  id,
  value,
  onValueChange,
  onBlur,
  ariaInvalid,
}: {
  id: string;
  value: string;
  onValueChange: (value: UnitOfAccount) => void;
  onBlur?: () => void;
  ariaInvalid?: boolean;
}) {
  const { t } = useLingui();
  const { options, vocabulary } = useUnitOfAccountOptions(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const labels = options.map((option) => option.label);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;
  // The unit typed so far, as it would be stored.
  const next = normalizeUnitOfAccount(query);
  const matching = options.some(
    (option) =>
      option.value.toLowerCase() === next.toLowerCase() ||
      option.label.toLowerCase() === next.toLowerCase(),
  );
  const canCreate = next !== "" && !matching && !validateCustomUnit(next);

  const commitCustom = () => {
    if (!canCreate) return;
    onValueChange(next);
    setOpen(false);
  };

  return (
    <div className="grid gap-2">
      <Combobox.Root<string>
        items={labels}
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setQuery("");
          setOpen(nextOpen);
        }}
        inputValue={open ? query : selectedLabel}
        onInputValueChange={(text) => {
          if (open) setQuery(text);
        }}
        value={selectedLabel || null}
        onValueChange={(label) => {
          const selected = options.find((option) => option.label === label);
          if (selected) onValueChange(selected.value);
        }}
      >
        <div className="relative">
          <Combobox.Input
            id={id}
            aria-invalid={ariaInvalid}
            placeholder={open ? selectedLabel : t`Search units of account`}
            onBlur={onBlur}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreate) {
                event.preventDefault();
                commitCustom();
              }
            }}
            className="h-9 w-full min-w-0 rounded-none border border-input bg-card ps-3 pe-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-foreground aria-invalid:border-destructive"
          />
          <Combobox.Trigger
            aria-label={t`Unit of Account`}
            className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <RiArrowDownSLine className="size-4" aria-hidden="true" />
          </Combobox.Trigger>
        </div>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50 w-[var(--anchor-width)]">
            <Combobox.Popup className="max-h-[min(18rem,var(--available-height))] overflow-y-auto border border-border bg-popover text-popover-foreground outline-none">
              <Combobox.Empty>
                {canCreate ? null : (
                  <p className="px-3 py-2.5 text-muted-foreground text-sm">
                    <Trans>No units of account found</Trans>
                  </p>
                )}
              </Combobox.Empty>
              <Combobox.List>
                {(label: string) => (
                  <Combobox.Item
                    key={label}
                    value={label}
                    className="flex h-9 cursor-default items-center gap-2 px-3 text-sm outline-none select-none data-highlighted:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <Combobox.ItemIndicator>
                      <RiCheckLine className="size-4 text-primary" aria-hidden="true" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
              {canCreate ? (
                <button
                  type="button"
                  className="flex h-9 w-full items-center border-border border-t px-3 text-start text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={commitCustom}
                >
                  {t`Add “${next}”`}
                </button>
              ) : null}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {vocabulary.isError ? (
        <div className="flex items-center justify-between gap-2 text-destructive text-xs">
          <span>{t`Couldn't load units of account.`}</span>
          <Button type="button" variant="outline" onClick={() => void vocabulary.refetch()}>
            {t`Retry`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
