// Hilfen zum Zeichnen fein gerasterter Pixel-Grafiken (Rüstung am Helden und im Inventar).
//
// Zeichen wie in itemSprites.ts (L/m/D Material, t Zierde, j Edelstein, h/H Griff,
// k/w dunkel/weiss). Dazu l/d: hell/dunkel wie L/D, werden beim Spiegeln aber
// nicht getauscht (für Muster wie Schuppen).
//
// Die meisten Formen sind symmetrisch und nur als linke Hälfte gezeichnet (`sym`).

/** Ein Teil einer Grafik – `x`/`y` = linke obere Ecke im Gesamtbild. */
export interface ArmorPiece {
  x: number;
  y: number;
  rows: readonly string[];
}

/** Licht kommt von links: Beim Spiegeln werden L und D getauscht, l und d bleiben. */
const SWAP: Readonly<Record<string, string>> = { L: "D", D: "L" };

/** Linke Hälfte (auf `half` Zeichen aufgefüllt) mit gespiegelter rechter Hälfte ergänzen. */
export function sym(rows: readonly string[], half = 12): string[] {
  return rows.map((row) => {
    const left = row.padEnd(half, ".");
    return left + [...left].reverse().map((ch) => SWAP[ch] ?? ch).join("");
  });
}

export const piece = (y: number, rows: readonly string[], x = 0): ArmorPiece => ({ x, y, rows });

/** Symmetrisches Teil, gezeichnet als linke Hälfte eines 24 Pixel breiten Rasters. */
export const half = (y: number, rows: readonly string[]) => piece(y, sym(rows));

/** Kantenlänge der Rüstungssymbole */
export const ICON_SIZE = 24;

/** Symmetrisches Symbol aus linken Hälften, auf 24 Zeilen aufgefüllt (Zeile = y im Symbol). */
export function base(rows: readonly string[]): string[] {
  const grid = sym(rows);
  return [...grid, ...Array<string>(ICON_SIZE - grid.length).fill(".".repeat(ICON_SIZE))];
}

/** Legt Teile über eine Grundform – jedes Zeichen ausser "." ersetzt, was darunter liegt. */
export function stamp(grid: readonly string[], ...pieces: ArmorPiece[]): string[] {
  const rows = grid.map((row) => [...row]);
  for (const { x, y, rows: part } of pieces)
    part.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        if (ch !== "." && rows[y + dy]?.[x + dx] !== undefined) rows[y + dy][x + dx] = ch;
      }),
    );
  return rows.map((row) => row.join(""));
}
