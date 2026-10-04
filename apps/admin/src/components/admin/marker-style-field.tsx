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
import type { IconType } from "react-icons";
import {
  RiCouponFill,
  RiGraduationCapFill,
  RiHandCoinFill,
  RiHeartPulseFill,
  RiPlantFill,
  RiRestaurantFill,
  RiShoppingBasket2Fill,
  RiToolsFill,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { cn } from "#/lib/utils";

export type MarkerChoice = { icon: MarkerIcon | null; color: MarkerColor | null };

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

export const MARKER_ICON_LABEL: Record<MarkerIcon, string> = {
  basket: "Shopping",
  "hand-coin": "Services",
  coupon: "Voucher",
  food: "Food",
  farm: "Farming",
  tools: "Tools",
  health: "Health",
  education: "Education",
};

export const MARKER_COLOR_LABEL: Record<MarkerColor, string> = {
  blue: "Blue",
  purple: "Purple",
  orange: "Orange",
  pink: "Pink",
  cyan: "Cyan",
  brown: "Brown",
};

/** The member app's map pin as SVG: the same 30 x 36 box, disc, tip and glyph. */
export function MarkerPin({ style, size = 30 }: { style: MarkerStyle; size?: number }) {
  const Glyph = MARKER_GLYPHS[style.icon];
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
        fill={MARKER_COLOR_HEX[style.color].pin}
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Glyph x={8.04} y={8.04} size={13.92} color="#ffffff" />
    </svg>
  );
}

/** "Default", or the chosen icon and colour by name. */
export function describeMarker(kind: MarketKind, value: MarkerChoice): string {
  if (value.icon === null && value.color === null) return "Default";
  const style = resolveMarkerStyle({ kind, markerIcon: value.icon, markerColor: value.color });
  return `${MARKER_ICON_LABEL[style.icon]}, ${MARKER_COLOR_LABEL[style.color]}`;
}

/**
 * The voucher's map pin: an icon and a colour, each optional. Pressing the
 * chosen option again clears it, and nothing chosen leaves the pin to follow
 * what the voucher offers.
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
  const resolved = resolveMarkerStyle({ kind, markerIcon: value.icon, markerColor: value.color });
  const automatic = value.icon === null && value.color === null;
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
          <p className="text-muted-foreground text-xs">
            {automatic
              ? "Follows the voucher's offerings until an icon or colour is chosen."
              : "Shown on the market map."}
          </p>
        </div>
        {automatic ? null : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="bg-destructive px-4 text-white hover:bg-destructive/90"
            disabled={disabled}
            onClick={() => onChange({ icon: null, color: null })}
          >
            Use default
          </Button>
        )}
      </div>

      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={value.icon ? [value.icon] : []}
        onValueChange={(values) => {
          const next = values[0];
          onChange({ ...value, icon: isMarkerIcon(next) ? next : null });
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

      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={value.color ? [value.color] : []}
        onValueChange={(values) => {
          const next = values[0];
          onChange({ ...value, color: isMarkerColor(next) ? next : null });
        }}
        disabled={disabled}
        aria-label="Map marker colour"
        className="border-border bg-card flex-wrap border p-0.5"
      >
        {MARKER_COLORS.map((color) => (
          <ToggleGroupItem
            key={color}
            value={color}
            aria-label={MARKER_COLOR_LABEL[color]}
            className={toggleClass}
          >
            <span
              className="size-4 rounded-full"
              style={{ backgroundColor: MARKER_COLOR_HEX[color].pin }}
            />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
