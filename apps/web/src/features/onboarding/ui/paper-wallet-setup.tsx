import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { FiDownload, FiPrinter, FiShare2 } from "react-icons/fi";

import { Button } from "#/components/ui/button";
import {
  type PaperWalletSetupState,
  type UsePaperWalletSetupProps,
  usePaperWalletSetupState,
} from "#/features/onboarding/hooks/use-paper-wallet-setup";
import { PaperWalletCard } from "./paper-wallet-card";
import { PAPER_WALLET_HEIGHT, PAPER_WALLET_WIDTH } from "./paper-wallet-constants";
import { PaperWalletCustomizer } from "./paper-wallet-customizer";

export type PaperWalletSetupSlots = {
  card: ReactNode;
  controls: ReactNode;
  downloadButton: ReactNode;
};

/** The phone's card preview, scaled to the column it sits in. */
export function PaperWalletPreview({ setup }: { setup: PaperWalletSetupState }) {
  const { previewHostRef, previewScale, cardRef, address, qrUrl, normalizedCustomization } = setup;
  const previewWidth = PAPER_WALLET_WIDTH * previewScale;
  const previewHeight = PAPER_WALLET_HEIGHT * previewScale;
  return (
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
}

/** The phone's save actions: Download on its own row, Print and Share under it. */
export function PaperWalletSaveActions({ setup }: { setup: PaperWalletSetupState }) {
  const { t } = useLingui();
  const {
    downloaded,
    handleDownload,
    handlePrintSheet,
    handleShare,
    busy,
    downloading,
    printing,
    sharing,
    shareSupported,
    downloadError,
    savedCardUrl,
  } = setup;
  return (
    <div>
      {/* Download on its own row: "Download card" beside Print outgrows a 360px
          row in French, Dutch, Portuguese, Serbian and Ukrainian. Print and
          Share card, both short, share the row under it. */}
      <div className="flex flex-col gap-3">
        <Button
          variant={downloaded ? "outline" : "default"}
          tap
          className="w-full"
          onClick={handleDownload}
          disabled={busy}
          pending={downloading}
          aria-label={t`Download card`}
        >
          <FiDownload className="size-4" />
          {downloading ? t`Preparing…` : t`Download card`}
        </Button>
        <div className={shareSupported ? "grid grid-cols-2 gap-3" : "grid"}>
          <Button
            variant="outline"
            tap
            className="w-full min-w-0"
            onClick={() => void handlePrintSheet()}
            disabled={busy}
            pending={printing}
            aria-label={t`Save printable A4 sheet`}
          >
            <FiPrinter className="size-4" />
            {t`Print`}
          </Button>
          {shareSupported ? (
            <Button
              variant="outline"
              tap
              className="w-full min-w-0"
              onClick={() => void handleShare()}
              disabled={busy}
              pending={sharing}
            >
              <FiShare2 className="size-4" />
              {sharing ? t`Preparing…` : t`Share card`}
            </Button>
          ) : null}
        </div>
      </div>
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
}

/**
 * The phone's paper wallet slots over {@link usePaperWalletSetupState}: the
 * preview, the customization fields the screen puts in a sheet, and the
 * save actions.
 */
export function usePaperWalletSetup(props: UsePaperWalletSetupProps): PaperWalletSetupSlots {
  const setup = usePaperWalletSetupState(props);
  return {
    card: <PaperWalletPreview setup={setup} />,
    controls: (
      <PaperWalletCustomizer value={setup.customization} onChange={setup.setCustomization} />
    ),
    downloadButton: <PaperWalletSaveActions setup={setup} />,
  };
}
