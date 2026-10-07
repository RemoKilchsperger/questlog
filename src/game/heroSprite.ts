// Pixel-Grafik des Helden (eigene Grafik), genutzt vom React-Avatar und von
// der Phaser-Kampfszene.
//
// Der Held ist 24 × 24 Pixel gross, seine Hände sind 2 × 2-Blöcke. Helme, Waffen
// und Schilde sind im selben Raster gezeichnet; die Grafiken der Boss-Items stammen
// noch aus dem halb so feinen 12er-Raster und werden verdoppelt (`scale` in
// itemSprites.ts). Deshalb hat der Held genau die doppelten Proportionen des alten
// 12er-Helden: Kopf, Hände und Füsse liegen dort, wo die Items sie erwarten.

import { getItem } from "../domain/items";
import type { ArmorSlot, Equipment, ItemDef, ItemType } from "../domain/types";
import { bossGlowColor, getWornHelmet, getWornWeapon, itemPalette } from "./itemSprites";
import { composeSprites, scaleSprite, type SpriteDef, type SpriteLayer } from "./sprites";

/** Grösse des Helden-Rasters */
const SIZE = 24;
/** Hände sind 2 × 2 Pixel gross; so viel Platz hatte ein Pixel im alten 12er-Raster */
const HAND = 2;

export const HERO_SPRITE: SpriteDef = {
  grid: [
    ".........hhhhhh.........",
    ".......hhjjhhhhh........",
    "......hhjhhhhhhhhh......",
    "......hhhhhhhhhhhh......",
    "......ihsssssssshi......",
    "......hssssssssssh......",
    "......ssewssssewss......",
    "......sseesssseess......",
    "......zssssssssssz......",
    "......zsssskkssssz......",
    ".......zssssssssz.......",
    ".........zssssz.........",
    "....ccaaaazsszaaaacc....",
    "...ncaaaaaazzaaaaaaAn...",
    "..nncaaaaaaaaaaaaaaAnn..",
    "..nncaaaaaaaaaaaaaaAnn..",
    "..nNcaAaaaaaaaaaaAaANn..",
    "..NNcaAaaaaaaaaaaAaANN..",
    "....aabbbbggbbbbbbaa....",
    "....AAbbbbggbbbbbbAA....",
    "......llllllllllll......",
    "......llllq..qllll......",
    "......FFFf....FFFf......",
    "......ffff....ffff......",
  ],
  palette: {
    h: "#6b4a2b", // Haare
    j: "#8f673d", // Haare, Glanzlicht
    i: "#4e3420", // Haare, Schatten
    s: "#f1c7a0", // Haut
    z: "#d9a37c", // Haut, Schatten
    e: "#1b1424", // Augen
    n: "#f1c7a0", // Arme und Hände (Armschutz)
    N: "#d9a37c", // Arme, Schatten
    c: "#7f8ff0", // Rüstung (Brust), Licht
    a: "#5b6ee1", // Rüstung (Brust)
    A: "#3f4fb8", // Rüstung dunkel
    b: "#8a5a2b", // Gürtel
    g: "#f4c95d", // Gold (Schnalle)
    l: "#2e2640", // Hose (Beine)
    q: "#211b2e", // Hose, Schatten
    F: "#40355a", // Schuhe, Kappe
    f: "#2e2640", // Schuhe
  },
};

/** Welche Zeichen der Heldengrafik ein Rüstungsteil einfärbt – und mit welcher Materialfarbe. */
const ARMOR_COLORS: Record<Exclude<ArmorSlot, "head">, Record<string, "L" | "m" | "D">> = {
  chest: { c: "L", a: "m", A: "D" },
  arms: { n: "m", N: "D" },
  legs: { l: "m", q: "D" },
  feet: { F: "m", f: "D" },
};

/** Hände im Heldenraster (linke obere Ecke des 2 × 2-Blocks): rechts die Waffe, links Schild oder Zweitwaffe. */
const RIGHT_HAND = { x: 20, y: 14 };
const LEFT_HAND = { x: 2, y: 14 };

/** Platz rund um den Helden für Waffen und Helmbusch – links und rechts gleich, damit er mittig bleibt. */
const SIDE_MARGIN = 3 * HAND;
const TOP_MARGIN = 2 * HAND;
const WIDTH = SIZE + SIDE_MARGIN * 2;
const HEIGHT = SIZE + TOP_MARGIN;

/**
 * Getragenes Item im Raster des Helden: bei Bedarf vergrössert, Griffstelle mitgerechnet.
 * Waffen liegen vor dem Körper – die Griffstelle (`G`) bleibt frei, damit die Hand
 * dahinter durchscheint und den Griff zu umschliessen scheint.
 */
function wornWeapon(def: ItemDef, mirrored = false) {
  const worn = getWornWeapon(def, mirrored);
  const scaled = scaleSprite(worn.sprite, worn.scale);
  const sprite = { ...scaled, grid: scaled.grid.map((row) => row.replaceAll("G", ".")) };
  return { sprite, grip: { x: worn.grip.x * worn.scale, y: worn.grip.y * worn.scale } };
}

/** Was der Held in den Händen hält: Hauptwaffe rechts, Schild bzw. Zweitwaffe links. */
function heldItems(equipment: Equipment) {
  const held = [equipment.weapon1, equipment.weapon2].filter((o) => o !== null).map((o) => getItem(o.itemId));
  const shield = held.find((d) => d.type === "shield");
  const [main, offHand] = held.filter((d) => d.type !== "shield");
  return { main, shield, offHand: shield ? undefined : offHand };
}

/**
 * Platzhalter in der Leuchtschicht: verdeckt, was dahinter liegt (z. B. eine
 * Boss-Waffe hinter dem Körper), leuchtet aber selbst nicht.
 */
