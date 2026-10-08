import type { Character, StatKey } from "./types";

/** Höchstes erreichbares Level. Auch die Items reichen bis hierhin. */
export const MAX_LEVEL = 60;

/**
 * Grundwert für Belohnungen: Kampf- und Quest-XP rechnen damit. Wächst linear
 * (100 auf Level 1, +25 pro Level) – langsamer als die Level-Kurve, damit
 * spätere Level mehr Siege brauchen.
 */
export function xpRewardBase(level: number): number {
  return 100 + 25 * (level - 1);
}

/** Krümmung der Level-Kurve – je grösser, desto zäher die hohen Level. */
const LEVEL_CURVE = 1.5;

/**
 * Level-Kurve: XP, die nötig sind, um von `level` auf `level + 1` zu kommen.
 * `100 + 25·n + 1.5·n²` mit n = Level − 1: Level 1→2 braucht 100 XP, Level 30
 * 2087, Level 59 6596. Bis Level 60 sind es insgesamt rund 148’800 XP – mit
 * gleichstarken Gegnern anfangs etwa 13 Siege pro Level, gegen Ende über 50.
 */
export function xpForNextLevel(level: number): number {
  const n = level - 1;
  return Math.round(100 + 25 * n + LEVEL_CURVE * n * n);
}

/**
 * Rechnet Gesamt-XP der früheren, linearen Kurve (`100 + 25·n` pro Level) auf
 * die heutige um – gleiches Level, gleicher Anteil am nächsten Level.
 */
export function convertLinearCurveXp(oldTotalXp: number): number {
  let level = 1;
  let remaining = Math.max(0, Math.floor(oldTotalXp));
  while (level < MAX_LEVEL && remaining >= xpRewardBase(level)) {
    remaining -= xpRewardBase(level);
    level++;
  }
  if (level === MAX_LEVEL) return totalXpForLevel(MAX_LEVEL);
  return totalXpForLevel(level) + Math.floor((remaining / xpRewardBase(level)) * xpForNextLevel(level));
}

/** Gesamt-XP, um `level` zu erreichen (Level 1 = 0). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l++) total += xpForNextLevel(l);
  return total;
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

/** Startwert jedes Attributs – tiefer fällt es auch beim Zurücksetzen nicht. */
export const BASE_STAT = 1;

/**
 * Gold für das Zurücksetzen der Attributpunkte: das erste Mal kostenlos, danach
 * 50 × Level × (1 + Level/10) – doppelt so viel wie bei den Skillpunkten. Lv. 20 → 3000.
 */
export function attributeResetCost(character: Character): number {
  if ((character.attributeResets ?? 0) === 0) return 0;
  const level = getLevel(character.totalXp);
  return Math.round(50 * level * (1 + level / 10));
}

/** Punkte, die das Zurücksetzen frei machen würde: alles über dem Startwert. */
export function resettablePoints(character: Character): number {
  return Object.values(character.stats).reduce((sum, value) => sum + Math.max(0, value - BASE_STAT), 0);
}

/** Warum die Attributpunkte gerade nicht zurückgesetzt werden können – oder null. */
export function attributeResetBlocker(character: Character): string | null {
  if (resettablePoints(character) === 0) return "Du hast noch keine Punkte verteilt.";
  if (character.gold < attributeResetCost(character)) return "Nicht genug Gold.";
  return null;
}

/**
 * Setzt alle Attribute auf den Startwert zurück – jeder Punkt darüber wird frei,
 * auch die, die früher epische Quests gaben. Dafür sinkt `spentPoints` um alle
 * frei gewordenen Punkte und kann negativ werden: `unspentPoints` zählt sie dann mit.
 */
export function resetAttributes(character: Character): Character {
  const blocker = attributeResetBlocker(character);
  if (blocker) throw new Error(blocker);
  return {
    ...character,
    gold: character.gold - attributeResetCost(character),
    stats: { strength: BASE_STAT, intellect: BASE_STAT, endurance: BASE_STAT, charisma: BASE_STAT },
    spentPoints: character.spentPoints - resettablePoints(character),
    attributeResets: (character.attributeResets ?? 0) + 1,
  };
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
