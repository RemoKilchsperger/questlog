import { describe, expect, it } from "vitest";
import { EMPTY_EQUIPMENT } from "./equipment";
import { gearScore, itemScore } from "./gearScore";
import { createItem, getItem } from "./items";
import type { Equipment, Rarity } from "./types";

const own = (itemId: string, rarity: Rarity = "common", upgrade = 0) => ({ ...createItem(itemId, rarity, itemId), upgrade });
const full = (rarity: Rarity = "common", weapons: Partial<Equipment> = {}): Equipment => ({
  ...EMPTY_EQUIPMENT,
  head: own("head-light-130", rarity),
  chest: own("chest-medium-130", rarity),
  arms: own("arms-130", rarity),
  legs: own("legs-130", rarity),
  feet: own("feet-light-130", rarity),
  weapon1: own("sword-130", rarity),
  weapon2: own("dagger-130", rarity),
  ...weapons,
});
const level = getItem("sword-130").requiredLevel;

describe("Gear Score", () => {
  it("lauter gewöhnliche Items eines Levels ergeben genau dieses Level", () => {
    expect(gearScore(full())).toBe(level);
  });

  it("Seltenheit hebt den Score, unabhängig von der Rüstungsklasse", () => {
    expect(gearScore(full("epic"))).toBe(Math.round(level * 1.45));
    expect(itemScore(own("chest-light-130"))).toBe(itemScore(own("chest-130")));
  });

  it("Schmied-Stufen geben +2 % pro Stufe", () => {
    expect(itemScore(own("sword-130", "common", 5))).toBeCloseTo(level * 1.1);
  });

  it("Zweihandwaffe zählt doppelt, leere Plätze zählen 0", () => {
    const twoHand = full("common", { weapon1: own("greatsword-130"), weapon2: null });
    expect(getItem("greatsword-130").requiredLevel).toBe(level);
    expect(gearScore(twoHand)).toBe(level);
    expect(gearScore(full("common", { weapon2: null }))).toBe(Math.round((level * 6) / 7));
    expect(gearScore(EMPTY_EQUIPMENT)).toBe(0);
  });
});
