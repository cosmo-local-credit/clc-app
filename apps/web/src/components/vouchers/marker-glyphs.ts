import type { MarkerIcon, WantMarkerIcon } from "@clc/core/features/markers/logic";
import type { IconType } from "react-icons";
import {
  RiCouponFill,
  RiGraduationCapFill,
  RiHandCoinFill,
  RiHeartPulseFill,
  RiPlantFill,
  RiMessage2Line,
  RiQuestionLine,
  RiRestaurantFill,
  RiShoppingBasket2Fill,
  RiSpeakLine,
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
  education: RiGraduationCapFill,
};

export const WANT_MARKER_GLYPHS: Record<WantMarkerIcon, IconType> = {
  question: RiQuestionLine,
  message: RiMessage2Line,
  request: RiSpeakLine,
};
