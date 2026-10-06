// Pixel-Grafiken der Items. Die Form ergibt sich aus Item-Typ und Namensform
// (Schwert, Klinge, Säbel …), die Farben aus dem Material (Rost, Kupfer …
// Götter) und der Edelstein aus dem Beinamen. So sieht z. B. eine
// Kupferbeinschiene anders aus als eine Eisenbeinschiene.
//
// Zeichen in den Rastern:
//   L/m/D  Material hell/mittel/dunkel   t  Zierde (Nieten, Parierstange …)
//   j      Edelstein                     h/H  Griff aus Holz/Leder
//   G      Griffstelle (nur getragene Waffen: hier liegt die Hand)
//   k/w    dunkle Details / Weiss (siehe SHARED_PALETTE)

import { getItemParts } from "../domain/items";
import type { ItemDef, ItemType, WeaponType } from "../domain/types";
import type { SpriteDef } from "./sprites";

/** Farben pro Materialstufe [hell, mittel, dunkel, Zierde] – Reihenfolge wie die Namensanfänge. */
const MATERIALS: readonly (readonly [string, string, string, string])[] = [
  ["#d0915e", "#a0582f", "#5e3420", "#7a7068"], // Rost
  ["#f7b27a", "#d0733c", "#82401f", "#4fae94"], // Kupfer (mit Grünspan)
  ["#f0cd85", "#bf8f40", "#6e4f22", "#8c5a2a"], // Bronze
  ["#d0d4db", "#8e939d", "#4c505a", "#6b4a2b"], // Eisen (Lederriemen)
  ["#c9bfae", "#8a7f70", "#4a4239", "#e8e1d4"], // Wolfs (Knochen)
  ["#eef3f9", "#aab6c6", "#5a6475", "#3b4252"], // Stahl
  ["#ffffff", "#d3dae4", "#838ca0", "#5b7bd5"], // Silber
  ["#a9c6e8", "#5d7ba3", "#2f3f5c", "#6ff2ff"], // Runen (leuchtend)
  ["#8f7cad", "#4f4266", "#251d33", "#b07cff"], // Schatten
  ["#f6f8ff", "#c3cbea", "#7480b0", "#fff1a8"], // Mondsilber
  ["#bfe6ff", "#4a90d9", "#22457a", "#ffe66b"], // Sturm (Blitze)
  ["#ffd27a", "#e0612f", "#7a2416", "#fff1a8"], // Glut
  ["#f2fdff", "#9ad9f0", "#4a8db0", "#ffffff"], // Frost
  ["#eafff9", "#a8e2d3", "#5a9c8f", "#f4c95d"], // Mithril
  ["#6d5a8c", "#2e2540", "#140f1c", "#c76bff"], // Obsidian
  ["#b3ecaa", "#4f9e5a", "#22502c", "#e7ffd6"], // Adamant
  ["#ff9d8c", "#c23a3a", "#621a22", "#f4c95d"], // Drachen
  ["#a3b6ff", "#3d4fb0", "#1b2160", "#fff6c2"], // Sternen
  ["#ffe28f", "#f08a2c", "#a3361e", "#ff5a3c"], // Phönix
  ["#fffdf0", "#f4c95d", "#a8781e", "#ffffff"], // Götter
];

/** Edelsteinfarbe pro Beiname – Reihenfolge wie die Beinamen. */
const GEMS = [
  "#e04848", "#4fb0e8", "#7dd3a8", "#b07cff", "#f4c95d",
  "#ff8ad8", "#f5f2ea", "#ff8c3a", "#3ad6c5", "#8a6bff",
] as const;

const HANDLE = { h: "#8a5a2b", H: "#5c3a1c", G: "#8a5a2b" };

/** Farben eines Items: Material (L/m/D/t), Edelstein (j) und Griff (h/H/G). */
export function itemPalette(def: ItemDef): Record<string, string> {
  if (def.bossId) return BOSS_LOOKS[def.id].palette;
  const { material, suffix } = getItemParts(def);
  const [L, m, D, t] = MATERIALS[material];
  return { L, m, D, t, j: GEMS[suffix], ...HANDLE };
}

/** "#rrggbb" → [Farbton 0–360, Sättigung 0–1, Helligkeit 0–1] */
function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Farbton 0–360, Sättigung/Helligkeit 0–1 → "#rrggbb" */
function fromHsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * Leuchtfarbe eines Boss-Items – abgeleitet aus seinen Rüstungsfarben: die
 * kräftigere der beiden Hauptfarben, aufgehellt, damit sie auf dunklem
 * Grund leuchtet. Normale Items leuchten nicht (null).
 */
export function bossGlowColor(def: ItemDef): string | null {
  if (!def.bossId) return null;
  const { L, m } = itemPalette(def);
  const [h, s] = [toHsl(L), toHsl(m)].reduce((a, b) => (b[1] > a[1] ? b : a));
  return fromHsl(h, Math.max(s, 0.3), 0.65);
}

/**
 * Symbol-Form. Mit `axis` ist das Raster eine aufrecht gezeichnete Waffe
 * (Spitze oben, `axis` = Spalte der Mittelachse), die schräg gekippt wird.
 */
interface IconShape {
  grid: readonly string[];
  axis?: number;
}

const weaponShape = (axis: number, grid: string[]): IconShape => ({ grid, axis });

