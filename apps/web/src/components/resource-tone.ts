import type { MarketplaceScope } from "@clc/core/features/marketplace/logic";
import type { IconType } from "react-icons";
import {
  RiBookOpenLine,
  RiCoupon3Line,
  RiGroupLine,
  RiQuestionLine,
  RiStore2Line,
} from "react-icons/ri";

/**
 * Each marketplace resource keeps one hue and one icon wherever it is offered:
 * the market's badges and the Wallet's create buttons. `--hue` paints edges and
 * tints; `--ink` paints the icon and label at a contrast that reads in light and
 * dark.
 */
export const RESOURCE_HUE: Record<MarketplaceScope, string> = {
  pools: "[--hue:var(--color-info)] [--ink:var(--color-info-ink)]",
  vouchers: "[--hue:var(--color-voucher)] [--ink:var(--color-voucher-ink)]",
  offers: "[--hue:var(--color-offer)] [--ink:var(--color-offer-ink)]",
  wants: "[--hue:var(--color-warning)] [--ink:var(--color-warning-foreground)]",
  catalogs: "[--hue:var(--color-catalog)] [--ink:var(--color-catalog-ink)]",
};

export const RESOURCE_ICON: Record<MarketplaceScope, IconType> = {
  pools: RiGroupLine,
  vouchers: RiCoupon3Line,
  offers: RiStore2Line,
  wants: RiQuestionLine,
  catalogs: RiBookOpenLine,
};

/** An outline button in its resource's hue: coloured edge, icon and label on white. */
export const RESOURCE_OUTLINE =
  "border-(--hue)! text-(--ink) hover:bg-[color-mix(in_oklab,var(--hue)_10%,var(--color-card))] hover:text-(--ink)";
