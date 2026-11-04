import { describe, expect, it } from "vitest";
import { attackRound, drinkPotion, getHeroCombatProfile, potionBlocker, setTarget, startBattle, type BattleState } from "./combat";
import { BOSS, resolveRound, startCoopBattle, type CoopPlayer } from "./coopCombat";
import { getCreature } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { getPotion, isThrowable, POTIONS, THROW_POTIONS } from "./potions";
import type { Character } from "./types";

const rng = (value: number) => () => value;

const hero: Character = {
  name: "Held",
  totalXp: 50_000,
  gold: 0,
  essence: 0,
  stats: { strength: 20, intellect: 20, endurance: 20, charisma: 20 },
  spentPoints: 0,
  skills: {},
};
const profile = getHeroCombatProfile(hero, EMPTY_EQUIPMENT);

/** Kampf gegen `creatureId` – Held und Gegner praktisch unverwundbar, Begleiter bleiben (zäh) dabei. */
const fight = (creatureId: string): BattleState => {
  const battle = startBattle("b", "Held", profile, getCreature(creatureId).creature);
  return {
    ...battle,
    hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 },
    enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 },
    adds: battle.adds?.map((a) => ({ ...a, combatant: { ...a.combatant, hp: 99_999, maxHp: 99_999 } })),
  };
};

/** Wurftrank bereithalten und die Runde mit einem normalen Angriff spielen. */
const throwAt = (state: BattleState, potionId: string) => attackRound(drinkPotion(state, getPotion(potionId)).state, rng(0.5));

describe("Wurftränke: Grundregeln", () => {
  it("es gibt sechs Wurftränke, alle mit Preis und Alchemisten-Stufe", () => {
    expect(THROW_POTIONS.map((p) => p.id)).toEqual(["firebomb", "venom", "frostbomb", "acid", "smoke", "blast"]);
    for (const p of THROW_POTIONS) expect(p.alchemist).toBeGreaterThanOrEqual(1);
    expect(new Set(POTIONS.map((p) => p.icon)).size).toBe(POTIONS.length);
  });

  it("zählt als Trank der Runde und jede Sorte nur einmal pro Kampf", () => {
    const ready = drinkPotion(fight("grey-wolf"), getPotion("firebomb")).state;
    expect(ready.thrown).toBe("firebomb");
    expect(() => drinkPotion(ready, getPotion("venom"))).toThrow(/Runde/);
    const next = attackRound(ready, rng(0.5)).state;
    expect(next.thrown).toBeUndefined();
    expect(() => drinkPotion(next, getPotion("firebomb"))).toThrow(/einmal|schon/);
    expect(() => drinkPotion(next, getPotion("venom"))).not.toThrow();
  });

  it("fliegt auf das Ziel beim Bereitlegen – angreifen lässt sich danach ein anderes", () => {
    const battle = fight("goblin-chief");
    const drummer = battle.adds!.find((a) => a.role === "drummer")!;
    const drumming: BattleState = { ...battle, adds: battle.adds!.map((a) => (a === drummer ? { ...a, cast: 2 } : a)) };
    const ready = setTarget(drinkPotion(setTarget(drumming, drummer.uid), getPotion("frostbomb")).state, undefined);
    const { events, state } = attackRound(ready, rng(0.5));
    expect(events[0]).toEqual({ type: "thrown", potionId: "frostbomb", add: drummer.uid });
    expect(events).toContainEqual({ type: "interrupted", add: drummer.uid });
    expect(events.some((e) => e.type === "hit" && e.attacker === "hero" && !e.add)).toBe(true);
    expect(state.enemy.hp).toBeLessThan(battle.enemy.hp);
    expect(state.thrownAt).toBeUndefined();
  });

  it("fliegt auch, wenn der Held abwehrt", () => {
    const ready = drinkPotion(fight("grey-wolf"), getPotion("venom")).state;
    const { events, state } = attackRound(ready, rng(0.5), "defend");
    expect(events[0]).toEqual({ type: "thrown", potionId: "venom" });
    expect(state.enemyEffects.poison).toBeDefined();
  });
});

