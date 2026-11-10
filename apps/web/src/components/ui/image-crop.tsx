import { IMAGE_POLICIES, type ImagePurpose } from "@clc/api/features/images/policy";
import {
  clampOffset,
  clampZoom,
  coverScale,
  cropRect,
  fitViewport,
  type Offset,
  type Size,
} from "@clc/core/features/images/crop";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import { cropToFile } from "#/lib/crop-image";
import { cn } from "#/lib/utils";

const PAN_STEP = 16;

/**
 * Framing a chosen photo: the source image, the measured frame, zoom and pan,
 * and the encode. The phone sheet and the desktop dialog draw the same state.
 */
export function useImageCrop({
  file,
  purpose,
  onCropped,
}: {
  /** The chosen file. Null means nothing is being framed. */
  file: File | null;
  purpose: ImagePurpose;
  onCropped: (cropped: File) => void;
}) {
  const policy = IMAGE_POLICIES[purpose];
  const aspect = policy.aspect ?? 1;

  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
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

  async function applyCrop() {
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

  return {
    aspect,
    setFrame,
    source,
    natural,
    viewport,
    scale,
    zoom,
    offset,
    pan,
    changeZoom,
    working,
    applyCrop,
  };
}

export type ImageCrop = ReturnType<typeof useImageCrop>;

/**
 * The frame itself: the photo under the shape it will be shown in. Drag to
 * pan, pinch to zoom, arrow keys for both. Fills its parent; the caller sizes it.
 */
export function ImageCropSurface({ crop, className }: { crop: ImageCrop; className?: string }) {
  const { t } = useLingui();
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const { source, natural, viewport, scale, zoom, offset, pan, changeZoom, aspect } = crop;

  return (
    <div
      ref={crop.setFrame}
      className={cn(
        "bg-muted relative flex w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      {source ? (
        <div
          // Focusable so the frame can be panned without a pointer; the
          // slider already covers zoom for keyboard and screen readers.
          tabIndex={0}
          // Panning down would otherwise drag the sheet closed.
          data-base-ui-swipe-ignore=""
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
              const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
              pinchStart.current ??= { distance, zoom };
              if (pinchStart.current.distance > 0) {
                changeZoom((pinchStart.current.zoom * distance) / pinchStart.current.distance);
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
  );
}