/** Symbole pro Typ, eine Form pro Namensform (gleiche Reihenfolge wie `nouns` in items.ts). */
const ICONS: Record<ItemType, readonly IconShape[]> = {
  head: [
    { // Helm
      grid: [
        ".....jj.....",
        "....jjjj....",
        "....LmmD....",
        "...LmmmmD...",
        "..LmmmmmmD..",
        "..LmmmmmmD..",
        "..tttttttt..",
        "..LkkmmkkD..",
        "..LmmmmmmD..",
        "..LmkmmkmD..",
        "..LmmmmmmD..",
        "...DDDDDD...",
      ],
    },
    { // Haube
      grid: [
        "............",
        "....LmmD....",
        "...LmmmmD...",
        "..LmmmmmmD..",
        "..LmmjjmmD..",
        "..LmmmmmmD..",
        "..LmmmmmmD..",
        "..tttttttt..",
        "LmmmmmmmmmmD",
        ".DDDDDDDDDD.",
        "............",
        "............",
      ],
    },
  ],
  chest: [
    { // Harnisch
      grid: [
        "............",
        ".LmmD..LmmD.",
        "LmmmmttmmmmD",
        "LmmmmmmmmmmD",
        ".DDLmmmmmDD.",
        "...LmjjmD...",
        "...LmmmmD...",
        "...LmmmmD...",
        "...tttttt...",
        "...LmmmmD...",
        "...LmDLmD...",
        "............",
      ],
    },
    { // Panzer
      grid: [
        "............",
        "LmmmD..LmmmD",
        "LmmmmmmmmmmD",
        "LmmmmjjmmmmD",
        "DDLmmmmmmDDD",
        "..LmmmmmmD..",
        "..DDDDDDDD..",
        "..LmmmmmmD..",
        "..DDDDDDDD..",
        "..LmmmmmmD..",
        "..tttttttt..",
        "............",
      ],
    },
    { // Brünne (Kettenhemd)
      grid: [
        "............",
        "..LmD..LmD..",
        ".LmLmLmLmLD.",
        "LmLmLmLmLmLD",
        "mLmLmLmLmLmD",
        "DDLmLmLmLmDD",
        "..mLmLmLmD..",
        "..LmLmLmLD..",
        "..mLmLmLmD..",
        "..ttttjttt..",
        "..LmLmLmLD..",
        "..DDDDDDDD..",
      ],
    },
  ],
  arms: [
    { // Armschienen
      grid: [
        "............",
        "............",
        ".tttt..tttt.",
        ".LmmD..LmmD.",
        ".LmmD..LmmD.",
        ".LjmD..LmjD.",
        ".LmmD..LmmD.",
        ".LmmD..LmmD.",
        ".LmmD..LmmD.",
        ".tttt..tttt.",
        "............",
        "............",
      ],
    },
    { // Handschuhe
      grid: [
        "............",
        "....LmLmLD..",
        "....LmLmLD..",
        ".Lm.LmmmmD..",
        ".LmmmmmmmD..",
        "..LmmjmmmD..",
        "..LmmmmmmD..",
        "..tttttttt..",
        "..LmmmmmmD..",
        "..LmmmmmmD..",
        "..DDDDDDDD..",
        "............",
      ],
    },
    { // Stulpen
      grid: [
        "............",
        ".LmmmmmmmmD.",
        ".tttttttttt.",
        "..LmmmmmmD..",
        "..LmmjjmmD..",
        "...LmmmmD...",
        "...LmmmmD...",
        "...tttttt...",
        "...LmmmmD...",
        "...LmmmmD...",
        "...DDDDDD...",
        "............",
      ],
    },
  ],
  legs: [
    { // Beinschienen
      grid: [
        "............",
        ".tttt..tttt.",
        ".LjmD..LmjD.",
        ".tttt..tttt.",
        ".LmmD..LmmD.",
        ".LmmD..LmmD.",
        ".LmmD..LmmD.",
        "..LmD..LmD..",
        "..LmD..LmD..",
        "..LmmD.LmmD.",
        "..DDDD.DDDD.",
        "............",
      ],
    },
    { // Beinlinge
      grid: [
        "............",
        "..ttttjttt..",
        "..LmmmmmmD..",
        "..LmmmmmmD..",
        "..LmmDLmmD..",
        "..LmD..LmD..",
        "..LmD..LmD..",
        "..ttt..ttt..",
        "..LmD..LmD..",
        "..LmD..LmD..",
        "..DDD..DDD..",
        "............",
      ],
    },
  ],
  feet: [
    { // Stiefel
      grid: [
        "............",
        "............",
        ".ttt...ttt..",
        ".LmD...LmD..",
        ".LmD...LmD..",
        ".LjD...LjD..",
        ".LmD...LmD..",
        ".LmD...LmD..",
        ".LmmmD.LmmmD",
        ".DDDDD.DDDDD",
        "............",
        "............",
      ],
    },
    { // Schuhe
      grid: [
        "............",
        "............",
        "............",
        "............",
        ".ttt...ttt..",
        ".LmmmD.LmmmD",
        ".LmjmD.LmjmD",
        ".DDDDD.DDDDD",
        "............",
        "............",
        "............",
        "............",
      ],
    },
  ],
  dagger: [
    weaponShape(2, [ // Dolch
      "..L..",
      ".LmD.",
      ".LmD.",
      ".LmD.",
      ".LmD.",
      "ttjtt",
      "..h..",
      "..H..",
      "..t..",
    ]),
    weaponShape(1, [ // Stilett
      ".L.",
      ".m.",
      ".m.",
      ".m.",
      ".m.",
      ".m.",
      "tjt",
      ".h.",
      ".H.",
      ".t.",
    ]),
  ],
  sword: [
    weaponShape(3, [ // Schwert
      "...L...",
      "..LmD..",
      "..LmD..",
      "..LmD..",
      "..LmD..",
      "..LmD..",
      "..LmD..",
      "tttjttt",
      "...h...",
      "...H...",
      "..tjt..",
    ]),
    weaponShape(2, [ // Klinge
      "..L..",
      "..L..",
      ".LmD.",
      ".LmD.",
      ".LmD.",
      ".LmD.",
      ".LmD.",
      ".LmD.",
      ".LmD.",
      ".tjt.",
      "..h..",
      "..H..",
      "..h..",
      "..t..",
    ]),
    weaponShape(3, [ // Säbel
      "......L",
      ".....LD",
      "....LmD",
      "....LmD",
      "...LmD.",
      "...LmD.",
      "..LmD..",
      "..LmD..",
      ".ttjtt.",
      "...h...",
      "...H...",
      "...t...",
    ]),
  ],
  greatsword: [
    weaponShape(4, [ // Zweihänder
      "....L....",
      "...LmD...",
      "..LmmmD..",
      "..LmmmD..",
      "..LmmmD..",
      "..LmmmD..",
      "..LmmmD..",
      "..LmmmD..",
      "..LmmmD..",
      "ttttjtttt",
      "....h....",
      "....H....",
      "....h....",
      "...tjt...",
    ]),
    weaponShape(4, [ // Bihänder (geflammte Klinge)
      "....L....",
      "...LmD...",
      "...LmmD..",
      "..LmmD...",
      "...LmmD..",
      "..LmmD...",
      "...LmmD..",
      "..LmmD...",
      "...LmmD..",
      ".tttjttt.",
      "....h....",
      "....H....",
      "....h....",
      "...tjt...",
    ]),
  ],
  shield: [
    { // Schild
      grid: [
        ".tttttttttt.",
        ".tLmmmmmmDt.",
        ".tLmmjjmmDt.",
        ".tLmjjjjmDt.",
        ".tLmmjjmmDt.",
        ".tLmmjjmmDt.",
        "..tLmmmmDt..",
        "..tLmmmmDt..",
        "...tLmmDt...",
        "....tLDt....",
        ".....tt.....",
        "............",
      ],
    },
    { // Rundschild
      grid: [
        "....tttt....",
        "..ttLmmDtt..",
        ".tLmmmmmmDt.",
        ".tLmmmmmmDt.",
        "tLmmmttmmmDt",
        "tLmmtjjtmmDt",
        "tLmmtjjtmmDt",
        "tLmmmttmmmDt",
        ".tLmmmmmmDt.",
        ".tDmmmmmmDt.",
        "..ttDDDDtt..",
        "....tttt....",
      ],
    },
    { // Turmschild
      grid: [
        "..tttttttt..",
        "..tLmmmmDt..",
        "..tLmmmmDt..",
        "..tLmjjmDt..",
        "..tLjjjjDt..",
        "..tLmjjmDt..",
        "..tLmjjmDt..",
        "..tLmmmmDt..",
        "..tLmmmmDt..",
        "..tLmmmmDt..",
        "..tDDDDDDt..",
        "..tttttttt..",
      ],
    },
  ],
  axe: [
    weaponShape(1, [ // Axt
      ".t....",
      ".hmL..",
      ".hmmL.",
      ".hmmmL",
      ".hjmmL",
      ".hmmL.",
      ".hmL..",
      ".h....",
      ".h....",
      ".h....",
      ".H....",
      ".t....",
    ]),
    weaponShape(1, [ // Beil
      ".t...",
      ".hmmL",
      ".hjmL",
      ".hmD.",
      ".h...",
      ".h...",
      ".h...",
      ".H...",
      ".t...",
    ]),
  ],
  greataxe: [
    weaponShape(1, [ // Grossaxt
      ".t.....",
      ".hmL...",
      ".hmmL..",
      ".hmmmL.",
      ".hmmmmL",
      ".hjmmmL",
      ".hmmmmL",
      ".hmmmL.",
      ".hmmL..",
      ".hmL...",
      ".h.....",
      ".h.....",
      ".h.....",
      ".H.....",
      ".t.....",
    ]),
    weaponShape(4, [ // Doppelaxt
      "....t....",
      "..LmhmL..",
      ".LmmhmmL.",
      "LmmmjmmmL",
      "LmmmhmmmL",
      ".LmmhmmL.",
      "..LmhmL..",
      "....h....",
      "....h....",
      "....h....",
      "....h....",
      "....h....",
      "....H....",
      "....t....",
    ]),
  ],
  staff: [
    weaponShape(2, [ // Stab
      "..j..",
      ".jwj.",
      ".jjj.",
      "m.j.m",
      ".mtm.",
      "..h..",
      "..h..",
      "..H..",
      "..h..",
      "..h..",
      "..H..",
      "..h..",
      "..h..",
      "..m..",
    ]),
  ],
  scepter: [
    weaponShape(2, [ // Zepter
      "..j..",
      ".tjt.",
      "tLmDt",
      ".LmD.",
      "..m..",
      "..t..",
      "..m..",
      "..m..",
      "..m..",
      "..t..",
      "..j..",
    ]),
  ],
  mace: [
    weaponShape(2, [ // Streitkolben
      "..t..",
      ".LmD.",
      "LmmmD",
      "LmjmD",
      "LmmmD",
      ".LmD.",
      "..h..",
      "..h..",
      "..h..",
      "..H..",
      "..h..",
      "..t..",
    ]),
    weaponShape(3, [ // Morgenstern
      "...t...",
      ".t.m.t.",
      "..LmD..",
      "tLmjmDt",
      "..LmD..",
      ".t.D.t.",
      "...t...",
      "...h...",
      "...h...",
      "...H...",
      "...h...",
      "...t...",
    ]),
    weaponShape(2, [ // Keule
      ".LmD.",
      "LmmmD",
      "LtmtD",
      "LmmmD",
      "LmtmD",
      ".LmD.",
      ".LmD.",
      "..h..",
      "..h..",
      "..H..",
      "..h..",
      "..t..",
    ]),
  ],
  greathammer: [
    weaponShape(3, [ // Grosshammer
      "...t...",
      "LmmmmmD",
      "LmmjmmD",
      "LmmmmmD",
      "..DhD..",
      "...h...",
      "...h...",
      "...H...",
      "...h...",
      "...h...",
      "...H...",
      "...h...",
      "...t...",
    ]),
    weaponShape(3, [ // Kriegshammer
      "...t...",
      "...hLmD",
      "tLmjmmD",
      "...hLmD",
      "...h...",
      "...h...",
      "...H...",
      "...h...",
      "...h...",
      "...H...",
      "...h...",
      "...t...",
    ]),
  ],
  // Bögen: Sehne (w) links, Wurfarme gekrümmt nach rechts, Griff in der Mitte
  bow: [
    { // Bogen
      grid: [
        "....wLm.....",
        "....w.mD....",
        "....w..mD...",
        "....w...mD..",
        "....w...hH..",
        "....w...jH..",
        "....w...hH..",
        "....w...mD..",
        "....w..mD...",
        "....w.mD....",
        "....wLm.....",
        "............",
      ],
    },
    { // Langbogen
      grid: [
        "....wL......",
        "....w.mD....",
        "....w..mD...",
        "....w..mD...",
        "....w...hH..",
        "....w...jH..",
        "....w...hH..",
        "....w..mD...",
        "....w..mD...",
        "....w..mD...",
        "....w.mD....",
        "....wL......",
      ],
    },
    { // Kurzbogen (Reflexbogen mit zurückgebogenen Enden)
      grid: [
        "............",
        "...Lw.......",
        "....wm......",
        "....w.mD....",
        "....w..hH...",
        "....w..jH...",
        "....w..hH...",
        "....w.mD....",
        "....wm......",
        "...Lw.......",
        "............",
        "............",
      ],
    },
  ],
};