describe("Wurftränke: Wirkung", () => {
  it("die Brandflasche setzt in Brand – Feuerimmune lässt sie kalt", () => {
    const { events, state } = throwAt(fight("grey-wolf"), "firebomb");
    expect(events[0]).toEqual({ type: "thrown", potionId: "firebomb" });
    const burn = events.find((e) => e.type === "burn" && e.target === "enemy");
    expect(burn && burn.type === "burn" && burn.damage).toBe(Math.round(profile.damage * 0.3));
    expect(state.enemyEffects.burn?.roundsLeft).toBe(2);

    const immune = throwAt(fight("fire-salamander"), "firebomb");
    expect(immune.events).toContainEqual({ type: "immune", kind: "burn" });
    expect(immune.state.enemyEffects.burn).toBeUndefined();
  });

  it("der Meisteralchemist macht Wurftränke stärker", () => {
    const burnOf = (s: BattleState) => throwAt(s, "firebomb").state.enemyEffects.burn!.damage;
    const base = fight("grey-wolf");
    expect(burnOf({ ...base, potionPower: 1.25 })).toBeGreaterThan(burnOf(base));
  });

  it("die Frostbombe friert ein – der Gegner greift nicht an, ein Boss ist danach immun", () => {
    const wolf = throwAt(fight("grey-wolf"), "frostbomb");
    expect(wolf.events).toContainEqual({ type: "stunned", freeze: true });
    expect(wolf.events.some((e) => e.type === "hit" && e.attacker === "enemy" && !e.add)).toBe(false);

    const boss = { ...fight("goblin-chief"), adds: [] };
    const frozen = throwAt(boss, "frostbomb");
    expect(frozen.events).toContainEqual({ type: "stunned", freeze: true });
    expect(frozen.state.enemyEffects.stunImmunity).toBeGreaterThan(0);
  });

  it("die Säure senkt die Rüstung und frisst zwei Panzerplatten weg", () => {
    const { events, state } = throwAt(fight("grey-wolf"), "acid");
    expect(events).toContainEqual({ type: "corroded" });
    expect(state.enemyEffects.armorBreak).toBe(0.25);

    const king = { ...fight("ore-king"), adds: [] };
    const plates = king.bossTurn!.plates!;
    const eaten = attackRound(drinkPotion(king, getPotion("acid")).state, rng(0.5), "defend");
    expect(eaten.state.bossTurn?.plates).toBe(plates - 2);
  });

  it("der Rauch schwächt das Ziel für zwei Runden", () => {
    const { state, events } = throwAt(fight("grey-wolf"), "smoke");
    expect(events).toContainEqual({ type: "smoked" });
    expect(state.enemyEffects.weaken).toEqual({ percent: 0.3, roundsLeft: 1 });
  });

  it("die Sprengflasche trifft alle Gegner – der Schild des Schildträgers schluckt seinen Teil", () => {
    const battle = fight("goblin-chief");
    const { events } = throwAt(battle, "blast");
    const blasts = events.filter((e) => e.type === "blast");
    expect(blasts).toHaveLength(1 + battle.adds!.length);
    expect(blasts.every((e) => e.type === "blast" && e.damage === Math.round(profile.damage * 0.5))).toBe(true);

    const shielded = throwAt({ ...battle, bossShield: 99_999 }, "blast").events.find((e) => e.type === "blast" && !e.add);
    expect(shielded).toMatchObject({ damage: 0, absorbed: Math.round(profile.damage * 0.5) });
  });

  it("auf einen abgetauchten Boss lässt sich nur die Sprengflasche werfen", () => {
    const battle: BattleState = { ...fight("grey-wolf"), bossTurn: { intent: "submerged" } };
    expect(potionBlocker(battle, getPotion("firebomb"))).toMatch(/abgetaucht/);
    expect(potionBlocker(battle, getPotion("blast"))).toBeNull();
    expect(potionBlocker({ ...battle, bossTurn: { intent: "attack" } }, getPotion("firebomb"))).toBeNull();
  });
});

