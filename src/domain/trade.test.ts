import { describe, expect, it } from "vitest";
import { BOSS_ITEMS, createItem, ITEMS } from "./items";
import {
  applyTrade,
  checkOffer,
  isTradeable,
  sameItem,
  TRADE_MAX_ITEMS,
  TRADE_MIN_LEVEL,
  TradeError,
  tradeLockReason,
  validateTradeItem,
} from "./trade";
import type { OwnedItem } from "./types";

const weapon = ITEMS.find((i) => i.type === "sword" && i.requiredLevel >= 20)!;
const armor = ITEMS.find((i) => i.type === "chest" && i.requiredLevel >= 20)!;

describe("Tausch: handelbare Items", () => {
  it("alle normalen Items sind handelbar, auch legendäre", () => {
    for (const rarity of ["common", "rare", "epic", "legendary"] as const) {
      expect(isTradeable(createItem(weapon.id, rarity, `w-${rarity}`)), rarity).toBe(true);
    }
  });

  it("Boss-Items sind gesperrt", () => {
    const boss = createItem(BOSS_ITEMS[0].id, "legendary", "boss");
    expect(isTradeable(boss)).toBe(false);
    expect(() => validateTradeItem(boss)).toThrow(/Boss-Items/);
  });

  it("Tauschen erst ab dem Mindest-Level", () => {
    expect(tradeLockReason(TRADE_MIN_LEVEL - 1)).not.toBeNull();
    expect(tradeLockReason(TRADE_MIN_LEVEL)).toBeNull();
  });
});

describe("Tausch: Prüfung von Items aus fremden Daten", () => {
  it("echte Drops kommen unverändert durch", () => {
    for (const def of [weapon, armor]) {
      for (const rarity of ["common", "rare", "epic", "legendary"] as const) {
        const item = createItem(def.id, rarity, `${def.id}-${rarity}`);
        expect(validateTradeItem(item), `${def.id} ${rarity}`).toEqual(item);
      }
    }
  });

  it("jedes normale Item des Katalogs besteht die Prüfung", () => {
    for (const def of ITEMS) {
      for (const rarity of ["common", "rare", "epic", "legendary"] as const) {
        const item = createItem(def.id, rarity, `${def.id}|${rarity}`);
        expect(() => validateTradeItem(item), `${def.id} ${rarity}`).not.toThrow();
      }
    }
  });

  it("verbesserte Items behalten ihre Stufe", () => {
    const item = { ...createItem(weapon.id, "epic", "up"), upgrade: 3 };
    expect(validateTradeItem(item).upgrade).toBe(3);
    expect(() => validateTradeItem({ ...item, upgrade: 9 })).toThrow(TradeError);
    expect(() => validateTradeItem({ ...item, upgrade: 1.5 })).toThrow(TradeError);
  });

  it("ergänzt fehlenden Effekt und fehlende Fähigkeiten aus der uid", () => {
    const item = createItem(weapon.id, "legendary", "alt");
    const { effect: _effect, abilities: _abilities, ...old } = item;
    expect(validateTradeItem(old)).toEqual(item);
  });

  it("lehnt manipulierte Items ab", () => {
    const item = createItem(weapon.id, "legendary", "fake");
    const [stat] = Object.keys(item.bonuses);
    const cases: [string, unknown][] = [
      ["unbekanntes Item", { ...item, itemId: "sword-9999" }],
      ["unbekannte Seltenheit", { ...item, rarity: "mythic" }],
      ["zu hoher Bonus", { ...item, bonuses: { ...item.bonuses, [stat]: 999 } }],
      ["zusätzlicher Bonus", { ...createItem(weapon.id, "rare", "r"), bonuses: item.bonuses }],
      ["unbekanntes Attribut", { ...item, bonuses: { ...item.bonuses, luck: 1 } }],
      ["anderer Effekt", { ...item, effect: item.effect === "ember" ? "venomFang" : "ember" }],
      ["andere Fähigkeiten", { ...item, abilities: ["sword"] }],
      ["Fähigkeiten an Rüstung", { ...createItem(armor.id, "rare", "a"), abilities: ["sword"] }],
      ["keine uid", { ...item, uid: "" }],
      ["kein Objekt", "sword-0"],
    ];
    for (const [why, raw] of cases) expect(() => validateTradeItem(raw), why).toThrow(TradeError);
  });
});

describe("Tausch: Angebot und Ausführung", () => {
  const a = createItem(weapon.id, "rare", "a");
  const b = createItem(armor.id, "epic", "b");
  const c = createItem(weapon.id, "common", "c");
  const inventory: OwnedItem[] = [a, b];

  it("Angebot muss im Inventar liegen, genau so wie angeboten", () => {
    expect(checkOffer(inventory, [a, b])).toEqual([a, b]);
    expect(() => checkOffer(inventory, [c])).toThrow(/nicht mehr im Inventar/);
    expect(() => checkOffer(inventory, [{ ...a, upgrade: 2 }])).toThrow(/nicht mehr im Inventar/);
    expect(() => checkOffer(inventory, [a, a])).toThrow(/doppelt/);
  });

  it("höchstens so viele Items wie erlaubt", () => {
    const many = Array.from({ length: TRADE_MAX_ITEMS + 1 }, (_, i) => createItem(weapon.id, "common", `m${i}`));
    expect(() => checkOffer(many, many)).toThrow(/Höchstens/);
    expect(checkOffer(many, many.slice(0, TRADE_MAX_ITEMS))).toHaveLength(TRADE_MAX_ITEMS);
  });

  it("Reihenfolge der Boni spielt keine Rolle", () => {
    const item = createItem(weapon.id, "legendary", "order");
    const reversed = { ...item, bonuses: Object.fromEntries(Object.entries(item.bonuses).reverse()) };
    expect(sameItem(item, reversed)).toBe(true);
  });

  it("abgegebene Items gehen weg, erhaltene kommen dazu", () => {
    const after = applyTrade(inventory, [a], [c]);
    expect(after.map((i) => i.uid)).toEqual(["b", "c"]);
    expect(() => applyTrade([b], [a], [c])).toThrow(TradeError);
  });

  it("ein schon erhaltenes Item kommt nicht doppelt ins Inventar", () => {
    expect(applyTrade([b, c], [b], [c]).map((i) => i.uid)).toEqual(["c"]);
  });
});
