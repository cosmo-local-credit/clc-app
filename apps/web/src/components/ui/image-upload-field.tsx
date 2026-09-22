import { checkImageFile, IMAGE_POLICIES } from "@clc/api/features/images/policy";
import type { ImagePurpose } from "@clc/api/features/images/policy";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { FaCamera, FaTrash } from "react-icons/fa";

import { Button } from "#/components/ui/button";
import { ImageCropSheet } from "#/components/ui/image-crop-sheet";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { useImageUpload } from "#/features/images/use-image-upload";

/**
 * Picks a photo and uploads it, so the value is the stored URL.
 *
 * The mobile counterpart of the console's field, and deliberately the same
 * shape — a purpose decides the folder, the width and the crop; the caller only
 * ever holds a URL. `AvatarPicker` beside it is the other pattern: it chooses
 * without uploading, because onboarding collects a photo before a session exists
 * and the upload service needs one. Everywhere a session already exists, this is
 * the field.
 *
 * Uploading on selection rather than on save is what makes replace work the same
 * as first upload, and it keeps the sequencing out of the form: by submit time
 * there is a URL or there is nothing. Storage keys are content-addressed and the
 * service never deletes, so a photo chosen for a save the user then abandons
 * costs one orphaned object — a better trade than carrying a `File` through a
 * form and re-deriving the upload on every submit attempt.
 * The native picker accepts image/* so mobile browsers can offer the camera;
 * checkImageFile still limits the formats and size sent to storage.
 */
export function ImageUploadField({
  label,
  hint,
  purpose,
  value,
  onChange,
  onBusyChange,
  disabled,
}: {
  label: string;
  hint?: string;
  purpose: ImagePurpose;
  /** The stored URL, or null when there is no image. */
  value: string | null;
  onChange: (url: string | null) => void;
  /**
   * Whether an upload or a framing step is in flight.
   *
   * The parent needs this because selection and save are separate actions: the
   * file uploads on selection, so a Save pressed while that is in flight would
   * persist the value the form held before.
   */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useImageUpload();
  const [rejection, setRejection] = useState<string | null>(null);
  /** Chosen, awaiting a frame. Purposes with no fixed shape skip this. */
  const [pending, setPending] = useState<File | null>(null);

  const policy = IMAGE_POLICIES[purpose];
  const round = policy.preview === "circle";
  const wide = policy.aspect !== undefined && policy.aspect !== 1;

  // A file chosen and not yet cropped has not produced a URL either, so it counts
  // as busy.
  const inFlight = upload.isPending || pending !== null;
  const busy = inFlight || disabled;

  // Seeded false rather than from the first render: a field that mounts while an
  // upload is already in flight has to report it, and comparing against its own
  // initial value would treat that as "no change".
  const reportedBusy = useRef(false);
  useEffect(() => {
    if (reportedBusy.current === inFlight) return;
    reportedBusy.current = inFlight;
    onBusyChange?.(inFlight);
  }, [inFlight, onBusyChange]);

  function select(file: File | undefined) {
    if (!file) return;

    const check = checkImageFile(file);
    if (!check.ok) {
      setRejection(
        check.reason === "unsupported-type"
          ? t`Choose a JPEG, PNG or WebP image.`
          : t`That image is too large. Choose one under 8 MB.`,
      );
      return;
    }

    setRejection(null);
    upload.reset();

    // A purpose with a display shape is framed first, so what is stored is what
    // every screen will show. One without uploads as it arrives.
    if (policy.aspect) {
      setPending(file);
      return;
    }
    void send(file);
  }

  async function send(file: File) {
    try {
      // A fresh id per attempt: the object key is derived from it, so reusing one
      // across two different files would be the only way to overwrite an object
      // this service treats as immutable.
      const uploaded = await upload.mutateAsync({
        file,
        purpose,
        uploadId: crypto.randomUUID().replaceAll("-", ""),
      });
      onChange(uploaded.url);
    } catch {
      // Surfaced through upload.isError below; the previous value stays.
    }
  }

  const error = rejection ?? (upload.isError ? t`Couldn't upload that photo. Try again.` : null);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>

      <div className="flex items-start gap-3">
        <div
          // `relative` is required: ProgressiveImage's skeleton is absolutely
          // positioned and would otherwise anchor to the page, not this box.
          className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-border bg-card ${
            round ? "size-20 rounded-full" : wide ? "h-20 w-32" : "size-20"
          }`}
        >
          {value ? (
            <ProgressiveImage src={value} alt="" className="size-full object-cover" />
          ) : (
            <FaCamera aria-hidden className="size-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex min-w-0 flex-col items-start gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label={label}
            disabled={busy}
            onChange={(event) => {
              select(event.target.files?.[0]);
              // Cleared so choosing the same file twice still fires a change.
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="h-11 bg-card"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <FaCamera aria-hidden className="mr-2 size-4" />
            {upload.isPending ? t`Uploading…` : value ? t`Update photo` : t`Add photo`}
          </Button>

          {value ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 bg-card"
              disabled={busy}
              onClick={() => {
                setRejection(null);
                upload.reset();
                onChange(null);
              }}
            >
              <FaTrash aria-hidden className="mr-2 size-4" />
              {t`Remove`}
            </Button>
          ) : hint ? (
            <p className="text-muted-foreground text-xs">{hint}</p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <ImageCropSheet
        file={pending}
        purpose={purpose}
        onCancel={() => setPending(null)}
        onCropped={(cropped) => {
          setPending(null);
          void send(cropped);
        }}
      />
    </div>
  );
}
