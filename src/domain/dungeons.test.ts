import { describe, expect, it } from "vitest";
import { dungeonCost, spendBattlePoint } from "./battlePoints";
import { bossAbilityDue, getBossAbilities, getBossAbility, upcomingBossAbility } from "./bossAbilities";
import { getHeroCombatProfile, rollBossLoot, startBattle } from "./combat";
import { AREAS, DUNGEONS, getCreature, getCreatureStats, getDungeon } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { getBossItems } from "./items";
import type { Character } from "./types";

const hero: Character = {
  name: "Held",
  totalXp: 0,
  gold: 0,
  essence: 0,
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

  it("jeder Dungeon-Boss hat zwei Fähigkeiten im Wechsel: erst gegen ein Ziel, dann gegen die Gruppe", () => {
    const ids = new Set<string>();
    for (const dungeon of DUNGEONS) {
      const boss = dungeon.creatures.at(-1)!;
      const [single, group, ...rest] = getBossAbilities(boss.id);
      expect(rest, boss.id).toEqual([]);
      expect(single.target ?? "single", boss.id).toBe("single");
      expect(group.target, boss.id).toBe("group");
      expect(group.every).toBe(single.every);
      // Solo treffen beide den Helden – im Wechsel
      expect(bossAbilityDue(boss.id, single.every)?.id).toBe(single.id);
      expect(bossAbilityDue(boss.id, single.every * 2)?.id).toBe(group.id);
      expect(bossAbilityDue(boss.id, single.every * 3)?.id).toBe(single.id);
      expect(bossAbilityDue(boss.id, single.every + 1)).toBeNull();
      // Angekündigt wird die nächste – auch in der Runde davor
      expect(upcomingBossAbility(boss.id, single.every * 2 - 1)?.id).toBe(group.id);
      for (const a of [single, group]) {
        expect(ids.has(a.id), a.id).toBe(false);
        ids.add(a.id);
      }
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

  it("die Beute gibt es nur beim Dungeon-Boss, mit 10 % Chance", () => {
    const boss = getCreature("void-lord").creature;
    const drop = rollBossLoot(boss, "x", () => 0.09);
    expect(getBossItems("void-lord").map((i) => i.id)).toContain(drop?.itemId);
    expect(rollBossLoot(boss, "x", () => 0.11)).toBeNull();
    expect(rollBossLoot(getCreature("soul-eater").creature, "x", () => 0)).toBeNull();
  });
});
