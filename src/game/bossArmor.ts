// Boss-Rüstungen am Helden: eigene, fein gezeichnete Formen im 24er-Raster.
//
// Normale Rüstung färbt nur die Grundgrafik des Helden ein. Boss-Rüstung tut das
// auch, legt aber zusätzlich eigene Teile darüber (Schulterstücke, Kragen,
// Krallen, Flügel …) – so verändert sie die Silhouette und hebt sich klar ab.
//
// Zeichen wie in itemSprites.ts (L/m/D Material, t Zierde, j Edelstein, h/H Griff,
// k/w dunkel/weiss). Dazu l/d: hell/dunkel wie L/D, werden beim Spiegeln aber
// nicht getauscht (für Muster wie Schuppen).
//
// Die meisten Teile sind symmetrisch und nur als linke Hälfte gezeichnet (`sym`).

/** Ein Teil der Rüstung im Raster des Helden – `x`/`y` = linke obere Ecke (Held: 0–23). */
export interface ArmorPiece {
  x: number;
  y: number;
  rows: readonly string[];
}

export interface BossArmorWorn {
  /** liegt über dem Helden */
  front: readonly ArmorPiece[];
  /** liegt hinter dem Helden (Umhang, Flügel, Kragen) */
  back?: readonly ArmorPiece[];
}

/** Licht kommt von links: Beim Spiegeln werden L und D getauscht, l und d bleiben. */
const SWAP: Readonly<Record<string, string>> = { L: "D", D: "L" };

/** Linke Hälfte (auf `half` Zeichen aufgefüllt) mit gespiegelter rechter Hälfte ergänzen. */
function sym(rows: readonly string[], half = 12): string[] {
  return rows.map((row) => {
    const left = row.padEnd(half, ".");
    return left + [...left].reverse().map((ch) => SWAP[ch] ?? ch).join("");
  });
}

const piece = (y: number, rows: readonly string[], x = 0): ArmorPiece => ({ x, y, rows });

/** Symmetrisches Teil, gezeichnet als linke Hälfte des 24er-Rasters. */
const half = (y: number, rows: readonly string[]) => piece(y, sym(rows));

// --- Helme -------------------------------------------------------------------
// Wie WORN_HELMETS in itemSprites.ts: 24 Spalten, erste Zeile 4 Pixel über dem Kopf.

