import { IMAGE_POLICIES, type ImagePurpose } from "@clc/api/features/images/policy";
import {
  clampOffset,
  clampZoom,
  coverScale,
  cropRect,
  fitViewport,
  MAX_CROP_ZOOM,
  type Offset,
  type Size,
} from "@clc/core/features/images/crop";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { Slider } from "#/components/ui/slider";
import { cropToFile } from "#/lib/crop-image";

const PAN_STEP = 16;

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
  const policy = IMAGE_POLICIES[purpose];
  const aspect = policy.aspect ?? 1;

  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  const [source, setSource] = useState<{ url: string; natural: Size } | null>(null);
  const [available, setAvailable] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);

  // A fresh file is a fresh frame: keeping the previous pan would open the sheet
  // showing a corner of the new photo.
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    if (!file) {
      setSource(null);
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setSource({ url, natural: { width: image.width, height: image.height } });
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The frame's pixel size is read back by the encode, so it is measured rather
  // than assumed from a breakpoint.
  // Keyed on the node, not on the file: the frame lives in a portal that mounts
  // after this component's effects have already run, so a ref read on open is
  // still null — which left the frame measured at 0x0 and the image scaled to
  // nothing. A state-held node re-runs this the moment it exists, and the first
  // measurement is taken directly rather than waiting for a resize that a
  // freshly mounted element never reports.
  useEffect(() => {
    if (!frame) return;
    const measure = () => setAvailable({ width: frame.clientWidth, height: frame.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame]);

  const viewport = fitViewport(available, aspect);
  const natural = source?.natural ?? { width: 0, height: 0 };
  const scale = coverScale(natural, viewport) * zoom;

  function pan(next: Offset) {
    setOffset(clampOffset({ natural, viewport, zoom, offset: next }));
  }

  function changeZoom(next: number) {
    const clamped = clampZoom(next);
    setZoom(clamped);
    // Re-clamped against the new zoom: zooming out with the pan left alone would
    // pull the image's edge into the frame.
    setOffset((current) => clampOffset({ natural, viewport, zoom: clamped, offset: current }));
  }

  async function useThisPhoto() {
    if (!file || !source) return;
    setWorking(true);
    try {
      onCropped(
        await cropToFile(file, cropRect({ natural, viewport, zoom, offset }, policy.width)),
      );
    } catch {
      // A crop is an improvement on the upload, not a precondition for it. If the
      // encode fails — an exotic colour profile, a browser without the canvas
      // APIs — the original still uploads and the service resizes it, which is
      // exactly the behaviour that existed before framing.
      onCropped(file);
    } finally {
      setWorking(false);
    }
  }

  return (
    <SheetRoot open={file !== null} onOpenChange={(next) => !next && onCancel()}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="border-border bg-background rounded-none border-t shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
              <Trans>Frame your photo</Trans>
            </SheetTitle>
            <p className="text-muted-foreground text-xs">
              <Trans>Drag to move, pinch or use the slider to zoom.</Trans>
            </p>
          </SheetHeader>

          <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div
              ref={setFrame}
              className="bg-muted relative flex h-64 w-full items-center justify-center overflow-hidden"
            >
              {source ? (
                <div
                  // Focusable so the frame can be panned without a pointer; the
                  // slider already covers zoom for keyboard and screen readers.
                  tabIndex={0}
                  role="group"
                  aria-label={t`Position your photo`}
                  className="focus-visible:ring-ring absolute focus-visible:ring-2 focus-visible:outline-none"
                  style={{ width: viewport.width, height: viewport.height }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? PAN_STEP * 4 : PAN_STEP;
                    if (event.key === "ArrowLeft") pan({ ...offset, x: offset.x - step });
                    else if (event.key === "ArrowRight") pan({ ...offset, x: offset.x + step });
                    else if (event.key === "ArrowUp") pan({ ...offset, y: offset.y - step });
                    else if (event.key === "ArrowDown") pan({ ...offset, y: offset.y + step });
                    else return;
                    event.preventDefault();
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                  }}
                  onPointerMove={(event) => {
                    const previous = pointers.current.get(event.pointerId);
                    if (!previous) return;
                    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

                    const active = [...pointers.current.values()];
                    if (active.length >= 2 && active[0] && active[1]) {
                      const distance = Math.hypot(
                        active[0].x - active[1].x,
                        active[0].y - active[1].y,
                      );
                      pinchStart.current ??= { distance, zoom };
                      if (pinchStart.current.distance > 0) {
                        changeZoom(
                          (pinchStart.current.zoom * distance) / pinchStart.current.distance,
                        );
                      }
                      return;
                    }

                    pan({
                      x: offset.x + (event.clientX - previous.x),
                      y: offset.y + (event.clientY - previous.y),
                    });
                  }}
                  onPointerUp={(event) => {
                    pointers.current.delete(event.pointerId);
                    if (pointers.current.size < 2) pinchStart.current = null;
                  }}
                  onPointerCancel={(event) => {
                    pointers.current.delete(event.pointerId);
                    pinchStart.current = null;
                  }}
                >
                  <img
                    src={source.url}
                    alt=""
                    draggable={false}
                    // max-w-none is load-bearing: Tailwind's preflight caps every image at
                    // max-width:100%, and an inline width does not override a max-width.
                    // Zooming then grew the height while the width stayed pinned to the
                    // frame, which stretched the photo vertically.
                    className="pointer-events-none absolute top-1/2 left-1/2 max-w-none origin-center select-none"
                    style={{
                      width: natural.width * scale,
                      height: natural.height * scale,
                      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                    }}
                  />
                  {/* The shape the photo will be shown in, drawn over it: every
                      1:1 image here is displayed round, so framing it in a square
                      would hide which pixels survive. */}
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute inset-0 border-2 border-white/80 ${
                      aspect === 1 ? "rounded-full" : ""
                    }`}
                  />
                </div>
              ) : null}
            </div>

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
                className="h-11 w-full"
                disabled={!source || working}
                onClick={() => void useThisPhoto()}
              >
                {working ? t`Preparing…` : t`Use photo`}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="bg-card h-11 w-full"
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
