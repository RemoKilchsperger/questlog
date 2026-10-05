// Item-Drops bei Quests und Kämpfen. Der Zufall kommt über `rng` herein,
// damit die Logik testbar bleibt und später serverseitig laufen kann.

import { createItem, ITEMS, RARITIES } from "./items";
import { dropChance } from "./rewards";
import type { Effort, ItemDef, Loot, Rarity } from "./types";

/**
 * Gewichte der Seltenheitsstufen je Aufwand (gewöhnlich, selten, episch, legendär).
 * Längere Quests droppen nicht nur öfter, sondern auch seltenere Items.
 */
export const RARITY_WEIGHTS: Record<Effort, Record<Rarity, number>> = {
  quick: { common: 80, rare: 17, epic: 3, legendary: 0 },
  short: { common: 70, rare: 24, epic: 5, legendary: 1 },
  medium: { common: 58, rare: 30, epic: 10, legendary: 2 },
  long: { common: 45, rare: 35, epic: 16, legendary: 4 },
  epic: { common: 30, rare: 38, epic: 24, legendary: 8 },
};

/** Wie viele Level unter dem Helden ein Drop höchstens liegen darf. */
const LOOT_LEVEL_RANGE = 6;

/** Items, die droppen können: sofort tragbar und nicht völlig veraltet. */
export function lootPool(level: number): ItemDef[] {
  const usable = ITEMS.filter((i) => i.requiredLevel <= level);
  const recent = usable.filter((i) => i.requiredLevel > level - LOOT_LEVEL_RANGE);
  return recent.length > 0 ? recent : usable;
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
  const pool = lootPool(level);
  const def = pool[Math.floor(rng() * pool.length)];
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