// --- Boss-Items --------------------------------------------------------------
// Einzigartige Stücke mit eigener Form und Farbe, passend zu ihrem Boss –
// als Symbol und am Helden (Helm am Kopf, Waffe in der Hand).

interface BossLook {
  palette: Record<string, string>;
  icon: IconShape;
  /** Form am Helden: Helme wie WORN_HELMETS, Waffen wie WORN_WEAPONS (mit `G` als Griff) */
  worn?: readonly string[];
}

/** Material hell/mittel/dunkel, Zierde, Edelstein, Griff hell/dunkel. */
const bossPalette = (L: string, m: string, D: string, t: string, j: string, h: string, H: string) => ({
  L, m, D, t, j, h, H, G: h,
});

const BOSS_LOOKS: Record<string, BossLook> = {
  // Goblinhäuptling Krummzahn: rostiges Eisen, Knochen, Goblin-Grün
  "boss-goblin-chief-axe": {
    palette: bossPalette("#d6c9a8", "#8d6e4a", "#4b3524", "#7fbf4a", "#e04848", "#e8dcc0", "#a89a78"),
    icon: weaponShape(1, [
      ".t.....",
      ".hmmmmL",
      ".hmjmm.",
      ".hmmmmL",
      ".hmmmm.",
      ".hDDDDL",
      ".t.....",
      ".h.....",
      ".t.....",
      ".h.....",
      ".H.....",
      ".w.....",
    ]),
    worn: [".t...", ".hmmL", ".hjm.", ".hmmL", ".hDDL", ".h...", ".G...", ".h...", ".w..."],
  },
  "boss-goblin-chief-mace": {
    palette: bossPalette("#b07a45", "#7a4f2a", "#4a2e18", "#efe6d2", "#7fbf4a", "#5c3a1c", "#3e2612"),
    icon: weaponShape(2, [
      ".t.t.",
      "tLmDt",
      ".LmD.",
      "tLjDt",
      ".LmD.",
      "tLmDt",
      ".LmD.",
      "..m..",
      "..h..",
      "..H..",
      "..h..",
      "..t..",
    ]),
    worn: [".t.t.", "tLmDt", ".LjD.", "tLmDt", ".LmD.", "..h..", "..G..", "..h..", "..t.."],
  },
  "boss-goblin-chief-head": {
    palette: bossPalette("#f5f2ea", "#e0d6bd", "#9c8f6e", "#7fbf4a", "#e04848", "#5c3a1c", "#3e2612"),
    icon: {
      grid: [
        "............",
        "............",
        ".L...LL...L.",
        ".Lm..mm..mD.",
        ".LmmLmmDmmD.",
        ".tttttttttt.",
        ".ttjttttjtt.",
        ".DDDDDDDDDD.",
        ".L........L.",
        ".L........L.",
        "..L......L..",
        "............",
      ],
    },
    worn: [
      "..L..LL..L..",
      "..Lm.mm.mD..",
      "..tttttttt..",
      "..tjttttjt..",
      "..L......L..",
      "..L......L..",
      "...L....L...",
    ],
  },
  "boss-goblin-chief-chest": {
    palette: bossPalette("#b5aa9a", "#8a7f70", "#4a4239", "#efe6d2", "#7fbf4a", "#5c3a1c", "#3e2612"),
    icon: {
      grid: [
        "............",
        ".LLmD..LLmD.",
        "LmLmmttmmLmD",
        "LmmmmmmmmmmD",
        ".DDLmmmmmDD.",
        "...LtjtmD...",
        "...LmmmmD...",
        "...LmmmmD...",
        "...tttttt...",
        "...LmLmLD...",
        "...LmDLmD...",
        "............",
      ],
    },
  },

  // Uralte Sumpfechse: Schuppengrün, Elfenbein-Zähne, gelbe Reptilienaugen
  "boss-ancient-lizard-sword": {
    palette: bossPalette("#f5f2ea", "#d9cfae", "#9c8f6e", "#4f7a3a", "#f4c95d", "#3b4a32", "#26302e"),
    icon: weaponShape(3, [
      "......L",
      ".....Lm",
      "....LmD",
      "...LmmD",
      "...LmmD",
      "..LmmD.",
      "..LmmD.",
      "..LmmD.",
      "tttjttt",
      "...h...",
      "...H...",
      "...h...",
      "..tjt..",
    ]),
    worn: ["...L", "..Lm", ".LmD", ".LmD", "LmD.", "LmD.", "tjt.", ".G..", ".h..", ".j.."],
  },
  "boss-ancient-lizard-greataxe": {
    palette: bossPalette("#a8d08a", "#5f8f45", "#2f4f2a", "#c9b458", "#f4c95d", "#5c3a1c", "#3e2612"),
    icon: weaponShape(1, [
      ".t.....",
      ".hLL...",
      ".hmmL..",
      ".hmDmL.",
      ".hmmmmL",
      ".hjmDmL",
      ".hmmmmL",
      ".hmDmL.",
      ".hmmL..",
      ".hLL...",
      ".h.....",
      ".h.....",
      ".H.....",
      ".h.....",
      ".t.....",
    ]),
    worn: [".t...", ".hLL.", ".hmmL", ".hmDL", ".hjmL", ".hmmL", ".hLL.", ".h...", ".G...", ".h...", ".h...", ".t..."],
  },
  "boss-ancient-lizard-head": {
    palette: bossPalette("#a8d08a", "#5f8f45", "#2f4f2a", "#f5f2ea", "#f4c95d", "#5c3a1c", "#3e2612"),
    icon: {
      grid: [
        "............",
        "....LmmD....",
        "...LmDmmD...",
        "..LmmmmDmD..",
        ".LmmmmmmmmD.",
        ".LjjmmmmjjD.",
        ".LmmmmmmmmD.",
        ".DtDtDDtDtD.",
        ".Lm......mD.",
        ".Lm......mD.",
        "..D......D..",
        "............",
      ],
    },
    worn: [
      "....LmmD....",
      "...LmDmmD...",
      "..LmmmmDmD..",
      "..LjmmmmjD..",
      "..DtDttDtD..",
      "..Lm....mD..",
      "..D......D..",
    ],
  },
  "boss-ancient-lizard-chest": {
    palette: bossPalette("#a8d08a", "#5f8f45", "#2f4f2a", "#c9b458", "#f4c95d", "#5c3a1c", "#3e2612"),
    icon: {
      grid: [
        "............",
        "LmmmD..LmmmD",
        "LmDmmmmmmDmD",
        "LmmmmjjmmmmD",
        "DDLmDmmDmDDD",
        "..LmmmmmmD..",
        "..LDmmDmmD..",
        "..LmmmmmmD..",
        "..LmDmmDmD..",
        "..LmmmmmmD..",
        "..tttttttt..",
        "............",
      ],
    },
  },

  // Das Höhlenauge: violetter und türkiser Kristall, ein starrendes Auge
  "boss-cave-eye-staff": {
    palette: bossPalette("#e6d9ff", "#a07ae0", "#5a3d8c", "#6ff2ff", "#ff4d6d", "#3d3a5c", "#25223d"),
    icon: weaponShape(2, [
      ".mmm.",
      "mwjwm",
      "mjkjm",
      "mwjwm",
      ".mmm.",
      "t.h.t",
      ".tht.",
      "..h..",
      "..H..",
      "..h..",
      "..h..",
      "..H..",
      "..h..",
      "..t..",
    ]),
    worn: [".mmm.", "mwjwm", "mjkjm", "mwjwm", ".mmm.", "t.h.t", "..h..", "..h..", "..G..", "..h..", "..h..", "..t.."],
  },
  "boss-cave-eye-sword": {
    palette: bossPalette("#e8fbff", "#6ff2ff", "#3a8fb0", "#a07ae0", "#ff4d6d", "#3d3a5c", "#25223d"),
    icon: weaponShape(3, [
      "...L...",
      "..LmD..",
      "..LmD..",
      "..LmmD.",
      "..LmD..",
      ".LmmD..",
      "..LmD..",
      "..LmmD.",
      "..LmD..",
      "t.tjt.t",
      "...h...",
      "...H...",
      "..tjt..",
    ]),
    worn: [".L.", ".Lm", "LmD", ".Lm", "LmD", ".Lm", "tjt", ".G.", ".h.", ".t."],
  },
  "boss-cave-eye-head": {
    palette: bossPalette("#e6d9ff", "#a07ae0", "#5a3d8c", "#6ff2ff", "#ff4d6d", "#3d3a5c", "#25223d"),
    icon: {
      grid: [
        "............",
        "..t..tt..t..",
        "..t.tLDt.t..",
        ".LmmmwwmmmD.",
        ".LmmjkkjmmD.",
        ".LmmjkkjmmD.",
        ".LmmmwwmmmD.",
        ".tttttttttt.",
        ".DDDDDDDDDD.",
        "............",
        "............",
        "............",
      ],
    },
    worn: [
      "..t..tt..t..",
      "..LmmwwmmD..",
      "..LmjkkjmD..",
      "..LmmwwmmD..",
      "..tttttttt..",
    ],
  },
  "boss-cave-eye-chest": {
    palette: bossPalette("#e6d9ff", "#a07ae0", "#5a3d8c", "#6ff2ff", "#ff4d6d", "#3d3a5c", "#25223d"),
    icon: {
      grid: [
        ".t........t.",
        "LtmD....LtmD",
        "LmmmmttmmmmD",
        "LmmmtmmtmmmD",
        ".DDLmjjmmDD.",
        "...LtmmtD...",
        "...LmttmD...",
        "...LmmmmD...",
        "...tttttt...",
        "...LmmmmD...",
        "...LmDLmD...",
        "............",
      ],
    },
  },

  // Urmammut Graufrost: Elfenbein, graues Fell, Gletschereis
  "boss-primal-mammoth-greatsword": {
    palette: bossPalette("#fffaf0", "#efe6d2", "#b8a98a", "#9ad9f0", "#4fb0e8", "#6b5a4a", "#4a3e33"),
    icon: weaponShape(4, [
      ".......L.",
      "......LmD",
      ".....LmmD",
      "....LmmD.",
      "....LmmD.",
      "...LmmD..",
      "...LmmD..",
      "...LmmD..",
      "...LmmD..",
      ".tttjttt.",
      "....h....",
      "....H....",
      "....h....",
      "....H....",
      "...tjt...",
    ]),
    worn: ["....L", "...Lm", "..LmD", "..LmD", ".LmD.", ".LmD.", ".LmD.", "ttjtt", "..G..", "..h..", "..H..", "..t.."],
  },
  "boss-primal-mammoth-greathammer": {
    palette: bossPalette("#f2fdff", "#9ad9f0", "#4a8db0", "#ffffff", "#4fb0e8", "#6b5a4a", "#4a3e33"),
    icon: weaponShape(3, [
      ".t.t.t.",
      "LLmmmmD",
      "LmmjmmD",
      "LmmmmmD",
      "D.DhD.D",
      "...h...",
      "...h...",
      "...H...",
      "...h...",
      "...h...",
      "...H...",
      "...h...",
      "...t...",
    ]),
    worn: [
      ".t.t.t.",
      "LLmmmmD",
      "LmmjmmD",
      "LmmmmmD",
      "D.DhD.D",
      "...h...",
      "...h...",
      "...h...",
      "...G...",
      "...h...",
      "...h...",
      "...t...",
    ],
  },
  "boss-primal-mammoth-head": {
    palette: bossPalette("#b5aa9a", "#8a7f70", "#4a4239", "#fffaf0", "#4fb0e8", "#6b5a4a", "#4a3e33"),
    icon: {
      grid: [
        "t..........t",
        "t..........t",
        ".t..LmmD..t.",
        ".t.LmmmmD.t.",
        "..tLmmmmDt..",
        "..LmmjjmmD..",
        "..LmmmmmmD..",
        ".LmmmmmmmmD.",
        ".DDDDDDDDDD.",
        "............",
        "............",
        "............",
      ],
    },
    worn: [
      ".t..LmmD..t.",
      "..tLmmmmDt..",
      "..LmmjjmmD..",
      ".LmmmmmmmmD.",
      "..D......D..",
    ],
  },
  "boss-primal-mammoth-chest": {
    palette: bossPalette("#c9bfae", "#8a7f70", "#4a4239", "#fffaf0", "#4fb0e8", "#6b5a4a", "#4a3e33"),
    icon: {
      grid: [
        "............",
        ".LLmD..LLmD.",
        "LmLmmttmmLmD",
        "LmmLmmmmLmmD",
        ".DDLmmmmmDD.",
        "...LtmmtD...",
        "...LmjjmD...",
        "...LtmmtD...",
        "...LmmmmD...",
        "...LmmmmD...",
        "...DmDmDm...",
        "............",
      ],
    },
  },

  // Der Lichkönig: dunkles Eisen, Knochen, grünes Seelenfeuer
  "boss-lich-king-sword": {
    palette: bossPalette("#b4f5c8", "#2b2238", "#120d1a", "#7dd3a8", "#7dd3a8", "#4f4266", "#251d33"),
    icon: weaponShape(3, [
      "...L...",
      "..LmD..",
      "..LtD..",
      "..LmD..",
      "..LtD..",
      "..LmD..",
      "..LtD..",
      "..LmD..",
      "tttjttt",
      ".t.h.t.",
      "...H...",
      "...h...",
      "..tjt..",
    ]),
    worn: [".L.", "LmD", "LtD", "LmD", "LtD", "LmD", "tjt", ".G.", ".h.", ".j."],
  },
  "boss-lich-king-scepter": {
    palette: bossPalette("#f5f2ea", "#d9cfae", "#8a7f70", "#b07cff", "#7dd3a8", "#4f4266", "#251d33"),
    icon: weaponShape(2, [
      ".LmD.",
      "LmmmD",
      "LjmjD",
      "LmkmD",
      ".tDt.",
      "..t..",
      "..h..",
      "..H..",
      "..h..",
      "..H..",
      "..t..",
      "..j..",
    ]),
    worn: [".LmD.", "LjmjD", "LmkmD", ".tDt.", "..h..", "..h..", "..G..", "..h..", "..j.."],
  },
  "boss-lich-king-head": {
    palette: bossPalette("#6d5a8c", "#2e2540", "#140f1c", "#b4f5c8", "#7dd3a8", "#4f4266", "#251d33"),
    icon: {
      grid: [
        "............",
        ".t...tt...t.",
        ".L...LD...D.",
        ".Lm.LmmD.mD.",
        ".LmmmmmmmmD.",
        ".LjmmjjmmjD.",
        ".LmmmmmmmmD.",
        ".tttttttttt.",
        ".DDDDDDDDDD.",
        "............",
        "............",
        "............",
      ],
    },
    worn: [
      "..t..tt..t..",
      "..L..LD..D..",
      "..LmLmmDmD..",
      "..LjmjjmjD..",
      "..tttttttt..",
    ],
  },
  "boss-lich-king-chest": {
    palette: bossPalette("#4f4266", "#2e2540", "#140f1c", "#e8e1d4", "#7dd3a8", "#4f4266", "#251d33"),
    icon: {
      grid: [
        "............",
        ".LmmD..LmmD.",
        "LmmmmjjmmmmD",
        "LmmmmttmmmmD",
        ".DDLttttmDD.",
        "...LmttmD...",
        "...LttttD...",
        "...LmttmD...",
        "...LmmmmD...",
        "..LmmmmmmD..",
        ".LmmmmmmmmD.",
        ".DDDDDDDDDD.",
      ],
    },
  },

  // Ignaroth: Drachenrot, Gold, Glut
  "boss-ignaroth-greatsword": {
    palette: bossPalette("#ffe28f", "#f08a2c", "#a3361e", "#f4c95d", "#ff5a3c", "#621a22", "#3a0f14"),
    icon: weaponShape(4, [
      "....L....",
      "...LL....",
      "...LmD...",
      "..LmmD...",
      "...LmmD..",
      "..LmmmD..",
      "..LmmD...",
      "...LmmD..",
      "..LmmmD..",
      "..LmmmD..",
      "ttttjtttt",
      "....h....",
      "....H....",
      "....h....",
      "...tjt...",
    ]),
    worn: ["..L..", ".LL..", ".LmD.", "LmmD.", ".LmmD", "LmmD.", ".LmmD", "ttjtt", "..G..", "..h..", "..H..", ".tjt."],
  },
  "boss-ignaroth-greataxe": {
    palette: bossPalette("#ff9d8c", "#c23a3a", "#621a22", "#f4c95d", "#ffe28f", "#3a0f14", "#1b0a0c"),
    icon: weaponShape(1, [
      ".t.....",
      ".hmL...",
      ".hmmL..",
      ".hmmmL.",
      ".hmmD.L",
      ".hjmmL.",
      ".hmmD.L",
      ".hmmmL.",
      ".hmmD.L",
      ".hmL...",
      ".h.....",
      ".h.....",
      ".H.....",
      ".h.....",
      ".t.....",
    ]),
    worn: [".t....", ".hmL..", ".hmmL.", ".hmD.L", ".hjmL.", ".hmD.L", ".hmmL.", ".hmL..", ".G....", ".h....", ".h....", ".t...."],
  },
  "boss-ignaroth-head": {
    palette: bossPalette("#ff9d8c", "#c23a3a", "#621a22", "#f4c95d", "#ffe28f", "#3a0f14", "#1b0a0c"),
    icon: {
      grid: [
        "t..........t",
        ".t........t.",
        ".tt.LmmD.tt.",
        "..tLmmmmDt..",
        "..LmmmmmmD..",
        ".LjjmmmmjjD.",
        ".LmmmmmmmmD.",
        ".DtDtDDtDtD.",
        "..Lm....mD..",
        "..Lm....mD..",
        "...D....D...",
        "............",
      ],
    },
    worn: [
      ".t..LmmD..t.",
      "..tLmmmmDt..",
      "..LjmmmmjD..",
      "..LmmmmmmD..",
      "..tDtDDtDt..",
      "..Lm....mD..",
    ],
  },
  "boss-ignaroth-chest": {
    palette: bossPalette("#ff9d8c", "#c23a3a", "#621a22", "#f4c95d", "#ffe28f", "#3a0f14", "#1b0a0c"),
    icon: {
      grid: [
        "............",
        "LmmmD..LmmmD",
        "LmDmmttmmDmD",
        "LmmmmjjmmmmD",
        "DDLmmmmmmDDD",
        "..LmDmmDmD..",
        "..tttttttt..",
        "..LDmmDmmD..",
        "..LmDmmDmD..",
        "..LmmmmmmD..",
        "..tttttttt..",
        "............",
      ],
    },
  },

  // Je eine dritte Waffe pro Gebietsboss
  "boss-goblin-chief-bow": {
    // Knochenbogen mit grünen Wicklungen
    palette: bossPalette("#e8dcc0", "#a89a78", "#6b5a40", "#7fbf4a", "#e04848", "#8d6e4a", "#4b3524"),
    icon: {
      grid: [
        "...tL.......",
        "...w.mm.....",
        "...w..mD....",
        "...w..tD....",
        "...w...hH...",
        "...w...jH...",
        "...w...hH...",
        "...w..tD....",
        "...w..mD....",
        "...w.mm.....",
        "...tL.......",
        "............",
      ],
    },
    worn: ["tL..", "w.m.", "w.mD", "w.tD", "w..h", "w..j", "G..h", "w.tD", "w.mD", "w.m.", "tL.."],
  },
  "boss-ancient-lizard-dagger": {
    // Ein Giftzahn als Klinge
    palette: bossPalette("#a8d08a", "#5f8f45", "#2f4f2a", "#f5f2ea", "#7dd3a8", "#5c3a1c", "#3e2612"),
    icon: weaponShape(2, ["..w..", "..wL.", ".wwL.", ".wLm.", ".LmD.", "tLjDt", ".ttt.", "..h..", "..H..", "..t.."]),
    worn: ["..w", ".wL", "wLm", "LmD", "tjt", ".G.", ".h.", ".t."],
  },
  "boss-cave-eye-shield": {
    // Kristallspiegel mit dem Auge in der Mitte
    palette: bossPalette("#e6d9ff", "#a07ae0", "#5a3d8c", "#6ff2ff", "#ff4d6d", "#3d3a5c", "#25223d"),
    icon: {
      grid: [
        "............",
        "....tttt....",
        "..ttLmmDtt..",
        ".tLmmmmmmDt.",
        ".tLmwjjwmDt.",
        ".tLmjkkjmDt.",
        ".tLmjkkjmDt.",
        ".tLmwjjwmDt.",
        ".tLmmmmmmDt.",
        "..ttLmmDtt..",
        "....tttt....",
        "............",
      ],
    },
    worn: [".ttt.", "tLjDt", "tjkjt", "tLjDt", ".ttt."],
  },
  "boss-primal-mammoth-bow": {
    // Elfenbein mit Frostkristallen an den Enden
    palette: bossPalette("#fffaf0", "#efe6d2", "#b8a98a", "#9ad9f0", "#4fb0e8", "#6b5a4a", "#4a3e33"),
    icon: {
      grid: [
        "..jL........",
        "...wLm......",
        "...w.mD.....",
        "...w..mD....",
        "...w...hH...",
        "...w...jH...",
        "...w...hH...",
        "...w..mD....",
        "...w.mD.....",
        "...wLm......",
        "..jL........",
        "............",
      ],
    },
    worn: ["jL...", ".wLm.", ".w.mD", ".w..m", ".w..h", ".w..j", ".G..h", ".w..m", ".w.mD", ".wLm.", "jL..."],
  },
  "boss-lich-king-greathammer": {
    // Grabstein als Hammerkopf, Totenkopf-Zierde
    palette: bossPalette("#8f7cad", "#4f4266", "#251d33", "#b4f5c8", "#7dd3a8", "#4f4266", "#251d33"),
    icon: weaponShape(3, [
      "...j...",
      ".LmmmD.",
      "LmktkmD",
      "LmmmmmD",
      ".DDhDD.",
      "...h...",
      "...t...",
      "...h...",
      "...H...",
      "...h...",
      "...t...",
      "...h...",
      "...j...",
    ]),
    worn: ["LmmmD", "LktkD", "LmmmD", ".DhD.", "..h..", "..t..", "..h..", "..G..", "..h..", "..t..", "..j.."],
  },
  "boss-ignaroth-mace": {
    // Glühender Morgenstern
    palette: bossPalette("#ffe28f", "#f08a2c", "#a3361e", "#f4c95d", "#ff5a3c", "#621a22", "#3a0f14"),
    icon: weaponShape(3, [
      "...j...",
      ".t.t.t.",
      "..LmD..",
      "tLmjmDt",
      "..LmD..",
      ".t.t.t.",
      "...D...",
      "...h...",
      "...H...",
      "...h...",
      "...H...",
      "...t...",
    ]),
    worn: ["t.t.t", ".LmD.", "tLjDt", ".LmD.", "t.t.t", "..h..", "..G..", "..h..", "..t.."],
  },
};

