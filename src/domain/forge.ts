// Schmied: zerlegt Items ab der Seltenheit "selten" in Essenz, verbessert
// mit Essenz den Hauptwert von Waffen (Angriff) und Rüstungen (Rüstung) und
// schmiedet neue Items auf Heldenlevel.
// Essenz ist bewusst knapp: Verbesserungen und neue Items kosten ein
// Vielfaches dessen, was ein einzelnes zerlegtes Item einbringt.

import { createItem, getItem, ITEMS, MAX_UPGRADE } from "./items";
import { pickFromPool } from "./loot";
import type { ArmorSlot, EquipSlot, Gear, ItemDef, OwnedItem, Rarity } from "./types";

/** Grundkosten einer Verbesserung – wachsen mit Item-Level und Stufe. */
export const UPGRADE_COST_BASE = 5;
/**
 * Gold pro `3 + Item-Level` und Stufe, das eine Verbesserung zusätzlich zur Essenz kostet.
 * Eine wiederkehrende Gold-Senke, die mit dem Level mitwächst: Ausrüstung wird alle paar
 * Level ersetzt und neu verbessert. +1 … +5 kosten zusammen 30 × (3 + Level) – Lv. 30 → 990.
 * Beim Zerlegen gibt es nur Essenz zurück, kein Gold.
 */