export const BOSS_HELMETS: Readonly<Record<string, readonly string[]>> = {
  // Knochenkrone mit Schädel
  "boss-goblin-chief-head": sym([
    "",
    "..........Lm",
    ".........Lmm",
    "......L..Lkm",
    "......Lm.Lmk",
    "...L..LmD.wk",
    "...LmDLmDLmj",
    "...ttttttttt",
    "...DjDDDDDDj",
  ]),
  // Echsenschädel mit Zähnen über der Stirn und gelben Augen
  "boss-ancient-lizard-head": sym([
    "...........L",
    "..........Lm",
    ".......Lmmmm",
    ".....Lmmmdmm",
    "....Lmjjmmmm",
    "...Lmmjkmmdm",
    "...Lmmmmmmmm",
    "...DDDDDDDDD",
    "...Dt.t.t.tt",
    "...md",
    "....t",
  ]),
  // Kristallkrone mit dem grossen Auge
  "boss-cave-eye-head": sym([
    "......w",
    ".....tw",
    ".....tw",
    ".....tt...Lm",
    ".....ttw.Lwj",
    ".....ttt.wjk",
    "....tttt.Lwj",
    "....tLmmmmmm",
    "....DDjDDDDD",
  ]),
  // Mammutkopf mit Fell, Ohren und weit geschwungenen Stosszähnen
  "boss-primal-mammoth-head": sym([
    ".........Lmm",
    ".......Llmmm",
    "......Lmmmmm",
    ".....Lmmmdmm",
    "..LmLmmmmmmm",
    "..Lmmmmjmmmm",
    "..Dmmmmmmmmm",
    "..dmdmdmdmdm",
    "..dm",
    "",
    ".....tw",
    "....tw",
    "...tw",
    "w.tw",
    "wtw",
  ]),
  // Dunkle Zackenkrone, Kapuze und grün glühende Augen
  "boss-lich-king-head": sym([
    "...........t",
    "......t....L",
    "......L...Lm",
    "...t..Lm..Lm",
    "...L.LmmD.Lm",
    "...LmLmmDLmj",
    "...ttttttttt",
    "...DjDDDDjDD",
    "....md",
    "....md",
    "....md..jj",
    "....md..jj",
    "....md",
    "....md",
    ".....md",
    "......md",
  ]),
  // Drachenkopf mit goldenen Hörnern und Zahnreihe
  "boss-ignaroth-head": sym([
    ".t",
    ".tt",
    "..tt......Lm",
    "...tt...Lmmm",
    "....ttLmmmmm",
    "....tLmmjmmm",
    "....Lmmmmmmm",
    "....DDtDDDDD",
    "....wDw.w.w.",
    "....md",
    "....t",
  ]),
  // Grubenhelm mit Laterne und breiter Krempe
  "boss-ore-king-head": sym([
    "",
    "..........tt",
    "..........tj",
    ".......Lmmtj",
    ".....Lmmmmtt",
    "....Lmmmmmmm",
    "....Lmmkmmmm",
    "..Lmmmmmmmmm",
    "...DDDDDDDDD",
  ]),
  // Gestreiftes Kopftuch mit Sonnenscheibe und langen Seitenteilen
  "boss-high-priestess-head": sym([
    "..........Lm",
    ".........Ljj",
    "..........Lm",
    "......Lmmmmt",
    "....Lmmmmmmt",
    "....tttttttt",
    "....mmmmmmmm",
    "....tttttttt",
    "....DjDDDDDD",
    "...Lmmm",
    "...tttt",
    "...mmmm",
    "...tttt",
    "...mmmm",
    "...tttt",
    "....DD",
  ]),
  // Flügelhelm mit Blitzkamm
  "boss-storm-lord-head": sym([
    "L..........t",
    "LL.........t",
    ".LL......Lmt",
    ".LLm...Lmmmt",
    "..LLm.Lmmmmt",
    "...LmmLmmmmm",
    "....Lmmmmmmm",
    "....tttttttt",
    "....DDDDDDDD",
    "....md",
    "....t",
  ]),
  // Zackenkrone mit schwebenden Splittern
  "boss-void-lord-head": sym([
    "....j",
    "",
    "...........L",
    "....L.....Lm",
    "....Lm.L..Lm",
    "....LmdLmdLt",
    "....Lmmmmmmm",
    "....DtDDtDDt",
  ]),
  // Drei Schlangenköpfe
  "boss-swamp-hydra-head": sym([
    "..Lm......Lm",
    ".Lmjm....Ljm",
    "wwmmmd...Lmm",
    ".w..md...Lmm",
    ".....md..Lmm",
    "......mdLmmm",
    "....Lmmmmmmm",
    "....tttttttt",
    "....DDDDDDDD",
  ]),
  // Eiskrone mit Zapfen
  "boss-frost-giant-head": sym([
    ".....L.....L",
    "...L.Lm...Lm",
    "...Lm.Lm.Lmm",
    "..LmmLmmLmmj",
    "..Lmmmmmmmmm",
    "...Lmmmmmmmm",
    "....tttttttt",
    "....DjDDDjDD",
    "....l.l..l.l",
    "....l....l",
  ]),
  // Goldene Hörner und ein Schlund voller Zähne
  "boss-world-eater-head": sym([
    ".t",
    ".t........t",
    ".tt......Lmm",
    "..tt...Lmmmm",
    "...ttLmmmmmm",
    "....tLmmmmmm",
    "....Lmdwdwdw",
    "....Lmjjjjjj",
    "....DDwdwdwd",
  ]),
};

// --- Brust, Arme, Beine, Schuhe -----------------------------------------------
// Lage im Helden (siehe HERO_SPRITE): Schultern y 12–13, Brust y 12–19,
// Arme x 2–3 / 20–21 (Hände y 14–15), Beine y 20–21, Füsse y 22–23.

