// Gebiete und Kreaturen. Jedes Gebiet deckt 10 Level ab und hat vier
// Kreaturen plus einen Boss. Die Kampfwerte werden aus Level und Boss-Status
// berechnet, damit die Balance an einer Stelle angepasst werden kann.

import { xpForNextLevel } from "./leveling";
import type { Rarity } from "./types";

export interface CreatureDef {
  id: string;
  name: string;
  /** Schlüssel der Pixel-Grafik in src/game/creatureSprites.ts */
  sprite: string;
  level: number;
  boss: boolean;
  /** Faktor auf Lebenspunkte und Schaden – Dungeon-Gegner sind stärker (Standard 1) */
  power?: number;
}

export interface AreaDef {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  maxLevel: number;
  /** Hintergrundfarbe der Kampfszene (Himmel, Boden). */
  colors: { sky: number; ground: number };
  creatures: readonly CreatureDef[];
  /** Dungeon: Gegner nacheinander, ohne Heilung dazwischen, Boss am Ende */
  dungeon?: boolean;
}

const c = (id: string, name: string, sprite: string, level: number, boss = false): CreatureDef => ({
  id, name, sprite, level, boss,
});

/** Dungeon-Gegner: wie `c`, aber mit Stärke-Faktor. */
const d = (id: string, name: string, sprite: string, level: number, power: number, boss = false): CreatureDef => ({
  id, name, sprite, level, boss, power,
});

export const AREAS: readonly AreaDef[] = [
  {
    id: "darkwood",
    name: "Düsterwald",
    description: "Ein dichter, finsterer Wald am Rand der bekannten Welt.",
    minLevel: 1,
    maxLevel: 10,
    colors: { sky: 0x1d2b22, ground: 0x2f4a2a },
    creatures: [
      c("giant-rat", "Riesenratte", "rat", 1),
      c("grey-wolf", "Grauwolf", "wolf", 3),
      c("forest-spider", "Waldspinne", "spider", 5),
      c("goblin-raider", "Goblin-Plünderer", "goblin", 7),
      c("goblin-chief", "Goblinhäuptling Krummzahn", "goblin-chief", 10, true),
    ],
  },
  {
    id: "mistmarsh",
    name: "Nebelsümpfe",
    description: "Modrige Sümpfe, in denen der Nebel nie ganz verschwindet.",
    minLevel: 11,
    maxLevel: 20,
    colors: { sky: 0x26302e, ground: 0x3b4a32 },
    creatures: [
      c("marsh-toad", "Sumpfkröte", "toad", 11),
      c("bog-serpent", "Moorschlange", "snake", 13),
      c("bog-corpse", "Moorleiche", "zombie", 15),
      c("blood-swarm", "Blutmückenschwarm", "mosquitoes", 17),
      c("ancient-lizard", "Uralte Sumpfechse", "swamp-lizard", 20, true),
    ],
  },
  {
    id: "crystal-caves",
    name: "Kristallhöhlen",
    description: "Leuchtende Höhlen tief unter den Bergen.",
    minLevel: 21,
    maxLevel: 30,
    colors: { sky: 0x1b1a33, ground: 0x34305a },
    creatures: [
      c("cave-bat", "Höhlenfledermaus", "bat", 21),
      c("stone-golem", "Steingolem", "golem", 23),
      c("crystal-scorpion", "Kristallskorpion", "scorpion", 25),
      c("rock-worm", "Felswurm", "worm", 27),
      c("cave-eye", "Das Höhlenauge", "eye", 30, true),
    ],
  },
  {
    id: "frost-peaks",
    name: "Frostgipfel",
    description: "Eisige Höhen, auf denen nur die Zähesten überleben.",
    minLevel: 31,
    maxLevel: 40,
    colors: { sky: 0x2a3a52, ground: 0xc8d6e5 },
    creatures: [
      c("ice-bear", "Eisbär", "ice-bear", 31),
      c("frost-elemental", "Frostelementar", "frost-elemental", 33),
      c("snow-wolf", "Schneewolf", "snow-wolf", 35),
      c("frost-troll", "Frosttroll", "troll", 37),
      c("primal-mammoth", "Urmammut Graufrost", "mammoth", 40, true),
    ],
  },
  {
    id: "shadow-ruins",
    name: "Schattenruinen",
    description: "Die Trümmer eines gefallenen Reiches – heute Heimat der Untoten.",
    minLevel: 41,
    maxLevel: 50,
    colors: { sky: 0x1a1024, ground: 0x3a2d40 },
    creatures: [
      c("skeleton-warrior", "Skelettkrieger", "skeleton", 41),
      c("wailing-ghost", "Klagegeist", "ghost", 43),
      c("bloodsucker", "Blutsauger", "vampire", 45),
      c("dark-sorcerer", "Dunkler Hexer", "sorcerer", 47),
      c("lich-king", "Der Lichkönig", "lich", 50, true),
    ],
  },
  {
    id: "dragon-hoard",
    name: "Drachenhort",
    description: "Vulkanische Hallen voller Gold – und voller Feuer.",
    minLevel: 51,
    maxLevel: 60,
    colors: { sky: 0x2d0f0f, ground: 0x5a2416 },
    creatures: [
      c("fire-salamander", "Feuersalamander", "salamander", 51),
      c("flame-elemental", "Flammenelementar", "flame-elemental", 53),
      c("young-dragon", "Jungdrache", "dragon", 56),
      c("demon-guard", "Dämonenwächter", "demon", 58),
      c("ignaroth", "Uralter Drache Ignaroth", "ancient-dragon", 60, true),
    ],
  },
];

