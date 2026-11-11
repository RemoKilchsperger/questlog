import { describe, expect, it } from "vitest";
import type { DamageOverTime } from "./combat";
import {
  abilityDots,
  bandage,
  canEndure,
  damageTakenFactor,
  dodges,
  drainHeal,
  drumFactor,
  drumTurn,
  elitePoison,
  eliteRegen,
  eliteStrike,
  guardedDamage,
  guardRetort,
  healerTurn,
  healShare,
  layDot,
  ritualHeal,
  secondWind,
  shieldTurn,
  strikeHero,
  strongerDot,
  thornsDamage,
  thornsShare,
  tickEnemyEffects,
  tickFoeDots,
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

describe("Kampfkern: Gift, Feuer, Bluten pro Runde", () => {
  const run = (fx: Record<string, unknown>, hp = 100, skills?: SkillRanks) => {
    const foe = { c: { hp }, fx };
    const hits: [string, number, boolean][] = [];
    let downs = 0;
    tickFoeDots(foe, {
      fightOn: () => foe.c.hp > 0,
      scale: (d) => d,
      sourceSkills: () => skills,
      damage: (kind, damage, _e, burst) => {
        foe.c.hp = Math.max(0, foe.c.hp - damage);
        hits.push([kind, damage, burst]);
      },
      down: () => downs++,
    });
    return { foe, hits, downs };
  };

  it("wirkt in der Reihenfolge Gift, Feuer, Bluten und läuft je eine Runde ab", () => {
    const { foe, hits } = run({ bleed: { damage: 3, roundsLeft: 2 }, poison: { damage: 5, roundsLeft: 1 }, burn: { damage: 4, roundsLeft: 3 } });
    expect(hits.map((h) => h[0])).toEqual(["poison", "burn", "bleed"]);
    expect(foe.fx).toEqual({ poison: undefined, burn: { damage: 4, roundsLeft: 2 }, bleed: { damage: 3, roundsLeft: 1 } });
  });

  it("stirbt der Gegner am Gift, brennt er nicht mehr", () => {
    const { hits } = run({ poison: { damage: 50, roundsLeft: 2 }, burn: { damage: 10, roundsLeft: 2 } }, 40);
    expect(hits).toEqual([["poison", 50, false]]);
  });

  it("Blutsturz: läuft das Bluten aus, platzt die Wunde", () => {
    const { hits } = run({ bleed: { damage: 10, roundsLeft: 1 } }, 100, { bloodburst: 1 });
    expect(hits.map((h) => h[2])).toEqual([false, true]);
    expect(run({ bleed: { damage: 10, roundsLeft: 2 } }, 100, { bloodburst: 1 }).hits).toHaveLength(1);
  });

  it("Boss-Fähigkeiten hinterlassen Gift und Feuer – Drachenfeuer schützt vor Feuer", () => {
    const ability = { burn: { percent: 0.2, rounds: 2 }, poison: { percent: 0.1, rounds: 3 } };
    expect(abilityDots(ability, 100, undefined)).toEqual([
      ["poison", { damage: 10, roundsLeft: 3 }],
      ["burn", { damage: 20, roundsLeft: 2 }],
    ]);
    expect(abilityDots(ability, 100, ["dragonfire"]).map(([kind]) => kind)).toEqual(["poison"]);
    expect(elitePoison(40, undefined).damage).toBeGreaterThan(0);
  });
});

describe("Kampfkern: Angriff auf einen Helden", () => {
  const c = { name: "X", level: 10, maxHp: 100, hp: 100, damage: 50, armor: 0, critChance: 0 };

  it("Bollwerk blockt, ohne Zufall zu ziehen", () => {
    let draws = 0;
    const rng = () => (draws++, 0.5);
    expect(strikeHero(c, {}, c, { bulwark: true, skills: { phantom: 1 }, hurt: 1 }, rng)).toEqual({ blocked: true });
    expect(draws).toBe(0);
  });

  it("ohne Schemen zieht Ausweichen keinen Zufall", () => {
    let draws = 0;
    expect(dodges(undefined, () => (draws++, 0))).toBe(false);
    expect(draws).toBe(0);
    expect(dodges({ phantom: 1 }, () => 0)).toBe(true);
  });

  it("Schwächung und erlittener Schaden mindern den Treffer", () => {
    const rng = () => 0.5;
    const full = strikeHero(c, {}, c, { bulwark: false, skills: undefined, hurt: 1 }, rng);
    const weak = strikeHero(c, { weaken: { percent: 0.5, roundsLeft: 1 } }, c, { bulwark: false, skills: undefined, hurt: 0.5 }, rng);
    expect("hit" in full && "hit" in weak && weak.hit.damage < full.hit.damage).toBe(true);
  });

  it("Abwehren, Säure und Schildwall wirken auf den erlittenen Schaden", () => {
    expect(damageTakenFactor({}, false, undefined, 0.5)).toBe(1);
    expect(damageTakenFactor({}, true, undefined, 0.5)).toBe(0.5);
    expect(damageTakenFactor({ corroded: { percent: 0.2, roundsLeft: 1 } }, false, undefined, 0.5)).toBeCloseTo(1.2);
    expect(damageTakenFactor({ damageTaken: { percent: -2, roundsLeft: 1 } }, false, undefined, 0.5)).toBe(0);
  });

  it("Rasend und Flink", () => {
    expect(eliteStrike([], { hp: 10, maxHp: 100 })).toEqual({ rage: 1, swift: 1, hits: 1 });
    const swift = eliteStrike(["swift", "raging"], { hp: 10, maxHp: 100 });
    expect(swift.hits).toBe(2);
    expect(swift.rage).toBeGreaterThan(eliteStrike(["raging"], { hp: 90, maxHp: 100 }).rage);
  });

  it("Parade: Rückwurf vom vollen Schaden, Konter nur, solange der Held steht", () => {
    expect(guardedDamage(100, { reduce: 0.3 })).toBe(30);
    expect(guardedDamage(100, undefined)).toBe(100);
    expect(guardRetort({ reduce: 0.3, reflect: 0.5 }, 100, null)).toBe(50);
    expect(guardRetort({ reduce: 0.3, counter: 2 }, 100, (f) => f * 10)).toBe(20);
    expect(guardRetort({ reduce: 0.3, counter: 2 }, 100, null)).toBe(0);
  });

  it("Dornen gehen nur zurück, wenn es etwas zurückzugeben gibt", () => {
    expect(thornsDamage(100, 0.2, 50)).toBe(20);
    expect(thornsDamage(100, 0, 50)).toBe(0);
    expect(thornsDamage(100, 0.2, 0)).toBe(0);
    expect(thornsShare(undefined, undefined, true, { spikes: 1 })).toBeGreaterThan(0);
    expect(drainHeal({ hp: 95, maxHp: 100 }, 40, 0.5)).toBe(5);
  });
});

describe("Kampfkern: Begleiter mit Aufgabe", () => {
  it("Heiler: Ritual zählt hoch, heilt nach drei Runden, ein Treffer unterbricht", () => {
    expect(healerTurn(undefined, false)).toEqual({ cast: 1, act: "ritual", roundsLeft: 2 });
    expect(healerTurn(2, false)).toEqual({ cast: 0, act: "heal" });
    expect(healerTurn(2, true)).toEqual({ cast: 0, act: "interrupted", wasCasting: true });
    expect(healerTurn(0, true)).toEqual({ cast: 0, act: "interrupted", wasCasting: false });
    expect(ritualHeal({ hp: 50, maxHp: 100 })).toBeGreaterThan(0);
  });

  it("Schildträger hebt alle drei Runden den Schild, der Trommler wird lauter bis zum Maximum", () => {
    expect(shieldTurn(0, 1000).shield).toBe(0);
    expect(shieldTurn(2, 1000)).toEqual({ cast: 0, shield: expect.any(Number) });
    expect(shieldTurn(2, 1000).shield).toBeGreaterThan(0);
    expect(drumTurn(undefined)).toBe(1);
    expect(drumTurn(99)).toBe(drumTurn(98));
    expect(drumFactor([{ role: "drummer", cast: 2, c: { hp: 1 } }, { role: "drummer", cast: 3, c: { hp: 0 } }])).toBeGreaterThan(1);
  });
});