// --- Dungeon-Sets ------------------------------------------------------------
// Waffen und Helme mit eigener Form, die übrigen Rüstungsteile nutzen die
// Standardformen in den Farben des Sets – so ist das ganze Set am Helden einheitlich.

/** Brust, Arme, Beine und Schuhe eines Dungeon-Sets: Standardform, Set-Farben. */
function dungeonArmor(
  bossId: string,
  palette: Record<string, string>,
  shapes: { chest: number; arms: number; legs: number; feet: number },
  chestPalette = palette,
): Record<string, BossLook> {
  return {
    [`boss-${bossId}-chest`]: { palette: chestPalette, icon: ICONS.chest[shapes.chest] },
    [`boss-${bossId}-arms`]: { palette, icon: ICONS.arms[shapes.arms] },
    [`boss-${bossId}-legs`]: { palette, icon: ICONS.legs[shapes.legs] },
    [`boss-${bossId}-feet`]: { palette, icon: ICONS.feet[shapes.feet] },
  };
}

const MINE = bossPalette("#c8cdd5", "#8a909a", "#4c505a", "#c0602f", "#ffcc40", "#6b4a2b", "#4a3020");
const TEMPLE = bossPalette("#fff1a8", "#f4c95d", "#a8781e", "#3a6ad0", "#3ad6c5", "#3a6ad0", "#22457a");
const STORM = bossPalette("#b8e3ff", "#4a7ac0", "#22457a", "#ffe66b", "#ffffff", "#3b4252", "#22262e");
const VOID = bossPalette("#8a5aba", "#3a2a5a", "#1a1028", "#4af0ff", "#4af0ff", "#1a1028", "#0e0814");

