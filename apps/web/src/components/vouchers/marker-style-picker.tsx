import { Radio } from "@base-ui/react/radio";
import {
  MARKER_COLORS,
  MARKER_COLOR_HEX,
  MARKER_ICONS,
  type MarketKind,
  type MarkerColor,
  type MarkerIcon,
  type MarkerStyle,
  isMarkerColor,
  isMarkerIcon,
  resolveMarkerStyle,
} from "@clc/core/features/markers/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiCheckLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { RadioGroup } from "#/components/ui/radio-group";
import { cn } from "#/lib/utils";
import { MARKER_GLYPHS } from "./marker-glyphs";
import { useMarkerLabels } from "./voucher-labels";

export type MarkerChoice = { icon: MarkerIcon | null; color: MarkerColor | null };

/**
 * The market map's pin as SVG, on the canvas pin's geometry: a 12 px disc
 * tapering to a 6 px tip inside a 3 px margin, with the glyph at 58% of the
 * disc. The tip sits on the bottom edge, as it does on the map.
 */
export function MarkerPin({
  style,
  size = 30,
  className,
}: {
  style: MarkerStyle;
  /** Rendered width in px; the height follows the pin's 30:36 box. */
  size?: number;
  className?: string;
}) {
  const Glyph = MARKER_GLYPHS[style.icon];
  return (
    <svg
      viewBox="0 0 30 36"
      width={size}
      height={(size * 36) / 30}
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path
        d="M6.056 23A12 12 0 1 1 23.944 23L15 33Z"
        fill={MARKER_COLOR_HEX[style.color].pin}
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Glyph x={8.04} y={8.04} size={13.92} color="#ffffff" />
    </svg>
  );
}

/**
 * The issuer's choice of map pin: an icon and a colour, each optional. Nothing
 * chosen leaves the pin to follow what the voucher offers, which `kind` says.
 */
export function MarkerStylePicker({
  kind,
  value,
  onChange,
  disabled = false,
}: {
  kind: MarketKind;
  value: MarkerChoice;
  onChange: (next: MarkerChoice) => void;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const labels = useMarkerLabels();
  const resolved = resolveMarkerStyle({ kind, markerIcon: value.icon, markerColor: value.color });
  const automatic = value.icon === null && value.color === null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <MarkerPin style={resolved} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">
            <Trans>Map pin</Trans>
          </p>
        </div>
        {automatic ? null : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-11 bg-destructive px-4 text-white hover:bg-destructive/90"
            disabled={disabled}
            onClick={() => onChange({ icon: null, color: null })}
          >
            <Trans>Use default</Trans>
          </Button>
        )}
      </div>

      <RadioGroup
        aria-label={t`Pin icon`}
        value={value.icon}
        onValueChange={(next) => {
          if (isMarkerIcon(next)) onChange({ ...value, icon: next });
        }}
        disabled={disabled}
        className="grid-cols-4 gap-2"
      >
        {MARKER_ICONS.map((icon) => (
          <Radio.Root
            key={icon}
            value={icon}
            aria-label={labels.icon(icon)}
            className={cn(
              "flex h-16 min-w-0 flex-col items-center justify-center gap-1 border border-border bg-card px-2 outline-none",
              "data-[checked]:border-primary data-[checked]:bg-primary/[0.05]",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <MarkerPin style={{ icon, color: resolved.color }} size={24} />
            <span className="w-full truncate text-center text-[11px] leading-tight">
              {labels.icon(icon)}
            </span>
          </Radio.Root>
        ))}
      </RadioGroup>

      <RadioGroup
        aria-label={t`Pin colour`}
        value={value.color}
        onValueChange={(next) => {
          if (isMarkerColor(next)) onChange({ ...value, color: next });
        }}
        disabled={disabled}
        className="grid-cols-6 gap-2"
      >
        {MARKER_COLORS.map((color) => (
          <Radio.Root
            key={color}
            value={color}
            aria-label={labels.color(color)}
            className={cn(
              "group flex h-11 items-center justify-center border border-border bg-card outline-none",
              "data-[checked]:border-primary",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <span
              className="grid size-6 place-items-center rounded-full"
              style={{ backgroundColor: MARKER_COLOR_HEX[color].pin }}
            >
              <RiCheckLine
                className="hidden size-4 text-white group-data-[checked]:block"
                aria-hidden="true"
              />
            </span>
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  );
}
