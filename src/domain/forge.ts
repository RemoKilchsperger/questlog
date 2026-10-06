// Schmied: zerlegt Items ab der Seltenheit "selten" in Essenz und verbessert
// mit Essenz den Hauptwert von Waffen (Angriff) und Rüstungen (Rüstung).
// Essenz ist bewusst knapp: Verbesserungen kosten ein Vielfaches dessen,
// was ein einzelnes zerlegtes Item einbringt.

import { getItem, MAX_UPGRADE } from "./items";
import type { EquipSlot, Gear, OwnedItem, Rarity } from "./types";

/** Grundkosten einer Verbesserung – wachsen mit Item-Level und Stufe. */
export const UPGRADE_COST_BASE = 5;
/** Anteil der investierten Essenz, den man beim Zerlegen zurückbekommt. */
export const UPGRADE_REFUND = 0.5;

/** Essenz für ein Item der Stufe 1 – gewöhnliche Items lassen sich nicht zerlegen. */
export const ESSENCE_PER_RARITY: Record<Rarity, number> = {
  common: 0,
  rare: 2,
  epic: 6,
  legendary: 20,
};

export function canSalvage(owned: OwnedItem): boolean {
  return ESSENCE_PER_RARITY[owned.rarity] > 0;
}

/**
 * Essenz aus einem zerlegten Item: Grundwert der Seltenheit, wächst mit dem
 * Item-Level (+10 % pro Level). Beispiel: seltenes Lv. 1 → 2, legendäres Lv. 60 → 140.
 */
export function essenceYield(owned: OwnedItem): number {
  const refund = Math.floor(investedEssence(owned) * UPGRADE_REFUND);
  return essenceFor(owned.rarity, getItem(owned.itemId).requiredLevel) + refund;
}

/** Essenz für ein Item dieser Seltenheit und Stufe (auch für die Übersicht beim Schmied). */
export function essenceFor(rarity: Rarity, requiredLevel: number): number {
  return Math.round(ESSENCE_PER_RARITY[rarity] * (1 + requiredLevel / 10));
}

/**
 * Essenz für die Verbesserung auf Stufe `next`. Beispiel Lv.-30-Item:
 * +1 → 20, +2 → 40 … +5 → 100 (insgesamt 300).
 */
export function upgradeCost(owned: OwnedItem, next = (owned.upgrade ?? 0) + 1): number {
  return Math.round(UPGRADE_COST_BASE * (1 + getItem(owned.itemId).requiredLevel / 10) * next);
}

/** Bisher in dieses Item gesteckte Essenz. */
export function investedEssence(owned: OwnedItem): number {
  let total = 0;
  for (let level = 1; level <= (owned.upgrade ?? 0); level++) total += upgradeCost(owned, level);
  return total;
}

export function canUpgrade(owned: OwnedItem): boolean {
  return (owned.upgrade ?? 0) < MAX_UPGRADE;
}

/** Verbessert ein Item um eine Stufe – im Inventar oder angelegt. */
export function upgradeItem(gear: Gear, essence: number, uid: string): { gear: Gear; essence: number } {
  const slot = (Object.keys(gear.equipment) as EquipSlot[]).find((s) => gear.equipment[s]?.uid === uid);
  const owned = slot ? gear.equipment[slot] : gear.inventory.find((i) => i.uid === uid);
  if (!owned) throw new Error("Item nicht gefunden.");
  if (!canUpgrade(owned)) throw new Error(`Höchste Stufe (+${MAX_UPGRADE}) bereits erreicht.`);
  const cost = upgradeCost(owned);
  if (essence < cost) throw new Error("Nicht genug Essenz.");
  const upgraded: OwnedItem = { ...owned, upgrade: (owned.upgrade ?? 0) + 1 };
  return {
    gear: slot
      ? { ...gear, equipment: { ...gear.equipment, [slot]: upgraded } }
      : { ...gear, inventory: gear.inventory.map((i) => (i.uid === uid ? upgraded : i)) },
    essence: essence - cost,
  };
}

/** Zerlegt ein Item aus dem Inventar (angelegte Items zuerst ablegen). */
export function salvageItem(gear: Gear, essence: number, uid: string): { gear: Gear; essence: number } {
  const owned = gear.inventory.find((i) => i.uid === uid);
  if (!owned) throw new Error("Item ist nicht im Inventar.");
  if (!canSalvage(owned)) throw new Error("Erst Items ab der Seltenheit „selten“ lassen sich zerlegen.");
  return {
    gear: { ...gear, inventory: gear.inventory.filter((i) => i.uid !== uid) },
    essence: essence + essenceYield(owned),
  };
}
