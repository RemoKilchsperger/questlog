// Name eines Bosses – egal ob Gebiets-, Dungeon- oder Koop-Boss. Koop-Bosse
// wohnen in keinem Gebiet, deshalb reicht getCreature allein nicht.

import { COOP_BOSSES } from "./coopCombat";
import { getCreature } from "./creatures";

export function bossName(bossId: string): string {
  return COOP_BOSSES.find((b) => b.id === bossId)?.name ?? getCreature(bossId).creature.name;
}

/** Ist das ein Koop-Boss (Raid-Beute)? */
export function isCoopBoss(bossId: string): boolean {
  return COOP_BOSSES.some((b) => b.id === bossId);
}
