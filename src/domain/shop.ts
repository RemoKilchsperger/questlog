// Händler: ein wechselndes Angebot. Alle 4 Stunden kommt komplett neue,
// zufällige Ware passend zum Level des Helden – jedes Stück kann selten, episch
// oder (sehr selten) legendär sein. Gekaufte Stücke sind bis zum nächsten Wechsel
// weg. Bis zu 5-mal am Tag kann man gegen Gold sofort neue Ware auswürfeln lassen.

import { dateKey } from "./calendar";
import { createItem, getItem, getRarity } from "./items";
import { lootPool, pickFromPool } from "./loot";
import type { Gear, OwnedItem, Rarity } from "./types";

export const SHOP_SIZE = 8;
export const SHOP_ROTATION_HOURS = 4;
/** Chance pro Stück auf die jeweilige Seltenheit – der Rest ist gewöhnlich. */
export const SHOP_RARITY_CHANCES: readonly { rarity: Rarity; chance: number }[] = [
  { rarity: "legendary", chance: 0.002 },
  { rarity: "epic", chance: 0.05 },
  { rarity: "rare", chance: 0.2 },
];
/** So oft am Tag darf gegen Gold neu ausgewürfelt werden. */
export const SHOP_REROLLS_PER_DAY = 5;

export interface ShopStock {
  /** Zeitabschnitt, zu dem die Ware gehört (siehe `shopSlot`); "" = noch nie ausgewürfelt */
  slot: string;
  /** Fertig ausgewürfelte Exemplare – beim Kauf wandern sie unverändert ins Inventar. */
  offers: OwnedItem[];
}

export const EMPTY_SHOP: ShopStock = { slot: "", offers: [] };

/** Aktueller 4-Stunden-Abschnitt in Ortszeit, z. B. "2026-10-05#3" (12–16 Uhr). */
export function shopSlot(now: Date = new Date()): string {
  return `${dateKey(now)}#${Math.floor(now.getHours() / SHOP_ROTATION_HOURS)}`;
}

/** Seltenheit eines Stücks: 0,2 % legendär, 5 % episch, 20 % selten, sonst gewöhnlich. */
export function rollShopRarity(rng: () => number = Math.random): Rarity {
  let roll = rng();
  for (const { rarity, chance } of SHOP_RARITY_CHANCES) {
    if (roll < chance) return rarity;
    roll -= chance;
  }
  return "common";
}

/** Würfelt neue Ware aus: verschiedene, sofort tragbare Items, jedes mit eigener Seltenheit. */
export function rollShopStock(
  slot: string,
  level: number,
  newUid: () => string,
  rng: () => number = Math.random,
): ShopStock {
  // Verschiedene Stücke, ausgewogen nach Typ (wie bei der Beute)
  let pool = [...lootPool(level)];
  const picked: typeof pool = [];
  while (picked.length < SHOP_SIZE && pool.length > 0) {
    const def = pickFromPool(pool, rng);
    picked.push(def);
    pool = pool.filter((i) => i.id !== def.id);
  }
  const offers = picked.map((def) => createItem(def.id, rollShopRarity(rng), newUid(), rng));
  return { slot, offers };
}

/** Preis fürs vorzeitige Neuauswürfeln – wächst mit dem Level wie die Warenpreise. */
export function rerollCost(level: number): number {
  return Math.round(10 * (1 + (level - 1) * 0.25) * (1 + level / 10));
}

/** Wie oft heute noch neu ausgewürfelt werden darf. `count` zählt die Würfe am Tag `lastReroll`. */
export function rerollsLeft(lastReroll: string, count: number, now: Date = new Date()): number {
  return lastReroll === dateKey(now) ? Math.max(0, SHOP_REROLLS_PER_DAY - count) : SHOP_REROLLS_PER_DAY;
}

/** Gegen Gold sofort komplett neue Ware – bis zu 5-mal pro Tag. Der nächste Wechsel bleibt gleich. */
export function rerollShop(
  gold: number,
  level: number,
  lastReroll: string,
  count: number,
  newUid: () => string,
  now: Date = new Date(),
  rng: () => number = Math.random,
): { stock: ShopStock; gold: number; lastReroll: string; count: number } {
  const left = rerollsLeft(lastReroll, count, now);
  if (left === 0) throw new Error("Heute wurde schon so oft neu ausgewürfelt.");
  const cost = rerollCost(level);
  if (gold < cost) throw new Error("Nicht genug Gold.");
  return {
    stock: rollShopStock(shopSlot(now), level, newUid, rng),
    gold: gold - cost,
    lastReroll: dateKey(now),
    count: SHOP_REROLLS_PER_DAY - left + 1,
  };
}

/** Kaufpreis eines Exemplars – seltene Stücke kosten entsprechend mehr. */
export function shopPrice(owned: OwnedItem): number {
  return Math.round(getItem(owned.itemId).price * getRarity(owned.rarity).priceMultiplier);
}

export function buyOffer(
  gear: Gear,
  gold: number,
  stock: ShopStock,
  uid: string,
  level: number,
): { gear: Gear; gold: number; stock: ShopStock } {
  const offer = stock.offers.find((o) => o.uid === uid);
  if (!offer) throw new Error("Dieses Angebot gibt es nicht mehr.");
  const item = getItem(offer.itemId);
  if (level < item.requiredLevel) throw new Error(`${item.name} benötigt Level ${item.requiredLevel}.`);
  const price = shopPrice(offer);
  if (gold < price) throw new Error("Nicht genug Gold.");
  return {
    gear: { ...gear, inventory: [...gear.inventory, offer] },
    gold: gold - price,
    stock: { ...stock, offers: stock.offers.filter((o) => o.uid !== uid) },
  };
}
