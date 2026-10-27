import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { DeskInspector } from "#/desktop/ui/inspector";
import { usePaperWalletCustomizer } from "#/features/onboarding/hooks/use-paper-wallet-customizer";
import type { PaperWalletSetupState } from "#/features/onboarding/hooks/use-paper-wallet-setup";
import { PaperWalletCard } from "#/features/onboarding/ui/paper-wallet-card";
import {
  PAPER_WALLET_HEIGHT,
  PAPER_WALLET_WIDTH,
} from "#/features/onboarding/ui/paper-wallet-constants";

/**
 * The card itself, scaled to its column. It is the node the download, print
 * and share actions capture, so it updates as the customization changes.
 */
export function PaperWalletCardTile({
  setup,
  footer,
}: {
  setup: PaperWalletSetupState;
  footer?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.55);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      if (host.clientWidth > 0) setScale(Math.min(1, host.clientWidth / PAPER_WALLET_WIDTH));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid min-w-0 content-start gap-3 border border-border bg-card p-4">
      <div ref={hostRef} className="min-w-0">
        <div
          style={{
            width: PAPER_WALLET_WIDTH * scale,
            height: PAPER_WALLET_HEIGHT * scale,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: PAPER_WALLET_WIDTH,
              height: PAPER_WALLET_HEIGHT,
              transformOrigin: "top left",
              transform: `scale(${scale})`,
            }}
          >
            <PaperWalletCard
              ref={setup.cardRef}
              address={setup.address}
              qrUrl={setup.qrUrl}
              customization={setup.normalizedCustomization}
            />
          </div>
        </div>
      </div>
      {footer}
    </div>
  );
}

/** Customize, in the inspector beside the page; the card preview follows each edit. */
export function PaperWalletCustomizeInspector({
  setup,
  onClose,
}: {
  setup: PaperWalletSetupState;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const value = setup.customization;
  const { logoError, logoFileName, fileInputRef, setField, handleLogoFile, resetLogo } =
    usePaperWalletCustomizer({ value, onChange: setup.setCustomization });

  return (
    <DeskInspector
      title={<Trans>Customize</Trans>}
      onClose={onClose}
      className="fixed inset-y-0 end-0 z-40"
      footer={
        <Button className="w-full" onClick={onClose}>
          <Trans>Done</Trans>
        </Button>
      }
    >
      <Field label={t`Name on wallet`} htmlFor="desk-pw-name">
        <Input
          id="desk-pw-name"
          maxLength={32}
          value={value.name}
          onChange={(event) => setField("name", event.target.value)}
        />
      </Field>
      <Field label={t`Website`} htmlFor="desk-pw-website">
        <Input
          id="desk-pw-website"
          dir="ltr"
          maxLength={40}
          value={value.website}
          onChange={(event) => setField("website", event.target.value)}
        />
      </Field>
      <Field label={t`Description`} htmlFor="desk-pw-description">
        <Textarea
          id="desk-pw-description"
          rows={2}
          maxLength={80}
          value={value.description}
          onChange={(event) => setField("description", event.target.value)}
        />
      </Field>
      <div className="grid gap-1.5">
        <label htmlFor="desk-pw-logo" className="font-medium text-sm">
          <Trans>Logo</Trans>
        </label>
        <input
          id="desk-pw-logo"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => handleLogoFile(event.target)}
        />
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Trans>Upload logo</Trans>
          </Button>
          {value.logoDataUrl && logoFileName ? (
            <span className="min-w-0 truncate text-muted-foreground text-xs">{logoFileName}</span>
          ) : null}
          {value.logoDataUrl ? (
            <Button variant="ghost" className="ms-auto text-destructive" onClick={resetLogo}>
              <Trans>Reset logo</Trans>
            </Button>
          ) : null}
        </div>
        {logoError ? <p className="text-destructive text-xs">{logoError}</p> : null}
      </div>
    </DeskInspector>
  );
}
