import { describe, expect, it } from "vitest";
import { ARMOR_CLASSES, BOSS_ARMOR_CLASS } from "./armorClasses";
import { BOSS_SETS } from "./bossSets";
import { getHeroCombatProfile } from "./combat";
import { EMPTY_EQUIPMENT, getArmorClassSummary } from "./equipment";
import { BOSS_ITEMS, createItem, getItem, getItemParts, ITEMS } from "./items";
import { lootPool, pickFromPool } from "./loot";
import type { Character, Equipment } from "./types";

const hero: Character = {
  name: "Held",
  totalXp: 50_000,
  gold: 0,
  essence: 0,
  stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 },
  spentPoints: 0,
  skills: {},
  abilities: [],
};
/** Komplettes Rüstungsset einer Klasse auf Index 90 (Lv. 28). */
const fullSet = (cls: "light" | "medium" | "heavy"): Equipment => {
  const id = (slot: string) => (cls === "heavy" ? `${slot}-90` : `${slot}-${cls}-90`);
  return {
    ...EMPTY_EQUIPMENT,
    head: createItem(id("head"), "common", "h"),
    chest: createItem(id("chest"), "common", "c"),
    arms: createItem(id("arms"), "common", "a"),
    legs: createItem(id("legs"), "common", "l"),
    feet: createItem(id("feet"), "common", "f"),
  };
};

describe("Rüstungsklassen", () => {
  it("jedes Rüstungsteil gibt es leicht, mittel und schwer – mit 50 / 75 / 100 % Rüstung", () => {
    const heavy = getItem("chest-120");
    const medium = getItem("chest-medium-120");
    const light = getItem("chest-light-120");
    expect([light.armorClass, medium.armorClass, heavy.armorClass]).toEqual(["light", "medium", "heavy"]);
    expect(light.requiredLevel).toBe(heavy.requiredLevel);
    expect(light.armor / heavy.armor).toBeCloseTo(0.5, 1);
    expect(medium.armor / heavy.armor).toBeCloseTo(0.75, 1);
    // Waffen haben keine Klasse
    expect(getItem("sword-10").armorClass).toBeUndefined();
  });

  it("bestehende IDs bleiben schwer; leichte und mittlere Teile haben eigene Namen", () => {
    expect(getItem("legs-30").armorClass).toBe("heavy");
    expect(getItem("legs-30").name).toMatch(/beinschienen|beinlinge/);
    expect(getItem("chest-light-0").name).toMatch(/^Leinen(robe|gewand) /);
    expect(getItem("chest-medium-0").name).toMatch(/^Rohleder(wams|weste) /);
    expect(getItemParts(getItem("head-light-61"))).toEqual({ material: 6, noun: 1, suffix: 1 });
  });

  it("leichte Rüstung gibt Mana und Krit, mittlere etwas Krit, schwere nichts davon", () => {
    expect(getArmorClassSummary(fullSet("light"))).toMatchObject({ mana: 20, crit: expect.closeTo(0.03) });
    expect(getArmorClassSummary(fullSet("medium"))).toMatchObject({ mana: 0, crit: expect.closeTo(0.02) });
    expect(getArmorClassSummary(fullSet("heavy"))).toMatchObject({ mana: 0, crit: 0 });
    const light = getHeroCombatProfile(hero, fullSet("light"));
    const heavy = getHeroCombatProfile(hero, fullSet("heavy"));
    expect(light.maxMana).toBe(heavy.maxMana + 20);
    expect(light.critChance).toBeCloseTo(heavy.critChance + 0.03);
    expect(light.armor).toBeLessThan(heavy.armor);
  });

  it("jedes Boss-Set hat eine Klasse, alle drei kommen vor", () => {
    for (const set of BOSS_SETS) expect(BOSS_ARMOR_CLASS[set.bossId], set.bossId).toBeDefined();
    const armor = BOSS_ITEMS.filter((i) => i.kind === "armor");
    expect(armor.every((i) => i.armorClass === BOSS_ARMOR_CLASS[i.bossId!])).toBe(true);
    expect(new Set(armor.map((i) => i.armorClass))).toEqual(new Set(ARMOR_CLASSES.map((c) => c.key)));
  });

  it("Beute bleibt ausgewogen: Rüstung kommt nicht häufiger als vor den Klassen", () => {
    const pool = lootPool(30);
    let armor = 0;
    const classes = { light: 0, medium: 0, heavy: 0 };
    for (let i = 0; i < 8000; i++) {
      const def = pickFromPool(pool, Math.random);
      if (def.kind === "armor") {
        armor++;
        classes[def.armorClass!]++;
      }
    }
    // 5 von 16 Typen sind Rüstung
    expect(armor / 8000).toBeGreaterThan(0.27);
    expect(armor / 8000).toBeLessThan(0.36);
    for (const n of Object.values(classes)) expect(n / armor).toBeGreaterThan(0.28);
    expect(ITEMS.some((i) => i.armorClass === "light" && i.requiredLevel === 60)).toBe(true);
  });
});
