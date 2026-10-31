import { describe, expect, it } from "vitest";
import { fullWeapon } from "../test/weapons";
import type { AbilityId } from "./abilities";
import { attackRound, getHeroCombatProfile, startBattle, type BattleEvent, type BattleState, type HeroCombatProfile } from "./combat";
import { resolveRound, startCoopBattle } from "./coopCombat";
import { getCreature } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { xpForNextLevel } from "./leveling";
import type { Character, Equipment } from "./types";

const heroAt = (level: number): Character => {
  let totalXp = 0;
  for (let l = 1; l < level; l++) totalXp += xpForNextLevel(l);
  return {
    name: "Held",
    totalXp,
    gold: 0,
    essence: 0,
    stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 },
    spentPoints: 0,
    skills: {},
  };
};
const withWeapons = (...ids: string[]): Equipment => ({
  ...EMPTY_EQUIPMENT,
  weapon1: ids[0] ? fullWeapon(ids[0], "common", "w1") : null,
  weapon2: ids[1] ? fullWeapon(ids[1], "common", "w2") : null,
});
const profileWith = (...weapons: string[]): HeroCombatProfile => getHeroCombatProfile(heroAt(30), withWeapons(...weapons));
/** Zäher Held gegen einen zähen, kräftig zuschlagenden Gegner – Runden laufen vollständig ab. */
const battleWith = (weapons: string[], creatureId = "grey-wolf"): BattleState => {
  const battle = startBattle("b", "Held", profileWith(...weapons), getCreature(creatureId).creature);
  return {
    ...battle,
    mana: 999,
    maxMana: 999,
    hero: { ...battle.hero, hp: 50_000, maxHp: 100_000 },
    enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999, damage: 400 },
  };
};
const rng = (value: number) => () => value;
const round = (state: BattleState, ability?: AbilityId) => attackRound(state, rng(0.5), ability);
const dealt = (events: BattleEvent[]) => events.reduce((sum, e) => sum + (e.type === "hit" && e.attacker === "hero" ? e.damage : 0), 0);
const taken = (events: BattleEvent[]) => events.reduce((sum, e) => sum + (e.type === "hit" && e.attacker === "enemy" ? e.damage : 0), 0);
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2);

describe("Neue Fähigkeiten: Wirkung im Solo-Kampf", () => {
  it("Heiliger Hammer zählt als Magie – gegen magie-schwache Gegner ein Schwachpunkt", () => {
    const { events } = round(battleWith(["mace-30"], "goblin-raider"), "mace-4");
    expect(events.find((e) => e.type === "hit" && e.attacker === "hero")).toMatchObject({ matchup: "weak" });
    const plain = round(battleWith(["mace-30"], "goblin-raider"), "mace").events;
    expect(plain.find((e) => e.type === "hit" && e.attacker === "hero")).not.toHaveProperty("matchup");
  });

  it("Läuterung heilt und entfernt Gift, Feuer und Bluten – ohne anzugreifen", () => {
    const base = battleWith(["mace-30"]);
    const sick = { ...base, heroEffects: { poison: { damage: 50, roundsLeft: 3 }, bleed: { damage: 50, roundsLeft: 2 } } };
    const { state, events } = round(sick, "mace-3");
    expect(events).toContainEqual({ type: "cleansed" });
    expect(events.some((e) => e.type === "poison" || e.type === "bleed")).toBe(false);
    expect(state.heroEffects.poison).toBeUndefined();
    expect(dealt(events)).toBe(0);
    expect(events.some((e) => e.type === "selfHeal")).toBe(true);
  });

  it("Schildwall: 3 Runden −50 % erlittener Schaden, ab sofort", () => {
    const base = battleWith(["sword-30", "shield-30"]);
    const plain = taken(round(base).events);
    const walled = round(base, "shield-4");
    near(taken(walled.events), plain * 0.5);
    const second = round(walled.state);
    const third = round(second.state);
    near(taken(second.events), plain * 0.5);
    near(taken(third.events), plain * 0.5);
    expect(third.state.heroEffects.damageTaken).toBeUndefined();
    near(taken(round(third.state).events), plain);
  });

  it("Wutschrei: ab der nächsten Runde +40 % Schaden, aber ab sofort +20 % erlittener Schaden", () => {
    const base = battleWith(["greataxe-30"]);
    const plain = round(base);
    const shout = round(base, "greataxe-5");
    near(taken(shout.events), taken(plain.events) * 1.2);
    near(dealt(round(shout.state).events), dealt(plain.events) * 1.4);
  });

  it("Ausbluten: +60 % gegen blutende Gegner", () => {
    const base = battleWith(["greataxe-30"]);
    const bleeding = { ...base, enemyEffects: { bleed: { damage: 1, roundsLeft: 3 } } };
    near(dealt(round(bleeding, "greataxe-6").events) - 1, dealt(round(base, "greataxe-6").events) * 1.6 - 1);
  });

  it("Titanenschlag: erst ausholen, dann dreifacher Schaden – nur einmal", () => {
    const base = battleWith(["greathammer-30"]);
    const plain = dealt(round(base).events);
    const charging = round(base, "greathammer-6");
    expect(dealt(charging.events)).toBe(0);
    expect(charging.state.heroEffects.charged).toBe(3);
    const smash = round(charging.state);
    near(dealt(smash.events), plain * 3);
    expect(smash.state.heroEffects.charged).toBeUndefined();
    near(dealt(round(smash.state).events), plain);
  });

  it("Arkane Heilung: sofort 20 %, dann 3 Runden je 5 % – Arkaner Schild gibt Mana zurück", () => {
    const base = battleWith(["staff-30"]);
    const healed = round(base, "staff-5");
    expect(healed.events).toContainEqual({ type: "selfHeal", heal: 20_000 });
    expect(healed.events).toContainEqual({ type: "regen", heal: 5_000 });
    const next = round(healed.state);
    const last = round(next.state);
    expect(next.events).toContainEqual({ type: "regen", heal: 5_000 });
    expect(last.events).toContainEqual({ type: "regen", heal: 5_000 });
    expect(round(last.state).events.some((e) => e.type === "regen")).toBe(false);

    const shield = round({ ...base, mana: 100 }, "staff-6");
    expect(shield.events.some((e) => e.type === "guarded")).toBe(true);
    expect(shield.state.mana).toBe(100 - 20 + 15 + 6);
  });

  it("Turm-Segen „Henker“ verstärkt auch normale Angriffe gegen angeschlagene Gegner", () => {
    const base = battleWith(["sword-30"]);
    const low = { ...base, enemy: { ...base.enemy, hp: 20_000 } };
    near(dealt(round({ ...low, blessings: ["executioner"] }).events), dealt(round(low).events) * 1.4);
  });
});

