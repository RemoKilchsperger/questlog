// Schatzkarten (docs/schatzkarten.md): Jeder Sieg hat eine sehr kleine Chance auf eine Karte.
// Sie zeigt einen verborgenen Raum in einem Solo-Dungeon – an der ersten Gabelung hinter dem
// Zwischenboss. Darin liegt garantiert ein legendäres Item auf Heldenlevel oder ein Schatz-Rezept.
// Reine Logik – die Karten stehen im Store (`treasureMaps`), der Raum im Dungeon-Lauf.

import { DUNGEONS, isAreaUnlocked, type AreaDef } from "./creatures";
import { FOODS } from "./food";
import { createItem } from "./items";
import { lootPool, pickFromPool } from "./loot";
import type { OwnedItem } from "./types";

export interface TreasureMap {
  id: string;
  /** Dungeon, in dem der verborgene Raum liegt */
  dungeonId: string;
  /** Wann die Karte gefunden wurde (ms) */
  found: number;
}

/** Chance pro Sieg über einen gewöhnlichen Gegner … */
export const MAP_CHANCE = 0.004;
/** … und über Elite, Zwischen- und Endbosse sowie im Koop */
export const MAP_CHANCE_STRONG = 0.02;
/** Mehr Karten trägt man nicht mit sich – erst eine einlösen */
export const MAX_MAPS = 3;
/** Chance auf ein Rezept statt eines Items, solange man nicht alle Schatz-Rezepte kennt */
export const RECIPE_CHANCE = 0.25;

/** Rezepte, die es nur in einem Schatzraum gibt (food.ts, `treasure`). */
export const TREASURE_RECIPES: readonly string[] = FOODS.filter((f) => f.treasure).map((f) => f.id);

/**
 * Fällt nach einem Sieg eine Karte? Sie führt in einen offenen Dungeon, für den man noch keine
 * Karte hat. `strong`: Elite, Boss oder Koop-Sieg.
 */
export function rollTreasureMap(
  maps: readonly TreasureMap[],
  heroLevel: number,
  strong: boolean,
  id: string,
  now: number,
  rng: () => number = Math.random,
): TreasureMap | null {
  if (maps.length >= MAX_MAPS) return null;
  if (rng() >= (strong ? MAP_CHANCE_STRONG : MAP_CHANCE)) return null;
  const open = DUNGEONS.filter((d) => isAreaUnlocked(d, heroLevel) && !maps.some((m) => m.dungeonId === d.id));
  if (open.length === 0) return null;
  return { id, dungeonId: open[Math.floor(rng() * open.length)].id, found: now };
}

/** Schritt mit der Tür zum Schatzraum: die erste Gabelung hinter dem Zwischenboss. */
export function treasureStep(dungeon: AreaDef): number {
  return dungeon.creatures.findIndex((c) => c.midBoss) + 1;
}

export type TreasureFind = { kind: "item"; item: OwnedItem } | { kind: "recipe"; foodId: string };

/** Was im Schatzraum liegt: ein legendäres Item auf Heldenlevel oder ein noch unbekanntes Schatz-Rezept. */
export function rollTreasure(heroLevel: number, recipes: readonly string[], uid: string, rng: () => number = Math.random): TreasureFind {
  const unknown = TREASURE_RECIPES.filter((id) => !recipes.includes(id));
  if (unknown.length > 0 && rng() < RECIPE_CHANCE) return { kind: "recipe", foodId: unknown[Math.floor(rng() * unknown.length)] };
  const def = pickFromPool(lootPool(heroLevel), rng);
  return { kind: "item", item: createItem(def.id, "legendary", uid, rng) };
}
