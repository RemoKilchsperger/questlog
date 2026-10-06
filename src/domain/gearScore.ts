// Gear Score: eine Zahl für die Qualität der angelegten Ausrüstung.
// Bewusst aus Item-Level, Seltenheit und Schmied-Stufe berechnet – nicht aus
// Rüstung/Angriff, sonst stünden leichte Rüstungsklassen immer schlechter da.
// Ein Held mit lauter gewöhnlichen Lv.-40-Items hat GS 40.

import { ARMOR_SLOTS, getItem, getRarity, WEAPON_SLOTS } from "./items";
import type { EquipSlot, Equipment, OwnedItem } from "./types";

const SLOTS: readonly EquipSlot[] = [...ARMOR_SLOTS, ...WEAPON_SLOTS];

/** Aufschlag pro Schmied-Stufe auf den Item-Score. */
export const GEAR_SCORE_UPGRADE_STEP = 0.02;

/** Item-Score: Item-Level × Seltenheitsfaktor, plus 2 % pro Schmied-Stufe. */
export function itemScore(owned: OwnedItem): number {
  const def = getItem(owned.itemId);
  const upgrade = owned.upgrade ?? 0;
  return def.requiredLevel * getRarity(owned.rarity).statMultiplier * (1 + GEAR_SCORE_UPGRADE_STEP * upgrade);
}

/**
 * Durchschnitt der Item-Scores über alle 7 Plätze (5 Rüstung + 2 Waffen).
 * Eine Zweihandwaffe zählt doppelt, leere Plätze zählen 0.
 */
export function gearScore(equipment: Equipment): number {
  let total = 0;
  for (const slot of SLOTS) {
    const owned = equipment[slot];
    if (!owned) continue;
    const twoHanded = slot === "weapon1" && getItem(owned.itemId).twoHanded;
    total += itemScore(owned) * (twoHanded ? 2 : 1);
  }
  return Math.round(total / SLOTS.length);
}
