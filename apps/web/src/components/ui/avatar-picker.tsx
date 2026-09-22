import { checkImageFile, IMAGE_POLICIES } from "@clc/api/features/images/policy";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useId, useState } from "react";
import { FaUser } from "react-icons/fa";

import { ImageCropSheet } from "#/components/ui/image-crop-sheet";
import { PhotoSourcePicker } from "#/components/ui/photo-source-picker";
import { ProgressiveImage } from "#/components/ui/progressive-image";

type Props = {
  /** The chosen file, owned by the caller so a form can carry it between steps. */
  value: File | null;
  onChange: (file: File | null) => void;
  /** Shown instead of the placeholder when nothing new has been chosen. */
  currentUrl?: string | null;
  disabled?: boolean;
  required?: boolean;
  validationError?: string | null;
};

/**
 * Picks a profile image. Chooses only — it does not upload.
 *
 * Onboarding collects the photo on the first screen but has no session until the
 * wallet step registers the account, and the upload service needs one. So the
 * file is held here and sent once an account exists; the preview is a local
 * object URL, which is why it is revoked on every change and on unmount.
 *
 * The source sheet offers native camera capture and existing photos. The shared
 * policy still rejects formats and sizes the service cannot take.
 */
export function AvatarPicker({
  value,
  onChange,
  currentUrl,
  disabled,
  required,
  validationError,
}: Props) {
  const { t } = useLingui();
  const validationErrorId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Chosen but not yet framed. Held here so the sheet owns one job. */
  const [pending, setPending] = useState<File | null>(null);

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
    // A profile photo has a fixed display shape, so it is framed before it is
    // accepted — the picker never sets an unframed file.
    if (IMAGE_POLICIES["profile.avatar"].aspect) {
      setPending(file);
      return;
    }
    onChange(file);
  }

  const shown = previewUrl ?? currentUrl ?? null;

  return (
    <div className="flex items-center gap-4">
      {/* Round, because it is a face. Everything else here stays square. */}
      <div className="border-border bg-card relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border">
        {shown ? (
          <ProgressiveImage
            src={shown}
            alt={t`Your profile photo`}
            className="size-full object-cover"
          />
        ) : (
          <FaUser aria-hidden className="text-muted-foreground size-7" />
        )}
      </div>

      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <PhotoSourcePicker
          buttonLabel={shown ? t`Change photo` : t`Add a photo`}
          inputLabel={t`Choose a profile photo`}
          onSelect={select}
          cameraFacing="user"
          disabled={disabled}
          required={required}
          ariaInvalid={!!validationError}
          ariaDescribedBy={validationError ? validationErrorId : undefined}
        />

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
          <p className="text-muted-foreground text-xs">{required ? t`Required` : t`Optional`}</p>
        )}

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        {validationError ? (
          <p id={validationErrorId} className="text-destructive text-xs" role="alert">
            {validationError}
          </p>
        ) : null}
      </div>

      <ImageCropSheet
        file={pending}
        purpose="profile.avatar"
        onCancel={() => setPending(null)}
        onCropped={(cropped) => {
          setPending(null);
          onChange(cropped);
        }}
      />
    </div>
  );
}
