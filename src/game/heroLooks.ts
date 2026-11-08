// Farben und Pixel zur Charaktererstellung (src/domain/looks.ts): Haut- und
// Haarfarben, Hemden, Frisuren und Bärte im 24er-Raster des Helden.

import type { HeroLooks } from "../domain/looks";

/** Haut: Grundton und Schatten (Gesicht `s`/`z`, nackte Arme `n`/`N`) */
export const SKIN_COLORS: Record<HeroLooks["skin"], { s: string; z: string }> = {
  hell: { s: "#f1c7a0", z: "#d9a37c" },
  rosig: { s: "#f6c2b4", z: "#df9c8c" },
  oliv: { s: "#d6a877", z: "#b8885a" },
  braun: { s: "#a8714a", z: "#8a5a37" },
  dunkel: { s: "#6e4630", z: "#553424" },
};

/** Haare und Bart: Grundton, Glanzlicht, Schatten */
export const HAIR_COLORS: Record<HeroLooks["hairColor"], { h: string; j: string; i: string }> = {
  braun: { h: "#6b4a2b", j: "#8f673d", i: "#4e3420" },
  schwarz: { h: "#2b2530", j: "#4a4352", i: "#1d1922" },
  blond: { h: "#d9b45a", j: "#f0d68a", i: "#a8843a" },
  rot: { h: "#b5482a", j: "#d8693f", i: "#82301b" },
  grau: { h: "#8a8790", j: "#aeabb3", i: "#64616b" },
  weiss: { h: "#e6e2d8", j: "#faf8f2", i: "#b9b4a8" },
  blau: { h: "#3f6fd8", j: "#6b95ee", i: "#2b4ea3" },
  gruen: { h: "#3f9a52", j: "#66bf73", i: "#2b6e3a" },
};

/** Hemd ohne Brustrüstung: Licht, Grundton, Schatten (wie `c`/`a`/`A` im Helden) */
export const SHIRT_COLORS: Record<HeroLooks["shirt"], { c: string; a: string; A: string }> = {
  blau: { c: "#7f8ff0", a: "#5b6ee1", A: "#3f4fb8" },
  rot: { c: "#e8746a", a: "#c84a3f", A: "#93302a" },
  gruen: { c: "#7cc77a", a: "#4f9e57", A: "#36733d" },
  violett: { c: "#b07ce0", a: "#8a55c4", A: "#633b94" },
  braun: { c: "#b88a5c", a: "#946a40", A: "#6c4b2c" },
  weiss: { c: "#f2eee4", a: "#d6d0c2", A: "#aaa393" },
};

/** Oberer Teil des kurzen Haars – Grundlage für Kurz, Lang und Zopf */
const SHORT_TOP = [
  ".........hhhhhh.........",
  ".......hhjjhhhhh........",
  "......hhjhhhhhhhhh......",
  "......hhhhhhhhhhhh......",
];

/**
 * Frisuren über dem kahlen Kopf. Die erste Zeile liegt 4 Pixel über dem
 * Helden (im Platz für Helmbüsche), damit Stacheln und Irokese hochstehen
 * können – unter einem Helm fällt dieser Teil weg. `g` = Haarband (Gold).
 */
export const HAIR_STYLES: Record<HeroLooks["hairStyle"], readonly string[]> = {
  kurz: [
    "........................",
    "........................",
    "........................",
    "........................",
    ...SHORT_TOP,
    "......ih........hi......",
    "......h..........h......",
  ],
  lang: [
    "........................",
    "........................",
    "........................",
    "........................",
    ...SHORT_TOP,
    ".....hih........hih.....",
    "....hhh..........hhh....",
    "....hh............hh....",
    "....hh............hh....",
    "....hi............ih....",
    "....hi............ih....",
    "....hi............ih....",
    "....ii............ii....",
  ],
  zopf: [
    "........................",
    "........................",
    "........................",
    "........................",
    SHORT_TOP[0],
    SHORT_TOP[1],
    "......hhjhhhhhhhhhg.....",
    "......hhhhhhhhhhhhhh....",
    "......ih........hi.hh...",
    "......h..........h..hh..",
    "....................hh..",
    "....................hi..",
    "....................ii..",
    ".....................i..",
  ],
  stachel: [
    "........................",
    "........................",
    ".......h..h..h..h.......",
    ".......hh.hh.hh.hh......",
    "......hhjhhjhhjhhh......",
    "......hhhhhhhhhhhh......",
    "......hjhhhhhhhhhh......",
    "......hhhhhhhhhhhh......",
    "......ih........hi......",
    "......h..........h......",
  ],
  iro: [
    "........................",
    "........................",
    "........................",
    "...........hh...........",
    "..........hjjh..........",
    "..........hjhh..........",
    "..........hjhh..........",
    "..........hhhh..........",
    "..........hhhh..........",
    "...........hh...........",
  ],
  glatze: [],
};

/** Bärte in Haarfarbe, ab Zeile 8 des Helden (unter den Augen, Mund in Zeile 9 bleibt frei) */
export const BEARD_TOP = 8;
export const BEARDS: Record<HeroLooks["beard"], readonly string[]> = {
  keiner: [],
  schnauz: [
    ".........hhhhhh.........",
    ".........h....h.........",
  ],
  kinnbart: [
    "........................",
    "........................",
    "..........hhhh..........",
    "..........hhhh..........",
    "...........ii...........",
  ],
  vollbart: [
    "......hh.hhhhhh.hh......",
    "......hhhh....hhhh......",
    ".......hhhhhhhhhh.......",
    "........ihhhhhhi........",
    "..........iiii..........",
  ],
};
