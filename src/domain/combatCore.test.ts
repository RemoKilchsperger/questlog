import { describe, expect, it } from "vitest";
import type { DamageOverTime } from "./combat";
import type { AbilityDef } from "./abilities";
import {
  abilityBuffs,
  abilityHeal,
  cleansed,
  debuffFoe,
  defendGain,
  extendDots,
  heroLifesteal,
  layAbilityDots,
  absorbShield,
  afterHeroHit,
  foeArmor,
  heroVolley,
  strikeFactors,
  type StrikeFoe,
  type StrikeSetup,
  type StrikeTarget,
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

describe("Kampfkern: Treffer des Helden", () => {
  const foe = (hp = 100, fx: StrikeFoe["fx"] = {}): StrikeFoe => ({
    creatureId: NEUTRAL,
    c: { name: "X", level: 10, maxHp: 100, hp, damage: 10, armor: 40, critChance: 0 },
    fx,
  });
  const setup = (over: Partial<StrikeSetup> = {}): StrikeSetup => ({
    ability: null,
    heroKind: null,
    itemEffects: undefined,
    skills: undefined,
    blessings: undefined,
    round: 1,
    critChance: 0.1,
    fire: false,
    riposte: 1,
    wrath: 1,
    echoShare: 1,
    ...over,
  });
  const target: StrikeTarget = { isBoss: true, realBoss: true, elite: false, charging: false, plates: undefined };

  it("ohne Besonderheiten sind alle Faktoren 1", () => {
    const f = strikeFactors(foe(), setup(), target);
    expect([f.finisher, f.headsman, f.bleedBonus, f.shakenBonus, f.charging, f.vulnerable, f.kindFactor, f.itemFactor, f.skillFactor, f.plate]).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
    expect(f.critChance).toBeCloseTo(0.1);
  });

  it("Henker gegen angeschlagene Gegner, Verwundbarkeit, Echo", () => {
    const low = strikeFactors(foe(5, { vulnerable: { percent: 0.3, roundsLeft: 1 } }), setup({ blessings: ["executioner"], echoShare: 0.5 }), target);
    expect(low.headsman).toBeGreaterThan(1);
    expect(low.vulnerable).toBeCloseTo(1.3);
    expect(low.skillFactor).toBeCloseTo(0.5);
  });

  it("Rüstungsbruch mindert die Rüstung, manche Fähigkeiten ignorieren sie", () => {
    expect(foeArmor(foe(100, { armorBreak: 0.5 }), null)).toBe(20);
    expect(foeArmor(foe(), { ignoreArmor: true } as AbilityDef)).toBe(0);
  });

  it("der Schild schluckt erst, dann geht der Rest durch", () => {
    expect(absorbShield(30, 50)).toEqual({ absorbed: 30, damage: 20, shield: 0 });
    expect(absorbShield(80, 50)).toEqual({ absorbed: 50, damage: 0, shield: 30 });
  });

  it("nach dem Treffer: Plünderer blutet bei Krit, Manadieb gibt Mana", () => {
    const dots: string[] = [];
    let mana = 0;
    const on = { dot: (_f: StrikeFoe, kind: string) => dots.push(kind), mana: (n: number) => (mana += n), freeze: () => undefined };
    const state = strikeFactors(foe(), setup(), target).foeState;
    afterHeroHit(foe(), true, { base: 50, heroClass: "plunderer", itemEffects: ["manaThief"], skills: undefined, fire: false, foeState: state }, () => 0.99, on);
    expect(dots).toEqual(["bleed"]);
    expect(mana).toBeGreaterThan(0);
    dots.length = 0;
    afterHeroHit(foe(), false, { base: 50, heroClass: "plunderer", itemEffects: undefined, skills: undefined, fire: false, foeState: state }, () => 0.99, on);
    expect(dots).toEqual([]);
  });
});

describe("Kampfkern: Trefferfolge", () => {
  type T = { id: string; c: { hp: number } };
  const play = (over: Partial<Parameters<typeof heroVolley<T>>[0]> = {}) => {
    const a: T = { id: "a", c: { hp: 10 } };
    const b: T = { id: "b", c: { hp: 10 } };
    const hits: string[] = [];
    heroVolley<T>({
      ability: null,
      hits: () => 1,
      target: a,
      living: () => [a, b].filter((f) => f.c.hp > 0),
      volleyOn: () => true,
      fightOn: () => true,
      echo: false,
      feint: false,
      plain: true,
      heroClass: null,
      itemEffects: undefined,
      strike: (foe, share, echoShare) => hits.push(`${foe.id}:${share}:${echoShare}`),
      rng: () => 0,
      ...over,
    });
    return hits;
  };

  it("ein normaler Angriff trifft das Ziel einmal", () => expect(play()).toEqual(["a:1:1"]));

  it("Flächenwirkung trifft alle, Splash die Umstehenden schwächer", () => {
    expect(play({ ability: { aoe: "all", multiplier: 1 } as AbilityDef, plain: false })).toEqual(["a:1:1", "b:1:1"]);
    expect(play({ ability: { aoe: { splash: 0.5 }, multiplier: 1 } as AbilityDef, plain: false })).toEqual(["a:1:1", "b:0.5:1"]);
  });

  it("Echo: ein zweiter Durchgang mit halbem Schaden", () => {
    const hits = play({ ability: { multiplier: 1 } as AbilityDef, echo: true, plain: false });
    expect(hits).toHaveLength(2);
    expect(hits[1]).toMatch(/^a:1:0\.\d+$/);
  });

  it("Finte, Duellant und Kettenblitz schlagen nach", () => {
    expect(play({ feint: true })).toEqual(["a:1:1", "a:1:1"]);
    expect(play({ heroClass: "duelist" })).toEqual(["a:1:1", "a:1:1"]);
    expect(play({ itemEffects: ["chainLightning"] })[1]).toMatch(/^b:/);
  });

  it("Raserei: die Trefferzahl wird vor jedem Treffer neu bestimmt", () => {
    let left = 3;
    expect(play({ hits: () => left--, plain: false })).toHaveLength(2);
  });
});

describe("Kampfkern: Fähigkeiten", () => {
  it("Selbst-Wirkungen: die Verstärkung zählt erst ab der nächsten Runde", () => {
    const buffs = abilityBuffs({ empower: { percent: 0.3, rounds: 2 }, guard: { reduce: 0.5 }, charge: 2, feint: true } as AbilityDef);
    expect(buffs).toEqual({ empower: { percent: 0.3, roundsLeft: 3 }, guard: { reduce: 0.5 }, charged: 2, feint: true });
    expect(abilityBuffs({} as AbilityDef)).toEqual({});
  });

  it("Heilung nie über das Maximum, Mitspieler mit Anteil", () => {
    expect(abilityHeal(50, 100, 0.3)).toBe(30);
    expect(abilityHeal(90, 100, 0.3)).toBe(10);
    expect(abilityHeal(50, 100, 0.3, 0.5)).toBe(15);
  });

  it("Läuterung nimmt Gift, Feuer und Bluten – sonst gibt es nichts zu läutern", () => {
    const effects: { poison?: DamageOverTime; burn?: DamageOverTime; bleed?: DamageOverTime; feint?: true } = { poison: { damage: 1, roundsLeft: 1 }, feint: true };
    expect(cleansed(effects)).toEqual({ poison: undefined, burn: undefined, bleed: undefined, feint: true });
    expect(cleansed({ feint: true } as typeof effects)).toBeNull();
  });

  it("Schwächen, Verwundbar, Rüstungsbruch und Fluch der Schwäche", () => {
    const fx = debuffFoe({}, { weaken: { percent: 0.2, rounds: 2 }, armorBreak: 0.3 } as AbilityDef);
    expect(fx).toEqual({ weaken: { percent: 0.2, roundsLeft: 2 }, armorBreak: 0.3 });
    const longer = extendDots({ poison: { damage: 5, roundsLeft: 1 }, bleed: { damage: 5, roundsLeft: 1 } }, { extendDots: 2 } as AbilityDef);
    expect(longer.poison?.roundsLeft).toBe(3);
    expect(longer.bleed?.roundsLeft).toBe(1);
  });

  it("Gift, Feuer und Bluten einer Fähigkeit – Stärke aus dem Schaden des Helden", () => {
    const laid: [string, number, number][] = [];
    layAbilityDots({ burn: { percent: 0.5, rounds: 2 }, poison: { percent: 0.2, rounds: 3 } } as AbilityDef, 100, (kind, base, rounds) =>
      laid.push([kind, base, rounds]),
    );
    expect(laid).toEqual([
      ["poison", 20, 3],
      ["burn", 50, 2],
    ]);
  });
});

describe("Kampfkern: Abwehren und Lebensraub", () => {
  it("Abwehren gibt Mana bis zum Maximum", () => {
    expect(defendGain(50, 100, undefined, 10)).toBe(10);
    expect(defendGain(95, 100, undefined, 10)).toBe(5);
  });

  it("Lebensraub summiert Fähigkeit, Klasse, Segen, Item und Skill", () => {
    expect(heroLifesteal(null, null, undefined, undefined, undefined)).toBe(0);
    expect(heroLifesteal("plunderer", null, ["bloodthirst"], ["soulDrain"], { leech: 1 })).toBeGreaterThan(heroLifesteal("plunderer", null, undefined, undefined, undefined));
  });
});
