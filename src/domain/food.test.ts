import { describe, expect, it } from "vitest";
import { eatMeal, FOODS, foodEffectText, foodPrice, getFood, withMeal } from "./food";
import type { HeroCombatProfile } from "./combat";

const profile: HeroCombatProfile = {
  level: 30,
  maxHp: 500,
  damage: 100,
  armor: 200,
  critChance: 0.1,
  goldBonus: 0.2,
  maxMana: 80,
  abilities: [],
  heroClass: null,
  itemEffects: [],
} as unknown as HeroCombatProfile;

describe("Buff-Food", () => {
  it("jedes Gericht hat eine eindeutige Id und eine Wirkung", () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const food of FOODS) expect(Object.keys(food.effect).length).toBeGreaterThan(0);
    // Festmahle haben mehrere Wirkungen
    for (const food of FOODS.filter((f) => f.tavern === 3)) expect(Object.keys(food.effect).length).toBeGreaterThan(1);
  });

  it("wirkt auf die Kampfwerte", () => {
    const fed = withMeal(profile, "festRoast");
    expect(fed.maxHp).toBe(600);
    expect(fed.damage).toBeCloseTo(110);
    expect(fed.armor).toBe(200);
    expect(withMeal(profile, "trout").critChance).toBeCloseTo(0.15);
    expect(withMeal(profile, "luckyCake").goldBonus).toBeCloseTo(0.5);
    expect(withMeal(profile, "mushrooms").maxMana).toBe(100);
    expect(withMeal(profile, null)).toBe(profile);
  });

  it("Preis steigt mit dem Level", () => {
    expect(foodPrice(getFood("stew"), 1)).toBe(10);
    expect(foodPrice(getFood("stew"), 31)).toBe(40);
    expect(foodEffectText(getFood("knightFeast"))).toBe("+12 % Schaden, +20 % Rüstung");
  });

  it("essen kostet Gold, nur eines auf einmal und nur mit passender Taverne", () => {
    expect(eatMeal(null, 100, "stew", 1, 1)).toEqual({ meal: "stew", gold: 90 });
    expect(() => eatMeal("stew", 100, "sausage", 1, 1)).toThrow(/satt/);
    expect(() => eatMeal(null, 100, "roast", 1, 1)).toThrow(/Stufe 2/);
    expect(() => eatMeal(null, 5, "stew", 1, 1)).toThrow(/Gold/);
  });
});
