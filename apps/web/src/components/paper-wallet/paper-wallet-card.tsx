import QRCode from "qrcode";
import { forwardRef, useEffect, useState } from "react";

import { CLCLogo } from "#/components/ui/clc-logo";
import { PAPER_WALLET_HEIGHT, PAPER_WALLET_WIDTH } from "./paper-wallet-constants";
import type { PaperWalletCustomization } from "./paper-wallet-types";

function useQrDataUrl(url: string): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, {
      type: "image/png",
      margin: 0,
      width: 512,
      color: { dark: "#000000", light: "#ffffff" },
    }).then((result) => {
      if (!cancelled) setDataUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return dataUrl;
}

export type PaperWalletCardProps = {
  address: `0x${string}`;
  qrUrl: string;
  customization: PaperWalletCustomization;
};

/**
 * Renders a fixed-geometry paper wallet card at 600 x 378 px.
 *
 * All dimensions and font stacks are inline-styled so html-to-image
 * captures an accurate export regardless of stylesheet resolution.
 */
export const PaperWalletCard = forwardRef<HTMLDivElement, PaperWalletCardProps>(
  function PaperWalletCard({ address, qrUrl, customization }, ref) {
    const qrDataUrl = useQrDataUrl(qrUrl);
    const { name, website, description, logoDataUrl } = customization;
    const showDescription = description.trim().length > 0;

    return (
      <div
        ref={ref}
        data-slot="paper-wallet-root"
        style={{
          width: PAPER_WALLET_WIDTH,
          height: PAPER_WALLET_HEIGHT,
          backgroundColor: "#ffffff",
          boxSizing: "border-box",
          overflow: "hidden",
          padding: "20px 20px 10px",
          border: "1px dashed rgba(0,0,0,0.16)",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Upper section: logo + text | QR */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            flexGrow: 1,
            minHeight: 0,
          }}
        >
          {/* Left identity column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 300,
              height: 250,
              paddingRight: 16,
            }}
          >
            {/* Logo */}
            <div
              style={{
                width: 124,
                height: 124,
                flexShrink: 0,
              }}
            >
              {logoDataUrl ? (
                <img
                  data-slot="logo"
                  src={logoDataUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <CLCLogo className="size-full" />
              )}
            </div>

            <div style={{ marginTop: "auto" }}>
              {/* Name */}
              <span
                data-slot="name"
                className="line-clamp-2"
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                  maxHeight: 57.6,
                  fontFamily: "Plus Jakarta Sans, sans-serif",
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.2,
                  color: "#111827",
                }}
              >
                {name}
              </span>

              {/* Website */}
              <span
                data-slot="website"
                className="truncate"
                style={{
                  display: "block",
                  width: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 17,
                  lineHeight: 1.25,
                  color: "#6b7280",
                  marginTop: 4,
                }}
              >
                {website}
              </span>

              {/* Description — rendered only when non-empty */}
              {showDescription ? (
                <span
                  dir="auto"
                  data-slot="description"
                  className="line-clamp-2"
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2,
                    overflow: "hidden",
                    maxHeight: 43.2,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 16,
                    lineHeight: 1.35,
                    color: "#6b7280",
                    marginTop: 6,
                  }}
                >
                  {description}
                </span>
              ) : null}
            </div>
          </div>

          {/* QR code */}
          <div
            style={{
              flexShrink: 0,
              marginLeft: "auto",
            }}
          >
            <div
              style={{
                width: 250,
                height: 250,
                boxSizing: "border-box",
                padding: 10,
                backgroundColor: "#ffffff",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              {qrDataUrl ? (
                <img
                  data-slot="qr"
                  src={qrDataUrl}
                  alt="Wallet QR code"
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#f3f4f6",
                    borderRadius: 2,
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer: address */}
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
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: "-0.035em",
              lineHeight: 1.1,
              color: "#111827",
              wordBreak: "normal",
              whiteSpace: "nowrap",
              textAlign: "center",
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
