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
import { MAX_LEVEL, POINTS_PER_LEVEL } from "./leveling";
import { lootPool, rollDrop, rollRarity } from "./loot";
import {
  buyOffer,
  rerollCost,
  rerollShop,
  rollShopRarity,
  rollShopStock,
  SHOP_REROLLS_PER_DAY,
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

  it("Schilde geben vor allem Rüstung und etwas Angriff, Zweihandwaffen sind stärker", () => {
    const shield = getItem("shield-50");
    expect(shield.armor).toBeGreaterThan(0);
    expect(shield.attack).toBeGreaterThan(0);
    expect(shield.attack).toBeLessThan(getItem("sword-50").attack);
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
      attack: getItem("sword-0").attack + getItem("shield-0").attack,
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

  it("hat 8 verschiedene, tragbare Stücke", () => {
    expect(SHOP_SIZE).toBe(8);
    for (const level of [1, 7, 30, 60]) {
      const stock = rollShopStock("s", level, newUid);
      expect(stock.offers).toHaveLength(SHOP_SIZE);
      expect(new Set(stock.offers.map((o) => o.itemId)).size).toBe(SHOP_SIZE);
      expect(stock.offers.every((o) => getItem(o.itemId).requiredLevel <= level)).toBe(true);
      expect(stock.offers.some((o) => getItem(o.itemId).bossId)).toBe(false);
    }
  });

  it("jedes Stück: 0,2 % legendär, 5 % episch, 20 % selten, sonst gewöhnlich", () => {
    expect(rollShopRarity(() => 0.001)).toBe("legendary");
    expect(rollShopRarity(() => 0.003)).toBe("epic");
    expect(rollShopRarity(() => 0.051)).toBe("epic");
    expect(rollShopRarity(() => 0.053)).toBe("rare");
    expect(rollShopRarity(() => 0.251)).toBe("rare");
    expect(rollShopRarity(() => 0.253)).toBe("common");
    const counts: Record<string, number> = {};
    const n = 20_000;
    for (let i = 0; i < n / SHOP_SIZE; i++) {
      for (const o of rollShopStock("s", 30, newUid).offers) counts[o.rarity] = (counts[o.rarity] ?? 0) + 1;
    }
    expect(counts.rare / n).toBeGreaterThan(0.18);
    expect(counts.rare / n).toBeLessThan(0.22);
    expect(counts.epic / n).toBeGreaterThan(0.04);
    expect(counts.epic / n).toBeLessThan(0.06);
    expect((counts.legendary ?? 0) / n).toBeLessThan(0.006);
  });

  it("würfelt bis zu 5-mal pro Tag gegen Gold neu aus", () => {
    const morning = new Date(2026, 9, 5, 9, 0);
    const cost = rerollCost(10);
    const first = rerollShop(1000, 10, "", 0, newUid, morning);
    expect(first.gold).toBe(1000 - cost);
    expect(first.count).toBe(1);
    expect(first.stock.slot).toBe(shopSlot(morning));
    expect(first.stock.offers).toHaveLength(SHOP_SIZE);
    let last = first;
    for (let i = 1; i < SHOP_REROLLS_PER_DAY; i++) last = rerollShop(1000, 10, last.lastReroll, last.count, newUid, morning);
    expect(last.count).toBe(SHOP_REROLLS_PER_DAY);
    expect(() => rerollShop(1000, 10, last.lastReroll, last.count, newUid, new Date(2026, 9, 5, 22, 0))).toThrow(/schon/);
    expect(() => rerollShop(cost - 1, 10, "", 0, newUid, morning)).toThrow(/Gold/);
    // Am nächsten Tag wieder erlaubt – der Zähler beginnt neu
    const next = rerollShop(1000, 10, last.lastReroll, last.count, newUid, new Date(2026, 9, 6, 0, 1));
    expect(next.gold).toBe(1000 - cost);
    expect(next.count).toBe(1);
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
  it("seltenere Stufen geben mehr Boni, mehr Attributpunkte und höhere Werte", () => {
    const points = (r: (typeof RARITIES)[number], level: number) => r.bonusCount * bonusValue(r.key, level);
    for (let i = 1; i < RARITIES.length; i++) {
      const lower = RARITIES[i - 1];
      const higher = RARITIES[i];
      expect(higher.bonusCount).toBeGreaterThan(lower.bonusCount);
      expect(higher.statMultiplier).toBeGreaterThan(lower.statMultiplier);
      expect(bonusValue(higher.key, 12)).toBeGreaterThanOrEqual(bonusValue(lower.key, 12));
      expect(points(higher, 12)).toBeGreaterThan(points(lower, 12));
    }
  });

  it("ein legendäres Item bringt ab Level 20 höchstens zwei Drittel der Punkte aus den Level-ups", () => {
    for (let level = 20; level <= 60; level++) {
      expect(3 * bonusValue("legendary", level), `Lv. ${level}`).toBeLessThanOrEqual(((level - 1) * POINTS_PER_LEVEL * 2) / 3);
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
  it("droppt nur, wenn der Wurf unter der Dropchance liegt", () => {
    const weights = { common: 100, rare: 0, epic: 0, legendary: 0 };
    expect(rollDrop(0.4, weights, 1, "x", sequence(0.5))).toBeNull();
    expect(rollDrop(0.6, weights, 1, "x", sequence(0.5))).not.toBeNull();
  });

  it("andere Gewichte, andere Seltenheit beim selben Wurf", () => {
    const order = RARITIES.map((r) => r.key);
    expect(order.indexOf(rollRarity({ common: 20, rare: 50, epic: 25, legendary: 5 }, () => 0.5))).toBeGreaterThan(
      order.indexOf(rollRarity({ common: 80, rare: 18, epic: 2, legendary: 0 }, () => 0.5)),
    );
  });

  it("droppt nur Items, die der Held tragen kann, aus allen Typen", () => {
    expect(lootPool(1).every((i) => i.requiredLevel === 1)).toBe(true);
    const pool = lootPool(60);
    expect(pool.every((i) => i.requiredLevel <= 60 && i.requiredLevel > 54)).toBe(true);
    expect(new Set(pool.map((i) => i.type)).size).toBe(16);
  });
});
