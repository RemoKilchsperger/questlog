// Gegner-Bilder (PNG, 128×128, Blick nach links) aus src/assets/creatures.
// Der Dateiname ist der Grafik-Schlüssel der Kreatur (z. B. "wolf.png").
// Gegner ohne Bild nutzen weiterhin ihre Pixel-Raster aus creatureSprites.ts.

const files = import.meta.glob<string>("../assets/creatures/*.png", { eager: true, query: "?url", import: "default" });

/** Grafik-Schlüssel → Bild-URL */
export const CREATURE_IMAGES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".png".length), url]),
);

export function creatureImage(key: string): string | null {
  return CREATURE_IMAGES[key] ?? null;
}

/** Unterste Zeile mit sichtbaren Pixeln – damit die Figur auf dem Boden steht. */
export function lastOpaqueRow(image: HTMLImageElement | HTMLCanvasElement): number {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  for (let y = image.height - 1; y > 0; y--) {
    for (let x = 0; x < image.width; x++) if (data[(y * image.width + x) * 4 + 3] > 16) return y;
  }
  return image.height - 1;
}
