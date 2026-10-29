import { useLingui } from "@lingui/react/macro";
import { useId } from "react";
import { FaUser } from "react-icons/fa";

import { Button } from "#/components/ui/button";
import { ImageCropSheet } from "#/components/ui/image-crop-sheet";
import { PhotoSourcePicker } from "#/components/ui/photo-source-picker";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { useAvatarPicker } from "#/components/ui/use-avatar-picker";

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
  const { shown, error, pending, select, remove, cancelCrop, acceptCrop } = useAvatarPicker({
    value,
    onChange,
    currentUrl,
  });

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
          ariaDescribedBy={required || validationError ? validationErrorId : undefined}
        />

        {value ? (
          <Button
            variant="link"
            tap
            disabled={disabled}
            onClick={remove}
            className="text-muted-foreground"
          >
            {t`Remove`}
          </Button>
        ) : required || validationError ? (
          <p
            id={validationErrorId}
            // Muted until a submit finds the photo missing: a fresh form opens with no errors.
            className={
              validationError ? "text-destructive text-xs" : "text-muted-foreground text-xs"
            }
            role={validationError ? "alert" : undefined}
          >
            {validationError ?? t`Required`}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">{t`Optional`}</p>
        )}

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        {value && validationError ? (
          <p id={validationErrorId} className="text-destructive text-xs" role="alert">
            {validationError}
          </p>
        ) : null}
      </div>

      <ImageCropSheet
        file={pending}
        purpose="profile.avatar"
        onCancel={cancelCrop}
        onCropped={acceptCrop}
      />
    </div>
  );
}
