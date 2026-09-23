import {
  PAPER_WALLET_CARD_HEIGHT,
  PAPER_WALLET_CARD_WIDTH,
} from "@clc/core/features/wallet/paper-wallet-sheet";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { SectionLabel } from "#/components/admin/section-heading";
import { PaperWalletCard, type PaperWalletCardDesign } from "./paper-wallet-card";

const SAMPLE_ADDRESS = "0x0000000000000000000000000000000000000000";
const PREVIEW_SCALE = 0.6;

/** A card with placeholder data, so the operator can check the design before issuing. */
export function CardPreview({ name, design }: { name: string; design: PaperWalletCardDesign }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    void QRCode.toDataURL("https://cosmolocal.credit/?w=preview", { margin: 0, width: 256 }).then(
      setQrDataUrl,
    );
  }, []);

  return (
    <div className="space-y-3">
      <SectionLabel>Preview</SectionLabel>
      <div
        className="border border-dashed border-border bg-white"
        style={{
          width: PAPER_WALLET_CARD_WIDTH * PREVIEW_SCALE + 2,
          height: PAPER_WALLET_CARD_HEIGHT * PREVIEW_SCALE + 2,
        }}
      >
        <div
          style={{
            transform: `scale(${PREVIEW_SCALE})`,
            transformOrigin: "top left",
            width: PAPER_WALLET_CARD_WIDTH,
          }}
        >
          <PaperWalletCard
            address={SAMPLE_ADDRESS}
            name={name}
            design={design}
            qrDataUrl={qrDataUrl}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Printed at 85.6 × 54 mm, ten to an A4 sheet, with crop marks for a trimmer. Print at 100%
        scale (not “fit to page”).
      </p>
    </div>
  );
}
