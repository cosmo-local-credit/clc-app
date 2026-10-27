import { describe, expect, it } from "vite-plus/test";
import {
  KIND_DEFAULT_MARKER,
  MARKER_COLOR_HEX,
  MARKER_COLORS,
  MARKER_ICONS,
  RESOURCE_COLOR_HEX,
  WANT_MARKER_ICONS,
  isMarkerColor,
  isMarkerIcon,
  isWantMarkerIcon,
  resolveMarkerStyle,
} from "./logic";

describe("resolveMarkerStyle", () => {
  it("draws the pin each kind had before issuers could choose", () => {
    expect(KIND_DEFAULT_MARKER).toEqual({
      goods: { icon: "basket", color: "blue" },
      services: { icon: "hand-coin", color: "purple" },
      voucher: { icon: "coupon", color: "orange" },
    });
    expect(resolveMarkerStyle({ kind: "goods", markerIcon: null, markerColor: null })).toEqual({
      icon: "basket",
      color: "blue",
    });
  });

  it("resolves the icon and the colour independently", () => {
    expect(resolveMarkerStyle({ kind: "services", markerIcon: "food", markerColor: null })).toEqual(
      { icon: "food", color: "purple" },
    );
    expect(resolveMarkerStyle({ kind: "voucher", markerIcon: null, markerColor: "pink" })).toEqual({
      icon: "coupon",
      color: "pink",
    });
  });
});

describe("marker palette", () => {
  it("keeps the automatic pins inside the palette", () => {
    for (const style of Object.values(KIND_DEFAULT_MARKER)) {
      expect(isMarkerIcon(style.icon)).toBe(true);
      expect(isMarkerColor(style.color)).toBe(true);
    }
  });

  it("keeps the fills that predate the choice", () => {
    expect(MARKER_COLOR_HEX.blue).toEqual({ pin: "#2563eb", label: "#1d4ed8" });
    expect(MARKER_COLOR_HEX.purple).toEqual({ pin: "#7c3aed", label: "#6d28d9" });
    expect(MARKER_COLOR_HEX.orange).toEqual({ pin: "#ea580c", label: "#c2410c" });
  });

  it("uses six-digit hex the canvas can draw, distinct per colour", () => {
    const pins = MARKER_COLORS.map((color) => MARKER_COLOR_HEX[color].pin);
    for (const hex of [...pins, ...MARKER_COLORS.map((color) => MARKER_COLOR_HEX[color].label)]) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(pins).size).toBe(MARKER_COLORS.length);
  });

  it("defines the fixed resource palette", () => {
    expect(RESOURCE_COLOR_HEX).toEqual({
      voucher: { pin: "#007A55", label: "#006644" },
      offer: { pin: "#007A55", label: "#006644" },
      want: { pin: "#EA580C", label: "#C2410C" },
      pool: { pin: "#125A98", label: "#054980" },
      catalog: { pin: "#7C3AED", label: "#6D28D9" },
      post: { pin: "#52525B", label: "#3F3F46" },
    });
  });

  it("rejects values outside the palette", () => {
    expect(isMarkerIcon("rocket")).toBe(false);
    expect(isMarkerColor("red")).toBe(false);
    expect(isMarkerColor("green")).toBe(false);
    expect(MARKER_ICONS).toHaveLength(8);
    expect(WANT_MARKER_ICONS).toEqual(["question", "message", "request"]);
    expect(isWantMarkerIcon("message")).toBe(true);
    expect(isWantMarkerIcon("coupon")).toBe(false);
  });
});
