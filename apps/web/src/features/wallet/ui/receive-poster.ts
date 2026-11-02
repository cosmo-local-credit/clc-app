import QRCode from "qrcode";

import {
  CLC_LOGO_BRIDGE_PATH,
  CLC_LOGO_GAP_PATH,
  CLC_LOGO_MARK_PATH,
} from "#/components/ui/clc-logo";
import {
  firstStrongDirection,
  type ReceivePosterIdentity,
} from "#/features/wallet/logic/receive-poster";
import { initialsOf } from "#/lib/initials";

/**
 * The receive poster: the wallet's receive QR as a picture someone can save,
 * print for a counter, or send in a chat, after Alipay's payment code.
 *
 * It is drawn on a 2D canvas rather than snapshotted from the DOM. Safari drops
 * images from html-to-image's SVG snapshot (the paper wallet export redraws
 * its QR for that reason), and a canvas gives the same pixels on iOS and
 * Android. 3:4 so it previews whole in a sheet and in a chat bubble.
 */
export const RECEIVE_POSTER_WIDTH = 1080;
export const RECEIVE_POSTER_HEIGHT = 1440;

export type ReceivePosterContent = {
  /** Exactly what the Receive screen's QR encodes. */
  qrValue: string;
  identity: ReceivePosterIdentity;
  /** The name the centre initials come from when there is no photo. */
  name: string | null;
  avatarUrl: string | null;
  brandName: string;
  /** sRGB primary for the band and the logo tile. */
  brandColor: string;
  headline: string;
  footer: string;
  network: string;
  /** Direction of the translated strings, the document's. */
  direction: "ltr" | "rtl";
};

// The locked font trio from styles.css. A canvas cannot read `font-heading`.
const HEADING = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", sans-serif';
const SANS = '"Inter Variable", Inter, sans-serif';
const MONO = '"JetBrains Mono Variable", "JetBrains Mono", monospace';

const WHITE = "#ffffff";
const INK = "#0a0a0a";
const MUTED = "#737373";

const W = RECEIVE_POSTER_WIDTH;
const H = RECEIVE_POSTER_HEIGHT;
const CENTER_X = W / 2;
const HEADER_HEIGHT = 216;
const LOGO_SIZE = 104;
const TILE = { x: 120, y: 408, width: 840, height: 852 } as const;
const TILE_TEXT_WIDTH = TILE.width - 120;
const QR_TOP = TILE.y + 72;
const QR_MAX = 600;
/**
 * The centre badge's share of the QR's width. At error correction H the code
 * survives 30% damage; a 20% wide disc covers about 3% of its area.
 */
const BADGE_SHARE = 0.2;
const AVATAR_TIMEOUT_MS = 6_000;

type TextStyle = {
  weight: number;
  family: string;
  max: number;
  min: number;
  color: string;
  direction: "ltr" | "rtl";
  maxWidth: number;
};

export async function renderReceivePoster(
  content: ReceivePosterContent,
  signal?: AbortSignal,
): Promise<Blob> {
  const [avatar] = await Promise.all([loadAvatar(content.avatarUrl, signal), loadFonts(content)]);
  try {
    return await drawPoster(content, avatar);
  } finally {
    // Revoked only once drawn, so the blob is live while the canvas reads it.
    if (avatar) URL.revokeObjectURL(avatar.src);
  }
}

function drawPoster(content: ReceivePosterContent, avatar: HTMLImageElement | null): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Receive poster canvas is unavailable");

  ctx.fillStyle = content.brandColor;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, HEADER_HEIGHT);
  drawBrandLockup(ctx, content);

  drawText(ctx, content.headline, 312, {
    weight: 700,
    family: HEADING,
    max: 76,
    min: 44,
    color: WHITE,
    direction: content.direction,
    maxWidth: W - 160,
  });

  ctx.fillStyle = WHITE;
  ctx.fillRect(TILE.x, TILE.y, TILE.width, TILE.height);
  const qr = drawQr(ctx, content.qrValue);
  drawBadge(ctx, qr, avatar, content);
  drawIdentity(ctx, content.identity);

  drawText(ctx, content.footer, 1328, {
    weight: 600,
    family: SANS,
    max: 40,
    min: 28,
    color: WHITE,
    direction: content.direction,
    maxWidth: W - 160,
  });
  ctx.globalAlpha = 0.85;
  drawText(ctx, content.network, 1388, {
    weight: 500,
    family: SANS,
    max: 30,
    min: 22,
    color: WHITE,
    direction: content.direction,
    maxWidth: W - 160,
  });
  ctx.globalAlpha = 1;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Receive poster PNG could not be created"));
    }, "image/png");
  });
}

