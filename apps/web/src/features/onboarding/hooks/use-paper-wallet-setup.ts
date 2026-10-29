import { useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  PAPER_WALLET_PREVIEW_MAX_SCALE,
  PAPER_WALLET_PREVIEW_SCALE,
  PAPER_WALLET_WIDTH,
} from "#/features/onboarding/ui/paper-wallet-constants";
import {
  exportPaperWallet,
  exportPaperWalletSheet,
} from "#/features/onboarding/ui/paper-wallet-export";
import type { PaperWalletCustomization } from "#/features/onboarding/ui/paper-wallet-types";

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
  /** Once saved, Download steps back to outline so the screen's own Continue leads. */
  downloaded?: boolean;
  /**
   * Called after a download starts (card or A4 sheet), a share succeeds, or an
   * iOS save image is shown.
   */
  onDownloaded?: () => void;
};

/**
 * Shared paper wallet screen logic: the card's customization, the export ref,
 * and the download, print-sheet and share handlers. Screens draw the preview,
 * the customization fields and the actions from it.
 */
export function usePaperWalletSetupState({
  address,
  qrUrl,
  defaultName,
  downloadDisabled = false,
  downloaded = false,
  onDownloaded,
}: UsePaperWalletSetupProps) {
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
  const [printing, setPrinting] = useState(false);
  const [printingCard, setPrintingCard] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  /** The rendered PNG, shown for long-press saving in an installed iOS PWA. */
  const [savedCardUrl, setSavedCardUrl] = useState<string | null>(null);
  const fallbackName = defaultName.trim() || t`Sign-in card`;
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
    if (!cardRef.current) throw new Error("Sign-in card is missing");
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
      throw new Error("Sign-in card changed while exporting");
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
      setDownloadError(t`Could not save the sign-in card. Try again.`);
    } finally {
      setDownloading(false);
    }
  }

  /**
   * Saves the card on an A4 sheet with cut marks, for printing later. It is a
   * download, not a print: the holder may not be near a printer now.
   */
  async function handlePrintSheet() {
    if (!cardRef.current) return;
    setPrinting(true);
    setDownloadError(null);
    try {
      const fileName = `clc-wallet-${address.slice(2, 10)}-a4.pdf`;
      const blob = await exportPaperWalletSheet(cardRef.current, contentRef.current.qrUrl);
      const file = new File([blob], fileName, { type: "application/pdf" });

      // An installed iOS app ignores download anchors; the share sheet offers
      // Save to Files and Print instead.
      if (isIosInstalledApp() && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        onDownloaded?.();
        return;
      }

      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      onDownloaded?.();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setDownloadError(t`Could not save the printable sheet. Try again.`);
      }
    } finally {
      setPrinting(false);
    }
  }

  /**
   * Prints the card at bank-card size through the browser's own dialog, from a
   * frame the page never shows. A printed card is a saved card.
   */
  async function handlePrint() {
    if (!cardRef.current) return;
    setPrintingCard(true);
    setDownloadError(null);
    try {
      const { file, fileName } = await prepareCard();
      const url = URL.createObjectURL(file);
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
      frame.srcdoc = `<!doctype html><title>${fileName}</title><style>@page{margin:15mm}body{margin:0}img{width:85.6mm}</style><img src="${url}" alt="">`;
      await new Promise<void>((resolve) => {
        frame.onload = () => resolve();
        document.body.appendChild(frame);
      });
      await frame.contentDocument?.querySelector("img")?.decode();
      frame.contentWindow?.print();
      onDownloaded?.();
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch {
      setDownloadError(t`Could not save the printable sheet. Try again.`);
    } finally {
      setPrintingCard(false);
    }
  }

  async function handleShare() {
    if (!cardRef.current) return;
    setSharing(true);
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
        setDownloadError(t`Could not share the sign-in card. Try downloading it instead.`);
      }
    } finally {
      setSharing(false);
    }
  }

  const busy = downloading || printing || printingCard || sharing || downloadDisabled;

  return {
    address,
    qrUrl,
    cardRef,
    previewHostRef,
    previewScale,
    customization,
    setCustomization,
    normalizedCustomization,
    downloaded,
    downloading,
    printing,
    printingCard,
    sharing,
    shareSupported,
    busy,
    downloadError,
    savedCardUrl,
    handleDownload,
    handlePrintSheet,
    handlePrint,
    handleShare,
  };
}

export type PaperWalletSetupState = ReturnType<typeof usePaperWalletSetupState>;