export const UPGRADE_GOLD_FACTOR = 2;
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
export function essenceYield(owned: OwnedItem, refundShare = UPGRADE_REFUND): number {
  const refund = Math.floor(investedEssence(owned) * refundShare);
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
export function upgradeCost(owned: OwnedItem, next = (owned.upgrade ?? 0) + 1, discount = 0): number {
  return Math.round(UPGRADE_COST_BASE * (1 + getItem(owned.itemId).requiredLevel / 10) * next * (1 - discount));
}

/**
 * Gold für die Verbesserung auf Stufe `next`: 2 × (3 + Item-Level) × Stufe, mit dem Rabatt der
 * Meisterschmiede. Beispiel Lv.-30-Item: +1 → 66, +5 → 330.
 */
export function upgradeGoldCost(owned: OwnedItem, next = (owned.upgrade ?? 0) + 1, discount = 0): number {
  return Math.round(UPGRADE_GOLD_FACTOR * (3 + getItem(owned.itemId).requiredLevel) * next * (1 - discount));
}

/** Ausbaustufe der Schmiede: höchste Verbesserung, Rabatt und Rückerstattung (village.ts). */
export interface ForgeRules {
  maxUpgrade: number;
  discount: number;
  refund: number;
}

export const DEFAULT_FORGE_RULES: ForgeRules = { maxUpgrade: MAX_UPGRADE, discount: 0, refund: UPGRADE_REFUND };

/** Bisher in dieses Item gesteckte Essenz. */
export function investedEssence(owned: OwnedItem): number {
  let total = 0;
  for (let level = 1; level <= (owned.upgrade ?? 0); level++) total += upgradeCost(owned, level);
  return total;
}

export function canUpgrade(owned: OwnedItem, maxUpgrade = MAX_UPGRADE): boolean {
  return (owned.upgrade ?? 0) < maxUpgrade;
}

/** Verbessert ein Item um eine Stufe – im Inventar oder angelegt. Kostet Essenz und Gold. */
export function upgradeItem(
  gear: Gear,
  wallet: { essence: number; gold: number },
  uid: string,
  rules: ForgeRules = DEFAULT_FORGE_RULES,
): { gear: Gear; essence: number; gold: number } {
  const slot = (Object.keys(gear.equipment) as EquipSlot[]).find((s) => gear.equipment[s]?.uid === uid);
  const owned = slot ? gear.equipment[slot] : gear.inventory.find((i) => i.uid === uid);
  if (!owned) throw new Error("Item nicht gefunden.");
  if (!canUpgrade(owned, rules.maxUpgrade)) {
    throw new Error(
      rules.maxUpgrade < MAX_UPGRADE
        ? `Diese Schmiede verbessert nur bis +${rules.maxUpgrade} – baue sie aus.`
        : `Höchste Stufe (+${MAX_UPGRADE}) bereits erreicht.`,
    );
  }
  const cost = upgradeCost(owned, undefined, rules.discount);
  if (wallet.essence < cost) throw new Error("Nicht genug Essenz.");
  const goldCost = upgradeGoldCost(owned, undefined, rules.discount);
  if (wallet.gold < goldCost) throw new Error("Nicht genug Gold.");
  const upgraded: OwnedItem = { ...owned, upgrade: (owned.upgrade ?? 0) + 1 };
  return {
    gear: slot
      ? { ...gear, equipment: { ...gear.equipment, [slot]: upgraded } }
      : { ...gear, inventory: gear.inventory.map((i) => (i.uid === uid ? upgraded : i)) },
    essence: wallet.essence - cost,
    gold: wallet.gold - goldCost,
  };
}

/* ───────────── Schmieden ───────────── */

/** Was man schmieden lässt: eine Waffe (Typ zufällig) oder ein Rüstungsteil für diesen Platz (Klasse zufällig). */
export type ForgeTarget = "weapon" | ArmorSlot;

/** Gewöhnliche Items gibt es beim Händler – geschmiedet wird erst ab selten. */
export const FORGE_RARITIES: readonly Rarity[] = ["rare", "epic", "legendary"];

/** Ein neues Item kostet so viel wie diese Anzahl gleicher Items beim Zerlegen einbringt. */
export const FORGE_COST_FACTOR = 5;

/**
 * Essenz für ein neues Item dieser Seltenheit auf diesem Level. Beispiel Lv. 30:
 * selten 40, episch 120, legendär 400.
 */
export function forgeCost(rarity: Rarity, level: number, discount = 0): number {
  return Math.round(essenceFor(rarity, level) * FORGE_COST_FACTOR * (1 - discount));
}

/** Items, die geschmiedet werden können: genau auf Heldenlevel, keine Boss-Items. */
export function forgePool(target: ForgeTarget, level: number): ItemDef[] {
  const fits = ITEMS.filter((i) => !i.bossId && (target === "weapon" ? i.kind === "weapon" : i.type === target));
  const exact = fits.filter((i) => i.requiredLevel === level);
  if (exact.length > 0) return exact;
  // Nicht jedes Level hat jeden Typ – dann das höchste darunter
  const best = Math.max(...fits.filter((i) => i.requiredLevel <= level).map((i) => i.requiredLevel));
  return fits.filter((i) => i.requiredLevel === best);
}

/** Schmiedet ein neues Item ins Inventar. */
export function forgeItem(
  inventory: readonly OwnedItem[],
  essence: number,
  target: ForgeTarget,
  rarity: Rarity,
  level: number,
  uid: string,
  discount = 0,
  rng: () => number = Math.random,
): { inventory: OwnedItem[]; essence: number; item: OwnedItem } {
  if (!FORGE_RARITIES.includes(rarity)) throw new Error("Der Schmied schmiedet erst ab der Seltenheit „selten“.");
  const cost = forgeCost(rarity, level, discount);
  if (essence < cost) throw new Error("Nicht genug Essenz.");
  const def = pickFromPool(forgePool(target, level), rng);
  const item = createItem(def.id, rarity, uid, rng);
  return { inventory: [...inventory, item], essence: essence - cost, item };
}

/** Zerlegt ein Item aus dem Inventar (angelegte Items zuerst ablegen). */
export function salvageItem(
  gear: Gear,
  essence: number,
  uid: string,
  refund = UPGRADE_REFUND,
): { gear: Gear; essence: number } {
  const owned = gear.inventory.find((i) => i.uid === uid);
  if (!owned) throw new Error("Item ist nicht im Inventar.");
  if (!canSalvage(owned)) throw new Error("Erst Items ab der Seltenheit „selten“ lassen sich zerlegen.");
  return {
    gear: { ...gear, inventory: gear.inventory.filter((i) => i.uid !== uid) },
    essence: essence + essenceYield(owned, refund),
  };
}
