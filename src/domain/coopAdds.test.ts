import { describe, expect, it } from "vitest";
import type { HeroCombatProfile } from "./combat";
import {
  BOSS,
  nextDungeonStage,
  resolveRound,
  startCoopBattle,
  type CoopAction,
  type CoopBattleState,
  type CoopEvent,
  type CoopPlayer,
} from "./coopCombat";
import { ADD_FACTORS, getCreature, getCreatureStats, getDungeon } from "./creatures";

const profile = (overrides: Partial<HeroCombatProfile> = {}): HeroCombatProfile => ({
  level: 12,
  maxHp: 5000,
  damage: 40,
  armor: 60,
  critChance: 0,
  goldBonus: 0,
  maxMana: 200,
  abilities: [],
  heroClass: null,
  critMultiplier: 1.5,
  ...overrides,
});
const player = (id: string, overrides: Partial<HeroCombatProfile> = {}): CoopPlayer => ({ id, name: id, profile: profile(overrides) });
const rng = (value: number) => () => value;
const MINE = "abandoned-mine";

/** Koop-Kampf gegen den Erzkönig am Ende der Mine – die ersten drei Gegner sofort besiegt. */
function atBoss(players: CoopPlayer[] = [player("a"), player("b")]): CoopBattleState {
  let state = startCoopBattle("k0", MINE, players, 0);
  for (let i = 1; i < getDungeon(MINE).creatures.length; i++) {
    const won = resolveRound({ ...state, boss: { ...state.boss, hp: 1 } }, {}, rng(0.5), 0).state;
    state = nextDungeonStage(won, `k${i}`, 0);
  }
  return state;
}
/** Boss praktisch unverwundbar, damit Runden vollständig ablaufen. */
const tough = (state: CoopBattleState): CoopBattleState => ({ ...state, boss: { ...state.boss, hp: 999_999, maxHp: 999_999 } });
const round = (state: CoopBattleState, actions: Record<string, CoopAction> = {}, value = 0.5) =>
  resolveRound(state, actions, rng(value), 0);
const hits = (events: CoopEvent[], attacker: string, target?: string) =>
  events.filter((e) => e.type === "hit" && e.attacker === attacker && (target === undefined || e.target === target));

describe("Koop: Begleiter der Dungeon-Bosse", () => {
  it("der Endboss bringt seine Begleiter mit – LP × n, Schaden +20 % pro Spieler über einem; die Gegner davor kämpfen allein", () => {
    expect(startCoopBattle("k", MINE, [player("a"), player("b")], 0).adds).toEqual([]);
    expect(startCoopBattle("k", "swamp-hydra", [player("a"), player("b")], 0).adds).toEqual([]);
    const duo = atBoss();
    expect(duo.bossId).toBe("ore-king");
    const kobold = getCreatureStats({ ...getCreature("kobold-blaster").creature, level: 12 });
    expect(duo.adds!.map((a) => a.uid)).toEqual(["add-1", "add-2"]);
    for (const add of duo.adds!) {
      expect(add.creatureId).toBe("kobold-blaster");
      expect(add.combatant.maxHp).toBe(Math.round(kobold.maxHp * ADD_FACTORS.hp * 2));
      expect(add.combatant.damage).toBeCloseTo(kobold.damage * ADD_FACTORS.damage * 1.2);
    }
    const four = atBoss([player("a"), player("b"), player("c"), player("d")]);
    expect(four.adds![0].combatant.maxHp).toBe(Math.round(kobold.maxHp * ADD_FACTORS.hp * 4));
    expect(four.adds![0].combatant.damage).toBeCloseTo(kobold.damage * ADD_FACTORS.damage * 1.6);
  });

  it("Spieler-Ids dürfen nicht wie Begleiter heissen", () => {
    expect(() => startCoopBattle("k", MINE, [player("add-1"), player("b")], 0)).toThrow();
  });

  it("jeder Held wählt sein Ziel – ein ungültiges Ziel heisst: der Boss", () => {
    const { events } = round(tough(atBoss()), { a: { target: "add-2" }, b: { target: "add-9" } });
    expect(hits(events, "a", "add-2")).toHaveLength(1);
    expect(hits(events, "b", BOSS)).toHaveLength(1);
  });

  it("die Begleiter greifen nach dem Boss an – jeder ein Ziel nach Bedrohung", () => {
    const { events } = round(tough(atBoss()));
    const enemyHits = events.filter((e) => e.type === "hit" && (e.attacker === BOSS || e.attacker.startsWith("add-")));
    expect(enemyHits.map((e) => e.type === "hit" && e.attacker)).toEqual([BOSS, "add-1", "add-2"]);
  });

  it("ein besiegter Begleiter fällt, der Kampf geht weiter – er greift nicht mehr an", () => {
    let state = tough(atBoss());
    state = { ...state, adds: state.adds!.map((a) => (a.uid === "add-1" ? { ...a, combatant: { ...a.combatant, hp: 1 } } : a)) };
    const first = round(state, { a: { target: "add-1" } });
    expect(first.events).toContainEqual({ type: "addDown", add: "add-1" });
    expect(first.state.status).toBe("active");
    expect(hits(first.events, "add-1")).toHaveLength(0);
    const second = round(first.state, { a: { target: "add-1" } });
    expect(hits(second.events, "a", BOSS)).toHaveLength(1);
    expect(hits(second.events, "add-1")).toHaveLength(0);
  });

  it("fällt der Boss, gewinnt die Gruppe – auch wenn Begleiter noch stehen", () => {
    const state = atBoss();
    const { state: after, events } = round({ ...state, boss: { ...state.boss, hp: 1 } });
    expect(after.status).toBe("won");
    expect(events).toContainEqual({ type: "victory" });
    expect(after.adds!.every((a) => a.combatant.hp > 0)).toBe(true);
  });

  it("Erdbeben trifft und schwächt alle Gegner", () => {
    const state = tough(atBoss([player("a", { abilities: ["greathammer-2"] }), player("b")]));
    const { state: after, events } = round(state, { a: { ability: "greathammer-2" } });
    expect(hits(events, "a", BOSS)).toHaveLength(1);
    expect(hits(events, "a", "add-1")).toHaveLength(1);
    expect(hits(events, "a", "add-2")).toHaveLength(1);
    expect(after.bossEffects.weaken).toBeDefined();
    for (const add of after.adds!) expect(add.effects.weaken).toBeDefined();
  });

  it("Bollwerk blockt alle Angriffe auf den Schildträger in dieser Runde – auch die der Begleiter", () => {
    const state = tough(atBoss([player("a", { abilities: ["shield"] }), player("b")]));
    const { state: after, events } = round(state, { a: { ability: "shield" } }, 0.1);
    const blocked = events.filter((e) => e.type === "blocked" && e.heroId === "a");
    expect(blocked.length).toBe(3);
    expect(blocked.filter((e) => e.type === "blocked" && e.add)).toHaveLength(2);
    expect(events.some((e) => e.type === "hit" && e.target === "a")).toBe(false);
    expect(after.heroes[0].effects.bulwark).toBeUndefined();
  });
});
