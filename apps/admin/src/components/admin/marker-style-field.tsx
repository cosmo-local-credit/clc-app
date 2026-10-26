import {
  MARKER_ICONS,
  RESOURCE_COLOR_HEX,
  REPORT_MARKER_ICONS,
  type MarketKind,
  type MarkerIcon,
  type MapMarkerStyle,
  type ReportMarkerIcon,
  isMarkerIcon,
  isReportMarkerIcon,
  resolveMarkerStyle,
} from "@clc/core/features/markers/logic";
import type { IconType } from "react-icons";
import {
  RiCouponFill,
  RiArticleLine,
  RiCalendarEventLine,
  RiGraduationCapFill,
  RiHandCoinFill,
  RiHeartPulseFill,
  RiPlantFill,
  RiMegaphoneLine,
  RiRestaurantFill,
  RiShoppingBasket2Fill,
  RiToolsFill,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { cn } from "#/lib/utils";

export type MarkerChoice = MarkerIcon | null;

/** The same artwork the member app's market map draws for each icon. */
const MARKER_GLYPHS: Record<MarkerIcon, IconType> = {
  basket: RiShoppingBasket2Fill,
  "hand-coin": RiHandCoinFill,
  coupon: RiCouponFill,
  food: RiRestaurantFill,
  farm: RiPlantFill,
  tools: RiToolsFill,
  health: RiHeartPulseFill,
  education: RiGraduationCapFill,
};

const REPORT_MARKER_GLYPHS: Record<ReportMarkerIcon, IconType> = {
  post: RiArticleLine,
  event: RiCalendarEventLine,
  announcement: RiMegaphoneLine,
};

const REPORT_MARKER_ICON_LABEL: Record<ReportMarkerIcon, string> = {
  post: "Post",
  event: "Event",
  announcement: "Announcement",
};

const MARKER_ICON_LABEL: Record<MarkerIcon, string> = {
  basket: "Shopping",
  "hand-coin": "Services",
  coupon: "Voucher",
  food: "Food",
  farm: "Farming",
  tools: "Tools",
  health: "Health",
  education: "Education",
};

/** The member app's map pin as SVG: the same 30 x 36 box, disc, tip and glyph. */
export function MarkerPin({ style, size = 30 }: { style: MapMarkerStyle; size?: number }) {
  const resource =
    style.icon === "question" || style.icon === "message" || style.icon === "request"
      ? "want"
      : style.icon === "post" || style.icon === "event" || style.icon === "announcement"
        ? "post"
        : "voucher";
  const Glyph =
    style.icon === "post" || style.icon === "event" || style.icon === "announcement"
      ? REPORT_MARKER_GLYPHS[style.icon]
      : "question" === style.icon || "message" === style.icon || "request" === style.icon
        ? RiArticleLine
        : MARKER_GLYPHS[style.icon];
  return (
    <svg
      viewBox="0 0 30 36"
      width={size}
      height={(size * 36) / 30}
      aria-hidden="true"
      className="shrink-0"
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

/** Required Post marker style: unlike vouchers there is no automatic option. */
export function ReportMarkerStyleField({
  value,
  onChange,
  disabled = false,
}: {
  value: ReportMarkerIcon;
  onChange: (next: ReportMarkerIcon) => void;
  disabled?: boolean;
}) {
  const toggleClass = cn(
    "text-muted-foreground h-9 min-w-9 px-2 text-xs font-medium",
    "data-[pressed]:bg-muted data-[pressed]:text-foreground",
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <MarkerPin style={{ icon: value, color: "pink" }} size={32} />
        <p className="text-sm font-medium">{REPORT_MARKER_ICON_LABEL[value]}</p>
      </div>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[value]}
        onValueChange={(values) => {
          const next = values[0];
          if (isReportMarkerIcon(next)) onChange(next);
        }}
        disabled={disabled}
        aria-label="Post map marker icon"
        className="border-border bg-card flex-wrap border p-0.5"
      >
        {REPORT_MARKER_ICONS.map((icon) => (
          <ToggleGroupItem key={icon} value={icon} className={cn(toggleClass, "gap-1.5")}>
            <MarkerPin style={{ icon, color: "pink" }} size={14} />
            {REPORT_MARKER_ICON_LABEL[icon]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** "Default", or the chosen icon by name. */
export function describeMarker(kind: MarketKind, value: MarkerChoice): string {
  if (value === null) return "Default";
  const style = resolveMarkerStyle({ kind, markerIcon: value, markerColor: null });
  return MARKER_ICON_LABEL[style.icon];
}

/**
 * The voucher's map-pin glyph. Pressing the chosen option again clears it, and
 * no glyph leaves the pin to follow what the voucher offers. Legacy colour is
 * retained in the form value for API compatibility.
 */
export function MarkerStyleField({
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
  const resolved = resolveMarkerStyle({ kind, markerIcon: value, markerColor: null });
  const automatic = value === null;
  const toggleClass = cn(
    "text-muted-foreground h-9 min-w-9 px-2 text-xs font-medium",
    "data-[pressed]:bg-muted data-[pressed]:text-foreground",
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <MarkerPin style={resolved} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{describeMarker(kind, value)}</p>
        </div>
        {automatic ? null : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="bg-destructive px-4 text-white hover:bg-destructive/90"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            Use default
          </Button>
        )}
      </div>

      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={value ? [value] : []}
        onValueChange={(values) => {
          const next = values[0];
          onChange(isMarkerIcon(next) ? next : null);
        }}
        disabled={disabled}
        aria-label="Map marker icon"
        className="border-border bg-card flex-wrap border p-0.5"
      >
        {MARKER_ICONS.map((icon) => (
          <ToggleGroupItem key={icon} value={icon} className={cn(toggleClass, "gap-1.5")}>
            <MarkerPin style={{ icon, color: resolved.color }} size={14} />
            {MARKER_ICON_LABEL[icon]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