export const BOSS_ARMOR: Readonly<Record<string, BossArmorWorn>> = {
  // Fellschultern mit Knochenstacheln, Zahnkette
  "boss-goblin-chief-chest": {
    front: [half(10, [".t...t", ".tLmmt", "LmmmmmD", "mdmdmdm..t.t", "d.d.d...t.tw", "...........w"])],
  },
  // Stachelkamm auf den Schultern, Schuppen, Echsenauge
  "boss-ancient-lizard-chest": {
    front: [
      half(10, ["...t", "..tLt", "..LmmD", "..dmdm", "......d.d.d", ".......d.d.j", "......d.d.d", ".......d.d"]),
    ],
  },
  // Kristalle wachsen aus den Schultern, ein Auge auf der Brust
  "boss-cave-eye-chest": {
    front: [half(9, ["..w", "..tw", "..ttw", ".Ltttw", ".LmmmD", "..........Lw", ".........wjk", "..........Lw"])],
  },
  // Schwerer Fellmantel mit Stosszahn-Spange
  "boss-primal-mammoth-chest": {
    front: [half(9, ["..t", "...t", "...LmLmLm", "..Lmmmmmmmmm", "..dmdmdmdmtw", "...........t"])],
    back: [half(12, ["...hhhhhhhhh", ...Array(7).fill(".hhhhhhhhhhh"), ".hHhHhhhhhhh", ".H.H.H"])],
  },
  // Schädel auf den Schultern, Seelenstein, hoher Kragen und zerrissener Umhang
  "boss-lich-king-chest": {
    front: [half(11, [".tttt", "tkttkt", ".tttt", "..tkt.....t", "...........j", "...........d"])],
    back: [
      half(7, [
        ".....d",
        ".....md",
        ".....md",
        "......md",
        "......md",
        ...Array(9).fill(".HHHHHHHHHHH"),
        ".H.HH.H",
        ".H..H",
      ]),
    ],
  },
  // Drachenflügel, Hornschultern, Flammenwappen
  "boss-ignaroth-chest": {
    front: [half(10, ["..t", "..tt", ".LtmmD", ".LmmmD.....j", "..........jt", ".........tjj", "..........tt"])],
    back: [
      piece(
        5,
        sym(
          [
            "t",
            "Lt",
            "LDt",
            "LmDt",
            "LmmDt",
            "LmmmDtt",
            "LmdmmdDt",
            "LdmdmmdDt",
            ".dmdmmmdD",
            ".d.dmmmd",
            "...d.dmd",
            ".....d.d",
          ],
          17,
        ),
        -5,
      ),
    ],
  },

  // Erzgräber: Schulterplatten mit Nieten, Ledergurt, dicke Handschuhe, Stahlkappen
  "boss-ore-king-chest": {
    front: [
      piece(11, [
        ".tttttt..........tttttt.",
        ".LmkmmD..........LmmkmD.",
        ".LmmmkD........h.LkmmmD.",
        ".DDDDDD.......hH.DDDDDD.",
        "...........thH..........",
        "..........hH............",
        ".........hH.............",
        "........hH..............",
      ]),
    ],
  },
  "boss-ore-king-arms": { front: [half(14, [".LmmD", ".LmmD", ".tttt", "..dd"])] },
  "boss-ore-king-legs": { front: [half(20, [".....Lmkd", ".....dddd"])] },
  "boss-ore-king-feet": { front: [half(21, ["......tttt", "....LmmmmD", "....dddddd"])] },

  // Hohepriesterin: breiter Schmuckkragen, Armreife, Schurz, Sandalen
  "boss-high-priestess-chest": {
    front: [half(12, ["...ttttttttt", "..thhhhhhhhh", "...tjjjjjjjj", ".....ttttttt"])],
  },
  "boss-high-priestess-arms": { front: [half(14, [".tjjt", "", ".tjjt"])] },
  "boss-high-priestess-legs": { front: [half(19, ["....tttttttt", "....Lmmmmmtj", ".....Lmmmmtj"])] },
  "boss-high-priestess-feet": { front: [half(21, ["......t.t", "....tmmmmd", "....dddddd"])] },

  // Sturmfürst: Blitzschultern und Blitz auf der Brust, Funken, Flügelstiefel
  "boss-storm-lord-chest": {
    front: [
      half(10, ["..L", ".LmL", ".LmtmD", ".LtmmD", "..DDD"]),
      piece(13, [
        ".............t..........",
        "............t...........",
        "...........ttt..........",
        "............t...........",
        "...........t............",
      ]),
    ],
  },
  "boss-storm-lord-arms": { front: [half(12, ["t", "", "j", "", ".LmmD", ".tttt", "..t"])] },
  "boss-storm-lord-legs": { front: [half(19, ["....t", "....Lmt", ".....mt"])] },
  "boss-storm-lord-feet": { front: [half(21, ["...L", "..LLm", "...L"])] },

  // Fürst der Leere: Zackenschultern, Riss in der Brust, Klauen, Spitzschuhe
  "boss-void-lord-chest": {
    front: [
      half(9, [
        "..L",
        "..Lm.L",
        ".LmmLmD",
        ".LmmmmD",
        "..tdtd",
        "...........t",
        "..........tk",
        ".........tkk",
        "..........tk",
        "...........t",
      ]),
    ],
  },
  "boss-void-lord-arms": { front: [half(13, ["..t", ".Lmm", ".Lmm", ".Lmd", ".mdm", ".l.l", ".t.t"])] },
  "boss-void-lord-legs": { front: [half(20, ["....LmtmD", "......dtd"])] },
  "boss-void-lord-feet": { front: [half(22, ["...Lmmmd", ".tLdddd"])] },

  // Sumpfhydra: Schlangenköpfe als Schultern, Schuppen, Flossen, Krallen
  "boss-swamp-hydra-chest": {
    front: [
      half(10, ["..Lmm", ".Lmjmm", "wwmmmmD", ".w.Lmm", "......d.d.d", ".......d.d.d", "......d.d.d"]),
    ],
  },
  "boss-swamp-hydra-arms": { front: [half(14, ["t", "tt.d", ".t"])] },
  "boss-swamp-hydra-legs": { front: [half(20, [".....mdmd", ".....j.j"])] },
  "boss-swamp-hydra-feet": { front: [half(22, ["....Lmmm", "...t.t"])] },

  // Frostriese: Eisschultern mit Zapfen, riesige Eisfäuste, Eisstiefel
  "boss-frost-giant-chest": {
    front: [half(10, ["..L..L", ".LmL.Lm", ".LmmmmmD", ".dmmmmd", ".l.l.l", "...l.......j"])],
  },
  "boss-frost-giant-arms": { front: [half(13, ["..Lm", "LmmmmD", "LmjmmD", "LmmmmD", ".dddd"])] },
  "boss-frost-giant-legs": { front: [half(20, [".....LlL", ".....l.l"])] },
  "boss-frost-giant-feet": { front: [half(21, [".....Lmmm", "....LmmmmmD", "....dddddd"])] },

  // Weltenverschlinger: Goldhörner auf den Schultern, Schlund in der Brust, Krallen
  "boss-world-eater-chest": {
    front: [
      half(9, [".t", ".tt", "..tLmD", ".LmmmmD", ".dtmmtd", "........wdwd", "........jjjj", "........dwdw"]),
    ],
  },
  "boss-world-eater-arms": { front: [half(16, ["t", "tl", ".t.t"])] },
  "boss-world-eater-legs": { front: [half(20, ["....tjm", ".....t"])] },
  "boss-world-eater-feet": { front: [half(22, ["...tLmmm", "..t.dddd"])] },
};

