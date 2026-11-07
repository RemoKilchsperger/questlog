import { describe, expect, it } from "vitest";
import { AREA_CHEST_CHANCE, canDropChest, getAreaMimic, rollAreaChest } from "./areaChests";
import { getBossAbilities } from "./bossAbilities";
import { AREAS, DUNGEONS, getCreature, getCreatureStats } from "./creatures";
import { isMimic, MIMIC_CHANCE } from "./dungeonPaths";
import { CREATURE_MATCHUPS } from "./matchups";
import { CREATURE_SPRITES } from "../game/creatureSprites";

describe("Truhen nach normalen Kämpfen", () => {
  it("jede gewöhnliche Kreatur hat ihren Mimic auf ihrem Level – zäher, mit Biss, Schwächen und Bild", () => {
    for (const area of AREAS) {
      for (const creature of area.creatures.filter((c) => !c.boss)) {
        const mimic = getAreaMimic(creature.id);
        expect(mimic.level).toBe(creature.level);
        expect(mimic.boss).toBe(false);
        expect(isMimic(mimic.id)).toBe(true);
        expect(getCreature(mimic.id).area).toBe(area);
        expect(area.creatures).not.toContain(mimic);
        expect(getCreatureStats(mimic).maxHp).toBeGreaterThan(getCreatureStats(creature).maxHp);
        expect(getBossAbilities(mimic.id)).toHaveLength(1);
        expect(CREATURE_MATCHUPS[mimic.id]).toBeDefined();
        expect(CREATURE_SPRITES).toHaveProperty([mimic.sprite]);
      }
    }
  });

  it("nur nach gewöhnlichen Kreaturen in Gebieten – nicht nach Bossen, Dungeon-Gegnern oder Mimics", () => {
    expect(canDropChest("grey-wolf")).toBe(true);
    expect(canDropChest("goblin-chief")).toBe(false);
    expect(canDropChest(DUNGEONS[0].creatures[0].id)).toBe(false);
    expect(canDropChest(getAreaMimic("grey-wolf").id)).toBe(false);
    expect(rollAreaChest("goblin-chief", () => 0)).toBeNull();
  });

  it("taucht selten auf, und etwa jede dritte beisst", () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const runs = 40_000;
    const chests = Array.from({ length: runs }, () => rollAreaChest("grey-wolf", rng)).filter((c) => c !== null);
    expect(chests.length / runs).toBeGreaterThan(AREA_CHEST_CHANCE - 0.01);
    expect(chests.length / runs).toBeLessThan(AREA_CHEST_CHANCE + 0.01);
    const mimics = chests.filter((c) => c.mimic).length / chests.length;
    expect(mimics).toBeGreaterThan(MIMIC_CHANCE - 0.05);
    expect(mimics).toBeLessThan(MIMIC_CHANCE + 0.05);
    expect(chests[0]).toMatchObject({ creatureId: "grey-wolf", outcome: null });
  });
});
