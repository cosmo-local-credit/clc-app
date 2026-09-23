import { useRef, useState } from "react";
import { HiOutlinePhotograph, HiOutlineX } from "react-icons/hi";

import { SectionLabel } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { PaperWalletCardDesign } from "./paper-wallet-card";

const LOGO_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";
/** The logo is embedded in every card of the PDF, so keep it small. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * The parts of the card that are the same on every wallet in a batch.
 *
 * The logo is read into a data URL and kept in the page: it is printed, never
 * uploaded, so it needs no storage and leaves no trace once the batch is done.
 */
export function CardDesignFields({
  value,
  onChange,
}: {
  value: PaperWalletCardDesign;
  onChange: (next: PaperWalletCardDesign) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  function pickLogo(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    if (!LOGO_TYPES.split(",").includes(file.type)) {
      setLogoError("Use a PNG, JPEG, WebP or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("The logo must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChange({ ...value, logoDataUrl: reader.result });
    };
    reader.onerror = () => setLogoError("The logo could not be read.");
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <SectionLabel>Card design</SectionLabel>
      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center border border-border bg-background">
            {value.logoDataUrl ? (
              <img src={value.logoDataUrl} alt="Custom logo" className="size-full object-contain" />
            ) : (
              <span className="text-muted-foreground text-xs">CLC</span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <HiOutlinePhotograph />
            {value.logoDataUrl ? "Replace logo" : "Upload logo"}
          </Button>
          {value.logoDataUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...value, logoDataUrl: null })}
            >
              <HiOutlineX />
              Use CLC logo
            </Button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept={LOGO_TYPES}
            className="hidden"
            aria-label="Logo file"
            onChange={(event) => {
              pickLogo(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {logoError ? <p className="text-destructive text-xs">{logoError}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="paper-wallet-website">Website</Label>
          <Input
            id="paper-wallet-website"
            value={value.website}
            maxLength={40}
            onChange={(event) => onChange({ ...value, website: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paper-wallet-description">Tagline</Label>
          <Input
            id="paper-wallet-description"
            value={value.description}
            maxLength={80}
            placeholder="Optional"
            onChange={(event) => onChange({ ...value, description: event.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
