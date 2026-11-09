import { checkImageFile, type ImagePurpose } from "@clc/api/features/images/policy";
import { MAX_CROP_ZOOM } from "@clc/core/features/images/crop";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { RiDeleteBinLine, RiImageLine, RiUploadLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { ImageCropSurface, useImageCrop } from "#/components/ui/image-crop";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { Slider } from "#/components/ui/slider";
import { useImageUpload } from "#/features/images/use-image-upload";

/**
 * The desktop logo field: a 72px drop target beside an Upload button. A chosen
 * file is framed in a dialog, then uploaded, so the form only ever holds the
 * stored URL — the same contract as the phone's upload field.
 */
export function DeskLogoField({
  id,
  purpose,
  value,
  onChange,
  onBusyChange,
  disabled,
}: {
  id: string;
  purpose: ImagePurpose;
  value: string | null;
  onChange: (url: string | null) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const upload = useImageUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inFlight = upload.isPending || pending !== null;
  const busy = inFlight || disabled;

  const reportedBusy = useRef(false);
  useEffect(() => {
    if (reportedBusy.current === inFlight) return;
    reportedBusy.current = inFlight;
    onBusyChange(inFlight);
  }, [inFlight, onBusyChange]);

  async function send(file: File) {
    try {
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
    setPending(file);
  }

  const crop = useImageCrop({
    file: pending,
    purpose,
    onCropped: (cropped) => {
      setPending(null);
      void send(cropped);
    },
  });
  const error = rejection ?? (upload.isError ? t`Couldn't upload that photo. Try again.` : null);

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t`Logo`}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!busy) select(event.dataTransfer.files[0]);
          }}
          className={
            value
              ? "relative size-[72px] shrink-0 overflow-hidden border border-border bg-card"
              : `flex size-[72px] shrink-0 items-center justify-center border border-dashed bg-card text-muted-foreground ${
                  dragging ? "border-primary text-primary" : "border-foreground/25"
                }`
          }
        >
          {value ? (
            <ProgressiveImage src={value} alt="" className="size-full object-cover" />
          ) : (
            <RiImageLine aria-hidden="true" className="size-4" />
          )}
        </button>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            select(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          pending={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? null : <RiUploadLine aria-hidden="true" />}
          {upload.isPending ? <Trans>Uploading…</Trans> : <Trans>Upload</Trans>}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setRejection(null);
              upload.reset();
              onChange(null);
            }}
          >
            <RiDeleteBinLine aria-hidden="true" />
            <Trans>Remove</Trans>
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <DialogRoot open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="grid max-w-md gap-4 rounded-none bg-card shadow-none">
            <DialogTitle>
              <Trans>Frame your photo</Trans>
            </DialogTitle>
            <ImageCropSurface crop={crop} className="h-72" />
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                <Trans>Zoom</Trans>
              </span>
              <Slider
                aria-label={t`Zoom`}
                min={1}
                max={MAX_CROP_ZOOM}
                step={0.01}
                value={crop.zoom}
                onValueChange={crop.changeZoom}
                disabled={!crop.source}
              />
            </div>
            <div className="flex justify-end gap-2 border-border border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={crop.working}
                onClick={() => setPending(null)}
              >
                <Trans>Choose another</Trans>
              </Button>
              <Button
                type="button"
                disabled={!crop.source}
                pending={crop.working}
                onClick={() => void crop.applyCrop()}
              >
                {crop.working ? <Trans>Preparing…</Trans> : <Trans>Use photo</Trans>}
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </div>
  );
}
