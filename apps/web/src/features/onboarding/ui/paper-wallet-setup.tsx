import { useLingui } from "@lingui/react/macro";
import { toPng } from "html-to-image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiLoader } from "react-icons/fi";

import { Button } from "#/components/ui/button";
import { PaperWalletCard } from "./paper-wallet-card";
import {
  PAPER_WALLET_EXPORT_PIXEL_RATIO,
  PAPER_WALLET_HEIGHT,
  PAPER_WALLET_PREVIEW_MAX_SCALE,
  PAPER_WALLET_PREVIEW_SCALE,
  PAPER_WALLET_WIDTH,
} from "./paper-wallet-constants";
import { PaperWalletCustomizer } from "./paper-wallet-customizer";
import type { PaperWalletCustomization } from "./paper-wallet-types";

export type UsePaperWalletSetupProps = {
  address: `0x${string}`;
  qrUrl: string;
  defaultName: string;
};

export type PaperWalletSetupSlots = {
  card: ReactNode;
  controls: ReactNode;
  downloadButton: ReactNode;
};

/**
 * Shared paper wallet screen logic: preview wrapper, customization state,
 * download handler, and the "Customize" disclosure.
 *
 * Hook returning slot nodes so parent screens (onboarding, standalone) can
 * compose their own surrounding flow while sharing state, ref, and download
 * behavior.
 */
export function usePaperWalletSetup({
  address,
  qrUrl,
  defaultName,
}: UsePaperWalletSetupProps): PaperWalletSetupSlots {
  const { t } = useLingui();
  const cardRef = useRef<HTMLDivElement>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const [customization, setCustomization] = useState<PaperWalletCustomization>(() => ({
    name: defaultName,
    website: "cosmolocal.credit",
    description: "",
    logoDataUrl: null,
  }));
  const [previewScale, setPreviewScale] = useState(PAPER_WALLET_PREVIEW_SCALE);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fallbackName = defaultName.trim() || t`Paper wallet`;
  const normalizedCustomization = useMemo<PaperWalletCustomization>(
    () => ({
      name: customization.name.trim() || fallbackName,
      website: customization.website.trim(),
      description: customization.description.trim(),
      logoDataUrl: customization.logoDataUrl,
    }),
    [customization, fallbackName],
  );

  useEffect(() => {
    const host = previewHostRef.current;
    if (!host) return;

    function updateScale() {
      const availableWidth = previewHostRef.current?.clientWidth ?? 0;
      if (availableWidth <= 0) return;

      const nextScale = Math.min(
        PAPER_WALLET_PREVIEW_MAX_SCALE,
        availableWidth / PAPER_WALLET_WIDTH,
      );
      setPreviewScale(nextScale);
    }

    updateScale();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateScale);
    observer.observe(host);

    return () => observer.disconnect();
  }, []);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: PAPER_WALLET_EXPORT_PIXEL_RATIO,
        width: PAPER_WALLET_WIDTH,
        height: PAPER_WALLET_HEIGHT,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `clc-wallet-${address.slice(2, 10)}.png`;
      a.click();
    } catch {
      setDownloadError(t`Download failed. Try a screenshot instead.`);
    } finally {
      setDownloading(false);
    }
  }

  const previewWidth = PAPER_WALLET_WIDTH * previewScale;
  const previewHeight = PAPER_WALLET_HEIGHT * previewScale;

  const card = (
    <div ref={previewHostRef} className="w-full">
      <div
        data-slot="preview-wrapper"
        style={{
          width: previewWidth,
          height: previewHeight,
          overflow: "hidden",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            width: PAPER_WALLET_WIDTH,
            height: PAPER_WALLET_HEIGHT,
            transformOrigin: "top left",
            transform: `scale(${previewScale})`,
          }}
        >
          <PaperWalletCard
            ref={cardRef}
            address={address}
            qrUrl={qrUrl}
            customization={normalizedCustomization}
          />
        </div>
      </div>
    </div>
  );

  const controls = <PaperWalletCustomizer value={customization} onChange={setCustomization} />;

  const downloadButton = (
    <div>
      <Button
        className="mt-4 h-11 w-full"
        onClick={handleDownload}
        disabled={downloading}
        aria-label={t`Download card`}
      >
        {downloading ? (
          <FiLoader className="mr-2 size-4 animate-spin" />
        ) : (
          <FiDownload className="mr-2 size-4" />
        )}
        {downloading ? t`Preparing...` : t`Download card`}
      </Button>
      {downloadError ? <p className="mt-2 text-destructive text-xs">{downloadError}</p> : null}
    </div>
  );

  return { card, controls, downloadButton };
}
