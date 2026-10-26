import { Radio } from "@base-ui/react/radio";
import {
  MARKER_ICONS,
  RESOURCE_COLOR_HEX,
  REPORT_MARKER_ICONS,
  type MarketKind,
  type MapMarkerStyle,
  type MarkerIcon,
  type ReportMarkerIcon,
  WANT_MARKER_ICONS,
  type WantMarkerIcon,
  isMarkerIcon,
  isReportMarkerIcon,
  isWantMarkerIcon,
  resolveMarkerStyle,
} from "@clc/core/features/markers/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiBookOpenFill, RiGroupFill } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { RadioGroup } from "#/components/ui/radio-group";
import { cn } from "#/lib/utils";
import { MARKER_GLYPHS, REPORT_MARKER_GLYPHS, WANT_MARKER_GLYPHS } from "./marker-glyphs";
import { useMarkerLabels } from "./voucher-labels";

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
  const resource =
    style.icon === "question" || style.icon === "message" || style.icon === "request"
      ? "want"
      : style.icon === "post" || style.icon === "event" || style.icon === "announcement"
        ? "post"
        : "voucher";
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
        fill={RESOURCE_COLOR_HEX[resource].pin}
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Glyph x={8.04} y={8.04} size={13.92} color="#ffffff" />
    </svg>
  );
}

export type FixedResourceMarkerKind = "pool" | "catalog";

/** Fixed Pool and Catalog artwork for form-location previews. */
export function FixedResourceMarkerPin({
  resource,
  size = 30,
}: {
  resource: FixedResourceMarkerKind;
  size?: number;
}) {
  const Glyph = resource === "pool" ? RiGroupFill : RiBookOpenFill;
  return (
    <svg
      viewBox="0 0 30 36"
      width={size}
      height={(size * 36) / 30}
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M3 3H27V25L19 29L15 33L11 29L3 25Z"
        fill={RESOURCE_COLOR_HEX[resource].pin}
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Glyph x={8.04} y={7.04} size={13.92} color="#ffffff" />
    </svg>
  );
}

/**
 * The issuer's choice of map-pin glyph. Resource kind owns the fixed pin
 * colour; the legacy colour value is preserved invisibly for API compatibility.
 */
type VoucherMarkerStylePickerProps = {
  mode?: "voucher";
  kind: MarketKind;
  value: MarkerIcon | null;
  onChange: (next: MarkerIcon | null) => void;
  disabled?: boolean;
};

type WantMarkerStylePickerProps = {
  mode: "want";
  value: WantMarkerIcon;
  onChange: (next: WantMarkerIcon) => void;
  disabled?: boolean;
};

type ReportMarkerStylePickerProps = {
  mode: "report";
  value: ReportMarkerIcon;
  onChange: (next: ReportMarkerIcon) => void;
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
    mode === "want"
      ? { icon: value as WantMarkerIcon, color: "orange" }
      : mode === "report"
        ? { icon: value as ReportMarkerIcon, color: "pink" }
        : resolveMarkerStyle({
            kind: kind as MarketKind,
            markerIcon: value as MarkerIcon | null,
            markerColor: null,
          });
  const automatic = mode === "voucher" && value === null;
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
            onClick={() => (onChange as (next: MarkerIcon | null) => void)(null)}
          >
            <Trans>Use default</Trans>
          </Button>
        )}
      </div>

      <RadioGroup
        aria-label={t`Pin icon`}
        value={value ?? ""}
        onValueChange={(next) => {
          if (mode === "want" && isWantMarkerIcon(next)) {
            (onChange as (next: WantMarkerIcon) => void)(next);
          } else if (mode === "report" && isReportMarkerIcon(next)) {
            (onChange as (next: ReportMarkerIcon) => void)(next);
          } else if (mode === "voucher" && isMarkerIcon(next)) {
            (onChange as (next: MarkerIcon | null) => void)(next);
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
    </div>
  );
}
