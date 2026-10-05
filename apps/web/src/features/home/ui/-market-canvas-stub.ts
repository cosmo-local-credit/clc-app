import { vi } from "vite-plus/test";

/**
 * A 2D context stub that actually retains colour.
 *
 * jsdom has no canvas backend, so a bare `vi.fn()` context would let a marker
 * "render" in no colour at all and still pass. This one records the fill that
 * was in effect for each `fill()` call and exposes it through `getImageData`,
 * which is the only way to catch the OKLCH failure mode the fallback table
 * exists for: an unsupported colour string leaves `fillStyle` at its previous
 * value instead of throwing.
 */
export type StubbedContext = {
  fills: string[];
  strokes: string[];
  paths: string[];
  arcs: Array<{ x: number; y: number; radius: number }>;
  lines: Array<{ x: number; y: number }>;
  pixel: [number, number, number, number];
};

const CSS_HEX = /^#([0-9a-f]{6})$/i;

function toRGBA(color: string): [number, number, number, number] {
  const hex = CSS_HEX.exec(color);
  if (hex?.[1]) {
    const value = Number.parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
  }
  // Anything the stub cannot parse (including oklch) paints transparent, which
  // mirrors a Canvas implementation that cannot honour the requested colour.
  return [0, 0, 0, 0];
}

export function installCanvasStub(): Map<HTMLCanvasElement, StubbedContext> {
  const contexts = new Map<HTMLCanvasElement, StubbedContext>();

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    contextId: string,
  ) {
    if (contextId !== "2d") return {} as RenderingContext;

    const existing = contexts.get(this);
    if (existing) return contextRefs.get(existing) as unknown as RenderingContext;

    const record: StubbedContext = {
      fills: [],
      strokes: [],
      paths: [],
      arcs: [],
      lines: [],
      pixel: [0, 0, 0, 0],
    };

    const ctx = {
      fillStyle: "#000000",
      strokeStyle: "#000000",
      lineWidth: 1,
      lineCap: "round",
      lineJoin: "round",
      scale: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      arc: vi.fn((x: number, y: number, radius: number) => {
        record.arcs.push({ x, y, radius });
      }),
      lineTo: vi.fn((x: number, y: number) => {
        record.lines.push({ x, y });
      }),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      fill: vi.fn((path?: unknown) => {
        const color = String(ctx.fillStyle);
        record.fills.push(color);
        if (path) {
          record.paths.push(String((path as { d?: string }).d ?? "path2d"));
          return;
        }
        // The pin body is the fill with no path; that is the pixel a reader sees.
        record.pixel = toRGBA(color);
      }),
      stroke: vi.fn(() => {
        record.strokes.push(String(ctx.strokeStyle));
      }),
      getImageData: vi.fn(() => ({
        data: Uint8ClampedArray.from(record.pixel),
      })),
    };

    contexts.set(this, record);
    contextRefs.set(record, ctx);
    return ctx as unknown as RenderingContext;
  } as typeof HTMLCanvasElement.prototype.getContext);

  return contexts;
}

const contextRefs = new WeakMap<StubbedContext, object>();

/** A minimal Path2D so glyph rendering is exercised rather than skipped. */
export function installPath2DStub(): void {
  vi.stubGlobal(
    "Path2D",
    class {
      d: string;
      constructor(d: string) {
        this.d = d;
      }
    },
  );
}
