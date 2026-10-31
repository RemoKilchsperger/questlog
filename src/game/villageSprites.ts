// Pixel-Grafiken der Dorfgebäude – eine pro Gebäude und Stufe (0–3).
// Stufe 0 ist ein Bauplatz, beim Händler der Karren des Strassenhändlers.
// Symmetrische Gebäude sind nur als linke Hälfte gezeichnet (`sym`), Türen,
// Schilder und andere Einzelheiten kommen mit `stamp` dazu.
// Der Umriss wird automatisch ergänzt (siehe sprites.ts).

import type { BuildingId, BuildingTier } from "../domain/village";
import { piece, stamp, sym } from "./pixelGrid";
import type { SpriteDef } from "./sprites";

/** Gemeinsame Farben aller Gebäude – so wirkt das Dorf wie aus einem Guss. */
const PALETTE: Readonly<Record<string, string>> = {
  "1": "#a0703f", // Holz
  "2": "#6b4423", // Holz dunkel
  "3": "#4a2e19", // Holz im Schatten, Türen
  "4": "#b3ada2", // Stein
  "5": "#7b756c", // Stein dunkel
  r: "#b5483b", // Ziegel
  R: "#7d2e27", // Ziegel dunkel
  b: "#56698a", // Schiefer
  B: "#3a4760", // Schiefer dunkel
  s: "#d4ab55", // Stroh
  S: "#9c7a35", // Stroh dunkel
  c: "#e8dcc0", // Putz, Stoff
  C: "#c0503a", // Stoff rot
  p: "#efe6cc", // Papier
  y: "#f4d27a", // Fensterlicht
  o: "#e6b84a", // Gold
  O: "#a8792a", // Gold dunkel
  f: "#f39a2e", // Feuer
  F: "#c8442a", // Glut
  m: "#9097a1", // Eisen
  M: "#5a606b", // Eisen dunkel
  v: "#a066d6", // Trank violett
  t: "#4fc0a8", // Trank türkis
  g: "#6fa35a", // Kraut
  G: "#3d6b3a", // Kraut dunkel
  a: "#d98a2b", // Bier
};

const def = (grid: readonly string[]): SpriteDef => ({ grid, palette: PALETTE });

/* ───────────── Bauplatz ───────────── */

/** Abgesteckter Platz mit Schild – für alle Gebäude ausser dem Händler. */
const PLOT = [
  "..........111111........",
  "..........1pkpp1........",
  "..........1pkkp1........",
  "..........111111........",
  "2............2.........2",
  "2ccccccccccccCccccccccc2",
  "2............2.........2",
  "2............2.........2",
  "5.4..5...4...2...5..4.55",
];

/* ───────────── Händler ───────────── */

const MERCHANT_0 = [
  "..CCccCCccCCccCCcc......",
  ".CCccCCccCCccCCccCC.....",
  "..2..............2......",
  "..2..............2......",
  "..2.oo.tt..yy.mm.2......",
  "..2.oo.tt.yyy.mm.2......",
  "1111111111111111111.....",
  "2222222222222222222222..",
  "...333........333....2..",
  "..33k33......33k33......",
  "...333........333.......",
];

const MERCHANT_1 = [
  ".rrccrrccrrccrrccrrccrr.",
  "rrrccrrccrrccrrccrrccrrr",
  "rr.cc.rr.cc.rr.cc.rr.ccr",
  ".2....................2.",
  ".2..oo...tt...yy..mm..2.",
  ".2..oo..ttt..yyy..mm..2.",
  ".2222222222222222222222.",
  ".2111111111111111111112.",
  ".2111111111111111111112.",
  ".2111111111111111111112.",
  ".2222222222222222222222.",
  ".3....................3.",
];

const MERCHANT_2 = stamp(
  sym(
    [
      ".............R",
      "...........RRr",
      ".........RRrrr",
      ".......RRrrrrr",
      ".....RRrrrrrrr",
      "...RRrrrrrrrrr",
      ".RRrrrrrrrrrrr",
      "RRRRRRRRRRRRRR",
      "..222222222222",
      "..2cccc2cccccc",
      "..2cyyc2cccccc",
      "..2cyyc2cccc33",
      "..2cccc2ccc333",
      "..2222222cc333",
      "..2cccc2ccc333",
      "..2cccc2ccc333",
      "..2cccc2ccc333",
      "..2cccc2ccc333",
      "..222222222233",
      "..444444444444",
    ],
    14,
  ),
  // Aushängeschild mit Münze
  piece(9, ["22222", ".2oo2", ".2oo2", ".2222"], 21),
);

