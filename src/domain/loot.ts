// Item-Drops bei Quests und Kämpfen. Der Zufall kommt über `rng` herein,
// damit die Logik testbar bleibt und später serverseitig laufen kann.

import { createItem, ITEMS, RARITIES } from "./items";
import type { ItemDef, Loot, Rarity } from "./types";

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
