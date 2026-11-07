// Rudel-Kämpfe: Manchmal kommt in einem Gebiet statt eines einzelnen Gegners ein
// Rudel aus drei schwächeren Artgenossen. Gewonnen ist erst, wenn alle liegen –
// Zielwahl und Flächen-Fähigkeiten werden wichtig. Siehe docs/rudel-kaempfe.md.
//
// Im Kampf ist das erste Tier der Gegner (`BattleState.enemy`), die beiden anderen
// kämpfen als Begleiter mit. Anders als beim Boss geht der Kampf weiter, wenn das
// erste Tier fällt (`BattleState.pack`, combat.ts).

import type { BattleReward } from "./combat";
import { getCreature, getCreatureLoot, type BossAdd, type CreatureDef } from "./creatures";
import { rollDrop } from "./loot";

/** Chance pro Kampf gegen eine gewöhnliche Kreatur im Gebiet. */
export const PACK_CHANCE = 0.07;
/** So viele Tiere hat ein Rudel – das erste ist der Gegner, die übrigen kämpfen als Begleiter mit. */
export const PACK_SIZE = 3;
/** Jedes Tier hat diesen Anteil der Lebenspunkte und des Schadens eines einzelnen Gegners. */
export const PACK_MEMBER = { hp: 0.4, damage: 0.4 };
/** Mehr Erfahrung und Gold als ein einzelner Gegner – das Rudel ist zusammen stärker. */
export const PACK_REWARD_FACTOR = 1.4;
/** Faktor auf die Chance, dass ein Item fällt. */
export const PACK_LOOT_FACTOR = 1.5;

/** Kann diese Kreatur im Rudel kommen? Jede gewöhnliche Kreatur der Gebiete – keine Bosse, Dungeon-Gegner oder Mimics. */
export function canBePack(creatureId: string): boolean {
  const { creature, area } = getCreature(creatureId);
  // Mimics stehen nicht in der Liste der Kreaturen ihres Gebiets
  return !creature.boss && !area.dungeon && area.creatures.some((c) => c.id === creatureId);
}

/** Würfelt beim Kampfbeginn, ob statt der Kreatur ein Rudel kommt. */
export function rollPack(creatureId: string, rng: () => number = Math.random): boolean {
  return canBePack(creatureId) && rng() < PACK_CHANCE;
}

/** Die Artgenossen des ersten Tiers – sie kämpfen als Begleiter mit. */
export function packAdds(creature: CreatureDef): BossAdd[] {
  return [{ creatureId: creature.id, count: PACK_SIZE - 1, ...PACK_MEMBER }];
}

/**
 * Beute aus der eines einzelnen Gegners (`rollBattleReward` ohne Begleiter): Erfahrung und Gold
 * mal `PACK_REWARD_FACTOR`, dazu ein neuer Beutewurf mit höherer Chance auf ein Item. Die
 * Artgenossen geben nicht noch einmal extra – sie stecken im Faktor.
 */
export function packReward(single: BattleReward, creature: CreatureDef, uid: string, rng: () => number = Math.random): BattleReward {
  const { dropChance, weights } = getCreatureLoot(creature);
  return {
    ...single,
    xp: Math.round(single.xp * PACK_REWARD_FACTOR),
    gold: Math.round(single.gold * PACK_REWARD_FACTOR),
    loot: rollDrop(Math.min(1, dropChance * PACK_LOOT_FACTOR), weights, creature.level, uid, rng),
  };
}
