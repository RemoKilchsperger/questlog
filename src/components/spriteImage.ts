// Pixel-Grafiken als fertige Bilder (PNG-Adressen), einmal gezeichnet und pro
// Grafik zwischengespeichert. Ein <img> statt hunderter SVG-Rechtecke hält die
// Seite leicht – besonders mit animierten Filtern und Bewegung (Leuchten, Schweben)
// zeichnete der Browser sonst so viel neu, dass Bildbereiche schwarz flackerten.

import { paintSprite, renderSprite, type SpriteDef } from "../game/sprites";

const cache = new WeakMap<SpriteDef, Map<string, string>>();

function cached(sprite: SpriteDef, key: string, draw: () => HTMLCanvasElement): string {
  let entries = cache.get(sprite);
  if (!entries) cache.set(sprite, (entries = new Map()));
  let url = entries.get(key);
  if (!url) entries.set(key, (url = draw().toDataURL("image/png")));
  return url;
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  return [el, el.getContext("2d")!];
}

/** Die Grafik als Bild, 1 Pixel = 1 Bildpixel (Anzeige mit `image-rendering: pixelated`). */
export function spriteUrl(sprite: SpriteDef, outline = true, pad = outline ? 1 : 0): string {
  return cached(sprite, `${outline}-${pad}`, () => {
    const image = renderSprite(sprite, outline, pad);
    const [el, ctx] = canvas(image.width, image.height);
    paintSprite(ctx, image);
    return el;
  });
}

/** Feinere Auflösung des Scheins, damit er weich statt pixelig wirkt. */
const HALO_SCALE = 8;
/** Der Schein ragt so weit über die Pixel hinaus (in Pixeln der Grafik) … */
const HALO_GROW = 0.6;
/** … und wird so stark weichgezeichnet (Radius einer Box-Unschärfe, dreimal angewandt). */
const HALO_BLUR = 6;

/**
 * Weicher Schein um die Pixel einer Grafik – gleiches Raster und gleicher Rand
 * wie `spriteUrl` mit Umriss, damit beide genau übereinander liegen.
 */
export function haloUrl(sprite: SpriteDef): string {
  return cached(sprite, "halo", () => {
    const image = renderSprite(sprite, false, 1);
    const [el, ctx] = canvas(image.width * HALO_SCALE, image.height * HALO_SCALE);
    const grow = HALO_GROW * HALO_SCALE;
    image.pixels.forEach((row, y) =>
      row.forEach((color, x) => {
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x * HALO_SCALE - grow, y * HALO_SCALE - grow, HALO_SCALE + grow * 2, HALO_SCALE + grow * 2);
      }),
    );
    const data = ctx.getImageData(0, 0, el.width, el.height);
    blur(data, HALO_BLUR);
    ctx.putImageData(data, 0, 0);
    return el;
  });
}

/** Box-Unschärfe, dreimal waagrecht und senkrecht – nähert eine Gauss-Unschärfe an (ohne Canvas-Filter, die nicht jeder Browser kann). */
function blur({ data, width, height }: ImageData, radius: number) {
  // Mit vormultipliziertem Alpha rechnen, sonst färben durchsichtige Pixel den Rand dunkel
  const px = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    px[i] = data[i] * a;
    px[i + 1] = data[i + 1] * a;
    px[i + 2] = data[i + 2] * a;
    px[i + 3] = data[i + 3];
  }
  const tmp = new Float32Array(px.length);
  const pass = (src: Float32Array, dst: Float32Array, length: number, lines: number, step: number, lineStep: number) => {
    const span = radius * 2 + 1;
    for (let line = 0; line < lines; line++) {
      const base = line * lineStep;
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += src[base + Math.min(length - 1, Math.max(0, k)) * step + c];
        for (let i = 0; i < length; i++) {
          dst[base + i * step + c] = sum / span;
          const out = base + Math.max(0, i - radius) * step + c;
          const into = base + Math.min(length - 1, i + radius + 1) * step + c;
          sum += src[into] - src[out];
        }
      }
    }
  };
  for (let n = 0; n < 3; n++) {
    pass(px, tmp, width, height, 4, width * 4);
    pass(tmp, px, height, width, width * 4, 4);
  }
  for (let i = 0; i < data.length; i += 4) {
    const a = px[i + 3];
    const f = a > 0 ? 255 / a : 0;
    data[i] = px[i] * f;
    data[i + 1] = px[i + 1] * f;
    data[i + 2] = px[i + 2] * f;
    data[i + 3] = a;
  }
}
