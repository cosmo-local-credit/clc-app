import { Radio } from "@base-ui/react/radio";
import {
  MARKER_COLORS,
  MARKER_COLOR_HEX,
  MARKER_ICONS,
  REPORT_MARKER_ICONS,
  type MarketKind,
  type MapMarkerStyle,
  type MarkerColor,
  type MarkerIcon,
  type ReportMarkerIcon,
  type ReportMarkerStyle,
  WANT_MARKER_ICONS,
  type WantMarkerIcon,
  type WantMarkerStyle,
  isMarkerColor,
  isMarkerIcon,
  isReportMarkerIcon,
  isWantMarkerIcon,
  resolveMarkerStyle,
} from "@clc/core/features/markers/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiCheckLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { RadioGroup } from "#/components/ui/radio-group";
import { cn } from "#/lib/utils";
import { MARKER_GLYPHS, REPORT_MARKER_GLYPHS, WANT_MARKER_GLYPHS } from "./marker-glyphs";
import { useMarkerLabels } from "./voucher-labels";

type MarkerChoice = { icon: MarkerIcon | null; color: MarkerColor | null };

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
  style: MapMarkerStyle;
  /** Rendered width in px; the height follows the pin's 30:36 box. */
  size?: number;
  className?: string;
}) {
  const Glyph =
    style.icon === "question" || style.icon === "message" || style.icon === "request"
      ? WANT_MARKER_GLYPHS[style.icon]
      : style.icon === "post" || style.icon === "event" || style.icon === "announcement"
        ? REPORT_MARKER_GLYPHS[style.icon]
        : MARKER_GLYPHS[style.icon];
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
type VoucherMarkerStylePickerProps = {
  mode?: "voucher";
  kind: MarketKind;
  value: MarkerChoice;
  onChange: (next: MarkerChoice) => void;
  disabled?: boolean;
};

type WantMarkerStylePickerProps = {
  mode: "want";
  value: WantMarkerStyle;
  onChange: (next: WantMarkerStyle) => void;
  disabled?: boolean;
};

type ReportMarkerStylePickerProps = {
  mode: "report";
  value: ReportMarkerStyle;
  onChange: (next: ReportMarkerStyle) => void;
  disabled?: boolean;
};

export function MarkerStylePicker(
  props: VoucherMarkerStylePickerProps | WantMarkerStylePickerProps | ReportMarkerStylePickerProps,
) {
  const { value, onChange, disabled = false } = props;
  const kind = props.mode === "want" || props.mode === "report" ? undefined : props.kind;
  const mode = props.mode ?? "voucher";
  const { t } = useLingui();
  const labels = useMarkerLabels();
  const resolved: MapMarkerStyle =
    mode === "want" || mode === "report"
      ? (value as WantMarkerStyle | ReportMarkerStyle)
      : resolveMarkerStyle({
          kind: kind as MarketKind,
          markerIcon: (value as MarkerChoice).icon,
          markerColor: value.color,
        });
  const automatic = mode === "voucher" && value.icon === null && value.color === null;
  const icons =
    mode === "want" ? WANT_MARKER_ICONS : mode === "report" ? REPORT_MARKER_ICONS : MARKER_ICONS;
  const iconLabel = (icon: MarkerIcon | WantMarkerIcon | ReportMarkerIcon) =>
    icon === "question"
      ? t`Question`
      : icon === "message"
        ? t`Message`
        : icon === "request"
          ? t`Request`
          : icon === "post"
            ? t`Post`
            : icon === "event"
              ? t`Event`
              : icon === "announcement"
                ? t`Announcement`
                : labels.icon(icon);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <MarkerPin style={resolved} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">
            <Trans>Map pin</Trans>
          </p>
        </div>
        {automatic || mode === "want" || mode === "report" ? null : (
          <Button
            type="button"
            variant="destructive"
            tap
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={disabled}
            onClick={() => (onChange as (next: MarkerChoice) => void)({ icon: null, color: null })}
          >
            <Trans>Use default</Trans>
          </Button>
        )}
      </div>

      <RadioGroup
        aria-label={t`Pin icon`}
        value={value.icon ?? undefined}
        onValueChange={(next) => {
          if (mode === "want" && isWantMarkerIcon(next)) {
            (onChange as (next: WantMarkerStyle) => void)({
              ...(value as WantMarkerStyle),
              icon: next,
            });
          } else if (mode === "report" && isReportMarkerIcon(next)) {
            (onChange as (next: ReportMarkerStyle) => void)({
              ...(value as ReportMarkerStyle),
              icon: next,
            });
          } else if (mode === "voucher" && isMarkerIcon(next)) {
            (onChange as (next: MarkerChoice) => void)({ ...value, icon: next });
          }
        }}
        disabled={disabled}
        className={cn(mode === "voucher" ? "grid-cols-4" : "grid-cols-3", "gap-2")}
      >
        {icons.map((icon) => (
          <Radio.Root
            key={icon}
            value={icon}
            aria-label={iconLabel(icon)}
            className={cn(
              "flex h-16 min-w-0 flex-col items-center justify-center gap-1 border border-border bg-card px-2 outline-none",
              "data-[checked]:border-primary data-[checked]:bg-primary/[0.05]",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <MarkerPin style={{ icon, color: resolved.color }} size={24} />
            <span className="w-full truncate text-center text-2xs">{iconLabel(icon)}</span>
          </Radio.Root>
        ))}
      </RadioGroup>

      <RadioGroup
        aria-label={t`Pin colour`}
        value={value.color}
        onValueChange={(next) => {
          if (isMarkerColor(next)) {
            (onChange as (next: typeof value) => void)({ ...value, color: next });
          }
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