describe("Neue Fähigkeiten im Koop", () => {
  const coop = (weapons: string[]) => {
    const battle = startCoopBattle("k", "swamp-hydra", [
      { id: "a", name: "A", profile: profileWith(...weapons) },
      { id: "b", name: "B", profile: profileWith("sword-30") },
    ], 0);
    return {
      ...battle,
      heroes: battle.heroes.map((h) => ({ ...h, mana: 999, combatant: { ...h.combatant, hp: 10, maxHp: 10_000 } })),
      boss: { ...battle.boss, hp: 999_999, maxHp: 999_999, damage: 1 },
      adds: [],
    };
  };

  it("Arkane Heilung heilt die Mitspieler halb so stark mit", () => {
    const { events, state } = resolveRound(coop(["staff-30"]), { a: { ability: "staff-5" } }, rng(0.5), 0);
    expect(events).toContainEqual({ type: "selfHeal", heroId: "a", heal: 2_000 });
    expect(events).toContainEqual({ type: "selfHeal", heroId: "b", heal: 1_000, by: "a" });
    expect(state.heroes.find((h) => h.id === "b")!.effects.renew).toMatchObject({ percent: 0.025 });
  });

  it("Schildwall zieht die Bedrohung auf den Anwender", () => {
    const battle = coop(["sword-30", "shield-30"]);
    const busy = { ...battle, heroes: battle.heroes.map((h) => ({ ...h, threat: h.id === "b" ? 500 : 0 })) };
    const { state } = resolveRound(busy, { a: { ability: "shield-4" }, b: {} }, rng(0.5), 0);
    const [a, b] = ["a", "b"].map((id) => state.heroes.find((h) => h.id === id)!);
    expect(a.threat).toBeGreaterThan(b.threat);
    expect(a.effects.damageTaken).toMatchObject({ percent: -0.5 });
  });

  it("Titanenschlag wirkt auch im Koop auf die nächste Aktion", () => {
    const first = resolveRound(coop(["greathammer-30"]), { a: { ability: "greathammer-6" } }, rng(0.5), 0);
    expect(first.state.heroes.find((h) => h.id === "a")!.effects.charged).toBe(3);
    const second = resolveRound(first.state, {}, rng(0.5), 0);
    expect(second.state.heroes.find((h) => h.id === "a")!.effects.charged).toBeUndefined();
  });
});