// --- Symbole -------------------------------------------------------------------
// Boss-Rüstung im Inventar: fein gezeichnete Grundformen (24 × 24), auf die jedes
// Set seine Motive legt – dieselben wie am Helden. Helme nutzen direkt ihre Form
// am Helden (siehe getItemSprite).

const ICON_SIZE = 24;

/** Symmetrische Grundform aus linken Hälften, auf 24 Zeilen aufgefüllt (Zeile = y im Symbol). */
function base(rows: readonly string[]): string[] {
  const grid = sym(rows);
  return [...grid, ...Array<string>(ICON_SIZE - grid.length).fill(".".repeat(ICON_SIZE))];
}

/** Legt Teile über eine Grundform – jedes Zeichen ausser "." ersetzt, was darunter liegt. */
function stamp(grid: readonly string[], ...pieces: ArmorPiece[]): string[] {
  const rows = grid.map((row) => [...row]);
  for (const { x, y, rows: part } of pieces)
    part.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        if (ch !== "." && rows[y + dy]?.[x + dx] !== undefined) rows[y + dy][x + dx] = ch;
      }),
    );
  return rows.map((row) => row.join(""));
}

const BREASTPLATE = base([
  "",
  "",
  "....Lmmm",
  "..LLmmmmm",
  ".Lmmmmmmmm",
  ".Lmmmmmmmmmm",
  ".Lmmmmmmmmmm",
  "..Lmmmmmmmmm",
  "...Lmmmmmmmm",
  "...Lmmmmmmmm",
  "...Lmmmmmmmm",
  "...Lmmmmmmmm",
  "...Lmmmmmmmm",
  "...Lmmmmmmmm",
  "....Lmmmmmmm",
  "....Lmmmmmmm",
  "....tttttttt",
  "....Lmmmmmmm",
  "....DDDDDDDD",
]);

const GAUNTLETS = base([
  "",
  "",
  "",
  "..tttttt",
  "..LmmmmD",
  "..LmmmmD",
  "..LmmmmD",
  "..LmmmmD",
  "..LmmmmD",
  "..tttttt",
  "..LmmmmmD",
  ".LmmmmmmD",
  ".LmmmmmmD",
  ".LmmmmmmD",
  ".LmDmDmD",
  ".LmDmDmD",
  "..D.D.D",
]);

