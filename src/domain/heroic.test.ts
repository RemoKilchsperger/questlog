import { describe, expect, it } from "vitest";
import { getHeroCombatProfile, rollBattleReward, startBattle } from "./combat";
import { AREAS, DUNGEONS, getCreature } from "./creatures";
import { ELITE_AFFIXES } from "./elites";
import { EMPTY_EQUIPMENT } from "./equipment";
import { HEROIC_AFFIX, HEROIC_HP, heroicAffixes, isHeroicUnlocked, makeHeroic } from "./heroic";
import type { Character } from "./types";

const character: Character = {
  name: "Held",
  totalXp: 0,
  gold: 0,
  essence: 0,
  stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
  spentPoints: 0,
  skills: {},
};
const hero = getHeroCombatProfile(character, EMPTY_EQUIPMENT);

describe("Heroische Bosse", () => {
  it("jeder Gebiets- und Dungeon-Boss hat eine Zusatzmechanik – nie Riesig oder Rudelführer", () => {
    const bosses = [...AREAS, ...DUNGEONS].flatMap((a) => a.creatures.filter((c) => c.boss)).map((c) => c.id);
    expect(Object.keys(HEROIC_AFFIX).sort()).toEqual([...new Set(bosses)].sort());
    const known = ELITE_AFFIXES.map((a) => a.id);
    for (const affix of Object.values(HEROIC_AFFIX)) {
      expect(known).toContain(affix);
      expect(["giant", "packLeader"]).not.toContain(affix);
    }
  });

  it("freigeschaltet erst nach dem ersten Sieg", () => {
    expect(isHeroicUnlocked("goblin-chief", [])).toBe(false);
    expect(isHeroicUnlocked("goblin-chief", ["goblin-chief"])).toBe(true);
    expect(isHeroicUnlocked("grey-wolf", ["grey-wolf"])).toBe(false);
  });

  it("mehr Lebenspunkte und die Zusatzmechanik im Kampf", () => {
    const { creature } = getCreature("lich-king");
    const normal = startBattle("n", "Held", hero, creature);
    const heroic = makeHeroic(startBattle("h", "Held", hero, creature, hero.maxHp, heroicAffixes("lich-king")));
    expect(heroic.heroic).toBe(true);
    expect(heroic.elite).toEqual(["regenerating"]);
    expect(heroic.enemy.maxHp).toBe(Math.round(normal.enemy.maxHp * HEROIC_HP));
    expect(heroic.enemy.hp).toBe(heroic.enemy.maxHp);
  });

  it("öfter ein Boss-Item, mehr Erfahrung und Gold", () => {
    const { creature } = getCreature("goblin-chief");
    // 0.12: über der normalen Chance (10 %), unter der heroischen (15 %)
    const rng = () => 0.12;
    const normal = rollBattleReward(creature, hero, "n", rng);
    const heroic = rollBattleReward(creature, hero, "h", rng, [], false, true);
    expect(normal.bossLoot).toBeNull();
    expect(heroic.bossLoot).not.toBeNull();
    expect(heroic.xp).toBe(Math.round(normal.xp * 1.5));
    expect(heroic.gold).toBe(Math.round(normal.gold * 1.5));
  });
});
