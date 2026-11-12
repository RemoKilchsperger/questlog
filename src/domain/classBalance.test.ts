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
import { CLASS_BUILDS, classBudget, classSpread } from "../test/classSim";

/** Kämpfe pro Klasse und Boss – genug für stabile Mittelwerte über 6 Bosse, schnell genug für jeden Lauf. */
const N = 60;

/** Leitplanken (heutiger Stand mit Abstand, siehe oben) */
const MIN_CLASS_WIN = 0.1;
const MAX_SPREAD = 0.6;
/** Budget: höchstens so viel mehr Schaden pro Runde als derselbe Held ohne Klasse (heute Assassine ≈ +44 %) */
const MAX_CLASS_DAMAGE_VALUE = 0.5;

describe("Klassen: Spreizung und Budget (Simulation)", () => {
  it("keine Klasse fällt ganz ab, der Abstand zwischen bester und schlechtester bleibt begrenzt", () => {
    const rows = classSpread({ n: N, rarity: "rare", seed: 1 });
    for (const row of rows) expect(row.meanWin, `${row.id}: mittlere Siegquote`).toBeGreaterThanOrEqual(MIN_CLASS_WIN);
    const wins = rows.map((r) => r.meanWin);
    expect(Math.max(...wins) - Math.min(...wins), "Abstand beste/schlechteste").toBeLessThanOrEqual(MAX_SPREAD);
  });

  it("die Klasse lohnt sich: mehr Siege als mit derselben Ausrüstung ohne Klasse, aber kein Ausreisser beim Schaden", () => {
    for (const build of CLASS_BUILDS) {
      const budget = classBudget(build, { n: N / 2, rarity: "rare", seed: 2 });
      expect(budget.withClass.meanWin, `${build.id}: Siege mit Klasse`).toBeGreaterThan(budget.classless.meanWin);
      expect(budget.value, `${build.id}: Mehrwert Schaden pro Runde`).toBeLessThanOrEqual(MAX_CLASS_DAMAGE_VALUE);
      expect(budget.value, `${build.id}: Mehrwert Schaden pro Runde`).toBeGreaterThan(-0.05);
    }
  });
});
