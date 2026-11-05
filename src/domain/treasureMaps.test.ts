import { describe, expect, it } from "vitest";
import { DUNGEONS } from "./creatures";
import { stepKind } from "./dungeonPaths";
import { getItem } from "./items";
import { seededRng } from "./random";
import { MAP_CHANCE, MAP_CHANCE_STRONG, MAX_MAPS, rollTreasure, rollTreasureMap, TREASURE_RECIPES, treasureStep, type TreasureMap } from "./treasureMaps";
import { COOK_RECIPES } from "./visitors";

const always = () => 0;
const map = (dungeonId: string): TreasureMap => ({ id: dungeonId, dungeonId, found: 0 });

describe("Schatzkarten", () => {
  it("fallen sehr selten – nach Elite und Bossen öfter", () => {
    const rng = seededRng(7);
    const rolls = 100_000;
    let normal = 0;
    let strong = 0;
    for (let i = 0; i < rolls; i++) {
      if (rollTreasureMap([], 100, false, "x", 0, rng)) normal++;
      if (rollTreasureMap([], 100, true, "x", 0, rng)) strong++;
    }
    expect(normal / rolls).toBeCloseTo(MAP_CHANCE, 2);
    expect(strong / rolls).toBeCloseTo(MAP_CHANCE_STRONG, 2);
  });

  it("führen nur in offene Dungeons, für die man noch keine Karte hat", () => {
    const first = DUNGEONS[0];
    expect(rollTreasureMap([], first.minLevel - 1, true, "x", 0, always)).toBeNull();
    expect(rollTreasureMap([], first.minLevel, true, "x", 0, always)?.dungeonId).toBe(first.id);
    expect(rollTreasureMap([map(first.id)], first.minLevel, true, "x", 0, always)).toBeNull();
  });

  it(`höchstens ${MAX_MAPS} Karten auf einmal`, () => {
    const maps = DUNGEONS.slice(0, MAX_MAPS).map((d) => map(d.id));
    expect(rollTreasureMap(maps, 100, true, "x", 0, always)).toBeNull();
    expect(rollTreasureMap(maps.slice(1), 100, true, "x", 0, always)).not.toBeNull();
  });

  it("der Schatzraum liegt in jedem Dungeon an der ersten Gabelung hinter dem Zwischenboss", () => {
    for (const dungeon of DUNGEONS) {
      const step = treasureStep(dungeon);
      expect(dungeon.creatures[step - 1].midBoss).toBe(true);
      expect(stepKind(dungeon, step)).toBe("fork");
    }
  });

  it("enthält ein legendäres Item auf Heldenlevel oder ein unbekanntes Schatz-Rezept", () => {
    const rng = seededRng(3);
    let recipes = 0;
    for (let i = 0; i < 400; i++) {
      const find = rollTreasure(30, [], `uid-${i}`, rng);
      if (find.kind === "recipe") {
        recipes++;
        expect(TREASURE_RECIPES).toContain(find.foodId);
      } else {
        expect(find.item.rarity).toBe("legendary");
        expect(find.item.effect).toBeDefined();
        const { requiredLevel } = getItem(find.item.itemId);
        expect(requiredLevel).toBeLessThanOrEqual(30);
        expect(requiredLevel).toBeGreaterThan(30 - 6);
      }
    }
    expect(recipes).toBeGreaterThan(60);
    expect(recipes).toBeLessThan(140);
    // Kennt man alle Schatz-Rezepte, gibt es immer ein Item
    expect(rollTreasure(30, TREASURE_RECIPES, "uid", always).kind).toBe("item");
  });

  it("Schatz-Rezepte verrät der fahrende Koch nie", () => {
    expect(TREASURE_RECIPES.length).toBeGreaterThan(0);
    for (const id of TREASURE_RECIPES) expect(COOK_RECIPES).not.toContain(id);
  });
});
