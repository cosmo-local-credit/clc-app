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
import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Slider } from "#/components/ui/slider";
import { cropToFile } from "#/lib/crop-image";

const PAN_STEP = 16;
const WHEEL_SENSITIVITY = 0.0015;

/**
 * Frames an image to the shape it will be displayed in, before it is uploaded.
 *
 * The storage service resizes but never crops, so without this a wide photograph
 * chosen as a pool logo is stored wide and every screen showing it square throws
 * away the sides at render time — the operator never sees which half survived.
 *
 * A dialog rather than the sheet apps/web uses: this is a modal decision on a
 * desktop screen, and the console's sheets are for editing a record. Drag or the
 * arrow keys pan, the wheel or the slider zooms.
 */
export function ImageCropDialog({
  file,
  purpose,
  onCancel,
  onCropped,
}: {
  /** The chosen file. Null closes the dialog. */
  file: File | null;
  purpose: ImagePurpose;
  onCancel: () => void;
  onCropped: (cropped: File) => void;
}) {
  const policy = IMAGE_POLICIES[purpose];
  const aspect = policy.aspect ?? 1;

  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  const [source, setSource] = useState<{ url: string; natural: Size } | null>(null);
  const [available, setAvailable] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);

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
    // The pan follows the zoom: zooming out otherwise exposes an edge inside the
    // frame, which the crop would then encode as blank.
    setOffset((current) => clampOffset({ natural, viewport, zoom: clamped, offset: current }));
  }

  async function confirm() {
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
    <Dialog open={file !== null} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Frame the image</DialogTitle>
          <DialogDescription>
            Stored at {policy.width}px wide in this shape. Drag to move, scroll or use the slider to
            zoom.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={setFrame}
          className="bg-background border-border relative flex h-64 w-full items-center justify-center overflow-hidden border"
        >
          {source ? (
            <div
              tabIndex={0}
              role="group"
              aria-label="Position the image"
              className="focus-visible:ring-ring absolute cursor-grab focus-visible:ring-2 focus-visible:outline-none"
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
              onWheel={(event) => {
                event.preventDefault();
                changeZoom(zoom * (1 - event.deltaY * WHEEL_SENSITIVITY));
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragOrigin.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerMove={(event) => {
                const origin = dragOrigin.current;
                if (!origin) return;
                dragOrigin.current = { x: event.clientX, y: event.clientY };
                pan({
                  x: offset.x + (event.clientX - origin.x),
                  y: offset.y + (event.clientY - origin.y),
                });
              }}
              onPointerUp={() => {
                dragOrigin.current = null;
              }}
              onPointerCancel={() => {
                dragOrigin.current = null;
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
              {/* The frame's edge, and for an avatar the circle it is shown in. */}
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 border-2 border-white/80 ${
                  purpose === "profile.avatar" ? "rounded-full" : ""
                }`}
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">Zoom</span>
          <Slider
            aria-label="Zoom"
            min={1}
            max={MAX_CROP_ZOOM}
            step={0.01}
            value={zoom}
            onValueChange={changeZoom}
            disabled={!source}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={working} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!source || working} onClick={() => void confirm()}>
            {working ? "Preparing…" : "Crop and upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