const MERCHANT_3 = stamp(
  sym(
    [
      "................B",
      "..............BBb",
      "............BBbbb",
      "..........BBbbbbb",
      "........BBbbbbbbb",
      "......BBbbbbbbbbb",
      "....BBbbbbbbbbbbb",
      "..BBbbbbbbbbbbbbb",
      "BBBBBBBBBBBBBBBBB",
      "..44444444444444o",
      "..4cccc4cccc4oooo",
      "..4cyyc4cyyc4oooo",
      "..4cyyc4cyyc4cccc",
      "..4cccc4cccc4cccc",
      "..444444444444444",
      "..4cccc4cccc4cc33",
      "..4cyyc4cyyc4c333",
      "..4cyyc4cyyc4c333",
      "..4cccc4cccc4c333",
      "..4cccc4cccc4c333",
      "..44444444444c3o3",
      "..4cccc4ccccc4333",
      "..55555555555333",
      ".5555555555555555",
    ],
    17,
  ),
  // Kisten vor dem Lager
  piece(19, ["1111", "1221", "1111", "1221", "1111"], 1),
  piece(21, ["111", "121", "111"], 30),
);

/* ───────────── Schmiede ───────────── */

const SMITH_1 = [
  "...55...............",
  "...45...............",
  "...45...............",
  "..4455..............",
  "..4455..............",
  "4444455555..........",
  "4yfffF455...........",
  "4fFFfF45......MMMM..",
  "4FffFF45.....mmmmmmm",
  "44444444.....MMmmMM.",
  "45455454......mmmm..",
  "44444444.....MMMMMM.",
];

const SMITH_2 = stamp(
  sym(
    [
      "...........SS",
      ".........SSss",
      ".......SSssss",
      ".....SSssssss",
      "...SSssssssss",
      ".SSssssssssss",
      "SSSSSSSSSSSSS",
      "..22222222222",
      "..2cc2ccccccc",
      "..2cy2ccc3333",
      "..2cy2ccc3333",
      "..2222ccc33ff",
      "..2cc2ccc3fFF",
      "..2cc2ccc3FfF",
      "..22222222222",
      ".444444444444",
    ],
    13,
  ).map((row) => row.padEnd(33, ".")),
  // Kamin aus Stein, rechts durchs Dach
  piece(0, ["44", "45", "45", "45", "45"], 18),
  // Amboss neben dem Haus
  piece(12, ["MMMMMM", ".mmmmm", "..MM", ".MMMM"], 27),
);

const SMITH_3 = stamp(
  sym(
    [
      "................b",
      "..............bbb",
      "............bbbbb",
      "..........bbbbbbb",
      "........bbbbbbbbb",
      "......bbbbbbbbbbb",
      "....bbbbbbbbbbbbb",
      "..bbbbbbbbbbbbbbb",
      "BBBBBBBBBBBBBBBBB",
      "..444444444444444",
      "..45545545545oooo",
      "..4cyyc4cyyc4oMMo",
      "..4cyyc4cyyc4oMMo",
      "..45545545545oooo",
      "..444444444444444",
      "..4554554554333",
      "..4cyyc4cyy333f",
      "..4cyyc4cyy3ffF",
      "..4554554553fFF",
      "..4554554553FFf",
      "..444444444333F",
      "..555555555555555",
      ".5555555555555555",
    ],
    17,
  ),
  piece(0, ["44", "45", "45", "45", "45", "45"], 4),
  piece(0, ["44", "45", "45", "45", "45", "45"], 28),
);

/* ───────────── Anschlagtafel ───────────── */

const BOARD_1 = [
  "2222222222222222",
  "2111111111111112",
  "21pp1111pp11pp12",
  "21pk111kpp11kp12",
  "21pp1111pp11pp12",
  "2111111111111112",
  "2222222222222222",
  ".2............2.",
  ".2............2.",
  ".2............2.",
  ".2............2.",
  "3.3..........3.3",
];

