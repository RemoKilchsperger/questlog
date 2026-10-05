// Pixel-Grafik des Helden (eigene Grafik), genutzt vom React-Avatar und von
// der Phaser-Kampfszene.

import { getItem } from "../domain/items";
import type { ArmorSlot, Equipment, ItemDef } from "../domain/types";
import { getWornHelmet, getWornWeapon, itemPalette } from "./itemSprites";
import { composeSprites, type SpriteDef, type SpriteLayer } from "./sprites";

export const HERO_SPRITE: SpriteDef = {
  grid: [
    "....hhhh....",
    "...hhhhhh...",
    "...hssssh...",
    "...sesses...",
    "...ssssss...",
    "....ssss....",
    "..aaaAAaaa..",
    ".naaaaaaaan.",
    ".naAaaaaAan.",
    "..abbgbbba..",
    "...llllll...",
    "...ff..ff...",
  ],
  palette: {
    h: "#6b4a2b", // Haare
    s: "#f1c7a0", // Haut
    n: "#f1c7a0", // Hände (Armschutz)
    e: "#1b1424", // Augen
    a: "#5b6ee1", // Rüstung (Brust)
    A: "#3f4fb8", // Rüstung dunkel
    b: "#8a5a2b", // Gürtel
    g: "#f4c95d", // Gold
    l: "#2e2640", // Hose (Beine)
    f: "#2e2640", // Füsse (Schuhe)
  },
};

/** Welche Zeichen der Heldengrafik ein Rüstungsteil einfärbt – und mit welcher Materialfarbe. */
const ARMOR_COLORS: Record<Exclude<ArmorSlot, "head">, Record<string, "L" | "m" | "D">> = {
  chest: { a: "m", A: "D" },
  arms: { n: "m" },
  legs: { l: "m" },
  feet: { f: "D" },
};

/** Hände im Heldenraster: rechts (zum Gegner hin) die Waffe, links Schild oder Zweitwaffe. */
const RIGHT_HAND = { x: 10, y: 7 };
const LEFT_HAND = { x: 1, y: 7 };

/** Platz rund um den Helden für Waffen und Helmbusch – links und rechts gleich, damit er mittig bleibt. */
const SIDE_MARGIN = 3;
const TOP_MARGIN = 2;
const WIDTH = 12 + SIDE_MARGIN * 2;
const HEIGHT = 12 + TOP_MARGIN;

/** Was der Held in den Händen hält: Hauptwaffe rechts, Schild bzw. Zweitwaffe links. */
function heldItems(equipment: Equipment) {
  const held = [equipment.weapon1, equipment.weapon2].filter((o) => o !== null).map((o) => getItem(o.itemId));
  const shield = held.find((d) => d.type === "shield");
  const [main, offHand] = held.filter((d) => d.type !== "shield");
  return { main, shield, offHand: shield ? undefined : offHand };
}

/** Grundgrafik mit den Farben der angelegten Rüstung (Brust, Arme, Beine, Schuhe). */
function armoredBody(equipment: Equipment): SpriteDef {
  const palette = { ...HERO_SPRITE.palette };
  for (const [slot, mapping] of Object.entries(ARMOR_COLORS) as [keyof typeof ARMOR_COLORS, Record<string, string>][]) {
    const owned = equipment[slot];
    if (!owned) continue;
    const colors = itemPalette(getItem(owned.itemId));
    for (const [ch, shade] of Object.entries(mapping)) palette[ch] = colors[shade];
  }
  return { grid: HERO_SPRITE.grid, palette };
}

export interface HeldWeapon {
  sprite: SpriteDef;
  /** Griffstelle im Raster der Waffe */
  grip: { x: number; y: number };
  /** Lage der Hand im Raster von `getHeroSprite` */
  hand: { x: number; y: number };
}

/** Die Waffe in der rechten Hand – die Kampfszene animiert sie separat. */
export function getMainWeapon(equipment: Equipment): HeldWeapon | null {
  const { main } = heldItems(equipment);
  if (!main) return null;
  const worn = getWornWeapon(main);
  return { ...worn, hand: { x: RIGHT_HAND.x + SIDE_MARGIN, y: RIGHT_HAND.y + TOP_MARGIN } };
}

/**
 * Der Held mit sichtbarer Ausrüstung: Rüstung in Materialfarben, Helm auf dem
 * Kopf, Waffe in der rechten Hand, Schild bzw. zweite Waffe in der linken.
 * Mit `withoutMainWeapon` fehlt die rechte Waffe (siehe `getMainWeapon`).
 */
export function getHeroSprite(equipment: Equipment, { withoutMainWeapon = false } = {}): SpriteDef {
  const at = (sprite: SpriteDef, x: number, y: number): SpriteLayer => ({
    sprite,
    x: x + SIDE_MARGIN,
    y: y + TOP_MARGIN,
  });
  const inHand = (def: ItemDef, hand: { x: number; y: number }, mirrored: boolean) => {
    const worn = getWornWeapon(def, mirrored);
    return at(worn.sprite, hand.x - worn.grip.x, hand.y - worn.grip.y);
  };
  const { main, shield, offHand } = heldItems(equipment);

  // Waffen liegen hinter dem Körper (die Hand umschliesst den Griff), Helm und Schild davor.
  const behind: SpriteLayer[] = [];
  if (main && !withoutMainWeapon) behind.push(inHand(main, RIGHT_HAND, false));
  if (offHand) behind.push(inHand(offHand, LEFT_HAND, true));
  const front: SpriteLayer[] = [];
  if (equipment.head) front.push(at(getWornHelmet(getItem(equipment.head.itemId)), 0, -TOP_MARGIN));
  if (shield) front.push(inHand(shield, LEFT_HAND, false));

  return composeSprites(WIDTH, HEIGHT, [...behind, at(armoredBody(equipment), 0, 0), ...front]);
}
