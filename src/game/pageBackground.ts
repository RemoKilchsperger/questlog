// Hintergrund der ganzen Seite: gekachelter Steinboden (gemalt in backgrounds.ts),
// darüber Kerzenschein und Vignette (index.css).
import { FLOOR_TILE_HEIGHT, FLOOR_TILE_WIDTH, paintFloorTile } from "./backgrounds";

/** Malt die Bodenkachel einmal und hängt sie als CSS-Variable an die Seite. */
export function initPageBackground(): void {
  const canvas = document.createElement("canvas");
  canvas.width = FLOOR_TILE_WIDTH;
  canvas.height = FLOOR_TILE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return; // ohne Canvas bleibt die schlichte Hintergrundfarbe
  paintFloorTile(ctx);
  document.documentElement.style.setProperty("--page-tile", `url(${canvas.toDataURL()})`);
}