const BOARD_2 = stamp(
  sym(
    [
      ".......RRRR",
      ".....RRrrrr",
      "...RRrrrrrr",
      ".RRrrrrrrrr",
      "RRRRRRRRRRR",
      ".2222222222",
      ".2111111111",
      ".21ppp11ppp",
      ".21pkp11pkk",
      ".21ppp11ppp",
      ".2111111111",
      ".21pp111ppp",
      ".21pk111pkp",
      ".2111111111",
      ".2222222222",
      "..2........",
      "..2........",
      "..2........",
      ".323.......",
    ],
    11,
  ),
);

const BOARD_3 = stamp(
  sym(
    [
      "..........BBBB",
      "........BBbbbb",
      "......BBbbbbbb",
      "....BBbbbbbbbb",
      "..BBbbbbbbbbbb",
      "BBBBBBBBBBBBBB",
      "..222222222222",
      "..211111111111",
      "..21pppp11pppp",
      "..21pkkp11pkkp",
      "..21pwwp11pwwp",
      "..21pCCp11pCCp",
      "..21pppp11pppp",
      "..211111111111",
      "..21ppp1ooo1pp",
      "..21pkp1oko1pk",
      "..21ppp1ooo1pp",
      "..211111111111",
      "..222222222222",
      "...2..........",
      "...2..........",
      "...2..........",
      "..323.........",
    ],
    14,
  ),
  // Laterne links
  piece(6, ["M", "M", "MM", "yy", "MM"], 0),
);

/* ───────────── Alchemist ───────────── */

const ALCHEMIST_1 = stamp(
  sym(
    [
      "..........SS",
      "........SSss",
      "......SSssss",
      "....SSssssss",
      "..SSssssssss",
      "SSSSSSSSSSSS",
      "..2222222222",
      "..21g1111111",
      "..2G11111133",
      "..2111111133",
      "..2111111133",
      "..2222222233",
      ".GgG......",
    ],
    12,
  ),
  // Kräuter am Dachbalken, Fenster links
  piece(6, ["G.g.G"], 4),
  piece(8, ["yy", "yy"], 5),
);

const ALCHEMIST_2 = stamp(
  sym(
    [
      "............RR",
      "..........RRrr",
      "........RRrrrr",
      "......RRrrrrrr",
      "....RRrrrrrrrr",
      "..RRrrrrrrrrrr",
      "RRRRRRRRRRRRRR",
      "..222222222222",
      "..2cccc2cccccc",
      "..2ctvc2cccc33",
      "..2ctvc2ccc333",
      "..2cccc2ccc333",
      "..2222222cc333",
      "..2cccc2ccc333",
      "..222222222233",
      "..444444444444",
    ],
    14,
  ),
  // Kamin mit Rauch, Schild mit Kolben
  piece(0, ["44", "45", "45", "45"], 4),
  piece(8, ["22222", ".2.v2", ".2vv2", ".2222"], 22),
);

const ALCHEMIST_3 = stamp(
  sym(
    [
      "...........v",
      "..........vv",
      ".........vBv",
      "........BBbb",
      ".......BBbbb",
      "......BBbbbb",
      ".....BBbbbbb",
      "....BBbbbbbb",
      "...BBbbbbbbb",
      "..BBbbbbbbbb",
      ".BBBBBBBBBBB",
      "...444444444",
      "...4554vvv54",
      "...45vvtvv54",
      "...45vvvvv54",
      "...444444444",
      "...455455455",
      "...4yy4554yy",
      "...4yy4554yy",
      "...455455455",
      "...444444444",
      "...455455433",
      "...455455333",
      "...455455333",
      "...455455333",
      "..5555555555",
    ],
    12,
  ),
  // Kessel vor dem Turm
  piece(22, ["t.t.", "MMMM", "MMMM", ".MM."], 0),
);

/* ───────────── Taverne ───────────── */

/** Schanktresen unter einem Strohdach, daneben ein Fass. */
const TAVERN_1 = [
  "..SSSSSSSSSSSSSSSSSS....",
  ".SssssssssssssssssssS...",
  "SSSSSSSSSSSSSSSSSSSSSS..",
  "..2................2....",
  "..2...cc.....cc....2....",
  "..2...aa.....aa....2....",
  "..2...aa.....aa....2.22.",
  "1111111111111111111.2112",
  "2222222222222222222.2222",
  "..2111111111111112..2112",
  "..2111111111111112..2222",
  "..2222222222222222..2112",
];

