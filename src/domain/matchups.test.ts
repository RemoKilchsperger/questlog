import { describe, expect, it } from "vitest";
import { fullWeapon } from "../test/weapons";
import { attackRound, getHeroCombatProfile, startBattle, type BattleEvent, type BattleState } from "./combat";
import { COOP_BOSSES, startCoopBattle } from "./coopCombat";
import { AREAS, DUNGEONS, getCreature, getCreatureStats } from "./creatures";
import { coopElite, PACK_ADD } from "./elites";
import { EMPTY_EQUIPMENT } from "./equipment";
import { xpForNextLevel } from "./leveling";
import { CREATURE_MATCHUPS, mainWeapon, matchupFactor, matchupOf, RESIST_FACTOR, WEAK_FACTOR, WEAPON_KIND } from "./matchups";
import type { Character } from "./types";

const hero = (): Character => {
  let totalXp = 0;
  for (let l = 1; l < 10; l++) totalXp += xpForNextLevel(l);
  return { name: "Held", totalXp, gold: 0, essence: 0, stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 }, spentPoints: 0, skills: {} };
};
const armed = (...weapons: string[]) =>
  getHeroCombatProfile(hero(), {
    ...EMPTY_EQUIPMENT,
    weapon1: weapons[0] ? fullWeapon(weapons[0], "common", "w1") : null,
    weapon2: weapons[1] ? fullWeapon(weapons[1], "common", "w2") : null,
  });
const rng = (value: number) => () => value;
/** Sehr zäher Held gegen eine sehr zähe Kreatur, ohne Rüstung – Schaden lässt sich vergleichen. */
const fight = (weapons: string[], creatureId: string): BattleState => {
  const battle = startBattle("b", "Held", armed(...weapons), getCreature(creatureId).creature);
  return {
    ...battle,
    mana: 999,
    hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 },
    enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999, armor: 0 },
  };
};
const heroHit = (events: BattleEvent[]) =>
  events.find((e) => e.type === "hit" && e.attacker === "hero" && !e.add) as Extract<BattleEvent, { type: "hit" }>;

describe("Schwächen und Resistenzen", () => {
  it("jede Kreatur und jeder Raid-Boss hat einen Eintrag – Immunität gibt es nur gegen Gift, Feuer und Bluten", () => {
    for (const area of [...AREAS, ...DUNGEONS]) for (const c of area.creatures) expect(CREATURE_MATCHUPS[c.id], c.name).toBeDefined();
    for (const boss of COOP_BOSSES) expect(CREATURE_MATCHUPS[boss.id], boss.name).toBeDefined();
    for (const m of Object.values(CREATURE_MATCHUPS)) {
      for (const kind of m.immune ?? []) expect(["poison", "burn", "bleed"]).toContain(kind);
      // Nie zugleich schwach und resistent gegen dasselbe
      for (const kind of m.weak ?? []) expect(m.resist ?? []).not.toContain(kind);
    }
  });

  it("Hauptwaffe: die erste, die kein Schild ist", () => {
    expect(mainWeapon(["shield", "mace"])).toBe("mace");
    expect(mainWeapon(["shield"])).toBe("shield");
    expect(armed("mace-0", "shield-0").weapon).toBe("mace");
    expect(armed().weapon).toBeNull();
  });

  it("Schwäche: mehr Schaden, Resistenz: weniger – sichtbar am Treffer", () => {
    // Skelettkrieger: schwach gegen Wucht, resistent gegen Stich, neutral gegen Klingen
    expect(matchupOf("skeleton-warrior", "blunt")).toBe("weak");
    const neutral = heroHit(attackRound(fight(["sword-0"], "skeleton-warrior"), rng(0.5)).events);
    const blunt = heroHit(attackRound(fight(["mace-0"], "skeleton-warrior"), rng(0.5)).events);
    const pierce = heroHit(attackRound(fight(["dagger-0"], "skeleton-warrior"), rng(0.5)).events);
    expect(neutral.matchup).toBeUndefined();
    expect(blunt.matchup).toBe("weak");
    expect(pierce.matchup).toBe("resist");
    // Gleicher Grundschaden? Dann zählt nur der Faktor
    const base = (weapon: string) => armed(weapon).damage;
    expect(Math.abs(blunt.damage - Math.round(base("mace-0") * 1.0 * WEAK_FACTOR))).toBeLessThanOrEqual(1);
    expect(Math.abs(pierce.damage - Math.round(base("dagger-0") * RESIST_FACTOR))).toBeLessThanOrEqual(1);
  });

  it("Fähigkeiten zählen mit ihrer eigenen Waffe", () => {
    // Zepter + Streitkolben: normaler Angriff mit dem Zepter (Magie), Betäubender Schlag mit dem Streitkolben (Wucht)
    const state = fight(["scepter-0", "mace-0"], "skeleton-warrior");
    expect(heroHit(attackRound(state, rng(0.5)).events).matchup).toBeUndefined();
    expect(heroHit(attackRound(state, rng(0.5), "mace").events).matchup).toBe("weak");
    expect(WEAPON_KIND.scepter).toBe("magic");
  });

  it("Immun: Gift wirkt nicht – das Ereignis zeigt es an", () => {
    const { state, events } = attackRound(fight(["scepter-0"], "skeleton-warrior"), rng(0.5), "scepter");
    expect(events).toContainEqual({ type: "immune", kind: "poison" });
    expect(state.enemyEffects.poison).toBeUndefined();
    expect(matchupFactor("skeleton-warrior", "poison")).toBe(0);
  });
});

describe("Elite: Rudelführer", () => {
  it("bringt einen Artgenossen mit halben Werten mit – solo und im Koop-Dungeon", () => {
    const wolf = getCreature("grey-wolf").creature;
    const battle = startBattle("b", "Held", armed("sword-0"), wolf, 999, ["packLeader"]);
    const stats = getCreatureStats(wolf);
    expect(battle.adds).toHaveLength(1);
    expect(battle.adds![0]).toMatchObject({ creatureId: "grey-wolf", combatant: { maxHp: Math.round(stats.maxHp * PACK_ADD.hp) } });
    expect(battle.adds![0].combatant.damage).toBeCloseTo(stats.damage * PACK_ADD.damage);
    expect(startBattle("b", "Held", armed("sword-0"), wolf).adds).toEqual([]);

    const players = ["a", "b"].map((id) => ({ id, name: id, profile: armed("sword-0") }));
    const mine = DUNGEONS[0];
    let id = 0;
    while (!coopElite(`r${id}`, 0, mine.creatures[0]).includes("packLeader")) id++;
    const coop = startCoopBattle(`r${id}`, mine.id, players, 0);
    expect(coop.elite).toContain("packLeader");
    expect(coop.adds!.map((a) => a.creatureId)).toEqual([mine.creatures[0].id]);
  });
});
