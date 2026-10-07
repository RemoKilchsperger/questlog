import { describe, expect, it } from "vitest";
import { EMPTY_EQUIPMENT } from "./equipment";
import {
  canSalvage,
  canUpgrade,
  essenceFor,
  essenceYield,
  investedEssence,
  salvageItem,
  upgradeCost,
  upgradeItem,
  UPGRADE_REFUND,
} from "./forge";
import { createItem, getItem, getItemStats, MAX_UPGRADE } from "./items";
import type { Gear, OwnedItem } from "./types";

const gearWith = (...items: OwnedItem[]): Gear => ({ inventory: items, equipment: EMPTY_EQUIPMENT });

describe("Schmied: Zerlegen", () => {
  it("erst ab der Seltenheit selten", () => {
    expect(canSalvage(createItem("dagger-0", "common", "c"))).toBe(false);
    expect(essenceYield(createItem("dagger-0", "common", "c"))).toBe(0);
    for (const rarity of ["rare", "epic", "legendary"] as const) {
      expect(canSalvage(createItem("dagger-0", rarity, "x")), rarity).toBe(true);
    }
    const common = createItem("dagger-0", "common", "c");
    expect(() => salvageItem(gearWith(common), 0, "c")).toThrow();
  });

  it("seltenere und höherstufige Items geben mehr Essenz", () => {
    const rare = essenceYield(createItem("dagger-0", "rare", "r"));
    const epic = essenceYield(createItem("dagger-0", "epic", "e"));
    const legendary = essenceYield(createItem("dagger-0", "legendary", "l"));
    expect(rare).toBeGreaterThan(0);
    expect(epic).toBeGreaterThan(rare);
    expect(legendary).toBeGreaterThan(epic);

    const high = createItem("dagger-20", "rare", "h");
    expect(getItem("dagger-20").requiredLevel).toBeGreaterThan(getItem("dagger-0").requiredLevel);
    expect(essenceYield(high)).toBeGreaterThan(rare);
  });

  it("entfernt das Item aus dem Inventar und schreibt die Essenz gut", () => {
    const item = createItem("dagger-0", "epic", "e");
    const other = createItem("dagger-0", "rare", "r");
    const result = salvageItem(gearWith(item, other), 5, "e");
    expect(result.gear.inventory).toEqual([other]);
    expect(result.essence).toBe(5 + essenceYield(item));
  });

  it("angelegte Items lassen sich nicht zerlegen", () => {
    const item = createItem("dagger-0", "rare", "w");
    const gear: Gear = { inventory: [], equipment: { ...EMPTY_EQUIPMENT, weapon1: item } };
    expect(() => salvageItem(gear, 0, "w")).toThrow();
  });
});

describe("Schmied: Verbessern", () => {
  const sword = () => createItem("sword-100", "rare", "s");
  const helmet = () => createItem("head-100", "rare", "h");
  const shield = () => createItem("shield-100", "rare", "sh");

  it("Waffen gewinnen Angriff, Rüstungen und Schilde Rüstung", () => {
    const upgraded = (make: typeof sword) => ({ before: getItemStats(make()), after: getItemStats({ ...make(), upgrade: 1 }) });

    const w = upgraded(sword);
    expect(w.after.attack).toBeGreaterThan(w.before.attack);
    expect(w.after.armor).toBe(w.before.armor);

    for (const make of [helmet, shield]) {
      const { before, after } = upgraded(make);
      expect(after.armor).toBeGreaterThan(before.armor);
      expect(after.attack).toBe(before.attack);
    }
  });

  it("jede Stufe bringt mindestens +1, auch bei kleinen Werten", () => {
    const dagger = createItem("dagger-0", "common", "d");
    const base = getItemStats(dagger).attack;
    for (let level = 1; level <= MAX_UPGRADE; level++) {
      expect(getItemStats({ ...dagger, upgrade: level }).attack).toBeGreaterThanOrEqual(base + level);
    }
  });

  it("kostet Essenz, steigt mit jeder Stufe und endet bei der Höchststufe", () => {
    let gear = gearWith(sword());
    let essence = 10_000;
    let lastCost = 0;
    for (let level = 1; level <= MAX_UPGRADE; level++) {
      const cost = upgradeCost(gear.inventory[0]);
      expect(cost).toBeGreaterThan(lastCost);
      lastCost = cost;
      ({ gear, essence } = upgradeItem(gear, essence, "s"));
      expect(gear.inventory[0].upgrade).toBe(level);
    }
    expect(10_000 - essence).toBe(investedEssence(gear.inventory[0]));
    expect(canUpgrade(gear.inventory[0])).toBe(false);
    expect(() => upgradeItem(gear, essence, "s")).toThrow();
  });

  it("Essenz ist knapp: +1 kostet mehr, als ein seltenes Item gleichen Levels einbringt", () => {
    for (const id of ["sword-0", "sword-100", "sword-199"]) {
      const item = createItem(id, "rare", "x");
      expect(upgradeCost(item)).toBeGreaterThan(2 * essenceFor("rare", getItem(id).requiredLevel));
    }
  });

  it("ohne genug Essenz geht es nicht", () => {
    const item = sword();
    expect(() => upgradeItem(gearWith(item), upgradeCost(item) - 1, "s")).toThrow();
  });

  it("angelegte Items lassen sich direkt verbessern", () => {
    const item = sword();
    const gear: Gear = { inventory: [], equipment: { ...EMPTY_EQUIPMENT, weapon1: item } };
    const result = upgradeItem(gear, 10_000, "s");
    expect(result.gear.equipment.weapon1?.upgrade).toBe(1);
    expect(result.gear.inventory).toEqual([]);
  });

  it("Zerlegen gibt die Hälfte der investierten Essenz zurück", () => {
    const plain = sword();
    const upgraded = { ...plain, upgrade: 3 };
    expect(essenceYield(upgraded)).toBe(
      essenceYield(plain) + Math.floor(investedEssence(upgraded) * UPGRADE_REFUND),
    );
  });
});
