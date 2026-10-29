import { Radio } from "@base-ui/react/radio";
import { MARKER_ICONS, type MarkerIcon, isMarkerIcon } from "@clc/core/features/markers/logic";
import { Trans, useLingui } from "@lingui/react/macro";

import { RadioGroup } from "#/components/ui/radio-group";
import { Button } from "#/components/ui/button";
import { MARKER_GLYPHS } from "#/components/vouchers/marker-glyphs";
import { useMarkerLabels } from "#/components/vouchers/voucher-labels";
import { cn } from "#/lib/utils";

/**
 * The map-pin glyph as a row of 36px squares, then "Use default" to go back
 * to the automatic pin. Null is the automatic pin, as on the phone picker.
 */
export function DeskPinPicker({
  value,
  onChange,
  disabled,
}: {
  value: MarkerIcon | null;
  onChange: (next: MarkerIcon | null) => void;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const labels = useMarkerLabels();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <RadioGroup
        aria-label={t`Pin icon`}
        value={value ?? ""}
        onValueChange={(next) => {
          if (isMarkerIcon(next)) onChange(next);
        }}
        disabled={disabled}
        className="flex flex-wrap gap-1.5"
      >
        {MARKER_ICONS.map((icon) => {
          const Glyph = MARKER_GLYPHS[icon];
          return (
            <Radio.Root
              key={icon}
              value={icon}
              aria-label={labels.icon(icon)}
              title={labels.icon(icon)}
              className={cn(
                "flex size-9 items-center justify-center border border-foreground/25 bg-card text-foreground outline-none",
                "hover:bg-muted data-[checked]:border-primary data-[checked]:text-primary data-[checked]:shadow-[inset_0_0_0_1px_var(--color-primary)]",
                "focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Glyph aria-hidden="true" className="size-4" />
            </Radio.Root>
          );
        })}
      </RadioGroup>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || value === null}
        onClick={() => onChange(null)}
      >
        <Trans>Use default</Trans>
      </Button>
    </div>
  );
}
