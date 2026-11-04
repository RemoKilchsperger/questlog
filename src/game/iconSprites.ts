// Pixel-Icons für die Oberfläche – Ersatz für Emojis, die die Spielwelt brechen.
// Abgelegt nach dem Emoji, das sie ersetzen: So zeigt <GameIcon icon="🪙" /> das
// Pixelbild, sobald es eines gibt, und sonst weiter das Emoji. Neue Icons lassen
// sich nach und nach ergänzen, ohne die Spieldaten umzubauen.
//
// Raster 12 × 12, den dunklen Umriss ergänzt renderSprite. Licht kommt von links oben.

import { COMBAT_ICONS } from "./icons/combatIcons";
import { UI_ICONS } from "./icons/uiIcons";
import { VILLAGE_ICONS } from "./icons/villageIcons";
import { WORLD_ICONS } from "./icons/worldIcons";
import type { SpriteDef } from "./sprites";

const GOLD = { Y: "#fff1a8", y: "#f4c95d", o: "#c4842a", d: "#7a4e12" };
const STEEL = { L: "#eef3f9", m: "#aab6c6", D: "#5a6475" };
const WOOD = { t: "#a0683a", T: "#5c3a1c" };

const coin: SpriteDef = {
  grid: [
    "....dddd....",
    "..ddyyyydd..",
    ".dyYYyyyyod.",
    ".dYyyyyyyod.",
    "dyYyyooyyyod",
    "dyYyoyyoyyod",
    "dyYyoyyoyyod",
    "dyyyyooyyyod",
    ".dyyyyyyyod.",
    ".dooyyyyood.",
    "..ddoooodd..",
    "....dddd....",
  ],
  palette: GOLD,
};

const heart: SpriteDef = {
  grid: [
    ".rrr....rrr.",
    "rWWrr..rrrrr",
    "rWrrrrrrrrrR",
    "rrrrrrrrrrrR",
    "rrrrrrrrrrRR",
    ".rrrrrrrrRR.",
    "..rrrrrrRR..",
    "...rrrrRR...",
    "....rrRR....",
    ".....RR.....",
  ],
  palette: { W: "#ffb3a8", r: "#e04848", R: "#9a2430" },
};

const shield: SpriteDef = {
  grid: [
    "gggggggggggg",
    "gLLLLgmmmmDg",
    "gLLLLgmmmmDg",
    "gLLLLgmmmmDg",
    "gggggggggggg",
    "gLLLLgmmmmDg",
    ".gLLLgmmmDg.",
    ".gLLLgmmmDg.",
    "..gLLgmmDg..",
    "...gLgmDg...",
    "....gggg....",
  ],
  palette: { ...STEEL, g: "#c4842a" },
};

const swords: SpriteDef = {
  grid: [
    "L..........L",
    "mL........Lm",
    ".mL......Lm.",
    "..mL....Lm..",
    "...mL..Lm...",
    "....mLLm....",
    "....LmmL....",
    "...Lm..mL...",
    ".g.L....L.g.",
    "..gg....gg..",
    ".tTg....gTt.",
    "tT........Tt",
  ],
  palette: { ...STEEL, g: "#f4c95d", ...WOOD },
};

const burst: SpriteDef = {
  grid: [
    ".....Y......",
    ".Y...Y...Y..",
    "..Y.YyY.Y...",
    "...YyoyY....",
    ".YYyorroyYY.",
    "YyyorWWroyyY",
    ".YYyorroyYY.",
    "...YyoyY....",
    "..Y.YyY.Y...",
    ".Y...Y...Y..",
    ".....Y......",
  ],
  palette: { W: "#ffffff", Y: "#fff1a8", y: "#f4c95d", o: "#f08a2c", r: "#e04848" },
};

const drop: SpriteDef = {
  grid: [
    ".....b......",
    ".....b......",
    "....bBb.....",
    "....bBb.....",
    "...bWBBb....",
    "...bWBBb....",
    "..bWBBBBb...",
    "..bWBBBBb...",
    "..bBBBBBb...",
    "..bBBBBDb...",
    "...bBBDb....",
    "....bbb.....",
  ],
  palette: { W: "#e3f2ff", B: "#5fa8f0", b: "#3466b8", D: "#2a4f94" },
};

const lock: SpriteDef = {
  grid: [
    "...mmmmm....",
    "..mL...Dm...",
    "..m.....m...",
    "..m.....D...",
    ".yyyyyyyyy..",
    ".yYYYYYYYo..",
    ".yYyyddyyo..",
    ".yYyyddyyo..",
    ".yYyyydyyo..",
    ".yyyyyyyyo..",
    ".ooooooooo..",
  ],
  palette: { ...STEEL, ...GOLD },
};

