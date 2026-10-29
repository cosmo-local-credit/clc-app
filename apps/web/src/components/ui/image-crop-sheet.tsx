import type { ImagePurpose } from "@clc/api/features/images/policy";
import { MAX_CROP_ZOOM } from "@clc/core/features/images/crop";
import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import { ImageCropSurface, useImageCrop } from "#/components/ui/image-crop";
import {
  SheetBackdrop,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { Slider } from "#/components/ui/slider";

/**
 * Frames a chosen photo before it is uploaded.
 *
 * Opened by the picker rather than replacing it: choosing a file and framing it
 * are two decisions, and a phone's file dialog already owns the first. The frame
 * is the aspect the image is stored and displayed at, so what the person drags
 * into view is what everyone else will see — the storage service resizes but
 * never crops, and without this an avatar taken in landscape arrives letterboxed.
 *
 * Drag to pan, pinch or the slider to zoom, arrow keys for both — the surface is
 * focusable and the slider is a real range input, so nothing here needs a
 * pointing device.
 */
export function ImageCropSheet({
  file,
  purpose,
  onCancel,
  onCropped,
}: {
  /** The chosen file. Null closes the sheet. */
  file: File | null;
  purpose: ImagePurpose;
  onCancel: () => void;
  onCropped: (cropped: File) => void;
}) {
  const { t } = useLingui();
  const crop = useImageCrop({ file, purpose, onCropped });
  const { source, zoom, changeZoom, working, applyCrop } = crop;

  return (
    <SheetRoot open={file !== null} onOpenChange={(next) => !next && onCancel()}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>
              <Trans>Frame your photo</Trans>
            </SheetTitle>
          </SheetHeader>

          <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <ImageCropSurface crop={crop} className="h-64" />

            <div className="mt-4 flex items-center gap-3">
              <span className="text-muted-foreground text-xs">
                <Trans>Zoom</Trans>
              </span>
              <Slider
                aria-label={t`Zoom`}
                min={1}
                max={MAX_CROP_ZOOM}
                step={0.01}
                value={zoom}
                onValueChange={changeZoom}
                disabled={!source}
              />
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <Button
                type="button"
                tap
                className="w-full"
                disabled={!source}
                pending={working}
                onClick={() => void applyCrop()}
              >
                {working ? t`Preparing…` : t`Use photo`}
              </Button>
              <Button
                type="button"
                variant="outline"
                tap
                className="w-full"
                disabled={working}
                onClick={onCancel}
              >
                <Trans>Choose another</Trans>
              </Button>
            </div>
          </div>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
