// Pixel-Grafiken als Text-Raster: jedes Zeichen ist ein Pixel, "." ist
// transparent, alle anderen Zeichen werden über die Palette eingefärbt.
// Der dunkle Umriss wird automatisch ergänzt, damit alle Figuren einheitlich
// aussehen und die Raster leicht zu bearbeiten bleiben.

export interface SpriteDef {
  grid: readonly string[];
  palette: Readonly<Record<string, string>>;
}

export const OUTLINE_COLOR = "#1b1424";

/** Farben, die jede Grafik ohne eigenen Paletteneintrag nutzen kann. */
export const SHARED_PALETTE: Readonly<Record<string, string>> = {
  k: OUTLINE_COLOR, // dunkle Details (Pupillen, Mund)
  w: "#f5f2ea", // Weiss (Zähne, Knochen)
};

export interface PixelImage {
  width: number;
  height: number;
  /** Farbe pro Pixel, null = transparent */
  pixels: (string | null)[][];
}

/**
 * Löst das Raster in Farben auf und ergänzt optional einen 1-px-Umriss.
 * `pad` = leerer Rand ringsum (mit Umriss 1, damit dieser Platz hat).
 */
export function renderSprite(def: SpriteDef, outline = true, pad = outline ? 1 : 0): PixelImage {
  const width = Math.max(...def.grid.map((r) => r.length)) + pad * 2;
  const height = def.grid.length + pad * 2;
  const colorAt = (x: number, y: number): string | null => {
    const ch = def.grid[y - pad]?.[x - pad];
    if (!ch || ch === ".") return null;
    return def.palette[ch] ?? SHARED_PALETTE[ch] ?? null;
  };
  const neighbours = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const pixels: (string | null)[][] = [];
  for (let y = 0; y < height; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < width; x++) {
      let color = colorAt(x, y);
      if (!color && outline && neighbours.some(([dx, dy]) => colorAt(x + dx, y + dy))) color = OUTLINE_COLOR;
      row.push(color);
    }
    pixels.push(row);
  }
  return { width, height, pixels };
}

/** Vergrössert eine Grafik um einen ganzzahligen Faktor: jedes Pixel wird zu factor × factor Pixeln. */
export function scaleSprite(def: SpriteDef, factor: number): SpriteDef {
  if (factor === 1) return def;
  const grid = def.grid.flatMap((row) => {
    const wide = [...row].map((ch) => ch.repeat(factor)).join("");
    return Array<string>(factor).fill(wide);
  });
  return { grid, palette: def.palette };
}

export interface SpriteLayer {
  sprite: SpriteDef;
  /** Position der linken oberen Ecke im Gesamtbild */
  x: number;
  y: number;
}

/**
 * Legt mehrere Grafiken übereinander (spätere Ebenen liegen oben) und gibt
 * das Ergebnis wieder als SpriteDef zurück – so bekommt das Gesamtbild einen
 * gemeinsamen Umriss. Was über den Rand ragt, wird abgeschnitten.
 */
export function composeSprites(width: number, height: number, layers: readonly SpriteLayer[]): SpriteDef {
  const colors: (string | null)[][] = Array.from({ length: height }, () => Array(width).fill(null));
  for (const { sprite, x, y } of layers) {
    sprite.grid.forEach((row, gy) =>
      [...row].forEach((ch, gx) => {
        const color = ch === "." ? null : (sprite.palette[ch] ?? SHARED_PALETTE[ch]);
        const [px, py] = [x + gx, y + gy];
        if (color && px >= 0 && px < width && py >= 0 && py < height) colors[py][px] = color;
      }),
    );
  }
  // Jede Farbe bekommt ein eigenes Zeichen (ab U+0100, damit nichts mit "." kollidiert).
  const palette: Record<string, string> = {};
  const charFor = new Map<string, string>();
  const grid = colors.map((row) =>
    row
      .map((color) => {
        if (!color) return ".";
        let ch = charFor.get(color);
        if (!ch) {
          ch = String.fromCharCode(0x100 + charFor.size);
          charFor.set(color, ch);
          palette[ch] = color;
        }
        return ch;
      })
      .join(""),
  );
  return { grid, palette };
}

/** Zeichnet ein Pixelbild in einen Canvas-Kontext (1 Pixel = 1 Canvas-Pixel). */
export function paintSprite(ctx: CanvasRenderingContext2D, image: PixelImage) {
  image.pixels.forEach((row, y) =>
    row.forEach((color, x) => {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
}
