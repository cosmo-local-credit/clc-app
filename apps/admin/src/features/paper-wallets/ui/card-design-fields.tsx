import { useRef, useState } from "react";
import { HiOutlinePhotograph, HiOutlineX } from "react-icons/hi";

import { SectionLabel } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  PAPER_WALLET_LOGO_SIZE,
  PAPER_WALLET_PIXEL_RATIO,
  type PaperWalletCardDesign,
} from "./paper-wallet-card";

const LOGO_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";
/** Bounds the decode; the stored logo is resampled far below this anyway. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** The logo box at print resolution. Anything larger is detail the sheet discards. */
const LOGO_PIXELS = PAPER_WALLET_LOGO_SIZE * PAPER_WALLET_PIXEL_RATIO;

/**
 * The logo resampled to fit `LOGO_PIXELS` square, as a PNG data URL.
 *
 * html-to-image inlines the logo into the SVG it rasterises, so an upload kept
 * at its original size — a 2 MB photo is 2.7 MB of base64 — is carried through
 * every render for no gain in print.
 */
async function resampleLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // An SVG without a width or height has no intrinsic size; fill the box.
    const width = image.naturalWidth || LOGO_PIXELS;
    const height = image.naturalHeight || LOGO_PIXELS;
    const scale = LOGO_PIXELS / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot resize the logo");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The parts of the card that are the same on every wallet in a batch.
 *
 * The logo is resampled into a data URL and kept in the page: it is printed,
 * never uploaded, so it needs no storage and leaves no trace once the batch is
 * done.
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
    resampleLogo(file).then(
      (logoDataUrl) => onChange({ ...value, logoDataUrl }),
      () => setLogoError("The logo could not be read."),
    );
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
