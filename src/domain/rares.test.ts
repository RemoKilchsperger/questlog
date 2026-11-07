import { describe, expect, it } from "vitest";
import { AREAS, getCreature, getCreatureStats } from "./creatures";
import { ELITE_REWARD_FACTOR, ELITE_DOUBLE_LEVEL } from "./elites";
import { rollBattleReward, type HeroCombatProfile } from "./combat";
import { areaRares, getRare, RARE_CHANCE, RARE_POWER, RARE_REWARD_FACTOR, rareCreature, rareFor, rareReward, RARES, rollRare } from "./rares";

const hero = { level: 5, goldBonus: 0 } as unknown as HeroCombatProfile;

describe("Seltene Gegner", () => {
  it("jede gewöhnliche Kreatur der Gebiete hat genau eine seltene Variante, Bosse keine", () => {
    for (const area of AREAS) {
      for (const creature of area.creatures) {
        expect(RARES.filter((r) => r.creatureId === creature.id), creature.id).toHaveLength(creature.boss ? 0 : 1);
      }
      expect(areaRares(area.id)).toHaveLength(area.creatures.filter((c) => !c.boss).length);
    }
    expect(new Set(RARES.map((r) => r.id)).size).toBe(RARES.length);
    expect(new Set(RARES.map((r) => r.name)).size).toBe(RARES.length);
    expect(rareFor("goblin-chief")).toBeUndefined();
    expect(rareFor("mine-rat")).toBeUndefined();
  });

  it("vor Level 30 ein Modifikator, danach zwei – wie bei Elite-Gegnern", () => {
    for (const rare of RARES) {
      const { creature } = getCreature(rare.creatureId);
      expect(rare.affixes.length, rare.id).toBe(creature.level >= ELITE_DOUBLE_LEVEL - 10 ? 2 : 1);
      expect(new Set(rare.affixes).size).toBe(rare.affixes.length);
    }
  });

  it("erscheint mit 1 % Chance", () => {
    expect(rollRare("grey-wolf", () => RARE_CHANCE - 0.001)?.id).toBe("rare-grey-wolf");
    expect(rollRare("grey-wolf", () => RARE_CHANCE)).toBeNull();
    expect(rollRare("goblin-chief", () => 0)).toBeNull();
  });

  it("kämpft unter der Id der Grundkreatur, mit neuem Namen und mehr Stärke", () => {
    const rare = getRare("rare-grey-wolf");
    const creature = rareCreature(rare);
    const base = getCreature("grey-wolf").creature;
    expect(creature.id).toBe("grey-wolf");
    expect(creature.name).toBe("Silberpelz, der Leitwolf");
    expect(getCreatureStats(creature).maxHp).toBe(Math.round(getCreatureStats(base).maxHp * RARE_POWER));
  });

  it("Beute: mehr als ein Elite-Gegner und sicher ein episches oder legendäres Item", () => {
    const rare = getRare("rare-grey-wolf");
    for (let i = 0; i < 20; i++) {
      const seed = (i + 0.5) / 20;
      const reward = rareReward(rare, hero, `r${i}`, () => seed);
      const elite = rollBattleReward(getCreature("grey-wolf").creature, hero, `e${i}`, () => seed, [], true);
      expect(reward.xp).toBe(Math.round((elite.xp * RARE_REWARD_FACTOR) / ELITE_REWARD_FACTOR));
      expect(["epic", "legendary"]).toContain(reward.loot?.rarity);
    }
  });
});
