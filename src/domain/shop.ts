// Händler: ein kleines, wechselndes Angebot. Alle 4 Stunden kommt komplett
// neue, zufällige Ware passend zum Level des Helden – ein Stück ist immer selten,
// mit etwas Glück eines episch. Gekaufte Stücke sind bis zum nächsten Wechsel weg.
// Einmal am Tag kann man gegen Gold sofort neue Ware auswürfeln lassen.

import { dateKey } from "./calendar";
import { createItem, getItem, getRarity } from "./items";
import { lootPool } from "./loot";
import type { Gear, OwnedItem, Rarity } from "./types";

export const SHOP_SIZE = 5;
export const SHOP_ROTATION_HOURS = 4;
/** Chance pro Wechsel, dass zusätzlich zum seltenen ein episches Stück dabei ist. */
export const SHOP_EPIC_CHANCE = 0.04;

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

/**
 * Würfelt neue Ware aus: verschiedene, sofort tragbare Items, genau eines davon
 * selten – und mit 4 % Chance ein weiteres episch.
 */
export function rollShopStock(
  slot: string,
  level: number,
  newUid: () => string,
  rng: () => number = Math.random,
): ShopStock {
  const pool = [...lootPool(level)];
  const count = Math.min(SHOP_SIZE, pool.length);
  // Teilweises Fisher-Yates: die ersten `count` Plätze zufällig belegen.
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Die Reihenfolge ist schon zufällig: Platz 0 wird selten, Platz 1 eventuell episch.
  const epic = rng() < SHOP_EPIC_CHANCE;
  const rarityAt = (i: number): Rarity => (i === 0 ? "rare" : i === 1 && epic ? "epic" : "common");
  const offers = pool.slice(0, count).map((def, i) => createItem(def.id, rarityAt(i), newUid(), rng));
  return { slot, offers };
}

/** Preis fürs vorzeitige Neuauswürfeln – wächst mit dem Level wie die Warenpreise. */
export function rerollCost(level: number): number {
  return Math.round(10 * (1 + (level - 1) * 0.25) * (1 + level / 10));
}

/** Darf heute (noch) neu ausgewürfelt werden? Einmal pro Tag. */
export function canReroll(lastReroll: string, now: Date = new Date()): boolean {
  return lastReroll !== dateKey(now);
}

/** Gegen Gold sofort komplett neue Ware – höchstens einmal pro Tag. Der nächste Wechsel bleibt gleich. */
export function rerollShop(
  gold: number,
  level: number,
  lastReroll: string,
  newUid: () => string,
  now: Date = new Date(),
  rng: () => number = Math.random,
): { stock: ShopStock; gold: number; lastReroll: string } {
  if (!canReroll(lastReroll, now)) throw new Error("Heute wurde schon neu ausgewürfelt.");
  const cost = rerollCost(level);
  if (gold < cost) throw new Error("Nicht genug Gold.");
  return { stock: rollShopStock(shopSlot(now), level, newUid, rng), gold: gold - cost, lastReroll: dateKey(now) };
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
