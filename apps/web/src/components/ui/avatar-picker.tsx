import { checkImageFile } from "@clc/api/features/images/policy";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { FaCamera, FaUser } from "react-icons/fa6";

import { Button } from "#/components/ui/button";

type Props = {
  /** The chosen file, owned by the caller so a form can carry it between steps. */
  value: File | null;
  onChange: (file: File | null) => void;
  /** Shown instead of the placeholder when nothing new has been chosen. */
  currentUrl?: string | null;
  disabled?: boolean;
};

/**
 * Picks a profile image. Chooses only — it does not upload.
 *
 * Onboarding collects the photo on the first screen but has no session until the
 * wallet step registers the account, and the upload service needs one. So the
 * file is held here and sent once an account exists; the preview is a local
 * object URL, which is why it is revoked on every change and on unmount.
 *
 * The accept list and the size ceiling come from the shared policy rather than
 * being retyped, so a file this control admits is one the service will take.
 */
export function AvatarPicker({ value, onChange, currentUrl, disabled }: Props) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function select(file: File | undefined) {
    if (!file) return;

    const check = checkImageFile(file);
    if (!check.ok) {
      setError(
        check.reason === "unsupported-type"
          ? t`Choose a JPEG, PNG or WebP image.`
          : t`That image is too large. Choose one under 8 MB.`,
      );
      onChange(null);
      return;
    }

    setError(null);
    onChange(file);
  }

  const shown = previewUrl ?? currentUrl ?? null;

  return (
    <div className="flex items-center gap-4">
      {/* Round, because it is a face. Everything else here stays square. */}
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
        {shown ? (
          <img src={shown} alt={t`Your profile photo`} className="size-full object-cover" />
        ) : (
          <FaUser aria-hidden className="size-7 text-muted-foreground" />
        )}
      </div>

      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label={t`Choose a profile photo`}
          onChange={(e) => {
            select(e.target.files?.[0]);
            // Cleared so choosing the same file twice still fires a change.
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="h-11 bg-card"
        >
          <FaCamera aria-hidden className="mr-2 size-4" />
          {shown ? t`Change photo` : t`Add a photo`}
        </Button>

        {value ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setError(null);
              onChange(null);
            }}
            className="text-muted-foreground text-xs underline-offset-4 hover:underline"
          >
            {t`Remove`}
          </button>
        ) : (
          <p className="text-muted-foreground text-xs">{t`Optional`}</p>
        )}

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </div>
  );
}