const DUNGEON_LOOKS: Record<string, BossLook> = {
  // Verlassene Mine: Eisen, Kupfer, Laternenlicht
  "boss-ore-king-dagger": {
    palette: bossPalette("#e0e4ea", "#9aa0aa", "#50545e", "#c0602f", "#ffcc40", "#6b4a2b", "#4a3020"),
    icon: weaponShape(2, ["..L..", "..LD.", ".LmD.", ".LmD.", ".LmD.", "tLmDt", "ttjtt", "..h..", "..H..", "..t.."]),
    worn: [".L.", ".LD", "LmD", "LmD", "tjt", ".G.", ".h.", ".t."],
  },
  "boss-ore-king-shield": {
    palette: bossPalette("#c0c8d0", "#7a808a", "#4a4e58", "#c0602f", "#ffcc40", "#6b4a2b", "#4a3020"),
    icon: {
      grid: [
        ".tttttttttt.",
        ".tLmmmmmmDt.",
        ".tLmjmmjmDt.",
        ".tLmmmmmmDt.",
        ".tLmmjjmmDt.",
        ".tLmmjjmmDt.",
        ".tLmmmmmmDt.",
        "..tLmjmmDt..",
        "..tLmmmmDt..",
        "...tLmmDt...",
        "....tttt....",
        "............",
      ],
    },
    worn: ["ttttt", "tLjDt", "tmjmt", "tLmDt", ".tDt.", "..t.."],
  },
  "boss-ore-king-head": {
    palette: bossPalette("#c8cdd5", "#8a909a", "#4c505a", "#c0602f", "#ffe66b", "#6b4a2b", "#4a3020"),
    icon: {
      grid: [
        "............",
        ".....jj.....",
        "....tjjt....",
        "...LmttmD...",
        "..LmmmmmmD..",
        "..LmmmmmmD..",
        "..LmmmmmmD..",
        ".tttttttttt.",
        "LmmmmmmmmmmD",
        ".DDDDDDDDDD.",
        "............",
        "............",
      ],
    },
    worn: [".....jj.....", "....tjjt....", "...LmmmmD...", ".LmmmmmmmmD."],
  },
  ...dungeonArmor("ore-king", MINE, { chest: 0, arms: 1, legs: 0, feet: 0 }),

  // Versunkener Tempel: Gold, Lapislazuli, Türkis
  "boss-high-priestess-scepter": {
    palette: bossPalette("#fff1a8", "#f4c95d", "#a8781e", "#3ad6c5", "#ff8c3a", "#f4c95d", "#a8781e"),
    icon: weaponShape(3, [
      "...t...",
      ".t.j.t.",
      "..jjj..",
      "tjjLjjt",
      "..jjj..",
      ".t.j.t.",
      "...m...",
      "..tmt..",
      "...m...",
      "...m...",
      "...m...",
      "...t...",
    ]),
    worn: [".t.", "jjj", "jLj", "jjj", ".m.", ".m.", ".G.", ".m.", ".t."],
  },
  "boss-high-priestess-mace": {
    palette: bossPalette("#7af0e0", "#3ad6c5", "#1a7a70", "#f4c95d", "#3a6ad0", "#f4c95d", "#a8781e"),
    icon: weaponShape(2, [".t.t.", ".LmD.", "LmjmD", "LmmmD", "tLmDt", ".tmt.", "..h..", "..h..", "..H..", "..h..", "..t.."]),
    worn: [".t.t.", "LmjmD", "LmmmD", "tLmDt", "..h..", "..G..", "..h..", "..t.."],
  },
  "boss-high-priestess-head": {
    palette: bossPalette("#fff1a8", "#f4c95d", "#a8781e", "#3a6ad0", "#3ad6c5", "#3a6ad0", "#22457a"),
    icon: {
      grid: [
        "............",
        ".....jj.....",
        "....LmmD....",
        "...LtmtmD...",
        "..LmtmtmtD..",
        "..Lt....tD..",
        "..Lm....mD..",
        "..Lt....tD..",
        "..Lm....mD..",
        "..LtD..LtD..",
        "...D....D...",
        "............",
      ],
    },
    worn: [
      ".....jj.....",
      "....LmmD....",
      "...LtmtmD...",
      "..LmtmtmtD..",
      "..Lt....tD..",
      "..Lm....mD..",
      "..Lt....tD..",
    ],
  },
  ...dungeonArmor(
    "high-priestess",
    TEMPLE,
    { chest: 0, arms: 0, legs: 1, feet: 1 },
    bossPalette("#ffffff", "#efe6d2", "#b8a98a", "#f4c95d", "#3ad6c5", "#3a6ad0", "#22457a"),
  ),

  // Gewitterturm: Sturmblau, Silber, Blitzgelb
  "boss-storm-lord-axe": {
    palette: bossPalette("#ffe66b", "#5a8ad0", "#2a4a8a", "#ffe66b", "#ffffff", "#3b4252", "#22262e"),
    icon: weaponShape(1, [
      ".t.....",
      ".hmL...",
      ".hmmL..",
      ".hmjmL.",
      ".hmtmmL",
      ".hmmtL.",
      ".hmL...",
      ".h.....",
      ".h.....",
      ".H.....",
      ".h.....",
      ".t.....",
    ]),
    worn: [".t...", ".hmL.", ".hjmL", ".htmL", ".hmL.", ".h...", ".G...", ".h...", ".t..."],
  },
  "boss-storm-lord-staff": {
    palette: bossPalette("#ffffff", "#ffe66b", "#c0a020", "#5a8ad0", "#b8e3ff", "#2a4a8a", "#1a2a5a"),
    icon: weaponShape(2, [
      "m...m",
      ".m.m.",
      "..j..",
      ".jLj.",
      "..j..",
      ".tht.",
      "..h..",
      "..H..",
      "..h..",
      "..h..",
      "..H..",
      "..h..",
      "..t..",
    ]),
    worn: ["m...m", ".m.m.", ".jLj.", "..j..", ".tht.", "..h..", "..h..", "..h..", "..G..", "..h..", "..h..", "..t.."],
  },
  "boss-storm-lord-head": {
    palette: bossPalette("#e0e8f5", "#5a8ad0", "#2a4a8a", "#ffe66b", "#ffffff", "#3b4252", "#22262e"),
    icon: {
      grid: [
        "............",
        "L....jj....L",
        "LL..LmmD..LL",
        ".LLLmmmmDLL.",
        "..LmmmmmmD..",
        "..LmmmmmmD..",
        "..tttttttt..",
        "..LktmmtkD..",
        "..LmmmmmmD..",
        "...DDDDDD...",
        "............",
        "............",
      ],
    },
    worn: ["L....jj....L", "LL..LmmD..LL", ".LLLmmmmDLL.", "..LmmmmmmD..", "..tttttttt..", "..mm....mm.."],
  },
  ...dungeonArmor("storm-lord", STORM, { chest: 1, arms: 1, legs: 0, feet: 0 }),

  // Abgrund der Leere: Schwarzviolett mit türkisem Leuchten
  "boss-void-lord-dagger": {
    palette: VOID,
    icon: weaponShape(2, ["...L.", "..LD.", "..mD.", ".LmD.", ".LD..", ".LmD.", "tLmDt", ".tjt.", "..h..", "..H..", "..j.."]),
    worn: ["..L", ".LD", ".mD", "LmD", "tjt", ".G.", ".h.", ".j."],
  },
  "boss-void-lord-shield": {
    palette: VOID,
    icon: {
      grid: [
        "..tttttttt..",
        ".tLmmmmmmDt.",
        ".tLmmmmmmDt.",
        ".tLmwwwwmDt.",
        ".tLwjkkjwDt.",
        ".tLmwwwwmDt.",
        ".tLmmmmmmDt.",
        "..tLmmmmDt..",
        "..tLmmmmDt..",
        "...tLmmDt...",
        "....tLDt....",
        ".....tt.....",
      ],
    },
    worn: ["ttttt", "tLmDt", "twjwt", "tLkDt", "tmmDt", ".tDt."],
  },
  "boss-void-lord-head": {
    palette: VOID,
    icon: {
      grid: [
        "............",
        ".t..t..t..t.",
        ".j..j..j..j.",
        ".t..t..t..t.",
        ".LmmmmmmmmD.",
        ".LmjmmmmjmD.",
        ".LmmmmmmmmD.",
        ".DDDDDDDDDD.",
        "..t......t..",
        "..t......t..",
        "...t....t...",
        "............",
      ],
    },
    worn: ["..j..jj..j..", "..t..tt..t..", "..LmmmmmmD..", "..LjmmmmjD..", "..t......t..", "..t......t.."],
  },
  ...dungeonArmor("void-lord", VOID, { chest: 1, arms: 2, legs: 0, feet: 0 }),
};

