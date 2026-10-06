import { streakBonus } from "./recurrence";
import type { Category, Effort, Reward, StatKey } from "./types";

export interface EffortTier {
  key: Effort;
  label: string;
  duration: string;
  xp: number;
  gold: number;
  /** Attributpunkte – nur epische Quests geben welche, der Rest kommt aus Level-ups. */
  statPoints: number;
  /** Attributpunkte als Bonusquest */
  bonusStatPoints: number;
  /** Aufgefüllte Kampfpunkte – je länger die Quest, desto mehr */
  battlePoints: number;
  /** Wahrscheinlichkeit (0..1), dass beim Abschluss ein Item droppt. */
  dropChance: number;
}

/**
 * Belohnungstabelle nach Zeitaufwand.
 * Längere Quests geben leicht überproportional mehr, damit sich grosse
 * Aufgaben lohnen und nicht in viele Mini-Tasks zerstückelt werden.
 */
export const EFFORT_TIERS: readonly EffortTier[] = [
  { key: "quick", label: "Schnell", duration: "≤ 15 Min", xp: 10, gold: 2, statPoints: 0, bonusStatPoints: 0, battlePoints: 1, dropChance: 0.05 },
  { key: "short", label: "Kurz", duration: "~ 30 Min", xp: 25, gold: 5, statPoints: 0, bonusStatPoints: 0, battlePoints: 2, dropChance: 0.12 },
  { key: "medium", label: "Mittel", duration: "~ 1 Std", xp: 55, gold: 12, statPoints: 0, bonusStatPoints: 0, battlePoints: 3, dropChance: 0.25 },
  { key: "long", label: "Lang", duration: "~ 2 Std", xp: 120, gold: 25, statPoints: 0, bonusStatPoints: 0, battlePoints: 4, dropChance: 0.45 },
  { key: "epic", label: "Episch", duration: "4+ Std", xp: 260, gold: 55, statPoints: 1, bonusStatPoints: 2, battlePoints: 6, dropChance: 0.75 },
];

export interface CategoryInfo {
  key: Category;
  label: string;
  stat: StatKey;
  icon: string;
}

export const CATEGORIES: readonly CategoryInfo[] = [
  { key: "body", label: "Körper", stat: "strength", icon: "⚔️" },
  { key: "mind", label: "Geist", stat: "intellect", icon: "📜" },
  { key: "daily", label: "Alltag", stat: "endurance", icon: "🛡️" },
  { key: "social", label: "Sozial", stat: "charisma", icon: "🎭" },
];

export const STAT_LABELS: Record<StatKey, string> = {
  strength: "Stärke",
  intellect: "Intelligenz",
  endurance: "Ausdauer",
  charisma: "Charisma",
};

export function getEffortTier(effort: Effort): EffortTier {
  const tier = EFFORT_TIERS.find((t) => t.key === effort);
  if (!tier) throw new Error(`Unbekannter Aufwand: ${effort}`);
  return tier;
}

export function getCategory(category: Category): CategoryInfo {
  const info = CATEGORIES.find((c) => c.key === category);
  if (!info) throw new Error(`Unbekannte Kategorie: ${category}`);
  return info;
}

/** Bonusquests geben 50 % mehr XP, Gold und Drop-Chance (epische auch mehr Attributpunkte). */
export const BONUS_MULTIPLIER = 1.5;

/**
 * Berechnet die Belohnung für eine Quest. Bei wiederkehrenden Quests gibt
 * die Serie (`streak`) zusätzlich bis zu +50 % XP und Gold.
 * Reine Funktion → kann 1:1 auf den Server wandern (Anti-Cheat).
 */
export function calculateReward(effort: Effort, category: Category, bonus = false, streak = 0): Reward {
  const tier = getEffortTier(effort);
  const factor = (bonus ? BONUS_MULTIPLIER : 1) * (1 + streakBonus(streak));
  return {
    xp: Math.round(tier.xp * factor),
    gold: Math.round(tier.gold * factor),
    stat: getCategory(category).stat,
    statPoints: bonus ? tier.bonusStatPoints : tier.statPoints,
    battlePoints: tier.battlePoints,
    ...(streak > 0 && { streak }),
  };
}

/** Chance (0..1) auf einen Item-Drop beim Abschluss. */
export function dropChance(effort: Effort, bonus = false): number {
  const chance = getEffortTier(effort).dropChance;
  return bonus ? Math.min(1, chance * BONUS_MULTIPLIER) : chance;
}