/** Brand tile and wordmark, centred in the white header. Not mirrored in RTL. */
function drawBrandLockup(ctx: CanvasRenderingContext2D, content: ReceivePosterContent) {
  const gap = 28;
  const style: TextStyle = {
    weight: 700,
    family: HEADING,
    max: 80,
    min: 48,
    color: INK,
    direction: "ltr",
    maxWidth: W - 160 - LOGO_SIZE - gap,
  };
  const { font, text } = fitText(ctx, content.brandName, style);
  ctx.font = font;
  const wordWidth = ctx.measureText(text).width;
  const left = Math.round(CENTER_X - (LOGO_SIZE + gap + wordWidth) / 2);
  const top = (HEADER_HEIGHT - LOGO_SIZE) / 2;
  drawLogoTile(ctx, left, top, LOGO_SIZE, content.brandColor);
  ctx.textAlign = "left";
  ctx.direction = "ltr";
  ctx.fillStyle = INK;
  ctx.fillText(text, left + LOGO_SIZE + gap, HEADER_HEIGHT / 2 + capHeight(ctx) / 2);
}

/** The square CLC tile, as `CLCLogo sharp` draws it. */
function drawLogoTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tile: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 256, size / 256);
  ctx.fillStyle = tile;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = WHITE;
  ctx.fill(new Path2D(CLC_LOGO_MARK_PATH));
  ctx.fill(new Path2D(CLC_LOGO_BRIDGE_PATH));
  ctx.fillStyle = tile;
  ctx.fill(new Path2D(CLC_LOGO_GAP_PATH));
  ctx.restore();
}

type QrBox = { x: number; y: number; size: number; module: number };

/**
 * Whole-pixel modules, so no edge is antialiased into grey. The tile's white
 * margin, at least eight modules either side, is the quiet zone.
 */
function drawQr(ctx: CanvasRenderingContext2D, value: string): QrBox {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "H" });
  const module = Math.floor(QR_MAX / modules.size);
  const size = module * modules.size;
  const x = Math.round(CENTER_X - size / 2);
  const y = QR_TOP;
  ctx.fillStyle = "#000000";
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) ctx.fillRect(x + col * module, y + row * module, module, module);
    }
  }
  return { x, y, size, module };
}

/**
 * The centre mark: the member's photo, else their initials, else the CLC tile.
 * Photo and initials are discs, as every avatar in the app is; the tile stays
 * square. A white ring keeps the modules around it readable.
 */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  qr: QrBox,
  avatar: HTMLImageElement | null,
  content: ReceivePosterContent,
) {
  const diameter = Math.round(qr.size * BADGE_SHARE);
  const ring = qr.module;
  const cx = qr.x + qr.size / 2;
  const cy = qr.y + qr.size / 2;
  const initials = content.name ? initialsOf(content.name) : "";

  if (!avatar && !initials) {
    ctx.fillStyle = WHITE;
    ctx.fillRect(
      cx - diameter / 2 - ring,
      cy - diameter / 2 - ring,
      diameter + ring * 2,
      diameter + ring * 2,
    );
    drawLogoTile(ctx, cx - diameter / 2, cy - diameter / 2, diameter, content.brandColor);
    return;
  }

  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(cx, cy, diameter / 2 + ring, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    // object-cover: fill the disc, crop the longer side.
    const scale = Math.max(diameter / avatar.naturalWidth, diameter / avatar.naturalHeight);
    const width = avatar.naturalWidth * scale;
    const height = avatar.naturalHeight * scale;
    ctx.drawImage(avatar, cx - width / 2, cy - height / 2, width, height);
  } else {
    ctx.fillStyle = content.brandColor;
    ctx.fillRect(cx - diameter / 2, cy - diameter / 2, diameter, diameter);
    ctx.font = `600 ${Math.round(diameter * 0.4)}px ${HEADING}`;
    ctx.direction = firstStrongDirection(initials);
    ctx.textAlign = "center";
    ctx.fillStyle = WHITE;
    ctx.fillText(initials, cx, cy + capHeight(ctx) / 2);
  }
  ctx.restore();
}