/**
 * Stärke der Dungeon-Gegner gegenüber normalen Kreaturen gleichen Levels.
 * Die Bosse sind schon als Boss deutlich stärker, stehen 2 Level über dem
 * Mindest-Level und haben eine Fähigkeit – sie werden daher leicht abgeschwächt,
 * damit man sie auch nach drei Kämpfen ohne Heilung noch schaffen kann.
 */
const DUNGEON_POWER = 1.2;
const ABYSS_POWER = 1.3;
const DUNGEON_BOSS_POWER = 0.9;
const ABYSS_BOSS_POWER = 1;

/**
 * Dungeons: mehrere Gegner hintereinander, zwischen den Kämpfen keine Heilung,
 * am Ende ein Boss mit eigener Fähigkeit und einzigartiger Beute.
 */
export const DUNGEONS: readonly AreaDef[] = [
  {
    id: "abandoned-mine",
    name: "Verlassene Mine",
    description: "Stollen voller Erz – und voller Dinge, die im Dunkeln hausen.",
    minLevel: 10,
    maxLevel: 12,
    dungeon: true,
    colors: { sky: 0x1a1612, ground: 0x3a2e22 },
    creatures: [
      d("mine-rat", "Minenratte", "mine-rat", 10, DUNGEON_POWER),
      d("kobold-blaster", "Kobold-Sprengmeister", "kobold", 11, DUNGEON_POWER),
      d("pit-spider", "Grubenspinne", "pit-spider", 11, DUNGEON_POWER),
      d("ore-king", "Erzkönig Grimmbart", "ore-king", 12, DUNGEON_BOSS_POWER, true),
    ],
  },
  {
    id: "sunken-temple",
    name: "Versunkener Tempel",
    description: "Ein Tempel im Wüstensand, bewacht von Priestern, die nie gestorben sind.",
    minLevel: 25,
    maxLevel: 27,
    dungeon: true,
    colors: { sky: 0x3a2a14, ground: 0x8a6a3a },
    creatures: [
      d("temple-guardian", "Tempelwächter", "temple-guardian", 25, DUNGEON_POWER),
      d("cobra-priest", "Kobra-Priester", "cobra-priest", 26, DUNGEON_POWER),
      d("mummy", "Mumie", "mummy", 26, DUNGEON_POWER),
      d("high-priestess", "Hohepriesterin Neferet", "high-priestess", 27, DUNGEON_BOSS_POWER, true),
    ],
  },
  {
    id: "storm-tower",
    name: "Gewitterturm",
    description: "Ein Turm über den Wolken, in dem ein Sturm gefangen ist.",
    minLevel: 40,
    maxLevel: 42,
    dungeon: true,
    colors: { sky: 0x141e36, ground: 0x3a4258 },
    creatures: [
      d("thunder-elemental", "Gewitterelementar", "thunder-elemental", 40, DUNGEON_POWER),
      d("stone-gargoyle", "Steingargoyle", "gargoyle", 41, DUNGEON_POWER),
      d("lightning-caller", "Blitzbeschwörer", "lightning-caller", 41, DUNGEON_POWER),
      d("storm-lord", "Sturmfürst Kaelthar", "storm-lord", 42, DUNGEON_BOSS_POWER, true),
    ],
  },
  {
    id: "void-abyss",
    name: "Abgrund der Leere",
    description: "Wo die Welt endet, wartet etwas, das sie verschlingen will.",
    minLevel: 60,
    maxLevel: 60,
    dungeon: true,
    colors: { sky: 0x0e0816, ground: 0x2a1a40 },
    creatures: [
      d("void-crawler", "Leerenkriecher", "void-crawler", 60, ABYSS_POWER),
      d("shadow-demon", "Schattendämon", "shadow-demon", 60, ABYSS_POWER),
      d("soul-eater", "Seelenfresser", "soul-eater", 60, ABYSS_POWER),
      d("void-lord", "Leerenfürst Xal'Zar", "void-lord", 60, ABYSS_BOSS_POWER, true),
    ],
  },
];

