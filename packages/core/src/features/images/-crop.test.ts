import { describe, expect, it } from "vite-plus/test";

import {
  clampOffset,
  clampZoom,
  coverScale,
  cropRect,
  fitViewport,
  MAX_CROP_ZOOM,
  maxOffset,
} from "./crop";

const square = { width: 320, height: 320 };

describe("coverScale", () => {
  it("fills the frame from the constraining axis", () => {
    // A landscape photo in a square frame is limited by its height.
    expect(coverScale({ width: 1600, height: 900 }, square)).toBeCloseTo(320 / 900);
    expect(coverScale({ width: 900, height: 1600 }, square)).toBeCloseTo(320 / 900);
  });

  it("reports zero for an image whose size is not known yet", () => {
    expect(coverScale({ width: 0, height: 0 }, square)).toBe(0);
  });
});

describe("clampZoom", () => {
  it("never crops looser than cover, nor tighter than the blur limit", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(99)).toBe(MAX_CROP_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe("clampOffset", () => {
  it("holds a square source still in a square frame", () => {
    // Nothing to pan: the image exactly covers the frame.
    const view = {
      natural: { width: 800, height: 800 },
      viewport: square,
      zoom: 1,
      offset: { x: 40, y: 40 },
    };
    expect(clampOffset(view)).toEqual({ x: 0, y: 0 });
  });

  it("allows panning only along the overflowing axis", () => {
    const view = {
      natural: { width: 1600, height: 900 },
      viewport: square,
      zoom: 1,
      offset: { x: 999, y: 999 },
    };
    const limit = maxOffset(view);

    expect(limit.y).toBe(0);
    expect(limit.x).toBeGreaterThan(0);
    expect(clampOffset(view)).toEqual({ x: limit.x, y: 0 });
  });

  it("pulls the pan back in when the zoom is reduced", () => {
    // The case a validate-on-drag-only implementation gets wrong: zooming out
    // with the pan left alone exposes an edge inside the crop.
    const natural = { width: 1600, height: 1600 };
    const panned = clampOffset({ natural, viewport: square, zoom: 4, offset: { x: 400, y: 0 } });
    const after = clampOffset({ natural, viewport: square, zoom: 1, offset: panned });

    expect(panned.x).toBeGreaterThan(0);
    expect(after).toEqual({ x: 0, y: 0 });
  });
});

describe("cropRect", () => {
  it("keeps the centre of a landscape photo for a square avatar", () => {
    const rect = cropRect(
      { natural: { width: 1600, height: 900 }, viewport: square, zoom: 1, offset: { x: 0, y: 0 } },
      400,
    );

    // The full height, a centred square of it, and nothing above or below.
    expect(rect.sh).toBeCloseTo(900);
    expect(rect.sw).toBeCloseTo(900);
    expect(rect.sy).toBeCloseTo(0);
    expect(rect.sx).toBeCloseTo((1600 - 900) / 2);
    expect([rect.outWidth, rect.outHeight]).toEqual([400, 400]);
  });

  it("moves the source window with the pan", () => {
    const view = {
      natural: { width: 1600, height: 900 },
      viewport: square,
      zoom: 1,
      offset: { x: 0, y: 0 },
    };
    const centred = cropRect(view, 400);
    const panned = cropRect({ ...view, offset: { x: 100, y: 0 } }, 400);

    // Dragging the image right reveals more of its left side.
    expect(panned.sx).toBeLessThan(centred.sx);
    expect(panned.sw).toBeCloseTo(centred.sw);
  });

  it("takes a smaller window as the zoom increases", () => {
    const view = {
      natural: { width: 1600, height: 1600 },
      viewport: square,
      zoom: 1,
      offset: { x: 0, y: 0 },
    };

    expect(cropRect({ ...view, zoom: 2 }, 400).sw).toBeCloseTo(cropRect(view, 400).sw / 2);
  });

  it("never encodes more pixels than the source region has", () => {
    // A 200px-wide source cropped for a 400px avatar: upscaling would only make
    // the upload bigger, and the storage service does not upscale either.
    const rect = cropRect(
      { natural: { width: 200, height: 200 }, viewport: square, zoom: 1, offset: { x: 0, y: 0 } },
      400,
    );

    expect(rect.outWidth).toBe(200);
    expect(rect.outHeight).toBe(200);
  });

  it("holds the frame's aspect in the encoded size", () => {
    const wide = { width: 320, height: 180 };
    const rect = cropRect(
      { natural: { width: 4000, height: 3000 }, viewport: wide, zoom: 1, offset: { x: 0, y: 0 } },
      1280,
    );

    expect(rect.outWidth / rect.outHeight).toBeCloseTo(16 / 9, 2);
  });

  it("returns an empty rect while the image has no dimensions", () => {
    const rect = cropRect(
      { natural: { width: 0, height: 0 }, viewport: square, zoom: 1, offset: { x: 0, y: 0 } },
      400,
    );
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0, outWidth: 0, outHeight: 0 });
  });
});

describe("fitViewport", () => {
  it("fits a square frame to the narrow side", () => {
    expect(fitViewport({ width: 360, height: 500 }, 1)).toEqual({ width: 360, height: 360 });
  });

  it("lets height constrain a wide frame in a tall space", () => {
    // A 16:9 banner on a phone: width-led would overflow the sheet.
    expect(fitViewport({ width: 360, height: 100 }, 16 / 9)).toEqual({
      width: 100 * (16 / 9),
      height: 100,
    });
  });
});
