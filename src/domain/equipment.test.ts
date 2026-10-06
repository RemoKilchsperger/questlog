import { describe, expect, it } from "vitest";
import {
  EMPTY_EQUIPMENT,
  equipItem,
  getCombatStats,
  getEffectiveStats,
  isOffHandBlocked,
  sellItem,
  unequipItem,
} from "./equipment";
import {
  bonusValue,
  createItem,
  getItem,
  getItemStats,
  indexForLevel,
  ITEM_TYPES,
  ITEMS,
  ITEMS_PER_TYPE,
  levelForIndex,
  migrateLegacyItemId,
  RARITIES,
} from "./items";
import { MAX_LEVEL } from "./leveling";
import { lootPool, RARITY_WEIGHTS, rollLoot, rollRarity } from "./loot";
import { EFFORT_TIERS } from "./rewards";
import {
  buyOffer,
  rerollCost,
  rerollShop,
  rollShopStock,
  SHOP_SIZE,
  shopPrice,
  shopSlot,
  type ShopStock,
} from "./shop";
import type { Gear, OwnedItem } from "./types";

const gearWith = (...itemIds: string[]): Gear => ({
  inventory: itemIds.map((itemId, i) => createItem(itemId, "common", `u${i}`)),
  equipment: EMPTY_EQUIPMENT,
});

