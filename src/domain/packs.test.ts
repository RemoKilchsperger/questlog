import { describe, expect, it } from "vitest";
import { fullWeapon } from "../test/weapons";
import {
  attackRound,
  defeatedAdds,
  getHeroCombatProfile,
  rollBattleReward,
  setTarget,
  startBattle,
  type BattleEvent,
  type BattleState,
  type HeroCombatProfile,
} from "./combat";
import { AREAS, DUNGEONS, getCreature, getCreatureStats } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { xpForNextLevel } from "./leveling";
import { canBePack, PACK_CHANCE, PACK_MEMBER, PACK_REWARD_FACTOR, PACK_SIZE, packReward, rollPack } from "./packs";
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
  };
};
const armed = (weapon: string): HeroCombatProfile =>
  getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, weapon1: fullWeapon(weapon, "common", "w1") });
const wolf = getCreature("grey-wolf").creature;
const rng = (value: number) => () => value;

/** Ein zäher Held mit vollem Mana gegen ein Rudel Grauwölfe. */
const packFight = (weapon = "sword-0"): BattleState => {
  const battle = startBattle("b", "Held", armed(weapon), wolf, undefined, [], true);
  return { ...battle, mana: 999, hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 } };
};
/** Setzt die LP des ersten Tiers (`enemy`) und der Artgenossen. */
const withHp = (state: BattleState, enemy: number, ...adds: number[]): BattleState => ({
  ...state,
  enemy: { ...state.enemy, hp: enemy },
  adds: state.adds!.map((a, i) => ({ ...a, combatant: { ...a.combatant, hp: adds[i] ?? a.combatant.hp } })),
});
const defeats = (events: BattleEvent[]) => events.filter((e) => e.type === "defeated");
const enemyHits = (events: BattleEvent[]) => events.filter((e) => e.type === "hit" && e.attacker === "enemy");

describe("Rudel-Kämpfe", () => {
  it("drei Artgenossen mit je einem Teil der Lebenspunkte und des Schadens", () => {
    const battle = packFight();
    const stats = getCreatureStats(wolf);
    expect(battle.pack).toBe(true);
    expect(battle.adds).toHaveLength(PACK_SIZE - 1);
    for (const member of [battle.enemy, ...battle.adds!.map((a) => a.combatant)]) {
      expect(member.maxHp).toBe(Math.round(stats.maxHp * PACK_MEMBER.hp));
      expect(member.damage).toBeCloseTo(stats.damage * PACK_MEMBER.damage);
    }
    expect(battle.adds!.every((a) => a.creatureId === "grey-wolf" && !a.role)).toBe(true);
    // Ohne Rudel kämpft der Wolf allein
    const single = startBattle("b", "Held", armed("sword-0"), wolf);
    expect(single.pack).toBeUndefined();
    expect(single.adds).toEqual([]);
  });

  it("fällt das erste Tier, geht der Kampf gegen die anderen weiter", () => {
    const { state, events } = attackRound(withHp(packFight(), 1), rng(0.5));
    expect(state.status).toBe("active");
    expect(state.enemy.hp).toBe(0);
    expect(defeats(events)).toEqual([{ type: "defeated", side: "enemy", pack: true }]);
    // Die Artgenossen schlagen noch in derselben Runde zu, und das Ziel springt auf den nächsten
    expect(enemyHits(events).map((e) => e.type === "hit" && e.add)).toEqual(["add-1", "add-2"]);
    expect(state.target).toBe("add-1");
    expect(() => setTarget(state, undefined)).toThrow();
    expect(setTarget(state, "add-2").target).toBe("add-2");

    // Die nächste Runde geht ohne gewähltes Ziel an den ersten lebenden Artgenossen – das tote Tier greift nicht mehr an
    const next = attackRound({ ...state, target: undefined }, rng(0.5));
    expect(next.events.some((e) => e.type === "hit" && e.attacker === "hero" && e.add === "add-1")).toBe(true);
    expect(enemyHits(next.events).every((e) => e.type === "hit" && e.add)).toBe(true);
    expect(next.events.filter((e) => e.type === "defeated" && e.pack)).toEqual([]);
  });

  it("gewonnen ist erst, wenn alle liegen – auch wenn das erste Tier zuletzt fällt", () => {
    const lastStanding = attackRound(withHp(packFight(), 0, 0, 1), rng(0.5));
    expect(lastStanding.state.status).toBe("won");
    expect(defeats(lastStanding.events)).toEqual([
      { type: "defeated", side: "enemy", add: "add-2" },
      { type: "defeated", side: "enemy" },
    ]);
    expect(defeatedAdds(lastStanding.state)).toHaveLength(2);

    const leadLast = attackRound(withHp(packFight(), 1, 0, 0), rng(0.5));
    expect(leadLast.state.status).toBe("won");
    expect(defeats(leadLast.events)).toEqual([{ type: "defeated", side: "enemy" }]);
  });

  it("Flächen-Fähigkeiten treffen das ganze Rudel", () => {
    const { state, events } = attackRound(withHp(packFight("axe-0"), 1, 1, 1), rng(0.5), "axe-3");
    expect(state.status).toBe("won");
    expect(events.filter((e) => e.type === "hit" && e.attacker === "hero")).toHaveLength(PACK_SIZE);
    expect(defeats(events).at(-1)).toEqual({ type: "defeated", side: "enemy" });
    expect(defeats(events).filter((e) => e.type === "defeated" && e.pack)).toHaveLength(1);
  });

  it("jede gewöhnliche Kreatur der Gebiete kann im Rudel kommen – keine Bosse, Dungeon-Gegner oder Mimics", () => {
    for (const area of AREAS) {
      for (const creature of area.creatures) expect(canBePack(creature.id)).toBe(!creature.boss);
      for (const mimic of area.mimics ?? []) expect(canBePack(mimic.id)).toBe(false);
    }
    for (const creature of DUNGEONS.flatMap((d) => d.creatures)) expect(canBePack(creature.id)).toBe(false);
    expect(rollPack("grey-wolf", rng(PACK_CHANCE - 0.001))).toBe(true);
    expect(rollPack("grey-wolf", rng(PACK_CHANCE))).toBe(false);
    expect(rollPack("goblin-chief", rng(0))).toBe(false);
  });

  it("Beute: mehr Erfahrung und Gold als ein einzelner Gegner", () => {
    const single = rollBattleReward(wolf, armed("sword-0"), "u", rng(0.5));
    const reward = packReward(single, wolf, "u", rng(0.5));
    expect(reward.xp).toBe(Math.round(single.xp * PACK_REWARD_FACTOR));
    expect(reward.gold).toBe(Math.round(single.gold * PACK_REWARD_FACTOR));
    // 0,5 liegt über der gewöhnlichen Chance (35 %), aber unter der des Rudels
    expect(single.loot).toBeNull();
    expect(reward.loot).not.toBeNull();
  });
});
