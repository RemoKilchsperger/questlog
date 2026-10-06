import { describe, expect, it } from "vitest";
import { ABILITIES, getAbility, type AbilityId } from "./abilities";
import { attackRound, getHeroCombatProfile, startBattle, type BattleState, type HeroCombatProfile } from "./combat";
import { resolveRound, startCoopBattle } from "./coopCombat";
import { getCreature } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem } from "./items";
import { xpForNextLevel } from "./leveling";
import {
  abilityUnlockBlocker,
  learnSkill,
  MAX_SKILL_RANK,
  SECOND_ABILITY_COST,
  SECOND_ABILITY_LEVEL,
  unlockAbility,
  unspentSkillPoints,
} from "./skills";
import type { Character, Equipment } from "./types";

const heroAt = (level: number, abilities: AbilityId[] = []): Character => {
  let totalXp = 0;
  for (let l = 1; l < level; l++) totalXp += xpForNextLevel(l);
  return {
    name: "Held",
    totalXp,
    gold: 0,
    essence: 0,
    stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 },
    spentPoints: 0,
    battlePoints: 5,
    battlePointSlot: 0,
    skills: {},
    abilities,
  };
};
const master = (character: Character, weapon: Parameters<typeof learnSkill>[1]) => {
  let next = character;
  for (let i = 0; i < MAX_SKILL_RANK; i++) next = learnSkill(next, weapon);
  return next;
};
const allAbilities = ABILITIES.map((a) => a.id);
const withWeapons = (...ids: string[]): Equipment => ({
  ...EMPTY_EQUIPMENT,
  weapon1: ids[0] ? createItem(ids[0], "common", "w1") : null,
  weapon2: ids[1] ? createItem(ids[1], "common", "w2") : null,
});
const profileWith = (...weapons: string[]): HeroCombatProfile =>
  getHeroCombatProfile(heroAt(30, allAbilities), withWeapons(...weapons));
/** Kampf gegen einen sehr zähen Wolf */
const battleWith = (...weapons: string[]): BattleState => {
  const battle = startBattle("b", "Held", profileWith(...weapons), getCreature("grey-wolf").creature);
  return { ...battle, mana: 999, enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 } };
};
const rng = (value: number) => () => value;
const heroDamage = (events: ReturnType<typeof attackRound>["events"]) =>
  events.reduce((sum, e) => sum + (e.type === "hit" && e.attacker === "hero" ? e.damage : 0), 0);
const enemyDamage = (events: ReturnType<typeof attackRound>["events"]) =>
  events.reduce((sum, e) => sum + (e.type === "hit" && e.attacker === "enemy" ? e.damage : 0), 0);

describe("Zweite Fähigkeiten: Freischalten", () => {
  it("braucht die erste Fähigkeit, Level 25 und 2 Skillpunkte", () => {
    const low = master(heroAt(SECOND_ABILITY_LEVEL - 1), "sword");
    expect(abilityUnlockBlocker(low, "sword-2")).toMatch(/Schwertwirbel freischalten/);
    expect(abilityUnlockBlocker(unlockAbility(low, "sword"), "sword-2")).toMatch(/Level 25/);

    const ready = unlockAbility(master(heroAt(SECOND_ABILITY_LEVEL), "sword"), "sword");
    expect(abilityUnlockBlocker(ready, "sword-2")).toBeNull();
    const both = unlockAbility(ready, "sword-2");
    expect(unspentSkillPoints(both)).toBe(unspentSkillPoints(ready) - SECOND_ABILITY_COST);
    expect(abilityUnlockBlocker(master(heroAt(30), "axe"), "sword-2")).toMatch(/meistern/);
  });

  it("im Kampf stehen pro Waffe beide Fähigkeiten zur Wahl", () => {
    expect(profileWith("sword-30", "axe-30").abilities).toEqual(["sword", "sword-2", "axe", "axe-2"]);
    const onlyFirst = getHeroCombatProfile(heroAt(30, ["sword"]), withWeapons("sword-30"));
    expect(onlyFirst.abilities).toEqual(["sword"]);
  });
});

