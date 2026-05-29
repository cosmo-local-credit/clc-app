/**
 * Canonical paper wallet dimensions.
 *
 * The wallet renders at a single fixed geometry (600 x 378).
 * Preview scales it down with a CSS transform so it fits mobile screens
 * without reflow. Export captures the native-size node at 2x pixel density.
 */
export const PAPER_WALLET_WIDTH = 600;
export const PAPER_WALLET_HEIGHT = 378;
export const PAPER_WALLET_EXPORT_PIXEL_RATIO = 2;

/**
 * Initial scale applied to the preview wrapper before the available mobile
 * content width is measured. 312 / 600 ≈ 0.52, which fits a 360 px viewport
 * with standard page padding.
 */
export const PAPER_WALLET_PREVIEW_SCALE = 0.52;

/**
 * The preview always fills the available width up to the card's native size.
 * Capping below 1 made the card narrower than the w-full controls beside it
 * on viewports wider than ~430 px, causing edge misalignment.
 */
export const PAPER_WALLET_PREVIEW_MAX_SCALE = 1;