Object.assign(BOSS_LOOKS, DUNGEON_LOOKS);

/** Kleinste Kantenlänge eines Symbols – kleine Items (Dolch, Schuhe) wirken dadurch auch kleiner. */
const ICON_SIZE = 12;

/**
 * Kippt eine aufrecht gezeichnete Waffe um 45°, Spitze nach rechts oben.
 * Jede Zeile wandert einen Pixel nach links unten; seitliche Pixel werden
 * abwechselnd waagrecht und senkrecht versetzt, damit die Waffe lückenlos bleibt.
 */
function tilt(grid: readonly string[], axis: number): string[] {
  const cells: [number, number, string][] = [];
  grid.forEach((row, s) =>
    [...row].forEach((ch, c) => {
      if (ch === ".") return;
      const o = c - axis;
      const dx = o > 0 ? Math.ceil(o / 2) : -Math.floor(-o / 2);
      const dy = o > 0 ? Math.floor(o / 2) : -Math.ceil(-o / 2);
      cells.push([dx - s, dy + s, ch]);
    }),
  );
  return cellsToGrid(cells);
}

/** Legt Pixel zentriert in ein quadratisches Raster (mindestens ICON_SIZE). */
function cellsToGrid(cells: [number, number, string][]): string[] {
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const width = Math.max(...xs) - minX + 1;
  const height = Math.max(...ys) - minY + 1;
  const size = Math.max(ICON_SIZE, width, height);
  const offX = Math.floor((size - width) / 2) - minX;
  const offY = Math.floor((size - height) / 2) - minY;
  const rows = Array.from({ length: size }, () => Array<string>(size).fill("."));
  for (const [x, y, ch] of cells) rows[y + offY][x + offX] = ch;
  return rows.map((r) => r.join(""));
}