const TAVERN_2 = stamp(
  sym(
    [
      ".............S",
      "...........SSs",
      ".........SSsss",
      ".......SSsssss",
      ".....SSsssssss",
      "...SSsssssssss",
      ".SSsssssssssss",
      "SSSSSSSSSSSSSS",
      "..222222222222",
      "..2cc2cccc2ccc",
      "..2c2cyyc2c2cc",
      "..22ccyycc2c2c",
      "..2c2cccc2ccc2",
      "..222222222222",
      "..2ccccc2ccc33",
      "..2cyyyc2cc333",
      "..2cyyyc2cc333",
      "..2ccccc2cc333",
      "..2ccccc2cc333",
      "..222222222333",
      "..444444444444",
    ],
    14,
  ),
  // Aushängeschild mit Bierkrug
  piece(13, ["22222", "2cc.2", "2aa22", "2aa.2", "22222"], 23),
);

const TAVERN_3 = stamp(
  sym(
    [
      "................R",
      "..............RRr",
      "............RRrrr",
      "..........RRrrrrr",
      "........RRrrrrrrr",
      "......RRrrrrrrrrr",
      "....RRrrrrrrrrrrr",
      "..RRrrrrrrrrrrrrr",
      "RRRRRRRRRRRRRRRRR",
      "..222222222222222",
      "..2c2cc2cyyc2cccc",
      "..22ccc2cyyc2cccc",
      "..2c2cc2cccc2cccc",
      "..222222222222222",
      "..2cccc2cccc2cc33",
      "..2cyyc2cyyc2c333",
      "..2cyyc2cyyc2c333",
      "..2cccc2cccc2c333",
      "..2cccc2cccc2c333",
      "..222222222222333",
      "..444444444444444",
      ".4444444444444444",
    ],
    17,
  ),
  // Grosser Krug über der Tür, Wimpel auf dem Dach, Fässer davor
  piece(9, ["22222222", "2cccccc2", "2aaaaaa2", "2aaaaaa2", "22222222"], 13),
  piece(0, ["2CC", "2C.", "2.."], 17),
  piece(18, ["222", "121", "222", "121"], 0),
  piece(18, ["222", "121", "222", "121"], 31),
);

/* ───────────── Trainingsplatz ───────────── */

/** Strohpuppe an einem Pfosten und ein Waffenständer. */
const TRAINING_1 = [
  "...ss...........o.o.o",
  "..ssss..........m.m.m",
  "..sSSs..........m.m.m",
  "2222222.........m.m.m",
  "..ssss.........222222",
  "..sCCs.........2m.m.m",
  "..ssss.........2.....",
  "...22..........222222",
  "...22..........2....2",
  ".222222........2....2",
];

const TRAINING_2 = stamp(
  [
    "...ss.....................",
    "..ssss.........CCCCC......",
    "..sSSs........CcccccC.....",
    "2222222......CcCCCCcC.....",
    "..ssss.......CcCooCcC.....",
    "..sCCs.......CcCooCcC.....",
    "..ssss.......CcCCCCcC.....",
    "...22.........CcccccC.....",
    "...22..........CCCCC......",
    "...22...........2.2.......",
    "...22..........2...2......",
    "2.2.2.2.2.2.2.2.2.2.2.2.2.",
    "22222222222222222222222222",
    "2.2.2.2.2.2.2.2.2.2.2.2.2.",
  ],
  // Waffenständer rechts
  piece(0, ["o.o.o", "m.m.m", "m.m.m", "m.m.m", "22222", "2...2", "2...2", "2...2"], 21),
);