describe("Feuer, Gift und Bluten treffen aufeinander", () => {
  const burning = (damage: number, roundsLeft: number): BattleState => {
    const battle = fight("grey-wolf");
    return { ...battle, enemyEffects: { ...battle.enemyEffects, burn: { damage, roundsLeft } } };
  };

  it("ein schwächeres Feuer überschreibt kein stärkeres – ein stärkeres ersetzt das schwächere", () => {
    const strong = throwAt(burning(999, 3), "firebomb");
    expect(strong.events).toContainEqual({ type: "burn", target: "enemy", damage: 999 });
    expect(strong.state.enemyEffects.burn).toEqual({ damage: 999, roundsLeft: 2 });

    const weak = throwAt(burning(1, 1), "firebomb");
    expect(weak.state.enemyEffects.burn).toEqual({ damage: Math.round(profile.damage * 0.3), roundsLeft: 2 });
  });

  it("dasselbe gilt für Gift", () => {
    const battle = fight("grey-wolf");
    const poisoned = { ...battle, enemyEffects: { poison: { damage: 999, roundsLeft: 3 } } };
    expect(throwAt(poisoned, "venom").state.enemyEffects.poison).toEqual({ damage: 999, roundsLeft: 2 });
  });

  it("Bluten, Feuer und Gift laufen gleichzeitig", () => {
    const battle = fight("grey-wolf");
    const bleeding = { ...battle, enemyEffects: { bleed: { damage: 5, roundsLeft: 3 }, poison: { damage: 7, roundsLeft: 3 } } };
    const { events } = throwAt(bleeding, "firebomb");
    const ticks = events.filter((e) => (e.type === "burn" || e.type === "bleed" || e.type === "poison") && e.target === "enemy").map((e) => e.type);
    expect(ticks).toEqual(["poison", "burn", "bleed"]);
  });

  it("im Koop überschreibt ein schwächeres Feuer auch das eines Mitspielers nicht", () => {
    const battle = startCoopBattle("k", "swamp-hydra", [
      { id: "a", name: "a", profile },
      { id: "b", name: "b", profile },
    ], 0);
    const burning = { ...battle, boss: { ...battle.boss, hp: 999_999, maxHp: 999_999 }, bossEffects: { burn: { damage: 999, roundsLeft: 3, sourceId: "b" } } };
    const { state } = resolveRound(burning, { a: { potion: { potionId: "firebomb", targetId: "a" } } }, rng(0.5), 0);
    expect(state.bossEffects.burn).toEqual({ damage: 999, roundsLeft: 2, sourceId: "b" });
  });
});

describe("Wurftränke im Koop", () => {
  const player = (id: string): CoopPlayer => ({ id, name: id, profile: { ...profile, critChance: 0 } });
  const start = () => {
    const battle = startCoopBattle("k", "swamp-hydra", [player("a"), player("b")], 0);
    return { ...battle, boss: { ...battle.boss, hp: 999_999, maxHp: 999_999 } };
  };

  it("fliegt auf das Ziel des Angriffs und zählt für die Sorte – mit Schwächen und Immunitäten", () => {
    const { state, events } = resolveRound(start(), { a: { potion: { potionId: "firebomb", targetId: "a" } } }, rng(0.5), 0);
    expect(events).toContainEqual({ type: "thrown", heroId: "a", target: BOSS, potionId: "firebomb" });
    // Die Hydra ist schwach gegen Feuer und immun gegen Gift
    expect(state.bossEffects.burn).toMatchObject({ sourceId: "a", damage: Math.round(profile.damage * 0.3 * 1.3) });
    expect(state.heroes[0].potionsUsed).toEqual(["firebomb"]);
    const venom = resolveRound(start(), { a: { potion: { potionId: "venom", targetId: "a" } } }, rng(0.5), 0);
    expect(venom.events).toContainEqual({ type: "immune", target: BOSS, kind: "poison" });
  });

  it("Frostbombe friert den Boss ein, Sprengflasche trifft ihn", () => {
    const frozen = resolveRound(start(), { a: { potion: { potionId: "frostbomb", targetId: "a" } } }, rng(0.5), 0);
    expect(frozen.events).toContainEqual({ type: "stunned", freeze: true });
    const blast = resolveRound(start(), { b: { potion: { potionId: "blast", targetId: "b" } } }, rng(0.5), 0);
    expect(blast.events).toContainEqual({ type: "blast", heroId: "b", target: BOSS, damage: Math.round(profile.damage * 0.5) });
  });

  it("jeder Wurftrank ist als solcher erkennbar", () => {
    expect(THROW_POTIONS.every(isThrowable)).toBe(true);
    expect(isThrowable(getPotion("small"))).toBe(false);
  });
});