/** Name over username and short address, inside the white tile. */
function drawIdentity(ctx: CanvasRenderingContext2D, identity: ReceivePosterIdentity) {
  const title: TextStyle = identity.titleIsCode
    ? {
        weight: 600,
        family: MONO,
        max: 44,
        min: 28,
        color: INK,
        direction: "ltr",
        maxWidth: TILE_TEXT_WIDTH,
      }
    : {
        weight: 600,
        family: HEADING,
        max: 52,
        min: 32,
        color: INK,
        direction: firstStrongDirection(identity.title),
        maxWidth: TILE_TEXT_WIDTH,
      };

  if (!identity.detail) {
    drawText(ctx, identity.title, 1170, title);
    return;
  }
  drawText(ctx, identity.title, 1148, title);
  drawText(ctx, identity.detail, 1210, {
    weight: 500,
    family: MONO,
    max: 30,
    min: 22,
    color: MUTED,
    direction: "ltr",
    maxWidth: TILE_TEXT_WIDTH,
  });
}

/** One centred line, shrunk to fit and then ellipsised, centred on `centerY`. */
function drawText(ctx: CanvasRenderingContext2D, value: string, centerY: number, style: TextStyle) {
  const { font, text } = fitText(ctx, value, style);
  ctx.font = font;
  ctx.direction = style.direction;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = style.color;
  ctx.fillText(text, CENTER_X, centerY + capHeight(ctx) / 2);
}

function fitText(
  ctx: CanvasRenderingContext2D,
  value: string,
  style: TextStyle,
): { font: string; text: string } {
  for (let size = style.max; size >= style.min; size -= 2) {
    const font = `${style.weight} ${size}px ${style.family}`;
    ctx.font = font;
    if (ctx.measureText(value).width <= style.maxWidth) return { font, text: value };
  }
  const font = `${style.weight} ${style.min}px ${style.family}`;
  ctx.font = font;
  const chars = Array.from(value);
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > style.maxWidth) {
    chars.pop();
  }
  return { font, text: `${chars.join("").trimEnd()}…` };
}

/**
 * The current font's cap height, so lines of any script and size centre on the
 * same optical middle whatever their descenders.
 */
function capHeight(ctx: CanvasRenderingContext2D): number {
  const size = Number(/(\d+)px/.exec(ctx.font)?.[1] ?? 16);
  return ctx.measureText("H").actualBoundingBoxAscent || size * 0.72;
}

/**
 * The poster's text, loaded before drawing: a canvas never waits for a web
 * font and would draw the fallback. `load` with the text pulls the
 * unicode-range subsets that text needs, Cyrillic or Vietnamese included.
 */
async function loadFonts(content: ReceivePosterContent) {
  if (!document.fonts?.load) return;
  const { identity } = content;
  const faces: Array<[string, string]> = [
    [`700 16px ${HEADING}`, `${content.brandName}${content.headline}`],
    [`600 16px ${HEADING}`, `${identity.title}${content.name ?? ""}`],
    [`600 16px ${MONO}`, identity.title],
    [`500 16px ${MONO}`, identity.detail ?? ""],
    [`600 16px ${SANS}`, content.footer],
    [`500 16px ${SANS}`, content.network],
  ];
  await Promise.all(
    faces.map(([font, text]) => document.fonts.load(font, text || "H").catch(() => [])),
  );
}

/**
 * The member's photo, or null to fall back to initials. Its `src` is an object
 * URL the caller revokes once it has drawn it.
 *
 * Fetched rather than set as an `img.src` with `crossOrigin`: the browser may
 * hold this URL from an ordinary `<img>` without CORS headers, and drawing that
 * copy would taint the canvas and fail the export. `no-store` asks the storage
 * host afresh, whose response carries `Access-Control-Allow-Origin`.
 */
async function loadAvatar(
  url: string | null,
  signal: AbortSignal | undefined,
): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(abort, AVATAR_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const objectUrl = URL.createObjectURL(await response.blob());
    const image = new Image();
    image.src = objectUrl;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(objectUrl);
      return null;
    }
    if (image.naturalWidth > 0 && image.naturalHeight > 0) return image;
    URL.revokeObjectURL(objectUrl);
    return null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
