// Seltene Gegner: Mit 1 % Chance erscheint in einem Gebiet statt einer gewöhnlichen
// Kreatur ihre benannte Variante („Silberpelz, der Leitwolf“ statt des Grauwolfs) –
// stärker, mit festen Elite-Modifikatoren, eigener Farbe und sicherer guter Beute.
// Jeder besiegte seltene Gegner kommt in die Sammlung (`records.raresDefeated`).
// Siehe docs/seltene-gegner.md.
//
// Der Kampf läuft wie gegen die Grundkreatur (gleiche Id, zählt für Quests), nur mit
// anderem Namen, mehr Stärke und den Modifikatoren – `BattleState.rare` merkt sich die Variante.

import { rollBattleReward, type BattleReward, type HeroCombatProfile } from "./combat";
import { AREAS, getCreature, type CreatureDef } from "./creatures";
import { ELITE_REWARD_FACTOR, type EliteAffix } from "./elites";
import { rollDrop } from "./loot";

/** Farbvariante im Kampfbild (BattleScene.ts) */
export type RareLook = "silver" | "gold" | "shadow" | "crimson" | "frost" | "jade" | "amethyst";

export interface RareDef {
  id: string;
  /** Die gewöhnliche Kreatur, an deren Stelle er erscheint */
  creatureId: string;
  name: string;
  affixes: readonly EliteAffix[];
  look: RareLook;
}

/** Chance pro Kampf gegen eine gewöhnliche Kreatur im Gebiet. */
export const RARE_CHANCE = 0.01;
/** Faktor auf Lebenspunkte und Schaden – zusätzlich zu den Modifikatoren. */
export const RARE_POWER = 1.3;
/** Mehr Erfahrung und Gold als ein gewöhnlicher Gegner (Elite: 2). */
export const RARE_REWARD_FACTOR = 3;
/** Sicher ein Item, mindestens episch. */
export const RARE_LOOT_WEIGHTS = { common: 0, rare: 0, epic: 75, legendary: 25 };

const rare = (creatureId: string, name: string, look: RareLook, ...affixes: EliteAffix[]): RareDef => ({
  id: `rare-${creatureId}`,
  creatureId,
  name,
  affixes,
  look,
});

/** Einer pro gewöhnlicher Kreatur der Gebiete – in den ersten beiden Gebieten mit einem Modifikator, danach mit zweien. */
export const RARES: readonly RareDef[] = [
  // Düsterwald
  rare("giant-rat", "Rattenkönigin Fettwanst", "gold", "giant"),
  rare("grey-wolf", "Silberpelz, der Leitwolf", "silver", "packLeader"),
  rare("forest-spider", "Weberin Schattenfaden", "shadow", "poisonous"),
  rare("goblin-raider", "Goldzahn, der Plünderer", "gold", "swift"),
  // Nebelsümpfe
  rare("marsh-toad", "Die Goldene Kröte", "gold", "regenerating"),
  rare("bog-serpent", "Moorkönigin Sssira", "jade", "poisonous"),
  rare("bog-corpse", "Der Ertrunkene Ritter", "frost", "armored"),
  rare("blood-swarm", "Die Schwarmmutter", "crimson", "vampiric"),
  // Kristallhöhlen
  rare("cave-bat", "Kristallflügel", "amethyst", "swift", "vampiric"),
  rare("stone-golem", "Edelsteingolem Funkel", "amethyst", "armored", "giant"),
  rare("crystal-scorpion", "Amethyststachel", "amethyst", "poisonous", "armored"),
  rare("rock-worm", "Der Grosse Schlund", "shadow", "giant", "regenerating"),
  // Frostgipfel
  rare("ice-bear", "Weissklaue", "silver", "raging", "giant"),
  rare("frost-elemental", "Ewiges Eis", "frost", "armored", "explosive"),
  rare("snow-wolf", "Mondheuler", "silver", "packLeader", "swift"),
  rare("frost-troll", "Gletscherzahn", "frost", "regenerating", "raging"),
  // Schattenruinen
  rare("skeleton-warrior", "Knochenfürst Morrak", "gold", "armored", "packLeader"),
  rare("wailing-ghost", "Die Weisse Dame", "silver", "vampiric", "swift"),
  rare("bloodsucker", "Graf Sangvin", "crimson", "vampiric", "regenerating"),
  rare("dark-sorcerer", "Zirkelmeister Vex", "jade", "explosive", "raging"),
  // Drachenhort
  rare("fire-salamander", "Glutschuppe", "crimson", "explosive", "swift"),
  rare("flame-elemental", "Herz des Vulkans", "gold", "giant", "explosive"),
  rare("young-dragon", "Rubinschwinge", "crimson", "armored", "raging"),
  rare("demon-guard", "Torwächter Azgor", "shadow", "armored", "vampiric"),
];

const findRare = (id: string) => RARES.find((r) => r.id === id);

export function getRare(id: string): RareDef {
  const def = findRare(id);
  if (!def) throw new Error(`Unbekannter seltener Gegner: ${id}`);
  return def;
}

/** Seltene Variante dieser Kreatur – undefined, wenn sie keine hat (Bosse, Dungeon-Gegner). */
export function rareFor(creatureId: string): RareDef | undefined {
  return RARES.find((r) => r.creatureId === creatureId);
}

/** Würfelt beim Kampfbeginn, ob statt der Kreatur ihre seltene Variante erscheint. */
export function rollRare(creatureId: string, rng: () => number = Math.random): RareDef | null {
  const def = rareFor(creatureId);
  return def && rng() < RARE_CHANCE ? def : null;
}

/** Die Kreatur, gegen die gekämpft wird: Grundkreatur mit neuem Namen und mehr Stärke. */
export function rareCreature(def: RareDef): CreatureDef {
  const { creature } = getCreature(def.creatureId);
  return { ...creature, name: def.name, power: (creature.power ?? 1) * RARE_POWER };
}

/** Beute: wie ein Elite-Gegner, aber dreifache Erfahrung und dreifaches Gold und sicher ein episches oder legendäres Item. */
export function rareReward(def: RareDef, hero: HeroCombatProfile, uid: string, rng: () => number = Math.random): BattleReward {
  const { creature } = getCreature(def.creatureId);
  const elite = rollBattleReward(creature, hero, uid, rng, [], true);
  const factor = RARE_REWARD_FACTOR / ELITE_REWARD_FACTOR;
  return {
    ...elite,
    xp: Math.round(elite.xp * factor),
    gold: Math.round(elite.gold * factor),
    loot: rollDrop(1, RARE_LOOT_WEIGHTS, creature.level, uid, rng),
  };
}

/** Seltene Gegner eines Gebiets, in der Reihenfolge seiner Kreaturen. */
export function areaRares(areaId: string): RareDef[] {
  const area = AREAS.find((a) => a.id === areaId);
  return (area?.creatures ?? []).map((c) => rareFor(c.id)).filter((r) => r !== undefined);
}
