import { describe, expect, it } from "vitest";
import { ABILITIES } from "./abilities";
import { BOSS_PHASES, DRUMMER_BONUS, getBossPhase, HEALER_HEAL, SHIELD_DAMAGE_TAKEN } from "./bossMechanics";
import { attackRound, getHeroCombatProfile, setTarget, startBattle, type BattleEvent, type BattleState } from "./combat";
import {
  BOSS,
  coopEnemyStats,
  getCoopEnemy,
  nextDungeonStage,
  resolveRound,
  startCoopBattle,
  type CoopBattleState,
  type CoopPlayer,
} from "./coopCombat";
import { AREAS, DUNGEONS, getCreature, getCreatureStats, getDungeon } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem } from "./items";
import { xpForNextLevel } from "./leveling";
import type { Character } from "./types";

const hero = (): Character => {
  let totalXp = 0;
  for (let l = 1; l < 30; l++) totalXp += xpForNextLevel(l);
  return {
    name: "Held",
    totalXp,
    gold: 0,
    essence: 0,
    stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 },
    spentPoints: 0,
    skills: {},
    abilities: ABILITIES.map((a) => a.id),
  };
};
const profile = getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, weapon1: createItem("sword-0", "common", "w1") });
const rng = (value: number) => () => value;

/** Ein sehr zäher Held gegen einen Boss mit vielen LP – Runden laufen vollständig ab. */
const bossFight = (bossId: string): BattleState => {
  const battle = startBattle("b", "Held", profile, getCreature(bossId).creature);
  return {
    ...battle,
    hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 },
    enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 },
  };
};
const withoutRoleAdd = (state: BattleState): BattleState => ({
  ...state,
  adds: state.adds!.map((a) => (a.role ? { ...a, combatant: { ...a.combatant, hp: 0 } } : a)),
});
const bossHit = (events: BattleEvent[], attacker: "hero" | "enemy") =>
  events.find((e) => e.type === "hit" && e.attacker === attacker && !e.add) as Extract<BattleEvent, { type: "hit" }>;

describe("Begleiter mit Aufgabe", () => {
  it("jeder Gebiets- und Dungeon-Boss hat einen gewöhnlichen Begleiter und einen mit Aufgabe", () => {
    for (const area of [...AREAS, ...DUNGEONS]) {
      const boss = area.creatures.at(-1)!;
      const adds = startBattle("b", "Held", profile, boss).adds!;
      expect(adds.map((a) => a.role), boss.name).toEqual([undefined, expect.any(String)]);
    }
    const chief = startBattle("b", "Held", profile, getCreature("goblin-chief").creature);
    expect(chief.adds![1]).toMatchObject({ creatureId: "goblin-raider", role: "drummer", combatant: { name: "Goblin-Trommler" } });
  });

  it("der Heiler heilt den Boss jede Runde, statt anzugreifen", () => {
    const battle = bossFight("ancient-lizard");
    const hurt = { ...battle, enemy: { ...battle.enemy, hp: 50_000 } };
    const { events } = attackRound(hurt, rng(0.5));
    const heal = events.find((e) => e.type === "addHeal");
    expect(heal).toEqual({ type: "addHeal", add: "add-2", heal: Math.round(99_999 * HEALER_HEAL) });
    expect(events.filter((e) => e.type === "hit" && e.attacker === "enemy" && e.add === "add-2")).toHaveLength(0);
    // Ohne Heiler keine Heilung
    expect(attackRound(withoutRoleAdd(hurt), rng(0.5)).events.some((e) => e.type === "addHeal")).toBe(false);
  });

  it("solange der Schildträger steht, erleidet der Boss weniger Schaden", () => {
    const battle = bossFight("cave-eye");
    const shielded = bossHit(attackRound(battle, rng(0.5)).events, "hero");
    const open = bossHit(attackRound(withoutRoleAdd(battle), rng(0.5)).events, "hero");
    expect(shielded.shielded).toBe(true);
    expect(open.shielded).toBeUndefined();
    expect(Math.abs(shielded.damage - open.damage * SHIELD_DAMAGE_TAKEN)).toBeLessThanOrEqual(1);
  });

  it("solange der Trommler steht, macht der Boss mehr Schaden", () => {
    const battle = bossFight("goblin-chief");
    const drummed = bossHit(attackRound(battle, rng(0.5)).events, "enemy");
    const quiet = bossHit(attackRound(withoutRoleAdd(battle), rng(0.5)).events, "enemy");
    expect(Math.abs(drummed.damage - quiet.damage * (1 + DRUMMER_BONUS))).toBeLessThanOrEqual(1);
  });
});