const shapeGrid = (shape: IconShape): readonly string[] =>
  shape.axis === undefined ? shape.grid : tilt(shape.grid, shape.axis);

const ICON_GRIDS = new Map<string, readonly string[]>();
const ITEM_SPRITES = new Map<string, SpriteDef>();

/** Symbol eines Items (wird pro Item zwischengespeichert). */
export function getItemSprite(def: ItemDef): SpriteDef {
  let sprite = ITEM_SPRITES.get(def.id);
  if (!sprite) {
    const shape = def.bossId ? BOSS_LOOKS[def.id].icon : ICONS[def.type][getItemParts(def).noun];
    const key = def.bossId ? def.id : `${def.type}-${getItemParts(def).noun}`;
    let grid = ICON_GRIDS.get(key);
    if (!grid) {
      grid = shapeGrid(shape);
      ICON_GRIDS.set(key, grid);
    }
    sprite = { grid, palette: itemPalette(def) };
    ITEM_SPRITES.set(def.id, sprite);
  }
  return sprite;
}

// --- Am Helden getragene Ausrüstung -----------------------------------------

/**
 * Waffen in der Hand des Helden, aufrecht. `G` liegt unter der Hand.
 * Bei Bögen hält die Hand die Sehne (wie beim Spannen); die Wölbung zeigt nach vorn zum Gegner.
 */
