import { describe, expect, it } from "vitest";
import type { BuildingTier } from "../domain/village";
import { BG_HEIGHT, BG_WIDTH } from "./backgrounds";
import { renderSprite } from "./sprites";
import { getBuildingSprite, VILLAGE_SLOTS } from "./villageSprites";

const TIERS: BuildingTier[] = [0, 1, 2, 3];

/** Linker und rechter Rand eines Gebäudes im Dorfbild (mit Umriss). */
function span(slot: (typeof VILLAGE_SLOTS)[number], tier: BuildingTier) {
  const { width, height } = renderSprite(getBuildingSprite(slot.id, tier));
  const left = slot.x - width / 2;
  return { left, right: left + width, top: slot.base - height };
}

describe("Dorfbild", () => {
  it("jedes Gebäude passt auf jeder Stufe ins Bild", () => {
    for (const slot of VILLAGE_SLOTS)
      for (const tier of TIERS) {
        const { left, right, top } = span(slot, tier);
        expect(left, `${slot.id} ${tier}`).toBeGreaterThanOrEqual(0);
        expect(right, `${slot.id} ${tier}`).toBeLessThanOrEqual(BG_WIDTH);
        expect(top, `${slot.id} ${tier}`).toBeGreaterThanOrEqual(0);
        expect(slot.base).toBeLessThanOrEqual(BG_HEIGHT);
      }
  });

  it("voll ausgebaute Nachbarn überdecken sich nicht", () => {
    for (let i = 1; i < VILLAGE_SLOTS.length; i++)
      expect(span(VILLAGE_SLOTS[i - 1], 3).right).toBeLessThanOrEqual(span(VILLAGE_SLOTS[i], 3).left);
  });

  it("jede Stufe sieht anders aus", () => {
    for (const slot of VILLAGE_SLOTS) {
      const grids = new Set(TIERS.map((t) => getBuildingSprite(slot.id, t).grid.join("\n")));
      expect(grids.size).toBe(4);
    }
  });
});