const TRAINING_3 = stamp(
  sym(
    [
      "...............B",
      ".............BBb",
      "...........BBbbb",
      ".........BBbbbbb",
      ".......BBbbbbbbb",
      ".....BBbbbbbbbbb",
      "...BBbbbbbbbbbbb",
      ".BBbbbbbbbbbbbbb",
      "BBBBBBBBBBBBBBBB",
      "..44444444444444",
      "..4cccc4cccc4ccc",
      "..4cyyc4cyyc4ccc",
      "..4cyyc4cyyc4ccc",
      "..4cccc4cccc4ccc",
      "..44444444444444",
      "..4cccc4cccc4c33",
      "..4cyyc4cyyc4333",
      "..4cyyc4cyyc4333",
      "..4cccc4cccc4333",
      "..44444444444333",
      "..55555555555555",
    ],
    16,
  ),
  // Wappen mit gekreuzten Schwertern über der Tür
  piece(9, ["CCCCCCCC", "CmCCCCmC", "CCmCCmCC", ".CCmmCC.", ".CoCCoC.", "..CCCC.."], 12),
);

/* ───────────── Statue ───────────── */

/** Runenstein auf einem Sockel. */
const STATUE_1 = sym(
  [
    "...44",
    "..444",
    "..454",
    "..44o",
    "..45o",
    "..4oo",
    "..45o",
    "..444",
    "..454",
    ".5555",
    "55555",
  ],
  5,
);

const STATUE_2 = stamp(
  sym(
    [
      "......44",
      ".....444",
      ".....454",
      "......44",
      "...44444",
      "..444454",
      "..44.454",
      "..44.454",
      "..4..454",
      ".....454",
      ".....44.",
      ".....44.",
      ".....44.",
      "....444.",
      "..555555",
      "..454444",
      "..4444oo",
      "..454444",
      ".5555555",
      "55555555",
    ],
    8,
  ),
  // Erhobenes Schwert in der rechten Hand
  piece(0, ["..m", "..m", "..m", "..m", ".ooo", "..4", "..4"], 11),
);

const STATUE_3 = stamp(
  sym(
    [
      "...........oo",
      "..........ooo",
      "..........oOo",
      "...........oo",
      "........ooooo",
      ".......oooooO",
      ".......oo.ooO",
      ".......oo.ooO",
      ".......o..ooO",
      "..........ooO",
      "..........oo.",
      "..........oo.",
      "..........oo.",
      ".........ooo.",
      ".......555555",
      ".......444444",
      ".......4444oo",
      ".......444444",
      "......5555555",
      "..2..55555555",
      ".fFf.44444444",
      "..2.444444444",
      "..2.555555555",
      "..2555555555555",
    ],
    13,
  ),
  // Schwert hoch erhoben, Krone auf dem Kopf
  piece(0, ["..o", "..o", "..o", "..o", ".OOO", "..o", "..o"], 16),
  piece(0, ["o.o.o"], 10),
);

const SPRITES: Readonly<Record<BuildingId, readonly (readonly string[])[]>> = {
  merchant: [MERCHANT_0, MERCHANT_1, MERCHANT_2, MERCHANT_3],
  smith: [PLOT, SMITH_1, SMITH_2, SMITH_3],
  board: [PLOT, BOARD_1, BOARD_2, BOARD_3],
  alchemist: [PLOT, ALCHEMIST_1, ALCHEMIST_2, ALCHEMIST_3],
  tavern: [PLOT, TAVERN_1, TAVERN_2, TAVERN_3],
  training: [PLOT, TRAINING_1, TRAINING_2, TRAINING_3],
  statue: [PLOT, STATUE_1, STATUE_2, STATUE_3],
};

/** Plätze im Dorfbild (Pixel im Raster VILLAGE_WIDTH × BG_HEIGHT): Mitte und Unterkante jedes Gebäudes. */
export const VILLAGE_SLOTS: readonly { id: BuildingId; x: number; base: number }[] = [
  { id: "merchant", x: 24, base: 69 },
  { id: "smith", x: 66, base: 69 },
  { id: "tavern", x: 108, base: 69 },
  { id: "statue", x: 150, base: 69 },
  { id: "board", x: 192, base: 69 },
  { id: "alchemist", x: 234, base: 69 },
  { id: "training", x: 276, base: 69 },
];

const cache = new Map<string, SpriteDef>();

/** Grafik eines Gebäudes auf seiner Stufe – immer dasselbe Objekt (Bild-Cache in spriteImage.ts). */
export function getBuildingSprite(id: BuildingId, tier: BuildingTier): SpriteDef {
  const key = `${id}-${tier}`;
  let sprite = cache.get(key);
  if (!sprite) cache.set(key, (sprite = def(SPRITES[id][tier])));
  return sprite;
}
