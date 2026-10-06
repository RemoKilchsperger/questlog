// Boss-Sets: Wer mehrere Boss-Items desselben Bosses trägt, bekommt einen
// Set-Bonus in Stufen.
// - Gebietsbosse (5 Teile: 3 Waffen, Helm, Brust): ab 2 Teilen Attributpunkte, ab
//   3 Teilen mehr Angriff und Rüstung (mehr als 4 gleichzeitig geht nie, wegen der
//   Zweihänder oft nur 3).
// - Dungeon- und Koop-Bosse (7 Teile, komplettes Rüstungsset): ab 2 Teilen Attributpunkte,
//   ab 4 Teilen mehr Angriff und Rüstung, ab 6 Teilen mehr Lebenspunkte.

import { getBossItems, getItem } from "./items";
import type { Equipment, StatKey, Stats } from "./types";

export type SetTier =
  /** Attributpunkte (Höhe: siehe `setStatBonus`) auf das Set-Attribut */
  | { pieces: number; kind: "stat" }
  /** Prozent auf Angriff und Rüstung der gesamten Ausrüstung */
  | { pieces: number; kind: "gear"; percent: number }
  /** Prozent auf die maximalen Lebenspunkte */
  | { pieces: number; kind: "hp"; percent: number };

export interface BossSet {
  bossId: string;
  name: string;
  /** Attribut, das die Attribut-Stufe erhöht */
  stat: StatKey;
  tiers: readonly SetTier[];
}

/** Ab so vielen Teilen greifen die Stufen der Gebietsboss-Sets. */
export const SET_STAT_PIECES = 2;
export const SET_GEAR_PIECES = 3;
/** Zusätzlicher Angriff und Rüstung der gesamten Ausrüstung. */
export const SET_GEAR_BONUS = 0.1;

const AREA_TIERS: readonly SetTier[] = [
  { pieces: SET_STAT_PIECES, kind: "stat" },
  { pieces: SET_GEAR_PIECES, kind: "gear", percent: SET_GEAR_BONUS },
];

const DUNGEON_TIERS: readonly SetTier[] = [
  { pieces: 2, kind: "stat" },
  { pieces: 4, kind: "gear", percent: SET_GEAR_BONUS },
  { pieces: 6, kind: "hp", percent: 0.15 },
];

export const BOSS_SETS: readonly BossSet[] = [
  { bossId: "goblin-chief", name: "Krummzahns Kriegsbeute", stat: "strength", tiers: AREA_TIERS },
  { bossId: "ancient-lizard", name: "Erbe der Uralten Echse", stat: "endurance", tiers: AREA_TIERS },
  { bossId: "cave-eye", name: "Gaben des Höhlenauges", stat: "intellect", tiers: AREA_TIERS },
  { bossId: "primal-mammoth", name: "Graufrosts Vermächtnis", stat: "endurance", tiers: AREA_TIERS },
  { bossId: "lich-king", name: "Insignien des Lichkönigs", stat: "intellect", tiers: AREA_TIERS },
  { bossId: "ignaroth", name: "Schatz Ignaroths", stat: "strength", tiers: AREA_TIERS },
  // Dungeons
  { bossId: "ore-king", name: "Rüstung des Erzgräbers", stat: "endurance", tiers: DUNGEON_TIERS },
  { bossId: "high-priestess", name: "Segen der Sonnenpriesterin", stat: "intellect", tiers: DUNGEON_TIERS },
  { bossId: "storm-lord", name: "Zorn des Sturmfürsten", stat: "strength", tiers: DUNGEON_TIERS },
  { bossId: "void-lord", name: "Vermächtnis des Abgrunds", stat: "endurance", tiers: DUNGEON_TIERS },
  // Raid-Sets der Koop-Bosse
  { bossId: "swamp-hydra", name: "Panzer der Sumpfhydra", stat: "endurance", tiers: DUNGEON_TIERS },
  { bossId: "frost-giant", name: "Rüstung des Frostriesen", stat: "strength", tiers: DUNGEON_TIERS },
  { bossId: "world-eater", name: "Erbe des Weltenendes", stat: "intellect", tiers: DUNGEON_TIERS },
];

export function getBossSet(bossId: string): BossSet {
  const set = BOSS_SETS.find((s) => s.bossId === bossId);
  if (!set) throw new Error(`Unbekanntes Boss-Set: ${bossId}`);
  return set;
}

/** Attributpunkte der Attribut-Stufe: die Hälfte des Item-Levels (Lv. 10 → +5, Lv. 60 → +30). */
export function setStatBonus(bossId: string): number {
  return Math.round(getBossItems(bossId)[0].requiredLevel / 2);
}

export interface ActiveSet {
  set: BossSet;
  /** Angelegte Teile dieses Sets */
  pieces: number;
  /** Teile insgesamt */
  total: number;
  /** Erreichte Stufen */
  active: SetTier[];
  statBonus: boolean;
  gearBonus: boolean;
  hpBonus: boolean;
}

/** Alle Sets, von denen mindestens ein Teil angelegt ist. */
export function getActiveSets(equipment: Equipment): ActiveSet[] {
  const counts = new Map<string, number>();
  for (const owned of Object.values(equipment)) {
    const bossId = owned && getItem(owned.itemId).bossId;
    if (bossId) counts.set(bossId, (counts.get(bossId) ?? 0) + 1);
  }
  return [...counts].map(([bossId, pieces]) => {
    const set = getBossSet(bossId);
    const active = set.tiers.filter((t) => pieces >= t.pieces);
    return {
      set,
      pieces,
      total: getBossItems(bossId).length,
      active,
      statBonus: active.some((t) => t.kind === "stat"),
      gearBonus: active.some((t) => t.kind === "gear"),
      hpBonus: active.some((t) => t.kind === "hp"),
    };
  });
}

/** Attributpunkte aus allen aktiven Set-Boni. */
export function getSetStatBonuses(equipment: Equipment): Stats {
  const total: Stats = { strength: 0, intellect: 0, endurance: 0, charisma: 0 };
  for (const active of getActiveSets(equipment)) {
    if (active.statBonus) total[active.set.stat] += setStatBonus(active.set.bossId);
  }
  return total;
}

/** Summe der aktiven Prozent-Boni einer Art. */
function percentBonus(equipment: Equipment, kind: "gear" | "hp"): number {
  let sum = 0;
  for (const { active } of getActiveSets(equipment)) {
    for (const tier of active) if (tier.kind === kind) sum += tier.percent;
  }
  return sum;
}

/** Faktor auf Angriff und Rüstung der Ausrüstung (1 = kein Bonus). */
export function getSetGearMultiplier(equipment: Equipment): number {
  return 1 + percentBonus(equipment, "gear");
}

/** Faktor auf die maximalen Lebenspunkte (1 = kein Bonus). */
export function getSetHpMultiplier(equipment: Equipment): number {
  return 1 + percentBonus(equipment, "hp");
}