describe("Zweite Fähigkeiten: Wirkung im Solo-Kampf", () => {
  it("Meucheln: dreifacher Schaden unter 30 % LP", () => {
    const full = battleWith("dagger-30");
    const low = { ...full, enemy: { ...full.enemy, hp: 20_000 } };
    const normal = heroDamage(attackRound(full, rng(0.5), "dagger-2").events);
    expect(heroDamage(attackRound(low, rng(0.5), "dagger-2").events)).toBeCloseTo(normal * 3, -1);
  });

  it("Parade: halber Schaden vom nächsten Angriff, dann Konter", () => {
    const battle = battleWith("sword-30");
    const plain = enemyDamage(attackRound(battle, rng(0.5)).events);
    const { events, state } = attackRound(battle, rng(0.5), "sword-2");
    expect(enemyDamage(events)).toBe(Math.max(1, Math.round(plain * 0.5)));
    expect(events.some((e) => e.type === "guarded")).toBe(true);
    expect(events.find((e) => e.type === "counter")).toBeDefined();
    expect(state.heroEffects.guard).toBeUndefined();
  });

  it("Vergeltung: wirft den vollen Schaden zurück, ohne selbst anzugreifen", () => {
    const battle = battleWith("sword-30", "shield-30");
    const plain = enemyDamage(attackRound(battle, rng(0.5)).events);
    const { events } = attackRound(battle, rng(0.5), "shield-2");
    expect(heroDamage(events)).toBe(0);
    expect(events.find((e) => e.type === "counter")).toEqual({ type: "counter", damage: plain });
  });

  it("Kriegsschrei: ab der nächsten Runde 3 Runden lang +25 % Schaden", () => {
    const battle = battleWith("greatsword-30");
    const base = heroDamage(attackRound(battle, rng(0.5)).events);
    let state = attackRound(battle, rng(0.5), "greatsword-2").state;
    for (let round = 0; round < 3; round++) {
      const result = attackRound(state, rng(0.5));
      expect(heroDamage(result.events), `Runde ${round + 1}`).toBeCloseTo(base * 1.25, -1);
      state = result.state;
    }
    expect(heroDamage(attackRound(state, rng(0.5)).events)).toBe(base);
  });

  it("Blutrausch heilt um 40 % des Schadens, Heiliges Licht um 25 % der LP", () => {
    const hurt = (s: BattleState): BattleState => ({ ...s, hero: { ...s.hero, hp: 10 } });
    const rage = attackRound(hurt(battleWith("greataxe-30")), rng(0.5), "greataxe-2").events;
    const heal = rage.find((e) => e.type === "selfHeal");
    expect(heal).toEqual({ type: "selfHeal", heal: Math.round(heroDamage(rage) * 0.4) });

    const battle = hurt(battleWith("mace-30"));
    const light = attackRound(battle, rng(0.5), "mace-2").events.find((e) => e.type === "selfHeal");
    expect(light).toEqual({ type: "selfHeal", heal: Math.round(battle.hero.maxHp * 0.25) });
  });

  it("Erdbeben schwächt den Gegner 2 Runden lang", () => {
    const battle = battleWith("greathammer-30");
    const plain = enemyDamage(attackRound(battle, rng(0.5)).events);
    const quake = attackRound(battle, rng(0.5), "greathammer-2");
    expect(enemyDamage(quake.events)).toBeCloseTo(plain * 0.6, -1);
    const next = attackRound(quake.state, rng(0.5));
    expect(enemyDamage(next.events)).toBeCloseTo(plain * 0.6, -1);
    expect(enemyDamage(attackRound(next.state, rng(0.5)).events)).toBe(plain);
  });

  it("Fluch der Schwäche: Gegner erleidet 20 % mehr Schaden", () => {
    const battle = battleWith("scepter-30");
    const plain = heroDamage(attackRound(battle, rng(0.5)).events);
    const cursed = attackRound(battle, rng(0.5), "scepter-2").state;
    expect(heroDamage(attackRound(cursed, rng(0.5)).events)).toBeCloseTo(plain * 1.2, -1);
  });

  it("Meteor und Durchbohrender Schuss: Feuer bzw. Bluten", () => {
    expect(attackRound(battleWith("staff-30"), rng(0.5), "staff-2").state.enemyEffects.burn?.roundsLeft).toBe(2);
    expect(attackRound(battleWith("bow-30"), rng(0.5), "bow-2").state.enemyEffects.bleed?.roundsLeft).toBe(1);
    expect(getAbility("axe-2").hits).toBe(2);
  });

  it("ein Konter kann den Kampf entscheiden", () => {
    const battle = battleWith("sword-30");
    // Der Hieb der Parade lässt den Gegner mit 1 LP stehen, der Konter erledigt ihn
    const hit = heroDamage(attackRound(battle, rng(0.5), "sword-2").events);
    const nearly = { ...battle, enemy: { ...battle.enemy, hp: hit + 1 } };
    const { state, events } = attackRound(nearly, rng(0.5), "sword-2");
    expect(events.some((e) => e.type === "counter")).toBe(true);
    expect(state.status).toBe("won");
  });
});

