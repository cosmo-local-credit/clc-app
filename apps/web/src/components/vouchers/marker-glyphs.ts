import type { MarkerIcon } from "@clc/core/features/markers/logic";
import type { IconType } from "react-icons";
import {
  RiCouponFill,
  RiHandCoinFill,
  RiHeartPulseFill,
  RiPlantFill,
  RiRestaurantFill,
  RiShoppingBasket2Fill,
  RiToolsFill,
} from "react-icons/ri";

/**
 * The artwork for each map pin icon. The market map draws these on a canvas
 * and the marker picker renders them as SVG, so both read the same glyph.
 */
export const MARKER_GLYPHS: Record<MarkerIcon, IconType> = {
  basket: RiShoppingBasket2Fill,
  "hand-coin": RiHandCoinFill,
  coupon: RiCouponFill,
  food: RiRestaurantFill,
  farm: RiPlantFill,
  tools: RiToolsFill,
  health: RiHeartPulseFill,
};
