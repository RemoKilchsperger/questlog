import { describe, expect, it } from "vitest";
import { dungeonCost, spendBattlePoint } from "./battlePoints";
import { getBossAbility } from "./bossAbilities";
import { getHeroCombatProfile, rollBossLoot, startBattle } from "./combat";
import { AREAS, DUNGEONS, getCreature, getCreatureStats, getDungeon } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { getBossItems } from "./items";
import type { Character } from "./types";

const hero: Character = {
  name: "Held",
  totalXp: 0,
  gold: 0,
  stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
  spentPoints: 0,
  battlePoints: 10,
  battlePointSlot: 0,
  skills: {},
  abilities: [],
};

describe("Dungeons", () => {
  it("vier Dungeons ab Level 10, 25, 40 und 60 – jeder mit mehreren Gegnern und einem Boss am Ende", () => {
    expect(DUNGEONS.map((d) => d.minLevel)).toEqual([10, 25, 40, 60]);
    for (const dungeon of DUNGEONS) {
      expect(dungeon.dungeon).toBe(true);
      expect(dungeon.creatures.length).toBeGreaterThanOrEqual(3);
      expect(dungeon.creatures.at(-1)!.boss).toBe(true);
      expect(dungeon.creatures.slice(0, -1).every((c) => !c.boss)).toBe(true);
      expect(getBossAbility(dungeon.creatures.at(-1)!.id), dungeon.name).not.toBeNull();
      expect(getDungeon(dungeon.id)).toBe(dungeon);
    }
  });

  it("hat nur neue Kreaturen, die man nicht draussen trifft", () => {
    const outside = new Set(AREAS.flatMap((a) => a.creatures.map((c) => c.id)));
    for (const creature of DUNGEONS.flatMap((d) => d.creatures)) {
      expect(outside.has(creature.id), creature.id).toBe(false);
      expect(getCreature(creature.id).area.dungeon).toBe(true);
    }
  });

  it("Dungeon-Gegner sind stärker als normale Kreaturen gleichen Levels", () => {
    const rat = getCreature("mine-rat").creature;
    const normal = { ...rat, power: undefined };
    expect(getCreatureStats(rat).maxHp).toBeGreaterThan(getCreatureStats(normal).maxHp);
    expect(getCreatureStats(rat).damage).toBeGreaterThan(getCreatureStats(normal).damage);
  });

  it("zwischen den Kämpfen keine Heilung: der nächste Kampf startet mit den übrigen LP", () => {
    const profile = getHeroCombatProfile(hero, EMPTY_EQUIPMENT);
    const [, second] = getDungeon("abandoned-mine").creatures;
    const battle = startBattle("b", "Held", profile, second, 37);
    expect(battle.hero.hp).toBe(37);
    expect(battle.hero.maxHp).toBe(profile.maxHp);
    expect(battle.mana).toBe(profile.maxMana); // Mana füllt sich wieder auf
    expect(startBattle("b", "Held", profile, second, 0).hero.hp).toBe(1); // nie mit 0 LP starten
  });

  it("kostet einen Kampfpunkt pro Kampf, beim Betreten bezahlt", () => {
    const fights = getDungeon("abandoned-mine").creatures.length;
    expect(dungeonCost(fights)).toBe(fights);
    expect(spendBattlePoint(hero, dungeonCost(fights)).battlePoints).toBe(10 - fights);
    expect(() => spendBattlePoint({ ...hero, battlePoints: fights - 1 }, dungeonCost(fights))).toThrow(/Kampfpunkte/);
  });

  it("die Beute gibt es nur beim Dungeon-Boss, mit 5 % Chance", () => {
    const boss = getCreature("void-lord").creature;
    const drop = rollBossLoot(boss, "x", () => 0.04);
    expect(getBossItems("void-lord").map((i) => i.id)).toContain(drop?.itemId);
    expect(rollBossLoot(boss, "x", () => 0.06)).toBeNull();
    expect(rollBossLoot(getCreature("soul-eater").creature, "x", () => 0)).toBeNull();
  });
});
