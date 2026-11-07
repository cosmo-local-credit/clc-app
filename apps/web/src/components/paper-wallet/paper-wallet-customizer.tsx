import { Trans } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { usePaperWalletCustomizer } from "#/features/onboarding/hooks/use-paper-wallet-customizer";
import type { PaperWalletCustomization } from "./paper-wallet-types";

type Props = {
  value: PaperWalletCustomization;
  onChange: (next: PaperWalletCustomization) => void;
};

/**
 * The paper wallet card's customization fields: name, website, description,
 * and a logo upload with a reset. The Save your card screen shows them in its
 * Customize sheet, over the live preview.
 */
export function PaperWalletCustomizer({ value, onChange }: Props) {
  const { logoError, logoFileName, fileInputRef, setField, handleLogoFile, resetLogo } =
    usePaperWalletCustomizer({ value, onChange });

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <label htmlFor="pw-name" className="font-medium text-foreground text-sm">
          <Trans>Name on card</Trans>
        </label>
        <Input
          id="pw-name"
          maxLength={32}
          value={value.name}
          onChange={(event) => setField("name", event.target.value)}
        />
      </div>

      {/* Website */}
      <div className="space-y-2">
        <label htmlFor="pw-website" className="font-medium text-foreground text-sm">
          <Trans>Website</Trans>
        </label>
        <Input
          id="pw-website"
          maxLength={40}
          value={value.website}
          onChange={(event) => setField("website", event.target.value)}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="pw-description" className="font-medium text-foreground text-sm">
          <Trans>Description</Trans>
        </label>
        <textarea
          id="pw-description"
          rows={2}
          maxLength={80}
          value={value.description}
          onChange={(event) => setField("description", event.target.value)}
          className="w-full rounded-none border border-border bg-card px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
        />
      </div>

      {/* Logo upload */}
      <div className="space-y-2">
        <label htmlFor="pw-logo-input" className="font-medium text-foreground text-sm">
          <Trans>Logo</Trans>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" tap onClick={() => fileInputRef.current?.click()}>
            <Trans>Upload logo</Trans>
          </Button>
          <input
            id="pw-logo-input"
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              if (event.target) handleLogoFile(event.target);
            }}
          />

          {value.logoDataUrl && logoFileName ? (
            <span className="max-w-full truncate text-muted-foreground text-xs">
              {logoFileName}
            </span>
          ) : null}

          {value.logoDataUrl ? (
            <Button variant="link" tap className="text-destructive" onClick={resetLogo}>
              <Trans>Reset logo</Trans>
            </Button>
          ) : null}
        </div>

        {logoError ? <p className="text-destructive text-xs">{logoError}</p> : null}
      </div>
    </div>
  );
}
