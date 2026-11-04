// Pixel-Icons in den Phaser-Szenen: Phaser zeichnet Text selbst auf die Leinwand,
// dort greift die JSX-Laufzeit nicht. Diese Hilfen setzen Text mit Emojis aus
// Textstücken und Icon-Bildern zusammen (z. B. „🔥 -12“ über dem Gegner).
import Phaser from "phaser";
import { iconSprite } from "./iconSprites";
import { paintSprite, renderSprite } from "./sprites";

const EMOJI = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)/u;
/** Kantenlänge eines Icons mit Umriss in Bildpixeln */
const ICON_PIXELS = 14;

/** Textur-Schlüssel des Icons – beim ersten Gebrauch gemalt; null, wenn es keines gibt. */
export function iconTexture(scene: Phaser.Scene, emoji: string): string | null {
  const sprite = iconSprite(emoji);
  if (!sprite) return null;
  const key = `icon-${emoji.replace(/️/g, "")}`;
  if (!scene.textures.exists(key)) {
    const image = renderSprite(sprite);
    const canvas = scene.textures.createCanvas(key, image.width, image.height)!;
    paintSprite(canvas.getContext(), image);
    canvas.refresh();
    canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  return key;
}

/** Ganzzahlige Vergrösserung, damit das Icon etwa so gross ist wie die Schrift. */
const iconScale = (fontSize: number) => Math.max(1, Math.round((fontSize * 1.2) / ICON_PIXELS));

/**
 * Text mit Pixel-Icons statt Emojis, als Container um (x, y) herum ausgerichtet
 * (`originY` 0.5 = mittig, 0 = oben bündig). Ohne Emojis bleibt es ein einfacher Text.
 */
export function iconText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  stroke: { color: string; width: number },
  originY = 0.5,
): Phaser.GameObjects.Container {
  const fontSize = parseInt(String(style.fontSize ?? 16), 10);
  const scale = iconScale(fontSize);
  const pieces: Phaser.GameObjects.Components.ComputedSize[] = [];
  const objects: Phaser.GameObjects.GameObject[] = [];
  for (const [i, part] of text.split(EMOJI).entries()) {
    if (!part) continue;
    const key = i % 2 === 1 ? iconTexture(scene, part) : null;
    const object = key
      ? scene.add.image(0, 0, key).setScale(scale)
      : scene.add.text(0, 0, part, style).setStroke(stroke.color, stroke.width);
    objects.push(object);
    pieces.push(object as unknown as Phaser.GameObjects.Components.ComputedSize);
  }
  const width = pieces.reduce((sum, p) => sum + p.displayWidth, 0);
  const height = Math.max(...pieces.map((p) => p.displayHeight));
  let left = -width / 2;
  for (const object of objects) {
    const o = object as Phaser.GameObjects.Image | Phaser.GameObjects.Text;
    o.setOrigin(0, 0.5).setPosition(Math.round(left), Math.round(height * (0.5 - originY)));
    left += o.displayWidth;
  }
  return scene.add.container(x, y, objects);
}