export interface CreatureStats {
  maxHp: number;
  /** Grundschaden pro Treffer (vor Rüstung und Streuung). */
  damage: number;
  armor: number;
  critChance: number;
}

/**
 * Kampfwerte einer Kreatur. Abgestimmt darauf, dass ein Held gleichen Levels
 * mit passender gewöhnlicher Ausrüstung etwa 5–7 Runden braucht und dabei
 * gut die Hälfte seiner Lebenspunkte verliert. Bosse halten deutlich mehr aus.
 */
export function getCreatureStats(creature: CreatureDef): CreatureStats {
  const L = creature.level;
  const power = creature.power ?? 1;
  return {
    maxHp: Math.round((40 + 8 * L) * (creature.boss ? 2.5 : 1) * power),
    damage: (6 + 1.4 * L) * (creature.boss ? 1.4 : 1) * power,
    armor: Math.round(L * 3 * (creature.boss ? 1.3 : 1)),
    critChance: creature.boss ? 0.1 : 0.05,
  };
}

/** Beute: normale Kreaturen droppen manchmal, Bosse immer und eher Seltenes. */
export function getCreatureLoot(creature: CreatureDef): { dropChance: number; weights: Record<Rarity, number> } {
  return creature.boss
    ? { dropChance: 1, weights: { common: 10, rare: 40, epic: 35, legendary: 15 } }
    : { dropChance: 0.35, weights: { common: 58, rare: 30, epic: 10, legendary: 2 } };
}

/**
 * Trank-Beute: normale Kreaturen lassen manchmal einen Trank fallen, Bosse
 * immer zwei. Je höher das Gebiet, desto stärker der Trank.
 */
export function getCreaturePotionDrop(creature: CreatureDef): { chance: number; potionId: string; count: number } {
  const potionId = creature.level <= 20 ? "small" : creature.level <= 40 ? "medium" : "large";
  return creature.boss ? { chance: 1, potionId, count: 2 } : { chance: 0.25, potionId, count: 1 };
}

/**
 * Erfahrung für einen Sieg: 8 % dessen, was auf dem Level der Kreatur bis zum
 * nächsten Level fehlt – Bosse geben das Dreifache. Lv. 1 → 8 XP, Lv. 30 → 66 XP,
 * Boss Lv. 60 → 378 XP. Niederlagen und Fluchten geben nichts.
 */
export function getCreatureXp(creature: CreatureDef): number {
  return Math.round(xpForNextLevel(creature.level) * 0.08 * (creature.boss ? 3 : 1));
}

/**
 * Gold-Beute: normale Kreaturen lassen nur manchmal Gold fallen, Bosse immer.
 * Die Menge streut zwischen 50 % und 150 % des Grundwerts `3 + Level`
 * (Bosse ×4). Lv. 1 → 2–6, Lv. 30 → 17–50, Boss Lv. 60 → 126–378.
 */
export function getCreatureGoldDrop(creature: CreatureDef): { chance: number; min: number; max: number } {
  const base = (3 + creature.level) * (creature.boss ? 4 : 1);
  return { chance: creature.boss ? 1 : 0.4, min: Math.round(base * 0.5), max: Math.round(base * 1.5) };
}

/** Gold für einen Sieg (vor dem Charisma-Bonus) – 0, wenn nichts fällt. */
export function rollCreatureGold(creature: CreatureDef, rng: () => number = Math.random): number {
  const { chance, min, max } = getCreatureGoldDrop(creature);
  if (rng() >= chance) return 0;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Durchschnittliche Gold-Beute, wenn etwas fällt – Grundlage für die Fluchtkosten. */
export function getCreatureGold(creature: CreatureDef): number {
  const { min, max } = getCreatureGoldDrop(creature);
  return Math.round((min + max) / 2);
}

/** Kreatur samt Gebiet bzw. Dungeon, in dem sie lebt. */
export function getCreature(id: string): { creature: CreatureDef; area: AreaDef } {
  for (const area of [...AREAS, ...DUNGEONS]) {
    const creature = area.creatures.find((cr) => cr.id === id);
    if (creature) return { creature, area };
  }
  throw new Error(`Unbekannte Kreatur: ${id}`);
}

export function isAreaUnlocked(area: AreaDef, heroLevel: number): boolean {
  return heroLevel >= area.minLevel;
}

export function getDungeon(id: string): AreaDef {
  const dungeon = DUNGEONS.find((dg) => dg.id === id);
  if (!dungeon) throw new Error(`Unbekannter Dungeon: ${id}`);
  return dungeon;
}