const GREAVES = base([
  "",
  "",
  "...tttttt",
  "...LmmmmD",
  "...LmmmmD",
  "...tttttt",
  "...LmmmmD",
  "...LmmmmD",
  "...LmmmmD",
  "...LmmmmD",
  "...LmmmmD",
  "....LmmD",
  "....LmmD",
  "....LmmD",
  "....LmmD",
  "....LmmmD",
  "....LmmmmD",
  "....DDDDDD",
]);

const BOOTS = base([
  "",
  "",
  "",
  "",
  "",
  "....tttt",
  "....LmmD",
  "....LmmD",
  "....LmmD",
  "....LmmD",
  "....LmmD",
  "....LmmD",
  "...LmmmD",
  "..LmmmmD",
  ".LmmmmmD",
  ".DDDDDDD",
]);

/** Blitz (Sturmfürst), wie auf der Brust am Helden. */
const BOLT = [".............t", "............t", "...........ttt", "............t", "...........t"].map((r) =>
  r.padEnd(ICON_SIZE, "."),
);

export const BOSS_ARMOR_ICONS: Readonly<Record<string, readonly string[]>> = {
  "boss-goblin-chief-chest": stamp(
    BREASTPLATE,
    half(1, [".t...t", ".tLmmt", "LmmmmmD", "mdmdmdm..t.t", "d.d.d...t.tw", "...........w"]),
  ),
  "boss-ancient-lizard-chest": stamp(
    BREASTPLATE,
    half(0, ["...t", "..tLt", "..LmmD", "..dmdm"]),
    half(8, ["....d.d.d.d", ".....d.d.d.d", "....d.d.d.d", ".....d.d.d.j", "....d.d.d.d", ".....d.d.d.d"]),
  ),
  "boss-cave-eye-chest": stamp(
    BREASTPLATE,
    half(0, ["..w", "..tw", "..ttw", ".Ltttw", ".LmmmD"]),
    half(8, ["..........Lw", ".........wjk", "..........Lw"]),
  ),
  "boss-primal-mammoth-chest": stamp(
    BREASTPLATE,
    half(0, ["..t", "...t", "...LmLmLm", "..Lmmmmmmmmm", "..dmdmdmdmtw", "...........t"]),
    half(17, ["....hHhHhHhH", "....H.H.H.H."]),
  ),
  "boss-lich-king-chest": stamp(
    BREASTPLATE,
    half(1, [".tttt", "tkttkt", ".tttt", "..tkt"]),
    half(8, ["..........t", "...........j", "...........d"]),
    half(17, ["....HHHHHHHH", "....H.HH.H.H", "....H..H...H"]),
  ),
  "boss-ignaroth-chest": stamp(
    BREASTPLATE,
    half(0, ["..t", "..tt", ".LtmmD", ".LmmmD"]),
    half(8, ["...........j", "..........jt", ".........tjj", "..........tt"]),
  ),

  "boss-ore-king-chest": stamp(
    BREASTPLATE,
    piece(2, [
      ".tttttt..........tttttt.",
      ".LmkmmD..........LmmkmD.",
      ".LmmmkD........h.LkmmmD.",
      ".DDDDDD.......hH.DDDDDD.",
      "...........thH..........",
      "..........hH............",
      ".........hH.............",
      "........hH..............",
    ]),
  ),
  "boss-ore-king-arms": stamp(GAUNTLETS, half(3, ["..tttttt", "..tktktk"]), half(14, [".LkmkmkD"])),
  "boss-ore-king-legs": stamp(GREAVES, half(8, ["..LmmmmmD", "..LkmmkmD", "..DDDDDDD"])),
  "boss-ore-king-feet": stamp(BOOTS, half(12, ["...Ll", "..Lll", ".Llll"])),

  "boss-high-priestess-chest": stamp(
    BREASTPLATE,
    half(2, ["...ttttttttt", "..thhhhhhhhh", "...tjjjjjjjj", ".....ttttttt"]),
  ),
  "boss-high-priestess-arms": stamp(GAUNTLETS, half(4, ["..tttttt", "..jjjjjj", "..tttttt"]), half(10, ["..tjtjtjt"])),
  "boss-high-priestess-legs": stamp(
    GREAVES,
    half(0, ["..tttttttttt", "..Lmmmmmmmmm", "..Lmmmmmmmtj", "...Lmmmmmmtj", "...Lmmmmmmtj", "....Lmmmmmtj"]),
  ),
  "boss-high-priestess-feet": base([
    "",
    "",
    "",
    "....tt",
    "....tj",
    "....tt",
    "....t.t",
    "....t.t",
    "...t..t",
    "...tttt",
    "..t.t.t",
    ".t..t.t",
    ".tttttt",
    "Lmmmmmmm",
    "DDDDDDDD",
  ]),

  "boss-storm-lord-chest": stamp(BREASTPLATE, half(0, ["..L", ".LmL", ".LmtmD", ".LtmmD", "..DDD"]), piece(7, BOLT)),
  "boss-storm-lord-arms": stamp(
    GAUNTLETS,
    half(0, ["t"]),
    half(2, [".LmmmmmmD", ".tttttttt"]),
    half(5, ["....t", "...t", "...tt", "....t", "...t"]),
    half(15, ["j", "", ".t"]),
  ),
  "boss-storm-lord-legs": stamp(GREAVES, half(7, [".t", ".Lmt", "..mt"]), half(11, [".....t", "....t", ".....t"])),
  "boss-storm-lord-feet": stamp(BOOTS, half(5, ["..L", ".LL", ".LLm", "..Lm"])),

  "boss-void-lord-chest": stamp(
    BREASTPLATE,
    half(0, ["..L", "..Lm.L", ".LmmLmD", ".LmmmmD", "..tdtd"]),
    half(7, ["...........t", "..........tk", ".........tkk", "..........tk", "...........t"]),
  ),
  "boss-void-lord-arms": stamp(GAUNTLETS, half(4, ["....t", "...t", "....t", "...t"]), half(16, [".l.l.l", ".t.t.t"])),
  "boss-void-lord-legs": stamp(GREAVES, half(0, ["...L..L", "..LmLLm"]), half(6, ["....t", ".....t", "....t", ".....t", "....t"])),
  "boss-void-lord-feet": stamp(BOOTS, half(11, ["t", "L", "dL"])),

  "boss-swamp-hydra-chest": stamp(
    BREASTPLATE,
    half(1, ["..Lmm", ".Lmjmm", "wwmmmmD", ".w.Lmm"]),
    half(8, ["......d.d.d", ".......d.d.d", "......d.d.d", ".......d.d.d"]),
  ),
  "boss-swamp-hydra-arms": stamp(GAUNTLETS, half(3, ["t", "tt", "ttt", ".tt", "..t"]), half(10, ["...d.d.d", "..d.d.d."])),
  "boss-swamp-hydra-legs": stamp(GREAVES, half(6, ["....d.d", "...d.d.d", "....d.d", "...d.d.d"]), half(18, ["....j.j.j"])),
  "boss-swamp-hydra-feet": stamp(BOOTS, half(13, ["t", "", "t"])),

  "boss-frost-giant-chest": stamp(
    BREASTPLATE,
    half(1, ["..L..L", ".LmL.Lm", ".LmmmmmD", ".dmmmmd", ".l.l.l", "...l"]),
    half(9, ["...........j"]),
  ),
  "boss-frost-giant-arms": stamp(
    GAUNTLETS,
    half(9, ["Lmmmmmmmm", "Lmmmmmmmm", "LmjmmmmmD", "LmmmmmmmD", "LmmmmmmmD", "LmmmmmmmD", ".dddddddd"]),
  ),
  "boss-frost-giant-legs": stamp(GREAVES, half(0, ["...L..L", "..Lm.Lm"]), half(6, ["...l.l.l"])),
  "boss-frost-giant-feet": stamp(BOOTS, half(11, ["...LmmmD", "..LmmmmmD", ".LmmmmmmD", "LmmmmmmmD", "ddddddddd"])),

  "boss-world-eater-chest": stamp(
    BREASTPLATE,
    half(0, [".t", ".tt", "..tLmD", ".LmmmmD", ".dtmmtd"]),
    half(8, ["........wdwd", "........jjjj", "........dwdw"]),
  ),
  "boss-world-eater-arms": stamp(GAUNTLETS, half(5, ["....j"]), half(16, [".t.t.t", ".t.t.t"])),
  "boss-world-eater-legs": stamp(GREAVES, half(7, [".t", ".tt", "..tLjjmD"])),
  "boss-world-eater-feet": stamp(BOOTS, half(12, ["t", ".t"]), half(14, ["t"])),
};