const WORN_WEAPONS: Record<Exclude<WeaponType, "shield">, readonly string[]> = {
  dagger: [".L.", ".Lm", ".Lm", "tjt", ".G.", ".h.", ".t."],
  sword: [".L.", ".Lm", ".Lm", ".Lm", ".Lm", ".LD", "tjt", ".G.", ".h.", ".t."],
  greatsword: ["..L..", ".LmD.", ".LmD.", ".LmD.", ".LmD.", ".LmD.", "ttjtt", "..G..", "..h..", "..h..", "..t.."],
  axe: [".t..", ".hmL", ".hjL", ".h..", ".h..", ".G..", ".h..", ".t.."],
  greataxe: ["..t..", "LmhmL", "LmjmL", ".mhm.", "..h..", "..h..", "..h..", "..G..", "..h..", "..h..", "..t.."],
  staff: [".j.", "jwj", "mjm", ".h.", ".h.", ".h.", ".h.", ".G.", ".h.", ".h.", ".h."],
  scepter: [".j.", "tmt", ".m.", ".m.", ".G.", ".m.", ".t."],
  mace: [".t.", "LmD", "LjD", "LmD", ".h.", ".h.", ".G.", ".h.", ".t."],
  greathammer: ["LmmmD", "LmjmD", "LmmmD", "..h..", "..h..", "..h..", "..h..", "..G..", "..h..", "..h..", "..t.."],
  bow: ["wL..", "w.m.", "w.mD", "w..m", "w..m", "w..h", "G..j", "w..h", "w.mD", "w.m.", "wL.."],
};

/** Schilde vor der Hand, eine Form pro Namensform. */
const WORN_SHIELDS: readonly (readonly string[])[] = [
  ["ttttt", "tLmDt", "tLjDt", "tmmDt", ".tDt.", "..t.."], // Schild
  [".ttt.", "tLmDt", "tmjmt", "tmmDt", ".ttt."], // Rundschild
  ["ttttt", "tLmDt", "tLjDt", "tLmDt", "tLmDt", "tDDDt"], // Turmschild
];

/** Kopfbedeckungen im Heldenraster, oberste Zeile liegt zwei Pixel über dem Kopf. */
const WORN_HELMETS: readonly (readonly string[])[] = [
  [ // Helm mit Federbusch und Wangenschutz
    ".....jj.....",
    "...LmmmmD...",
    "..LmmmmmmD..",
    "..LmmmmmmD..",
    "..tttttttt..",
    "..mm....mm..",
  ],
  [ // Haube mit breiter Krempe
    "............",
    "....LmmD....",
    "...LmmmmD...",
    ".LmmjjmmmmD.",
  ],
];

export interface WornSprite {
  sprite: SpriteDef;
  /** Griffstelle im Raster (nur Waffen). */
  grip: { x: number; y: number };
}

/** Position von `G`; Schilde haben keins und werden mittig knapp unter dem oberen Rand gehalten. */
function findGrip(grid: readonly string[]): { x: number; y: number } {
  const y = grid.findIndex((row) => row.includes("G"));
  return y < 0 ? { x: Math.floor(grid[0].length / 2), y: 1 } : { x: grid[y].indexOf("G"), y };
}

/** Getragene Waffe, auf Wunsch gespiegelt (für die linke Hand). */
export function getWornWeapon(def: ItemDef, mirrored = false): WornSprite {
  const bossWorn = def.bossId ? BOSS_LOOKS[def.id].worn : undefined;
  const base =
    bossWorn ??
    (def.type === "shield"
      ? WORN_SHIELDS[def.bossId ? 0 : getItemParts(def).noun]
      : WORN_WEAPONS[def.type as keyof typeof WORN_WEAPONS]);
  const grid = mirrored ? base.map((row) => [...row].reverse().join("")) : base;
  return { sprite: { grid, palette: itemPalette(def) }, grip: findGrip(grid) };
}

export function getWornHelmet(def: ItemDef): SpriteDef {
  const grid = def.bossId ? (BOSS_LOOKS[def.id].worn ?? WORN_HELMETS[0]) : WORN_HELMETS[getItemParts(def).noun];
  return { grid, palette: itemPalette(def) };
}
