// Waffen skalieren mit Attributen (Plan: docs/attribut-skalierung.md): Jede Waffe
// bekommt Bonusschaden aus ihrem eigenen Attribut – ein Grosshammer aus Stärke,
// ein Stab aus Intelligenz, ein Bogen aus Charisma. Der Schild skaliert mit
// Ausdauer, auch seine Rüstung.

import { getItem, getItemStats } from "./items";
import type { Equipment, StatKey, Stats, WeaponType } from "./types";

export const WEAPON_STAT: Readonly<Record<WeaponType, StatKey>> = {
  sword: "strength",
  greatsword: "strength",
  axe: "strength",
  greataxe: "strength",
  greathammer: "strength",
  staff: "intellect",
  scepter: "intellect",
  mace: "endurance",
  shield: "endurance",
  dagger: "charisma",
  bow: "charisma",
};

/**
 * Bonusschaden pro Punkt im Attribut der Waffe. Ausdauer gibt weniger, weil sie
 * zugleich Lebenspunkte bringt (per Simulation abgestimmt, docs/attribut-skalierung.md).
 */
export const DAMAGE_PER_POINT: Readonly<Record<StatKey, number>> = {
  strength: 0.25,
  intellect: 0.25,
  endurance: 0.15,
  charisma: 0.25,
};

/** Zusätzliche Rüstung pro Ausdauer-Punkt und angelegtem Schild. */
export const SHIELD_ARMOR_PER_ENDURANCE = 0.1;

export function weaponStat(type: WeaponType): StatKey {
  return WEAPON_STAT[type];
}

/**
 * Bonusschaden aus Attributen. Bei zwei Waffen zählt jede nach ihrem Anteil am
 * Angriff mit ihrem Attribut – mit lauter Stärke-Waffen also genau
 * `0,25 · Stärke`. Ohne Waffe zählt Stärke.
 */
export function attributeDamage(stats: Stats, equipment: Equipment): number {
  const weapons = [equipment.weapon1, equipment.weapon2]
    .filter((o) => o !== null)
    .map((o) => ({ stat: weaponStat(getItem(o.itemId).type as WeaponType), attack: getItemStats(o).attack }));
  const total = weapons.reduce((sum, w) => sum + w.attack, 0);
  if (total <= 0) return stats.strength * DAMAGE_PER_POINT.strength;
  return weapons.reduce((sum, w) => sum + (w.attack / total) * stats[w.stat] * DAMAGE_PER_POINT[w.stat], 0);
}

/** Zusätzliche Rüstung angelegter Schilde aus Ausdauer. */
export function shieldArmorBonus(stats: Stats, equipment: Equipment): number {
  const shields = [equipment.weapon1, equipment.weapon2].filter((o) => o !== null && getItem(o.itemId).type === "shield").length;
  return Math.round(shields * stats.endurance * SHIELD_ARMOR_PER_ENDURANCE);
}
