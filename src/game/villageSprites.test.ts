import { describe, expect, it } from "vitest";
import { BUILDINGS, maxTier, type BuildingId, type BuildingTier } from "../domain/village";
import { BG_HEIGHT, VILLAGE_WIDTH } from "./backgrounds";
import { renderSprite } from "./sprites";
import { getBuildingSprite, VILLAGE_SLOTS } from "./villageSprites";

/** Alle Stufen eines Gebäudes, von 0 bis zur höchsten. */
const tiersOf = (id: BuildingId) => Array.from({ length: maxTier(id) + 1 }, (_, t) => t as BuildingTier);

/** Linker und rechter Rand eines Gebäudes im Dorfbild (mit Umriss). */
function span(slot: (typeof VILLAGE_SLOTS)[number], tier: BuildingTier) {
  const { width, height } = renderSprite(getBuildingSprite(slot.id, tier));
  const left = slot.x - width / 2;
  return { left, right: left + width, top: slot.base - height };
}

describe("Dorfbild", () => {
  it("jedes Gebäude passt auf jeder Stufe ins Bild", () => {
    for (const slot of VILLAGE_SLOTS)
      for (const tier of tiersOf(slot.id)) {
        const { left, right, top } = span(slot, tier);
        expect(left, `${slot.id} ${tier}`).toBeGreaterThanOrEqual(0);
        expect(right, `${slot.id} ${tier}`).toBeLessThanOrEqual(VILLAGE_WIDTH);
        expect(top, `${slot.id} ${tier}`).toBeGreaterThanOrEqual(0);
        expect(slot.base).toBeLessThanOrEqual(BG_HEIGHT);
      }
  });

  it("voll ausgebaute Nachbarn überdecken sich nicht", () => {
    const full = (slot: (typeof VILLAGE_SLOTS)[number]) => span(slot, maxTier(slot.id));
    for (let i = 1; i < VILLAGE_SLOTS.length; i++)
      expect(full(VILLAGE_SLOTS[i - 1]).right).toBeLessThanOrEqual(full(VILLAGE_SLOTS[i]).left);
  });

  it("jedes Gebäude hat einen Platz im Dorfbild", () => {
    expect(new Set(VILLAGE_SLOTS.map((s) => s.id))).toEqual(new Set(BUILDINGS.map((b) => b.id)));
  });

  it("jede Stufe sieht anders aus", () => {
    for (const slot of VILLAGE_SLOTS) {
      const tiers = tiersOf(slot.id);
      const grids = new Set(tiers.map((t) => getBuildingSprite(slot.id, t).grid.join("\n")));
      expect(grids.size).toBe(tiers.length);
    }
  });
});