/** Zufallsquelle, die der Reihe nach feste Werte liefert. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("Katalog", () => {
  it("hat 16 Typen – Waffen je 200 Items, Rüstung je 200 pro Klasse – mit eindeutigen IDs und Namen", () => {
    expect(ITEM_TYPES).toHaveLength(16);
    expect(ITEMS).toHaveLength(11 * ITEMS_PER_TYPE + 5 * 3 * ITEMS_PER_TYPE);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const { type, kind } of ITEM_TYPES) {
      const names = ITEMS.filter((i) => i.type === type).map((i) => i.name);
      expect(new Set(names).size, type).toBe(kind === "armor" ? 3 * ITEMS_PER_TYPE : ITEMS_PER_TYPE);
    }
  });

  it("verteilt die Items über Level 1 bis 60", () => {
    expect(levelForIndex(0)).toBe(1);
    expect(levelForIndex(ITEMS_PER_TYPE - 1)).toBe(MAX_LEVEL);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expect(levelForIndex(indexForLevel(level))).toBe(level);
      expect(ITEMS.some((i) => i.type === "chest" && i.requiredLevel === level)).toBe(true);
    }
  });

  it("höheres Level gibt bessere Werte", () => {
    expect(getItem("sword-199").attack).toBeGreaterThan(getItem("sword-0").attack * 10);
    expect(getItem("chest-199").armor).toBeGreaterThan(getItem("chest-0").armor * 10);
  });

  it("Schilde geben Rüstung statt Angriff, Zweihandwaffen sind stärker", () => {
    const shield = getItem("shield-50");
    expect(shield.armor).toBeGreaterThan(0);
    expect(shield.attack).toBe(0);
    expect(getItem("greatsword-50").twoHanded).toBe(true);
    expect(getItem("greatsword-50").attack).toBeGreaterThan(getItem("sword-50").attack);
  });

  it("stellt alte Items auf den neuen Katalog um", () => {
    expect(migrateLegacyItemId("leather-chest")).toBe("chest-0");
    expect(getItem(migrateLegacyItemId("iron-head")!).requiredLevel).toBe(4);
    expect(getItem(migrateLegacyItemId("rune-blade")!).type).toBe("sword");
    expect(migrateLegacyItemId("sword-5")).toBe("sword-5");
    expect(migrateLegacyItemId("gibt-es-nicht")).toBeNull();
  });
});

describe("Anlegen und Ablegen", () => {
  it("legt Rüstung in ihren Slot und zählt den Rüstungswert", () => {
    const gear = equipItem(gearWith("chest-0"), "u0", 1);
    expect(gear.equipment.chest?.itemId).toBe("chest-0");
    expect(gear.inventory).toHaveLength(0);
    expect(getCombatStats(gear.equipment)).toEqual({ armor: getItem("chest-0").armor, attack: 0 });
  });

  it("Schwert und Schild: Angriff und Rüstung zusammen", () => {
    let gear = gearWith("sword-0", "shield-0");
    gear = equipItem(gear, "u0", 1, "weapon1");
    gear = equipItem(gear, "u1", 1, "weapon2");
    expect(getCombatStats(gear.equipment)).toEqual({
      armor: getItem("shield-0").armor,
      attack: getItem("sword-0").attack,
    });
  });

  it("Zweihandwaffen belegen beide Hände und verdrängen beide Waffen", () => {
    let gear = gearWith("sword-0", "dagger-0", "greataxe-0");
    gear = equipItem(gear, "u0", 1, "weapon1");
    gear = equipItem(gear, "u1", 1, "weapon2");
    gear = equipItem(gear, "u2", 1);
    expect(gear.equipment.weapon1?.itemId).toBe("greataxe-0");
    expect(gear.equipment.weapon2).toBeNull();
    expect(isOffHandBlocked(gear.equipment)).toBe(true);
    expect(gear.inventory.map((i) => i.itemId).sort()).toEqual(["dagger-0", "sword-0"]);
    expect(() => equipItem(gearWith("greataxe-0"), "u0", 1, "weapon2")).toThrow();
  });

  it("eine Einhandwaffe in Hand 2 verdrängt die Zweihandwaffe", () => {
    let gear = gearWith("staff-0", "dagger-0");
    gear = equipItem(gear, "u0", 1);
    gear = equipItem(gear, "u1", 1, "weapon2");
    expect(gear.equipment.weapon1).toBeNull();
    expect(gear.equipment.weapon2?.itemId).toBe("dagger-0");
    expect(gear.inventory.map((i) => i.itemId)).toEqual(["staff-0"]);
  });

  it("nur ein Schild: ein zweiter verdrängt den ersten", () => {
    let gear = gearWith("shield-0", "shield-1", "sword-0");
    gear = equipItem(gear, "u0", 1, "weapon1");
    gear = equipItem(gear, "u1", 1, "weapon2");
    expect(gear.equipment.weapon1).toBeNull();
    expect(gear.equipment.weapon2?.itemId).toBe("shield-1");
    expect(gear.inventory.map((i) => i.itemId).sort()).toEqual(["shield-0", "sword-0"]);
    // Schwert und Schild zusammen bleiben erlaubt
    gear = equipItem(gear, gear.inventory.find((i) => i.itemId === "sword-0")!.uid, 1, "weapon1");
    expect(gear.equipment.weapon1?.itemId).toBe("sword-0");
    expect(gear.equipment.weapon2?.itemId).toBe("shield-1");
  });

  it("tauscht ein belegtes Teil zurück ins Inventar", () => {
    let gear = gearWith("head-0", "head-20");
    gear = equipItem(gear, "u0", 10);
    gear = equipItem(gear, "u1", 10);
    expect(gear.equipment.head?.itemId).toBe("head-20");
    expect(gear.inventory.map((i) => i.itemId)).toEqual(["head-0"]);
  });

  it("verhindert falsche Slots und zu niedriges Level", () => {
    expect(() => equipItem(gearWith("head-0"), "u0", 1, "feet")).toThrow();
    expect(() => equipItem(gearWith("sword-0"), "u0", 1, "chest")).toThrow();
    expect(() => equipItem(gearWith("sword-199"), "u0", 1)).toThrow(/Level/);
  });

  it("legt ab und gibt das Item zurück", () => {
    const gear = unequipItem(equipItem(gearWith("dagger-0"), "u0", 1), "weapon1");
    expect(gear.equipment.weapon1).toBeNull();
    expect(gear.inventory).toHaveLength(1);
    expect(getCombatStats(gear.equipment)).toEqual({ armor: 0, attack: 0 });
  });
});

describe("Händler", () => {
  const stockOf = (...offers: OwnedItem[]): ShopStock => ({ slot: "s", offers });
  let uid = 0;
  const newUid = () => `n${uid++}`;

  it("hat höchstens 5 verschiedene, tragbare Stücke, genau eines selten", () => {
    for (const level of [1, 7, 30, 60]) {
      const stock = rollShopStock("s", level, newUid);
      expect(stock.offers).toHaveLength(SHOP_SIZE);
      expect(new Set(stock.offers.map((o) => o.itemId)).size).toBe(SHOP_SIZE);
      expect(stock.offers.filter((o) => o.rarity === "rare")).toHaveLength(1);
      expect(stock.offers.filter((o) => o.rarity === "epic").length).toBeLessThanOrEqual(1);
      expect(stock.offers.some((o) => o.rarity === "legendary")).toBe(false);
      expect(stock.offers.every((o) => getItem(o.itemId).requiredLevel <= level)).toBe(true);
      expect(stock.offers.some((o) => getItem(o.itemId).bossId)).toBe(false);
    }
  });

  it("hat mit 4 % Chance zusätzlich ein episches Stück", () => {
    const rarities = (roll: number) => rollShopStock("s", 10, newUid, () => roll).offers.map((o) => o.rarity);
    expect(rarities(0.03).filter((r) => r === "epic")).toHaveLength(1); // unter 4 %
    expect(rarities(0.05).filter((r) => r === "epic")).toHaveLength(0); // darüber
    let epics = 0;
    for (let i = 0; i < 5000; i++) epics += rollShopStock("s", 10, newUid).offers.some((o) => o.rarity === "epic") ? 1 : 0;
    expect(epics / 5000).toBeGreaterThan(0.025);
    expect(epics / 5000).toBeLessThan(0.055);
  });

  it("würfelt einmal pro Tag gegen Gold neu aus", () => {
    const morning = new Date(2026, 9, 5, 9, 0);
    const cost = rerollCost(10);
    const first = rerollShop(1000, 10, "", newUid, morning);
    expect(first.gold).toBe(1000 - cost);
    expect(first.stock.slot).toBe(shopSlot(morning));
    expect(first.stock.offers).toHaveLength(SHOP_SIZE);
    expect(() => rerollShop(1000, 10, first.lastReroll, newUid, new Date(2026, 9, 5, 22, 0))).toThrow(/schon/);
    expect(() => rerollShop(cost - 1, 10, "", newUid, morning)).toThrow(/Gold/);
    // Am nächsten Tag wieder erlaubt
    expect(rerollShop(1000, 10, first.lastReroll, newUid, new Date(2026, 9, 6, 0, 1)).gold).toBe(1000 - cost);
    expect(rerollCost(60)).toBeGreaterThan(rerollCost(1));
  });

  it("wechselt alle 4 Stunden", () => {
    expect(shopSlot(new Date(2026, 9, 5, 0, 0))).toBe(shopSlot(new Date(2026, 9, 5, 3, 59)));
    expect(shopSlot(new Date(2026, 9, 5, 3, 59))).not.toBe(shopSlot(new Date(2026, 9, 5, 4, 0)));
    expect(shopSlot(new Date(2026, 9, 5, 23, 0))).not.toBe(shopSlot(new Date(2026, 9, 6, 23, 0)));
  });

  it("kauft mit Gold, das Stück verschwindet aus dem Angebot; Verkauf zu einem Viertel des Preises", () => {
    const offer = createItem("dagger-0", "common", "offer");
    const price = getItem("dagger-0").price;
    const bought = buyOffer(gearWith(), 100, stockOf(offer), "offer", 1);
    expect(bought.gold).toBe(100 - price);
    expect(bought.gear.inventory).toEqual([offer]);
    expect(bought.stock.offers).toHaveLength(0);

    const sold = sellItem(bought.gear, bought.gold, "offer");
    expect(sold.gold).toBe(100 - price + Math.max(1, Math.floor(price / 4)));
    expect(sold.gear.inventory).toHaveLength(0);
  });

  it("seltene Stücke kosten mehr", () => {
    expect(shopPrice(createItem("dagger-0", "rare", "x"))).toBe(getItem("dagger-0").price * 2);
  });

  it("verweigert Kauf ohne genug Gold, Level oder bei ausverkauftem Stück", () => {
    const stock = stockOf(createItem("dagger-0", "common", "a"), createItem("sword-199", "common", "b"));
    expect(() => buyOffer(gearWith(), 0, stock, "a", 1)).toThrow(/Gold/);
    expect(() => buyOffer(gearWith(), 999_999, stock, "b", 1)).toThrow(/Level/);
    expect(() => buyOffer(gearWith(), 999_999, stock, "weg", 1)).toThrow(/Angebot/);
  });

  it("zahlt für seltene Stücke mehr", () => {
    const common = sellItem(gearWith("dagger-0"), 0, "u0").gold;
    const legendary = sellItem(
      { inventory: [createItem("dagger-0", "legendary", "x")], equipment: EMPTY_EQUIPMENT },
      0,
      "x",
    ).gold;
    expect(legendary).toBeGreaterThan(common);
  });
});

describe("Seltenheit und Attributboni", () => {
  it("seltenere Stufen geben mehr Boni und höhere Werte", () => {
    for (let i = 1; i < RARITIES.length; i++) {
      const lower = RARITIES[i - 1];
      const higher = RARITIES[i];
      expect(higher.bonusCount).toBeGreaterThan(lower.bonusCount);
      expect(higher.statMultiplier).toBeGreaterThan(lower.statMultiplier);
      expect(bonusValue(higher.key, 12)).toBeGreaterThan(bonusValue(lower.key, 12));
    }
  });

  it("jedes Item gibt es in jeder Seltenheitsstufe", () => {
    for (const { key } of RARITIES) {
      expect(getItemStats(createItem("greathammer-123", key, "x")).rarity).toBe(key);
    }
  });

  it("würfelt verschiedene Attribute je nach Seltenheit", () => {
    expect(createItem("chest-10", "common", "a").bonuses).toEqual({});
    const epic = createItem("chest-10", "epic", "b", sequence(0, 0));
    expect(Object.keys(epic.bonuses)).toEqual(["strength", "intellect"]);
    expect(epic.bonuses.strength).toBe(bonusValue("epic", getItem("chest-10").requiredLevel));
    expect(Object.keys(createItem("chest-10", "legendary", "c").bonuses)).toHaveLength(3);
  });

  it("erhöht Rüstung/Angriff und addiert Boni auf die Attribute", () => {
    const legendary = createItem("chest-0", "legendary", "x", sequence(0));
    expect(getItemStats(legendary).armor).toBe(Math.round(getItem("chest-0").armor * 1.75));

    const gear = equipItem({ inventory: [legendary], equipment: EMPTY_EQUIPMENT }, "x", 1);
    const base = { strength: 5, intellect: 5, endurance: 5, charisma: 5 };
    const effective = getEffectiveStats(base, gear.equipment);
    const total = (s: typeof base) => s.strength + s.intellect + s.endurance + s.charisma;
    expect(total(effective) - total(base)).toBe(3 * bonusValue("legendary", 1));
  });
});

describe("Beute", () => {
  it("längere Quests haben eine höhere Dropchance", () => {
    for (let i = 1; i < EFFORT_TIERS.length; i++) {
      expect(EFFORT_TIERS[i].dropChance).toBeGreaterThan(EFFORT_TIERS[i - 1].dropChance);
    }
  });

  it("droppt nur, wenn der Wurf unter der Dropchance liegt", () => {
    expect(rollLoot("quick", 1, "x", sequence(0.5))).toBeNull();
    expect(rollLoot("epic", 1, "x", sequence(0.5))).not.toBeNull();
  });

  it("längere Quests droppen eher seltene Items", () => {
    // Derselbe Wurf landet bei epischen Quests in einer höheren Stufe.
    const order = RARITIES.map((r) => r.key);
    expect(order.indexOf(rollRarity(RARITY_WEIGHTS.epic, () => 0.5))).toBeGreaterThan(
      order.indexOf(rollRarity(RARITY_WEIGHTS.quick, () => 0.5)),
    );
  });

  it("droppt nur Items, die der Held tragen kann, aus allen Typen", () => {
    expect(lootPool(1).every((i) => i.requiredLevel === 1)).toBe(true);
    const pool = lootPool(60);
    expect(pool.every((i) => i.requiredLevel <= 60 && i.requiredLevel > 54)).toBe(true);
    expect(new Set(pool.map((i) => i.type)).size).toBe(16);
  });
});
