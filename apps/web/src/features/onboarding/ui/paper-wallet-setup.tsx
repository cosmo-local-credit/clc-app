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

/**
 * iOS ignores an anchor's `download` attribute inside an installed PWA: the tap
 * does nothing at all, which is what made the button look broken there. The
 * share sheet is the platform's own "Save Image", so it is tried first wherever
 * the browser will take a file — Android included, where it is also the better
 * destination — and the anchor stays the desktop path.
 */
async function shareCard(file: File): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file] });
    return true;
  } catch (error) {
    // A dismissed sheet is not a failure. The person was offered the save and
    // declined it, so falling through to another mechanism would be noise.
    return error instanceof DOMException && error.name === "AbortError";
  }
}

/**
 * Whether the app is running as an installed PWA, where the anchor fallback is
 * known to be silently ignored. Only there is the rendered PNG worth showing:
 * the preview above it is live DOM and cannot be long-pressed into Photos.
 */
function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** Decoded here rather than fetched: a `fetch` of a data URL is a needless round trip. */
function pngFileFromDataUrl(dataUrl: string, fileName: string): File {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: "image/png" });
}

export type UsePaperWalletSetupProps = {
  address: `0x${string}`;
  qrUrl: string;
  defaultName: string;
  downloadDisabled?: boolean;
  /** Called only after the image has been rendered and its browser download opened. */
  onDownloaded?: () => void;
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
  downloadDisabled = false,
  onDownloaded,
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
  /** The rendered PNG, shown only where neither the share sheet nor the anchor works. */
  const [savedCardUrl, setSavedCardUrl] = useState<string | null>(null);
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
    setSavedCardUrl(null);
    const fileName = `clc-wallet-${address.slice(2, 10)}.png`;
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: PAPER_WALLET_EXPORT_PIXEL_RATIO,
        width: PAPER_WALLET_WIDTH,
        height: PAPER_WALLET_HEIGHT,
        backgroundColor: "#ffffff",
      });

      if (await shareCard(pngFileFromDataUrl(dataUrl, fileName))) {
        onDownloaded?.();
        return;
      }

      if (isInstalledApp()) {
        setSavedCardUrl(dataUrl);
        onDownloaded?.();
        return;
      }

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      a.click();
      onDownloaded?.();
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
        disabled={downloading || downloadDisabled}
        aria-label={t`Download card`}
      >
        {downloading ? (
          <FiLoader className="mr-2 size-4 animate-spin" />
        ) : (
          <FiDownload className="mr-2 size-4" />
        )}
        {downloading ? t`Preparing...` : t`Download card`}
      </Button>
      {downloadError ? <p className="text-destructive mt-2 text-xs">{downloadError}</p> : null}
      {savedCardUrl ? (
        <div className="mt-3 space-y-2 border border-border bg-card p-3">
          <p className="text-muted-foreground text-xs">
            {t`Press and hold the card below, then choose Save to Photos.`}
          </p>
          <img src={savedCardUrl} alt={t`Paper wallet card`} className="w-full" />
        </div>
      ) : null}
    </div>
  );

  return { card, controls, downloadButton };
}
