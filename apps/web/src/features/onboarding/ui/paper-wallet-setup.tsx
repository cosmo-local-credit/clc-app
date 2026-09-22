import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiLoader, FiShare2 } from "react-icons/fi";

import { Button } from "#/components/ui/button";
import { PaperWalletCard } from "./paper-wallet-card";
import {
  PAPER_WALLET_HEIGHT,
  PAPER_WALLET_PREVIEW_MAX_SCALE,
  PAPER_WALLET_PREVIEW_SCALE,
  PAPER_WALLET_WIDTH,
} from "./paper-wallet-constants";
import { PaperWalletCustomizer } from "./paper-wallet-customizer";
import { exportPaperWallet } from "./paper-wallet-export";
import type { PaperWalletCustomization } from "./paper-wallet-types";

/**
 * Whether the app is running as an installed PWA, where the anchor fallback is
 * known to be silently ignored on iOS. Only there is the rendered PNG worth showing:
 * the preview above it is live DOM and cannot be long-pressed into Photos.
 */
function isIosInstalledApp(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type UsePaperWalletSetupProps = {
  address: `0x${string}`;
  qrUrl: string;
  defaultName: string;
  downloadDisabled?: boolean;
  /** Called after a download starts, a share succeeds, or an iOS save image is shown. */
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
  const [shareSupported, setShareSupported] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  /** The rendered PNG, shown for long-press saving in an installed iOS PWA. */
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
  const contentRef = useRef({ qrUrl, customization: normalizedCustomization });
  contentRef.current = { qrUrl, customization: normalizedCustomization };
  const preparedRef = useRef<{
    file: File;
    fileName: string;
    qrUrl: string;
    customization: PaperWalletCustomization;
  } | null>(null);

  useEffect(() => {
    const probe = new File([""], "wallet.png", { type: "image/png" });
    setShareSupported(navigator.canShare?.({ files: [probe] }) === true);
  }, []);

  useEffect(() => {
    return () => {
      if (savedCardUrl) URL.revokeObjectURL(savedCardUrl);
    };
  }, [savedCardUrl]);

  useEffect(() => {
    setSavedCardUrl(null);
    preparedRef.current = null;
  }, [qrUrl, normalizedCustomization]);

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

  async function prepareCard(): Promise<{ file: File; fileName: string }> {
    if (!cardRef.current) throw new Error("Paper wallet card is missing");
    const content = contentRef.current;
    const prepared = preparedRef.current;
    if (prepared?.qrUrl === content.qrUrl && prepared.customization === content.customization) {
      return prepared;
    }
    const fileName = `clc-wallet-${address.slice(2, 10)}.png`;
    const blob = await exportPaperWallet(cardRef.current, content.qrUrl);
    if (
      contentRef.current.qrUrl !== content.qrUrl ||
      contentRef.current.customization !== content.customization
    ) {
      throw new Error("Paper wallet changed while exporting");
    }
    const result = { file: new File([blob], fileName, { type: "image/png" }), fileName };
    preparedRef.current = { ...result, ...content };
    return result;
  }

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    setDownloadError(null);
    setSavedCardUrl(null);
    try {
      const { file, fileName } = await prepareCard();
      const url = URL.createObjectURL(file);

      if (isIosInstalledApp()) {
        setSavedCardUrl(url);
        onDownloaded?.();
        return;
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      onDownloaded?.();
    } catch {
      setDownloadError(t`Could not save the paper wallet. Try again.`);
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    if (!cardRef.current) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const { file } = await prepareCard();
      if (!navigator.canShare?.({ files: [file] })) {
        throw new Error("File sharing unavailable");
      }
      await navigator.share({ files: [file] });
      onDownloaded?.();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setDownloadError(t`Could not share the paper wallet. Try downloading it instead.`);
      }
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
      {shareSupported ? (
        <Button
          variant="outline"
          className="mt-3 h-11 w-full"
          onClick={() => void handleShare()}
          disabled={downloading || downloadDisabled}
        >
          <FiShare2 className="mr-2 size-4" />
          {t`Share card`}
        </Button>
      ) : null}
      {downloadError ? <p className="text-destructive mt-2 text-xs">{downloadError}</p> : null}
      {savedCardUrl ? (
        <div className="mt-3 space-y-2 border border-border bg-card p-3">
          <p className="text-muted-foreground text-xs">
            {t`Press and hold the image below, then choose Save Image.`}
          </p>
          <img src={savedCardUrl} alt={t`Paper wallet card`} className="w-full" />
        </div>
      ) : null}
    </div>
  );

  return { card, controls, downloadButton };
}