const NO_GLOW = "none";

/** Färbt eine Grafik für die Leuchtschicht ein: ganz in der Leuchtfarbe des Items oder unsichtbar. */
function glowLayer(sprite: SpriteDef, def: ItemDef): SpriteDef {
  const color = bossGlowColor(def) ?? NO_GLOW;
  const chars = new Set(sprite.grid.join("").replaceAll(".", ""));
  return { grid: sprite.grid, palette: Object.fromEntries([...chars].map((ch) => [ch, color])) };
}

/**
 * Grundgrafik mit den Farben der angelegten Rüstung (Brust, Arme, Beine, Schuhe).
 * Mit `glow` stattdessen die Leuchtschicht: nur Teile von Boss-Rüstungen leuchten.
 */
function armoredBody(equipment: Equipment, glow = false): SpriteDef {
  const palette: Record<string, string> = glow
    ? Object.fromEntries(Object.keys(HERO_SPRITE.palette).map((ch) => [ch, NO_GLOW]))
    : { ...HERO_SPRITE.palette };
  for (const [slot, mapping] of Object.entries(ARMOR_COLORS) as [keyof typeof ARMOR_COLORS, Record<string, string>][]) {
    const owned = equipment[slot];
    if (!owned) continue;
    const def = getItem(owned.itemId);
    const colors = itemPalette(def);
    for (const [ch, shade] of Object.entries(mapping)) palette[ch] = glow ? (bossGlowColor(def) ?? NO_GLOW) : colors[shade];
  }
  return { grid: HERO_SPRITE.grid, palette };
}

export interface HeldWeapon {
  sprite: SpriteDef;
  /** Griffstelle im Raster der Waffe */
  grip: { x: number; y: number };
  /** Lage der Hand im Raster von `getHeroSprite` (linke obere Ecke) */
  hand: { x: number; y: number };
  /** Grösse der Hand im Heldenraster – Hand und Griff sind so grosse Blöcke */
  pixel: number;
  /** Waffentyp – Bögen schiessen statt zuzuschlagen */
  type: ItemType;
}

/** Die Waffe in der rechten Hand – die Kampfszene animiert sie separat. */
export function getMainWeapon(equipment: Equipment): HeldWeapon | null {
  const { main } = heldItems(equipment);
  if (!main) return null;
  const worn = wornWeapon(main);
  return { ...worn, hand: { x: RIGHT_HAND.x + SIDE_MARGIN, y: RIGHT_HAND.y + TOP_MARGIN }, pixel: HAND, type: main.type };
}

/** Leuchtfarbe der Waffe in der rechten Hand (nur Boss-Waffen) – die Kampfszene lässt sie separat leuchten. */
export function getMainWeaponGlow(equipment: Equipment): string | null {
  const { main } = heldItems(equipment);
  return main ? bossGlowColor(main) : null;
}

/**
 * Der Held mit sichtbarer Ausrüstung: Rüstung in Materialfarben, Helm auf dem
 * Kopf, Waffe in der rechten Hand, Schild bzw. zweite Waffe in der linken.
 * Mit `withoutMainWeapon` fehlt die rechte Waffe (siehe `getMainWeapon`).
 */
export function getHeroSprite(equipment: Equipment, { withoutMainWeapon = false } = {}): SpriteDef {
  return composeSprites(WIDTH, HEIGHT, heroLayers(equipment, withoutMainWeapon, false));
}

/**
 * Leuchtschicht zu `getHeroSprite` (gleiche Grösse): nur die sichtbaren Pixel
 * angelegter Boss-Items, in ihrer Leuchtfarbe. null, wenn nichts leuchtet.
 */
export function getHeroGlowSprite(equipment: Equipment, { withoutMainWeapon = false } = {}): SpriteDef | null {
  const { grid, palette } = composeSprites(WIDTH, HEIGHT, heroLayers(equipment, withoutMainWeapon, true));
  const glowing = Object.fromEntries(Object.entries(palette).filter(([, color]) => color !== NO_GLOW));
  return Object.keys(glowing).length > 0 ? { grid, palette: glowing } : null;
}

function heroLayers(equipment: Equipment, withoutMainWeapon: boolean, glow: boolean): SpriteLayer[] {
  const at = (sprite: SpriteDef, x: number, y: number): SpriteLayer => ({
    sprite,
    x: x + SIDE_MARGIN,
    y: y + TOP_MARGIN,
  });
  const paint = (sprite: SpriteDef, def: ItemDef) => (glow ? glowLayer(sprite, def) : sprite);
  const inHand = (def: ItemDef, hand: { x: number; y: number }, mirrored: boolean) => {
    const worn = wornWeapon(def, mirrored);
    return at(paint(worn.sprite, def), hand.x - worn.grip.x, hand.y - worn.grip.y);
  };
  const { main, shield, offHand } = heldItems(equipment);

  // Alles liegt vor dem Körper: erst der Helm, dann Waffen und Schild. Die Hände
  // scheinen durch die frei gelassene Griffstelle der Waffen (siehe `wornWeapon`).
  const front: SpriteLayer[] = [];
  if (equipment.head) {
    const helmet = getItem(equipment.head.itemId);
    const worn = getWornHelmet(helmet);
    front.push(at(paint(scaleSprite(worn.sprite, worn.scale), helmet), 0, -TOP_MARGIN));
  }
  if (offHand) front.push(inHand(offHand, LEFT_HAND, true));
  if (shield) front.push(inHand(shield, LEFT_HAND, false));
  if (main && !withoutMainWeapon) front.push(inHand(main, RIGHT_HAND, false));

  return [at(armoredBody(equipment, glow), 0, 0), ...front];
}
