// Item-Drops bei Quests und Kämpfen. Der Zufall kommt über `rng` herein,
// damit die Logik testbar bleibt und später serverseitig laufen kann.

import { createItem, ITEMS, RARITIES } from "./items";
import { dropChance } from "./rewards";
import type { Effort, ItemDef, Loot, Rarity } from "./types";

/**
 * Gewichte der Seltenheitsstufen je Aufwand (gewöhnlich, selten, episch, legendär;
 * Summe 100 = Prozent). Längere Quests droppen nicht nur öfter, sondern auch
 * seltenere Items – epische und legendäre bleiben aber etwas Besonderes.
 */
export const RARITY_WEIGHTS: Record<Effort, Record<Rarity, number>> = {
  quick: { common: 80, rare: 18.5, epic: 1.5, legendary: 0 },
  short: { common: 72, rare: 25, epic: 2.7, legendary: 0.3 },
  medium: { common: 64, rare: 31, epic: 4.5, legendary: 0.5 },
  long: { common: 55, rare: 37, epic: 7, legendary: 1 },
  epic: { common: 42, rare: 43, epic: 12, legendary: 3 },
};

/** Wie viele Level unter dem Helden ein Drop höchstens liegen darf. */
const LOOT_LEVEL_RANGE = 6;

/** Items, die droppen können: sofort tragbar und nicht völlig veraltet. */
export function lootPool(level: number): ItemDef[] {
  const usable = ITEMS.filter((i) => i.requiredLevel <= level);
  const recent = usable.filter((i) => i.requiredLevel > level - LOOT_LEVEL_RANGE);
  return recent.length > 0 ? recent : usable;
}

/**
 * Ein Item aus dem Pool, ausgewogen nach Typ: erst ein Typ (alle gleich
 * wahrscheinlich), bei Rüstung dann eine Klasse, dann ein Item. Sonst kämen
 * Rüstungsteile dreimal so oft wie Waffen, weil es sie in drei Klassen gibt.
 */
export function pickFromPool(pool: readonly ItemDef[], rng: () => number): ItemDef {
  const types = [...new Set(pool.map((i) => i.type))];
  const type = types[Math.floor(rng() * types.length)];
  const ofType = pool.filter((i) => i.type === type);
  const classes = [...new Set(ofType.map((i) => i.armorClass))];
  const armorClass = classes[Math.floor(rng() * classes.length)];
  const candidates = ofType.filter((i) => i.armorClass === armorClass);
  return candidates[Math.floor(rng() * candidates.length)];
}

export function rollRarity(weights: Record<Rarity, number>, rng: () => number): Rarity {
  const total = RARITIES.reduce((sum, r) => sum + weights[r.key], 0);
  let roll = rng() * total;
  for (const { key } of RARITIES) {
    roll -= weights[key];
    if (roll < 0) return key;
  }
  return "common";
}

/** Allgemeiner Item-Drop – genutzt von Quests und Kreaturen. */
export function rollDrop(
  dropChance: number,
  weights: Record<Rarity, number>,
  level: number,
  uid: string,
  rng: () => number = Math.random,
): Loot {
  if (rng() >= dropChance) return null;
  const def = pickFromPool(lootPool(level), rng);
  return createItem(def.id, rollRarity(weights, rng), uid, rng);
}

/** Würfelt aus, ob und was eine Quest droppt. Bonusquests droppen öfter. */
export function rollLoot(
  effort: Effort,
  level: number,
  uid: string,
  rng: () => number = Math.random,
  bonus = false,
): Loot {
  return rollDrop(dropChance(effort, bonus), RARITY_WEIGHTS[effort], level, uid, rng);
}
