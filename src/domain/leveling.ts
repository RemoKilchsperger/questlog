import type { Character, StatKey } from "./types";

/** Höchstes erreichbares Level. Auch die Items reichen bis hierhin. */
export const MAX_LEVEL = 60;

/**
 * Level-Kurve: XP, die nötig sind, um von `level` auf `level + 1` zu kommen.
 * Linear: Level 1→2 braucht 100 XP, jedes weitere Level 25 XP mehr
 * (100, 125, 150 … 1550). Bis Level 60 sind es insgesamt rund 48’700 XP –
 * etwa 190 epische oder 890 mittlere Quests.
 */
export function xpForNextLevel(level: number): number {
  return 100 + 25 * (level - 1);
}

export interface LevelProgress {
  level: number;
  /** XP innerhalb des aktuellen Levels */
  xpInLevel: number;
  /** XP, die für das nächste Level gebraucht werden (0 auf dem Maximallevel) */
  xpNeeded: number;
  /** 0..1 */
  ratio: number;
}

/** Leitet Level und Fortschritt aus der Gesamt-XP ab. */
export function getLevelProgress(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < MAX_LEVEL && remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level++;
  }
  if (level === MAX_LEVEL) return { level, xpInLevel: 0, xpNeeded: 0, ratio: 1 };
  const xpNeeded = xpForNextLevel(level);
  return { level, xpInLevel: remaining, xpNeeded, ratio: remaining / xpNeeded };
}

export function getLevel(totalXp: number): number {
  return getLevelProgress(totalXp).level;
}

/** Frei verteilbare Attributpunkte pro Level-up. */
export const POINTS_PER_LEVEL = 2;

/** Noch nicht verteilte Punkte: verdient durch Level-ups minus bereits verteilte. */
export function unspentPoints(character: Character): number {
  return Math.max(0, (getLevel(character.totalXp) - 1) * POINTS_PER_LEVEL - character.spentPoints);
}

/** Verteilt einen Level-up-Punkt auf ein Attribut. */
export function allocatePoint(character: Character, stat: StatKey): Character {
  if (unspentPoints(character) <= 0) throw new Error("Keine Attributpunkte zum Verteilen.");
  return {
    ...character,
    spentPoints: character.spentPoints + 1,
    stats: { ...character.stats, [stat]: character.stats[stat] + 1 },
  };
}