describe("Zweite Fähigkeiten im Koop", () => {
  const coop = (weapons: string[]) => {
    const battle = startCoopBattle("k", "swamp-hydra", [
      { id: "a", name: "A", profile: profileWith(...weapons) },
      { id: "b", name: "B", profile: profileWith("sword-30") },
    ], 0);
    return {
      ...battle,
      heroes: battle.heroes.map((h) => ({ ...h, mana: 999 })),
      boss: { ...battle.boss, hp: 999_999, maxHp: 999_999 },
    };
  };

  it("Vergeltung im Koop: Rückwurf trifft den Boss und erzeugt Bedrohung", () => {
    const battle = coop(["sword-30", "shield-30"]);
    // Nur A ist angreifbar: B ist gefallen
    const lonely = { ...battle, heroes: battle.heroes.map((h) => (h.id === "b" ? { ...h, down: true } : h)) };
    const { events, state } = resolveRound(lonely, { a: { ability: "shield-2" } }, rng(0.5), 0);
    const counter = events.find((e) => e.type === "counter");
    expect(counter).toMatchObject({ type: "counter", heroId: "a" });
    expect(events.some((e) => e.type === "guarded" && e.heroId === "a")).toBe(true);
    expect(state.heroes.find((h) => h.id === "a")!.threat).toBeGreaterThan(0);
  });

  it("Erdbeben schwächt den Boss für die ganze Gruppe", () => {
    const battle = coop(["greathammer-30"]);
    const result = resolveRound(battle, { a: { ability: "greathammer-2" } }, rng(0.5), 0);
    expect(result.state.bossEffects.weaken).toEqual({ percent: 0.4, roundsLeft: 1 });
  });

  it("Heiliges Licht heilt im Koop nur den Anwender", () => {
    const battle = coop(["mace-30"]);
    const hurt = { ...battle, heroes: battle.heroes.map((h) => ({ ...h, combatant: { ...h.combatant, hp: 10 } })) };
    const { events } = resolveRound(hurt, { a: { ability: "mace-2" } }, rng(0.5), 0);
    const heals = events.filter((e) => e.type === "selfHeal");
    expect(heals).toHaveLength(1);
    expect(heals[0]).toMatchObject({ heroId: "a" });
  });
});

describe("Abklingzeiten", () => {
  it("jede Fähigkeit hat 1–4 Runden, starke länger als schwache", () => {
    for (const a of ABILITIES) expect(a.cooldown, a.id).toBeGreaterThanOrEqual(1);
    for (const a of ABILITIES) expect(a.cooldown, a.id).toBeLessThanOrEqual(4);
    expect(getAbility("staff-2").cooldown).toBeGreaterThan(getAbility("staff").cooldown);
  });

  it("nach dem Einsatz ist die Fähigkeit so viele Runden gesperrt", () => {
    let state = attackRound(battleWith("greataxe-30"), rng(0.5), "greataxe").state;
    const rounds = getAbility("greataxe").cooldown;
    for (let i = 0; i < rounds; i++) {
      expect(() => attackRound(state, rng(0.5), "greataxe"), `Runde ${i + 1}`).toThrow(/Abklingzeit/);
      // Die andere Fähigkeit derselben Waffe bleibt frei
      expect(state.cooldowns?.["greataxe-2"]).toBeUndefined();
      state = attackRound(state, rng(0.5)).state;
    }
    expect(() => attackRound(state, rng(0.5), "greataxe")).not.toThrow();
  });

  it("auch im Koop – eine Fähigkeit in Abklingzeit wird zum normalen Angriff", () => {
    const battle = startCoopBattle("k", "swamp-hydra", [
      { id: "a", name: "A", profile: profileWith("staff-30") },
      { id: "b", name: "B", profile: profileWith("sword-30") },
    ], 0);
    const tough = { ...battle, boss: { ...battle.boss, hp: 999_999, maxHp: 999_999 } };
    const first = resolveRound(tough, { a: { ability: "staff-2" } }, rng(0.5), 0);
    expect(first.state.heroes.find((h) => h.id === "a")!.cooldowns).toEqual({ "staff-2": 4 });
    const again = resolveRound(first.state, { a: { ability: "staff-2" } }, rng(0.5), 0);
    expect(again.events.some((e) => e.type === "ability" && e.heroId === "a")).toBe(false);
    expect(again.state.heroes.find((h) => h.id === "a")!.cooldowns).toEqual({ "staff-2": 3 });
  });
});