const scroll: SpriteDef = {
  grid: [
    ".rrrrrrrrrr.",
    "rRPPPPPPPPRr",
    ".rrrrrrrrrr.",
    "..PPPPPPPP..",
    "..PllllllP..",
    "..PPPPPPPP..",
    "..PlllllPP..",
    "..PPPPPPPP..",
    "..PllllPPP..",
    ".rrrrrrrrrr.",
    "rRPPPPPPPPRr",
    ".rrrrrrrrrr.",
  ],
  palette: { P: "#efe6d2", l: "#9a8a6a", r: "#b89a6a", R: "#e2d2ae" },
};

const wizardHat: SpriteDef = {
  grid: [
    "........P...",
    ".......PP...",
    "......PPp...",
    ".....PPPp...",
    ".....PYPp...",
    "....PPPPPp..",
    "....PPPPPp..",
    "...PPPPPPPp.",
    "...yyyyyyyy.",
    "..PPPPPPPPPp",
    "bbbbbbbbbbbb",
  ],
  palette: { P: "#6a5ad0", p: "#3d2f8a", Y: "#fff1a8", y: "#f4c95d", b: "#2e2470" },
};

const tree: SpriteDef = {
  grid: [
    "....gggg....",
    "..gGGGgggg..",
    ".gGGggggggd.",
    "gGGgggggggdd",
    "gGgggggggddd",
    ".gggggggddd.",
    "..gggddddd..",
    ".....tT.....",
    ".....tT.....",
    ".....tT.....",
    "....ttTT....",
  ],
  palette: { G: "#8fd07a", g: "#4f9e5a", d: "#2f6a3c", ...WOOD },
};

const backpack: SpriteDef = {
  grid: [
    "....DDDD....",
    "...D....D...",
    "..LLLLLLLL..",
    ".LLLLLLLLLm.",
    ".mmmmmmmmmm.",
    ".LmmmyymmmD.",
    ".LmmmmmmmmD.",
    ".LmLLLLLLmD.",
    ".LmLmmmmLmD.",
    ".LmLLLLLLmD.",
    ".mmmmmmmmmD.",
    ".DDDDDDDDDD.",
  ],
  palette: { L: "#c08850", m: "#8a5a2b", D: "#5c3a1c", y: "#f4c95d" },
};

const house: SpriteDef = {
  grid: [
    ".....rr.....",
    "....rRRr....",
    "...rRRRRr...",
    "..rRRRRRRr..",
    ".rRRRRRRRRr.",
    "rrrrrrrrrrrr",
    ".WWWWWWWWWw.",
    ".WyyWWWWWWw.",
    ".WyyWWhhWWw.",
    ".WWWWWhhWWw.",
    ".WWWWWhhWWw.",
    ".wwwwwhhwww.",
  ],
  palette: { R: "#e0612f", r: "#a3361e", W: "#e8dcc0", w: "#b8a888", y: "#f4c95d", h: "#5c3a1c" },
};

const trophy: SpriteDef = {
  grid: [
    "..yyyyyyyy..",
    "yyYYyyyyyoyy",
    "y.YYyyyyyo.y",
    "y.Yyyyyyyo.y",
    ".yYyyyyyyoy.",
    "...Yyyyyo...",
    "....yyoo....",
    ".....yo.....",
    ".....yo.....",
    "...oyyyyo...",
    "..dddddddd..",
    "..dddddddd..",
  ],
  palette: GOLD,
};

const question: SpriteDef = {
  grid: [
    "...yyyyy....",
    "..yYYYYYy...",
    ".yYy...yYo..",
    ".yo....yYo..",
    "......yYo...",
    ".....yYo....",
    "....yYo.....",
    "....yYo.....",
    "............",
    "....yYo.....",
    "....ooo.....",
  ],
  palette: GOLD,
};

const gem: SpriteDef = {
  grid: [
    ".....c......",
    "....cWc.....",
    "...cWCCc....",
    "..cWCCCCc...",
    ".cWCCCCCCc..",
    "cCCCCCCCCDc.",
    ".cCCCCCCDc..",
    "..cCCCCDc...",
    "...cCCDc....",
    "....cDc.....",
    ".....c......",
  ],
  palette: { W: "#ffffff", C: "#6fe0e8", c: "#2fa5b0", D: "#1f7a85" },
};

