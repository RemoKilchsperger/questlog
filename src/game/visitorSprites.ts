// Pixel-Figuren der Besucher im Dorfbild (visitors.ts): alle dieselbe Gestalt,
// Haare bzw. Kapuze, Kleidung und Gürtel in den Farben des Besuchers. Der Umriss
// kommt wie bei den Gebäuden automatisch dazu (sprites.ts).

import type { SpriteDef } from "./sprites";

/** h Haare/Kapuze, f Haut, e Augen, c Kleidung, C Kleidung dunkel, a Gürtel/Abzeichen, b Stiefel, x Gegenstand */
const BODY: readonly string[] = [
  "...hhh...",
  "..hhhhh..",
  "..hfffh..",
  "..fefef..",
  "...fff...",
  "..ccccc..",
  ".cccCccc.",
  ".fccaccf.",
  "..cCcCc..",
  "..ccCcc..",
  "..cc.cc..",
  "..bb.bb..",
];

/** Mit Hut statt Haaren – für die Durchreisenden. */
const HAT: readonly string[] = ["..hhhhh..", ".hhhhhhh.", ...BODY.slice(2)];

interface Look {
  palette: Record<string, string>;
  hat?: boolean;
}

const SKIN = { f: "#e8b890", e: "#2a1c14" };
const PALE = { f: "#d8d0c8", e: "#5a1a2a" };

const LOOKS: Readonly<Record<string, Look>> = {
  bram: { palette: { ...SKIN, h: "#8a5a2b", c: "#7b756c", C: "#5a606b", a: "#c0503a", b: "#4a2e19" } },
  mirla: { palette: { ...SKIN, h: "#e8e2d8", c: "#6fa35a", C: "#3d6b3a", a: "#a066d6", b: "#6b4423" } },
  torbin: { palette: { ...SKIN, h: "#c0602a", c: "#a0703f", C: "#6b4423", a: "#9097a1", b: "#3a2414" } },
  yrla: { palette: { ...SKIN, h: "#f5f2ea", c: "#d8d0c0", C: "#9a9284", a: "#5a8ac0", b: "#6b4423" } },
  stranger: { palette: { ...PALE, h: "#2a1c34", c: "#3a2a4a", C: "#1e1426", a: "#7d2e27", b: "#1e1426" } },
  aldric: { palette: { ...SKIN, h: "#b8b4ac", c: "#a8792a", C: "#6b4a1a", a: "#c0503a", b: "#3a2414" } },
  // Dungeon-Besucher (dungeonVisitors.ts)
  gerold: { palette: { ...SKIN, h: "#9097a1", c: "#5c4a3a", C: "#3a2e22", a: "#e6b84a", b: "#2a1c14" } },
  samira: { palette: { ...SKIN, f: "#c08a5a", h: "#2a1c14", c: "#d4ab55", C: "#8a6a3a", a: "#4fc0a8", b: "#6b4423" } },
  vessa: { palette: { ...SKIN, h: "#c8d8f0", c: "#3a4a78", C: "#262f52", a: "#e6d84a", b: "#1e1426" } },
  orun: { palette: { ...SKIN, h: "#d8d0c8", c: "#6a6070", C: "#3a3446", a: "#a066d6", b: "#2a2430" } },
  cook: { hat: true, palette: { ...SKIN, h: "#f5f2ea", c: "#efe6cc", C: "#c0b8a0", a: "#c0503a", b: "#4a2e19" } },
  preacher: { palette: { ...SKIN, h: "#5c3a1c", c: "#6b4423", C: "#4a2e19", a: "#e6b84a", b: "#3a2414" } },
  apprentice: { hat: true, palette: { ...SKIN, h: "#4fc0a8", c: "#56698a", C: "#3a4760", a: "#4fc0a8", b: "#3a2414" } },
  builder: { hat: true, palette: { ...SKIN, h: "#d4ab55", c: "#b5483b", C: "#7d2e27", a: "#9097a1", b: "#4a2e19" } },
  minstrel: { hat: true, palette: { ...SKIN, h: "#a066d6", c: "#e6b84a", C: "#a066d6", a: "#c0503a", b: "#6b4423" } },
  cartographer: { hat: true, palette: { ...SKIN, h: "#3d6b3a", c: "#6fa35a", C: "#3d6b3a", a: "#efe6cc", b: "#4a2e19" } },
};

const cache = new Map<string, SpriteDef>();

/** Brief eines Besuchers, der nicht zurückkommt: ein gefalteter Mantel mit Zettel und Siegel (Orun). */
export const LETTER_SPRITE: SpriteDef = {
  grid: [
    ".........",
    ".........",
    ".........",
    ".........",
    ".........",
    ".........",
    ".........",
    "...www...",
    "..wWwwr..",
    ".ccwwwWc.",
    "cCccCccCc",
    "CCCCCCCCC",
  ],
  palette: { w: "#efe6cc", W: "#c0b8a0", r: "#c0503a", c: "#6a6070", C: "#3a3446" },
};

/** Figur eines festen Besuchers (Id) oder Durchreisenden (Art) – immer dasselbe Objekt (Bild-Cache in spriteImage.ts). */
export function getVisitorSprite(key: string): SpriteDef {
  if (key === "letter") return LETTER_SPRITE;
  let sprite = cache.get(key);
  if (!sprite) {
    const look = LOOKS[key] ?? LOOKS.preacher;
    sprite = { grid: look.hat ? HAT : BODY, palette: look.palette };
    cache.set(key, sprite);
  }
  return sprite;
}

/** Für Tests: alle Figuren. */
export const VISITOR_LOOK_KEYS = Object.keys(LOOKS);
