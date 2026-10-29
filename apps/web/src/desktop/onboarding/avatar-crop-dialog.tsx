import { MAX_CROP_ZOOM } from "@clc/core/features/images/crop";
import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { ImageCropSurface, useImageCrop } from "#/components/ui/image-crop";
import { Slider } from "#/components/ui/slider";

/** Framing the profile photo, in a dialog over the setup page. */
export function AvatarCropDialog({
  file,
  onCancel,
  onCropped,
}: {
  /** The chosen file. Null closes the dialog. */
  file: File | null;
  onCancel: () => void;
  onCropped: (cropped: File) => void;
}) {
  const { t } = useLingui();
  const crop = useImageCrop({ file, purpose: "profile.avatar", onCropped });

  return (
    <DialogRoot open={file !== null} onOpenChange={(next) => !next && onCancel()}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="grid w-110 max-w-[calc(100vw-3rem)] gap-4 rounded-none bg-card p-5 shadow-none">
          <DialogTitle>
            <Trans>Frame your photo</Trans>
          </DialogTitle>
          <ImageCropSurface crop={crop} className="h-80" />
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-xs">
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
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={crop.working} onClick={onCancel}>
              <Trans>Choose another</Trans>
            </Button>
            <Button
              disabled={!crop.source}
              pending={crop.working}
              onClick={() => void crop.applyCrop()}
            >
              {crop.working ? t`Preparing…` : t`Use photo`}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
