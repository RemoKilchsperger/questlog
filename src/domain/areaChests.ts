// Truhen nach normalen Kämpfen (docs/dungeon-wege.md, Abschnitt „Truhen in den Gebieten“):
// Nach einem Sieg über eine gewöhnliche Kreatur bleibt selten eine alte Truhe zurück.
// Öffnen oder liegen lassen – und manchmal ist sie ein Mimic, wie im Dungeon.
// Reine Logik – die Truhe steht im Store (`areaChest`), gekämpft wird mit combat.ts.

import { areaMimicId, getCreature, type CreatureDef } from "./creatures";
import { isMimic, MIMIC_CHANCE, type ChestChoice } from "./dungeonPaths";
import type { BattleReward } from "./combat";

/** Chance auf eine Truhe nach einem Sieg über eine gewöhnliche Kreatur in einem Gebiet. */
export const AREA_CHEST_CHANCE = 0.05;

export interface AreaChest {
  /** Die Kreatur, nach deren Sieg die Truhe stand – bestimmt Beute und Level des Mimics */
  creatureId: string;
  /** Steht beim Auftauchen fest, man sieht es aber erst beim Öffnen */
  mimic: boolean;
  /** Echte Truhe geöffnet: der Inhalt (schon gutgeschrieben). Beim Mimic beginnt stattdessen ein Kampf. */
  outcome: { choice: ChestChoice; reward: BattleReward | null } | null;
}

/** Kann nach einem Sieg über diese Kreatur eine Truhe auftauchen? Nicht nach Bossen, Mimics oder im Dungeon. */
export function canDropChest(creatureId: string): boolean {
  const { creature, area } = getCreature(creatureId);
  return !area.dungeon && !creature.boss && !isMimic(creatureId);
}

/** Würfelt nach einem Sieg, ob eine Truhe zurückbleibt – und ob sie zubeisst. */
export function rollAreaChest(creatureId: string, rng: () => number = Math.random): AreaChest | null {
  if (!canDropChest(creatureId) || rng() >= AREA_CHEST_CHANCE) return null;
  return { creatureId, mimic: rng() < MIMIC_CHANCE, outcome: null };
}

/** Der Mimic, der nach einem Sieg über diese Kreatur in der Truhe steckt – auf deren Level. */
export function getAreaMimic(creatureId: string): CreatureDef {
  return getCreature(areaMimicId(creatureId)).creature;
}
