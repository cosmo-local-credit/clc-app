import {
  PAPER_WALLET_CARD_HEIGHT,
  PAPER_WALLET_CARD_WIDTH,
  PAPER_WALLET_QR_BOX,
} from "@clc/core/features/wallet/paper-wallet-sheet";
import { forwardRef } from "react";

import { BRAND_ICON_BASE } from "#/lib/brand";

/** Print resolution: 2x the design size is ~356 dpi at CR80, above what office printers resolve. */
export const PAPER_WALLET_PIXEL_RATIO = 2;
export const PAPER_WALLET_LOGO_SIZE = 124;
export const PAPER_WALLET_INK = "#111827";

export type CardTextStyle = {
  family: string;
  size: number;
  weight: number;
  letterSpacingEm: number;
  lineHeight: number;
};

/**
 * The per-wallet text, styled here and drawn onto the print sheet with Canvas
 * 2D from the same values, so the two cannot drift.
 */
export const PAPER_WALLET_NAME_TEXT: CardTextStyle = {
  family: "Plus Jakarta Sans Variable, Plus Jakarta Sans, sans-serif",
  size: 24,
  weight: 700,
  letterSpacingEm: -0.015,
  lineHeight: 1.2,
};
export const PAPER_WALLET_NAME_WIDTH = 300;
export const PAPER_WALLET_NAME_LINES = 2;
export const PAPER_WALLET_ADDRESS_TEXT: CardTextStyle = {
  family: "JetBrains Mono Variable, JetBrains Mono, monospace",
  size: 16,
  weight: 500,
  letterSpacingEm: -0.035,
  lineHeight: 1.1,
};

function textStyle(text: CardTextStyle) {
  return {
    fontFamily: text.family,
    fontSize: text.size,
    fontWeight: text.weight,
    letterSpacing: `${text.letterSpacingEm}em`,
    lineHeight: text.lineHeight,
  };
}

export type PaperWalletCardDesign = {
  website: string;
  description: string;
  /** A data URL, or null for the brand mark. */
  logoDataUrl: string | null;
};

export type PaperWalletCardProps = {
  address: string;
  /** Empty prints a write-in line, for a blank card the holder names by hand. */
  name: string;
  design: PaperWalletCardDesign;
  /** Shown in the QR box for previews only; the print sheet draws the QR as vectors. */
  qrDataUrl?: string | null;
  /**
   * Lays out the name and address but leaves them unpainted: the print sheet's
   * shared background, which the sheet draws each wallet's text over.
   */
  blankText?: boolean;
};

/**
 * The printed card, at the fixed 600 x 378 design size the sheet scales to CR80.
 *
 * A port of apps/web's `PaperWalletCard` (the apps cannot share UI), kept to the
 * same geometry so a card issued here and one saved during web onboarding look
 * alike. Every style is inline because html-to-image rasterises it, and the QR
 * box sits at `PAPER_WALLET_QR_BOX`, where the sheet overlays the vector QR.
 */
export const PaperWalletCard = forwardRef<HTMLDivElement, PaperWalletCardProps>(
  function PaperWalletCard({ address, name, design, qrDataUrl, blankText }, ref) {
    const qrFrame = PAPER_WALLET_QR_BOX.size + 22;
    const visibility = blankText ? "hidden" : undefined;
    return (
      <div
        ref={ref}
        data-slot="paper-wallet-root"
        style={{
          width: PAPER_WALLET_CARD_WIDTH,
          height: PAPER_WALLET_CARD_HEIGHT,
          backgroundColor: "#ffffff",
          boxSizing: "border-box",
          overflow: "hidden",
          padding: "20px 20px 10px",
          border: "1px solid transparent",
          display: "flex",
          flexDirection: "column",
          color: PAPER_WALLET_INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", flexGrow: 1, minHeight: 0 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: PAPER_WALLET_NAME_WIDTH,
              height: 250,
              paddingRight: 16,
            }}
          >
            <div
              style={{
                width: PAPER_WALLET_LOGO_SIZE,
                height: PAPER_WALLET_LOGO_SIZE,
                flexShrink: 0,
              }}
            >
              <img
                data-slot="logo"
                src={design.logoDataUrl ?? `${BRAND_ICON_BASE}/logo.svg`}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>

            <div style={{ marginTop: "auto" }}>
              {name ? (
                <span
                  data-slot="name"
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: PAPER_WALLET_NAME_LINES,
                    overflow: "hidden",
                    // Breaks a word too long for the line, as the print sheet does.
                    overflowWrap: "break-word",
                    maxHeight:
                      PAPER_WALLET_NAME_TEXT.size *
                      PAPER_WALLET_NAME_TEXT.lineHeight *
                      PAPER_WALLET_NAME_LINES,
                    ...textStyle(PAPER_WALLET_NAME_TEXT),
                    visibility,
                  }}
                >
                  {name}
                </span>
              ) : (
                <div data-slot="name-line" style={{ paddingTop: 22 }}>
                  <div style={{ borderBottom: "1.5px solid #9ca3af", height: 0 }} />
                  <span
                    style={{
                      display: "block",
                      marginTop: 4,
                      fontFamily: "Inter Variable, Inter, sans-serif",
                      fontSize: 12,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#9ca3af",
                    }}
                  >
                    Name
                  </span>
                </div>
              )}

              {design.website ? (
                <span
                  data-slot="website"
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "Inter Variable, Inter, sans-serif",
                    fontSize: 17,
                    lineHeight: 1.25,
                    color: "#6b7280",
                    marginTop: 4,
                  }}
                >
                  {design.website}
                </span>
              ) : null}

              {design.description ? (
                <span
                  data-slot="description"
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2,
                    overflow: "hidden",
                    maxHeight: 43.2,
                    fontFamily: "Inter Variable, Inter, sans-serif",
                    fontSize: 16,
                    lineHeight: 1.35,
                    color: "#6b7280",
                    marginTop: 6,
                  }}
                >
                  {design.description}
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ flexShrink: 0, marginLeft: "auto" }}>
            <div
              style={{
                width: qrFrame,
                height: qrFrame,
                boxSizing: "border-box",
                padding: 10,
                backgroundColor: "#ffffff",
                border: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              {qrDataUrl ? (
                <img
                  data-slot="qr"
                  src={qrDataUrl}
                  alt="Wallet QR code"
                  style={{ width: "100%", height: "100%" }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div
          style={{
            height: 56,
            flexShrink: 0,
            borderTop: "1px solid rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            data-slot="address"
            style={{
              ...textStyle(PAPER_WALLET_ADDRESS_TEXT),
              whiteSpace: "nowrap",
              visibility,
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            {address}
          </span>
        </div>
      </div>
    );
  },
);
