// Klassenspreizung als Balance-Test (Review Nr. 22, Etappe G0 in docs/klassen-skilltree-abgleich.md):
// alle 11 Klassen mit passender Ausrüstung (Einhand-Klassen mit zwei Waffen), seltene Ausrüstung,
// Heiltränke, alle Gebietsbosse – solo, mit fester Saat. Er schützt vor neuen Ausreissern, wenn Klassen,
// Waffen, Fähigkeiten oder Skills sich ändern.
//
// Die Grenzen sind Leitplanken für den heutigen Stand (nach G1: Duellant ≈ 17 %, Assassine ≈ 68 %,
// Abstand ≈ 50 Punkte), nicht das Ziel. Ziel nach dem Klassen-Kern (G3, klassen-neukonzept.md Etappe 5):
// jede Klasse 40–60 %, Abstand ≤ 20 Punkte, klassenlos 20–30 Punkte unter dem Klassenmittel. Nach jeder
// Etappe die Grenzen nachziehen. Ausführliche Tabellen: src/domain/zzClassSim.test.ts (SIM_MODE).

import { describe, expect, it } from "vitest";
import { AREA_BOSSES, CLASS_BUILDS, CLASS_SKILL_PLANS, classBudget, classSpread, simulateSolo } from "../test/classSim";

/** Kämpfe pro Klasse und Boss – genug für stabile Mittelwerte über 6 Bosse, schnell genug für jeden Lauf. */
const N = 60;

/** Leitplanken (heutiger Stand mit Abstand, siehe oben) */
const MIN_CLASS_WIN = 0.1;
const MAX_SPREAD = 0.6;
/** Budget: höchstens so viel mehr Schaden pro Runde als derselbe Held ohne Klasse (heute Assassine ≈ +44 %) */
const MAX_CLASS_DAMAGE_VALUE = 0.5;
/**
 * Voller Baum (G2, „Meisterpfad 13 + Zweitpfad 17“ mit CLASS_SKILL_PLANS): Der Skilltree soll jede Klasse
 * stärken, aber keine abheben. Gemessen nach G2 (N=300): Mittel 76 %, Abstand 25 Punkte, Zuwachs +15 bis +46,
 * beste Klasse 85 % – vor G2 (alter Baum, 16 + 14) Mittel 73 %, Abstand 34.
 */
const TREE_MAX_SPREAD = 0.35;
const TREE_MAX_WIN = 0.95;
const TREE_MIN_GAIN = 0.05;
/** Simulationen brauchen unter Last mehr als die 5 s Standard */
const SIM_TIMEOUT = 120_000;

describe("Klassen: Spreizung und Budget (Simulation)", () => {
  it("keine Klasse fällt ganz ab, der Abstand zwischen bester und schlechtester bleibt begrenzt", () => {
    const rows = classSpread({ n: N, rarity: "rare", seed: 1 });
    for (const row of rows) expect(row.meanWin, `${row.id}: mittlere Siegquote`).toBeGreaterThanOrEqual(MIN_CLASS_WIN);
    const wins = rows.map((r) => r.meanWin);
    expect(Math.max(...wins) - Math.min(...wins), "Abstand beste/schlechteste").toBeLessThanOrEqual(MAX_SPREAD);
  }, SIM_TIMEOUT);

  it("die Klasse lohnt sich: mehr Siege als mit derselben Ausrüstung ohne Klasse, aber kein Ausreisser beim Schaden", () => {
    for (const build of CLASS_BUILDS) {
      const budget = classBudget(build, { n: N / 2, rarity: "rare", seed: 2 });
      expect(budget.withClass.meanWin, `${build.id}: Siege mit Klasse`).toBeGreaterThan(budget.classless.meanWin);
      expect(budget.value, `${build.id}: Mehrwert Schaden pro Runde`).toBeLessThanOrEqual(MAX_CLASS_DAMAGE_VALUE);
      expect(budget.value, `${build.id}: Mehrwert Schaden pro Runde`).toBeGreaterThan(-0.05);
    }
  }, SIM_TIMEOUT);

  it("voller Baum (Meisterpfad 13 + Zweitpfad 17): jede Klasse gewinnt dazu, keine hebt ab", () => {
    const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
    const rows = CLASS_BUILDS.map((build) => {
      const options = { n: N / 2, rarity: "rare" as const, seed: 3 };
      const plain = mean(AREA_BOSSES.map((boss) => simulateSolo(build, boss, options).win));
      const tree = mean(AREA_BOSSES.map((boss) => simulateSolo(build, boss, { ...options, plan: CLASS_SKILL_PLANS[build.id] }).win));
      return { id: build.id, plain, tree };
    });
    for (const row of rows) {
      expect(row.tree - row.plain, `${row.id}: Zuwachs durch den Baum`).toBeGreaterThanOrEqual(TREE_MIN_GAIN);
      expect(row.tree, `${row.id}: Siegquote mit vollem Baum`).toBeLessThanOrEqual(TREE_MAX_WIN);
    }
    const wins = rows.map((r) => r.tree);
    expect(Math.max(...wins) - Math.min(...wins), "Abstand mit vollem Baum").toBeLessThanOrEqual(TREE_MAX_SPREAD);
  }, SIM_TIMEOUT);
});