const hammer: SpriteDef = {
  grid: [
    ".DDDDDDDD...",
    "DLLLLLLLLD..",
    "DLmmmmmmmD..",
    ".DDDDtDDD...",
    ".....tT.....",
    ".....tT.....",
    ".....tT.....",
    ".....tT.....",
    ".....tT.....",
    ".....tT.....",
    "....TTTT....",
  ],
  palette: { ...STEEL, ...WOOD },
};

const anvil: SpriteDef = {
  grid: [
    "LLLLLLLLLLLL",
    ".LmmmmmmmmmD",
    "...LmmmmmD..",
    "....LmmmD...",
    "....LmmmD...",
    "...LmmmmmD..",
    "..LmmmmmmmD.",
    "..DDDDDDDDD.",
  ],
  palette: { L: "#9aa2ae", m: "#5f6672", D: "#363b45" },
};

const flask: SpriteDef = {
  grid: [
    "....hhhh....",
    ".....gg.....",
    ".....gg.....",
    "....gWgg....",
    "...gWggggg..",
    "..gWppppppg.",
    "..gpPppppDg.",
    "..gppppppDg.",
    "..gppppppDg.",
    "...gppppDg..",
    "....gggg....",
  ],
  palette: { h: "#8a5a2b", g: "#9ab8c8", W: "#ffffff", p: "#7dd3a8", P: "#c8f5dc", D: "#3e8a68" },
};

const stall: SpriteDef = {
  grid: [
    "rwrwrwrwrwrw",
    "rwrwrwrwrwrw",
    ".r.w.r.w.r..",
    ".t........t.",
    ".t.yy.ee..t.",
    ".tttttttttt.",
    ".tTTTTTTTTt.",
    ".tTTTTTTTTt.",
    ".t........t.",
    ".T........T.",
  ],
  palette: { r: "#c0503a", w: "#efe6d2", y: "#f4c95d", e: "#7dd3a8", ...WOOD },
};

const scales: SpriteDef = {
  grid: [
    ".....Y......",
    ".YyyyYyyyyo.",
    ".y...y...o..",
    "y.y..y..o.o.",
    "y.y..y..o.o.",
    "yyyy.y.oooo.",
    ".....y......",
    ".....y......",
    "....yyo.....",
    "..ddddddd...",
  ],
  palette: GOLD,
};

const crown: SpriteDef = {
  grid: [
    "y....y....y.",
    "yy..yRy..yy.",
    "yYy.yyy.yyo.",
    "yYyyyyyyyyo.",
    "yYyRyyyByyo.",
    "yYyyyyyyyyo.",
    "ooooooooooo.",
  ],
  palette: { ...GOLD, R: "#e04848", B: "#5fa8f0" },
};

/** Emoji (ohne Variantenzeichen U+FE0F) → Pixel-Icon */
const DRAWN: Readonly<Record<string, SpriteDef>> = {
  ...UI_ICONS,
  ...COMBAT_ICONS,
  ...WORLD_ICONS,
  ...VILLAGE_ICONS,
  "🪙": coin,
  "❤": heart,
  "🛡": shield,
  "⚔": swords,
  "💥": burst,
  "💧": drop,
  "🔒": lock,
  "📜": scroll,
  "🧙": wizardHat,
  "🌳": tree,
  "🎒": backpack,
  "🏘": house,
  "🏆": trophy,
  "❓": question,
  "💠": gem,
  "🏗": hammer,
  "⚒": anvil,
  "⚗": flask,
  "🏪": stall,
  "🤝": scales,
  "⚖": scales,
  "👑": crown,
};

const SIZE = 12;

/** Mittig auf ein 12 × 12-Raster setzen, damit jedes Icon quadratisch ist und gleich gross skaliert. */
function square(def: SpriteDef): SpriteDef {
  const width = Math.max(...def.grid.map((row) => row.length));
  const left = Math.floor((SIZE - width) / 2);
  const top = Math.floor((SIZE - def.grid.length) / 2);
  const empty = ".".repeat(SIZE);
  const rows = def.grid.map((row) => (".".repeat(left) + row).padEnd(SIZE, "."));
  return { palette: def.palette, grid: [...Array(top).fill(empty), ...rows, ...Array(SIZE - top - rows.length).fill(empty)] };
}

const ICONS: Readonly<Record<string, SpriteDef>> = Object.fromEntries(Object.entries(DRAWN).map(([emoji, def]) => [emoji, square(def)]));

/** Pixel-Icon für ein Emoji – undefined, solange noch keines gezeichnet ist. */
export function iconSprite(emoji: string): SpriteDef | undefined {
  return ICONS[emoji.replace(/️/g, "")];
}

/** Alle gezeichneten Icons (für Tests und die Vorschau). */
export const ICON_SPRITES = ICONS;
