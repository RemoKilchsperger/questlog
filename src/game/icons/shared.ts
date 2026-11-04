// Gemeinsame Farben und Hilfen der Pixel-Icons (Raster höchstens 12 × 12).
import type { SpriteDef } from "../sprites";

export const GOLD = { Y: "#fff1a8", y: "#f4c95d", o: "#c4842a", d: "#7a4e12" };
export const STEEL = { L: "#eef3f9", m: "#aab6c6", D: "#5a6475" };
export const STONE = { L: "#c9bfae", m: "#8a7f70", D: "#4a4239" };
export const WOOD = { t: "#a0683a", T: "#5c3a1c" };
export const PAPER = { P: "#efe6d2", p: "#c9b48a", l: "#9a8a6a" };
export const BONE = { W: "#f5f2ea", w: "#d8d0c0", g: "#9a9284" };
export const FIRE = { r: "#c23a3a", o: "#f08a2c", y: "#f4c95d", Y: "#fff1a8" };

/** Kurzform: Raster plus Palette */
export const icon = (palette: Readonly<Record<string, string>>, grid: readonly string[]): SpriteDef => ({ grid, palette });

/**
 * Runde Formen ohne Handzeichnen: `pick` bekommt die Entfernung zur Mitte
 * (und die Lage dx/dy) und gibt das Zeichen zurück ("." = leer).
 */
export function radial(
  size: number,
  palette: Readonly<Record<string, string>>,
  pick: (d: number, dx: number, dy: number) => string,
): SpriteDef {
  const c = (size - 1) / 2;
  const grid = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => pick(Math.hypot(x - c, y - c), x - c, y - c)).join(""),
  );
  return { grid, palette };
}

/** Spiegelt die linke Hälfte zu einem symmetrischen Raster (Breite 2 × half, oder ungerade mit Mittelspalte). */
export function mirror(rows: readonly string[], odd = false): string[] {
  return rows.map((row) => row + [...row].reverse().slice(odd ? 1 : 0).join(""));
}
