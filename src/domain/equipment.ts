// Reine Ausrüstungslogik: Anlegen, Ablegen, Verkaufen (Kaufen: siehe shop.ts).
// Alle Funktionen geben einen neuen Zustand zurück und werfen bei ungültigen
// Aktionen einen Fehler – so können sie später 1:1 serverseitig laufen.

import { ARMOR_CLASSES } from "./armorClasses";
import { getSetGearMultiplier, getSetStatBonuses } from "./bossSets";
import { getItem, getItemStats, sellPrice, WEAPON_SLOTS } from "./items";
import type { ArmorClass, CombatStats, EquipSlot, Equipment, Gear, ItemDef, OwnedItem, StatKey, Stats } from "./types";

export const EMPTY_EQUIPMENT: Equipment = {
  head: null,
  chest: null,
  arms: null,
  legs: null,
  feet: null,
  weapon1: null,
  weapon2: null,
};

/**
 * In welche Slots passt dieses Item? Zweihandwaffen liegen immer in
 * „Waffe 1“ und sperren „Waffe 2“.
 */
export function slotsFor(item: ItemDef): EquipSlot[] {
  if (item.kind === "armor") return [item.type as EquipSlot];
  return item.twoHanded ? ["weapon1"] : [...WEAPON_SLOTS];
}

/** Ist „Waffe 2“ durch eine Zweihandwaffe in „Waffe 1“ gesperrt? */
export function isOffHandBlocked(equipment: Equipment): boolean {
  const main = equipment.weapon1;
  return main !== null && getItem(main.itemId).twoHanded;
}

/** Standard-Slot beim Anlegen: Rüstung in ihren Slot, Waffen in die erste freie Hand. */
export function defaultSlot(item: ItemDef, equipment: Equipment): EquipSlot {
  const slots = slotsFor(item);
  return slots.find((s) => equipment[s] === null) ?? slots[0];
}

/**
 * Welche angelegten Items müssen weichen, wenn `item` in `slot` kommt?
 * - Zweihandwaffen verdrängen beide Hände.
 * - Eine Einhandwaffe in „Waffe 2“ verdrängt eine Zweihandwaffe aus „Waffe 1“.
 * - Es darf nur ein Schild getragen werden: ein Schild in der anderen Hand weicht.
 */
export function displacedSlots(item: ItemDef, slot: EquipSlot, equipment: Equipment): EquipSlot[] {
  if (item.kind === "weapon" && item.twoHanded) return ["weapon1", "weapon2"];
  if (slot === "weapon2" && isOffHandBlocked(equipment)) return ["weapon1", "weapon2"];
  if (item.type === "shield") {
    const otherHand: EquipSlot = slot === "weapon1" ? "weapon2" : "weapon1";
    const other = equipment[otherHand];
    if (other && getItem(other.itemId).type === "shield") return [slot, otherHand];
  }
  return [slot];
}

/**
 * Legt ein Item aus dem Inventar an. Belegte Slots werden getauscht:
 * die alten Items wandern zurück ins Inventar.
 */
export function equipItem(gear: Gear, uid: string, level: number, slot?: EquipSlot): Gear {
  const owned = gear.inventory.find((i) => i.uid === uid);
  if (!owned) throw new Error("Item ist nicht im Inventar.");
  const item = getItem(owned.itemId);
  const target = slot ?? defaultSlot(item, gear.equipment);
  if (!slotsFor(item).includes(target)) throw new Error(`${item.name} passt nicht in diesen Slot.`);
  if (level < item.requiredLevel) throw new Error(`${item.name} benötigt Level ${item.requiredLevel}.`);

  const equipment = { ...gear.equipment };
  const returned: OwnedItem[] = [];
  for (const s of displacedSlots(item, target, gear.equipment)) {
    const previous = equipment[s];
    if (previous) returned.push(previous);
    equipment[s] = null;
  }
  equipment[target] = owned;
  return {
    inventory: [...gear.inventory.filter((i) => i.uid !== uid), ...returned],
    equipment,
  };
}

export function unequipItem(gear: Gear, slot: EquipSlot): Gear {
  const owned = gear.equipment[slot];
  if (!owned) return gear;
  return {
    inventory: [...gear.inventory, owned],
    equipment: { ...gear.equipment, [slot]: null },
  };
}

/** Verkauft ein Item aus dem Inventar (angelegte Items zuerst ablegen). */
export function sellItem(gear: Gear, gold: number, uid: string): { gear: Gear; gold: number } {
  const owned = gear.inventory.find((i) => i.uid === uid);
  if (!owned) throw new Error("Item ist nicht im Inventar.");
  return {
    gear: { ...gear, inventory: gear.inventory.filter((i) => i.uid !== uid) },
    gold: gold + sellPrice(owned),
  };
}

/**
 * Rüstung = Summe aller Rüstungsteile, Angriff = Summe beider Waffen –
 * jeweils erhöht um den Set-Bonus (ab 3 Boss-Teilen desselben Bosses).
 */
export function getCombatStats(equipment: Equipment): CombatStats {
  let armor = 0;
  let attack = 0;
  for (const owned of Object.values(equipment)) {
    if (!owned) continue;
    const stats = getItemStats(owned);
    armor += stats.armor;
    attack += stats.attack;
  }
  const factor = getSetGearMultiplier(equipment);
  return { armor: Math.round(armor * factor), attack: Math.round(attack * factor) };
}

/** Was die angelegten Rüstungsklassen bringen: Teile pro Klasse und der Ausgleich leichter Rüstung. */
export interface ArmorClassSummary {
  pieces: Record<ArmorClass, number>;
  /** Zusätzliches Mana-Maximum */
  mana: number;
  /** Zusätzliche kritische Trefferchance (0.03 = +3 %) */
  crit: number;
}

export function getArmorClassSummary(equipment: Equipment): ArmorClassSummary {
  const pieces: Record<ArmorClass, number> = { light: 0, medium: 0, heavy: 0 };
  for (const owned of Object.values(equipment)) {
    const armorClass = owned && getItem(owned.itemId).armorClass;
    if (armorClass) pieces[armorClass]++;
  }
  let mana = 0;
  let crit = 0;
  for (const info of ARMOR_CLASSES) {
    mana += pieces[info.key] * info.manaPerPiece;
    crit += pieces[info.key] * info.critPerPiece;
  }
  return { pieces, mana, crit };
}

/** Summe der Attributboni aller angelegten Items und aktiven Set-Boni. */
export function getStatBonuses(equipment: Equipment): Stats {
  const total = getSetStatBonuses(equipment);
  for (const owned of Object.values(equipment)) {
    if (!owned) continue;
    for (const [stat, value] of Object.entries(owned.bonuses) as [StatKey, number][]) {
      total[stat] += value;
    }
  }
  return total;
}

/** Trainierte Grundwerte + Boni der Ausrüstung. */
export function getEffectiveStats(base: Stats, equipment: Equipment): Stats {
  const bonuses = getStatBonuses(equipment);
  return {
    strength: base.strength + bonuses.strength,
    intellect: base.intellect + bonuses.intellect,
    endurance: base.endurance + bonuses.endurance,
    charisma: base.charisma + bonuses.charisma,
  };
}