describe("Zweite Phase", () => {
  it("jeder Gebiets- und Dungeon-Boss hat eine – Raserei, Sammelruf oder beides", () => {
    for (const area of [...AREAS, ...DUNGEONS]) {
      const phase = getBossPhase(area.creatures.at(-1)!.id);
      expect(phase, area.name).not.toBeNull();
      expect(phase!.enrage || phase!.rally).toBeTruthy();
    }
    expect(BOSS_PHASES).toHaveLength(AREAS.length + DUNGEONS.length);
  });

  it("Raserei: unter der Hälfte der LP macht der Boss einmalig und bis zum Ende mehr Schaden", () => {
    const battle = bossFight("ancient-lizard");
    const damage = battle.enemy.damage;
    const above = attackRound({ ...battle, enemy: { ...battle.enemy, hp: 60_000 } }, rng(0.5));
    expect(above.events.some((e) => e.type === "bossPhase")).toBe(false);
    const below = attackRound({ ...battle, enemy: { ...battle.enemy, hp: 49_000 } }, rng(0.5));
    expect(below.events).toContainEqual({ type: "bossPhase", bossId: "ancient-lizard" });
    expect(below.state.phase).toBe(true);
    expect(below.state.enemy.damage).toBeCloseTo(damage * (1 + getBossPhase("ancient-lizard")!.enrage!));
    // Nur einmal pro Kampf
    const again = attackRound(below.state, rng(0.5));
    expect(again.events.some((e) => e.type === "bossPhase")).toBe(false);
    expect(again.state.enemy.damage).toBeCloseTo(below.state.enemy.damage);
  });

  it("Sammelruf: der gewöhnliche Begleiter steht wieder auf – der mit Aufgabe bleibt liegen", () => {
    const battle = bossFight("goblin-chief");
    const allDown = {
      ...battle,
      enemy: { ...battle.enemy, hp: 49_000 },
      adds: battle.adds!.map((a) => ({ ...a, combatant: { ...a.combatant, hp: 0 } })),
    };
    const { state, events } = attackRound(allDown, rng(0.5));
    expect(events).toContainEqual({ type: "bossPhase", bossId: "goblin-chief", rally: ["add-1"] });
    const [raider, drummer] = state.adds!;
    expect(raider.combatant.hp).toBe(raider.combatant.maxHp);
    expect(drummer.combatant.hp).toBe(0);
    // Der Wiederaufgestandene schlägt gleich mit zu
    expect(events.some((e) => e.type === "hit" && e.attacker === "enemy" && e.add === "add-1")).toBe(true);
    expect(setTarget(state, "add-1").target).toBe("add-1");
  });
});

describe("Koop-Dungeons", () => {
  const players: CoopPlayer[] = ["a", "b"].map((id) => ({ id, name: id, profile: { ...profile, maxHp: 99_999 } }));
  /** Koop-Kampf gegen den Endboss eines Dungeons – die Gegner davor sofort besiegt. */
  const atBoss = (dungeonId: string): CoopBattleState => {
    let state = startCoopBattle("k0", dungeonId, players, 0);
    for (let i = 1; i < getDungeon(dungeonId).creatures.length; i++) {
      const won = resolveRound({ ...state, boss: { ...state.boss, hp: 1 } }, {}, rng(0.5), 0).state;
      state = nextDungeonStage(won, `k${i}`, 0);
    }
    return { ...state, heroes: state.heroes.map((h) => ({ ...h, combatant: { ...h.combatant, hp: 99_999, maxHp: 99_999 } })) };
  };

  it("Endbosse haben im Koop einen eigenen LP-Faktor", () => {
    const priestess = getCreature("high-priestess").creature;
    const coopHp = priestess.bossFactors!.coopHp!;
    expect(coopHp).toBeGreaterThan(priestess.bossFactors!.hp);
    const solo = getCreatureStats({ ...priestess, bossFactors: { ...priestess.bossFactors!, hp: coopHp } });
    // Zwei Spieler: LP × 2 × (1 + 10 %)
    expect(coopEnemyStats(getCoopEnemy("high-priestess"), 2).maxHp).toBe(Math.round(solo.maxHp * 2 * 1.1));
  });

  it("der Heiler heilt, die zweite Phase kommt einmal – mit Sammelruf nur für den gewöhnlichen Begleiter", () => {
    const state = atBoss("sunken-temple");
    expect(state.adds!.map((a) => a.role)).toEqual([undefined, "healer"]);
    const half = { ...state, boss: { ...state.boss, hp: Math.round(state.boss.maxHp * 0.45) } };
    const { state: next, events } = resolveRound(half, { a: { target: "add-1" } }, rng(0.5), 0);
    expect(events.some((e) => e.type === "addHeal" && e.add === "add-2")).toBe(true);
    expect(events).toContainEqual({ type: "bossPhase", bossId: "high-priestess", rally: ["add-1"] });
    expect(next.phase).toBe(true);
    expect(resolveRound(next, {}, rng(0.5), 0).events.some((e) => e.type === "bossPhase")).toBe(false);
  });

  it("der Schildträger schützt den Boss auch im Koop", () => {
    const state = atBoss("storm-tower");
    const tough = { ...state, boss: { ...state.boss, hp: 999_999, maxHp: 999_999 } };
    const hit = (s: CoopBattleState) =>
      resolveRound(s, {}, rng(0.5), 0).events.find((e) => e.type === "hit" && e.attacker === "a" && e.target === BOSS)!;
    const shielded = hit(tough);
    const open = hit({ ...tough, adds: tough.adds!.map((a) => (a.role ? { ...a, combatant: { ...a.combatant, hp: 0 } } : a)) });
    if (shielded.type !== "hit" || open.type !== "hit") throw new Error("Treffer fehlt");
    expect(shielded.shielded).toBe(true);
    expect(Math.abs(shielded.damage - open.damage * SHIELD_DAMAGE_TAKEN)).toBeLessThanOrEqual(1);
  });
});
