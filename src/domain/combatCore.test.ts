import { describe, expect, it } from "vitest";
import type { DamageOverTime } from "./combat";
import {
  bandage,
  canEndure,
  eliteRegen,
  healShare,
  layDot,
  secondWind,
  strongerDot,
  tickEnemyEffects,
  type DotEffects,
  type LayDot,
} from "./combatCore";
import { AREAS, DUNGEONS } from "./creatures";
import { matchupOf } from "./matchups";
import type { SkillRanks } from "./skills";

const ids = [...AREAS, ...DUNGEONS].flatMap((a) => a.creatures.map((c) => c.id));
/** Ein Gegner ohne Schwäche oder Resistenz gegen Gift – und einer, der immun ist. */
const NEUTRAL = ids.find((id) => matchupOf(id, "poison") === null && matchupOf(id, "burn") === null)!;
const IMMUNE = ids.find((id) => matchupOf(id, "poison") === "immune");

const ROT: SkillRanks = { venom: 3, creepingPoison: 1, rot: 1 };
const lay = <F extends DotEffects<DamageOverTime>>(fx: F, over: Partial<LayDot<DamageOverTime>> = {}) =>
  layDot<DamageOverTime, F>(fx, { creatureId: NEUTRAL, kind: "poison", base: 10, rounds: 3, skills: undefined, alive: true, own: undefined, ...over });

describe("Kampfkern: Gift, Feuer, Bluten", () => {
  it("legt eine Wirkung, ein stärkeres bleibt, bei Gleichstand gewinnt das neue", () => {
    const laid = lay({}, { kind: "burn" });
    expect(laid).toEqual({ immune: false, fx: { burn: { damage: 10, roundsLeft: 3 } } });
    const strong = { burn: { damage: 50, roundsLeft: 1 } };
    expect(lay(strong, { kind: "burn" })).toEqual({ immune: false, fx: strong });
    expect(strongerDot({ damage: 5, roundsLeft: 1 }, { damage: 5, roundsLeft: 4 }).roundsLeft).toBe(4);
  });

  it("wirkt nicht auf immune Gegner", () => {
    if (!IMMUNE) return;
    expect(lay({}, { creatureId: IMMUNE })).toEqual({ immune: true });
  });

  it("Gift stapelt sich nur auf `own` – im Koop also nicht auf das Gift eines Mitspielers", () => {
    const foreign: { poison: DamageOverTime & { sourceId: string } } = { poison: { damage: 10, roundsLeft: 3, sourceId: "b" } };
    const skills: SkillRanks = { creepingPoison: 1 };
    // Solo: own = das vorhandene Gift → Stapel 2
    const solo = lay(foreign, { skills, own: foreign.poison });
    expect(!solo.immune && solo.fx.poison?.stacks).toBe(2);
    // Koop, fremdes Gift: kein Stapel – gleich stark, also gewinnt das neue mit Verursacher
    const coop = layDot(foreign, { creatureId: NEUTRAL, kind: "poison", base: 10, rounds: 3, skills, alive: true, own: undefined, tag: { sourceId: "a" } });
    expect(!coop.immune && coop.fx.poison).toEqual({ damage: 10, roundsLeft: 3, sourceId: "a" });
  });

  it("Fäulnis: beim dritten Stapel platzt das Gift – nur, solange der Gegner lebt", () => {
    const two = { poison: { damage: 26, roundsLeft: 3, stacks: 2 } };
    const burst = lay(two, { skills: ROT, own: two.poison });
    expect(!burst.immune && burst.burst).toBeGreaterThan(0);
    expect(!burst.immune && burst.fx.poison).toBeUndefined();
    const dead = lay(two, { skills: ROT, own: two.poison, alive: false });
    expect(!dead.immune && dead.burst).toBeUndefined();
    expect(!dead.immune && dead.fx.poison?.stacks).toBe(3);
  });

  it("Verwundbarkeit verstärkt das Platzen", () => {
    const two = { poison: { damage: 26, roundsLeft: 3, stacks: 2 } };
    const plain = lay(two, { skills: ROT, own: two.poison });
    const vulnerable = lay({ ...two, vulnerable: { percent: 0.5, roundsLeft: 2 } }, { skills: ROT, own: two.poison });
    expect(!vulnerable.immune && !plain.immune && vulnerable.burst! > plain.burst!).toBe(true);
  });
});

describe("Kampfkern: Rundenende", () => {
  it("lässt Schwächung, Verwundbarkeit und Markierungen ablaufen, Gift bleibt unberührt", () => {
    const fx = tickEnemyEffects({
      weaken: { percent: 0.2, roundsLeft: 2 },
      vulnerable: { percent: 0.2, roundsLeft: 1 },
      dazed: 1,
      chilled: 3,
      poison: { damage: 5, roundsLeft: 2 },
    });
    expect(fx.weaken).toEqual({ percent: 0.2, roundsLeft: 1 });
    expect(fx.vulnerable).toBeUndefined();
    expect(fx.dazed).toBeUndefined();
    expect(fx.chilled).toBe(2);
    expect(fx.poison).toEqual({ damage: 5, roundsLeft: 2 });
    expect("shaken" in fx).toBe(false);
  });

  it("Heilung geht nie über das Maximum", () => {
    expect(healShare(90, 100, 0.2)).toBe(10);
    expect(healShare(50, 100, 0.2)).toBe(20);
  });

  it("Regenerierende Elites heilen sich – nicht, solange sie brennen", () => {
    const c = { hp: 50, maxHp: 100 };
    expect(eliteRegen(c, ["regenerating"], false)).toBeGreaterThan(0);
    expect(eliteRegen(c, ["regenerating"], true)).toBe(0);
    expect(eliteRegen(c, [], false)).toBe(0);
    expect(eliteRegen({ hp: 100, maxHp: 100 }, ["regenerating"], false)).toBe(0);
  });

  it("Notverband, Unbeugsam und Zweiter Atem greifen je nur einmal", () => {
    expect(bandage({ bandage: 1 }, 20, 100, false)).toBeGreaterThan(0);
    expect(bandage({ bandage: 1 }, 20, 100, true)).toBe(0);
    expect(bandage({ bandage: 1 }, 80, 100, false)).toBe(0);
    expect(canEndure(["unyielding"], false)).toBe(true);
    expect(canEndure(["unyielding"], true)).toBe(false);
    expect(secondWind(["secondWind"], false, 200)).toBeGreaterThan(0);
    expect(secondWind(["secondWind"], true, 200)).toBe(0);
    expect(secondWind([], false, 200)).toBe(0);
  });
});
