// Elite-Gegner: Normale Kreaturen (in Gebieten und Solo-Dungeons, nie Bosse)
// sind manchmal Elite – mit ein oder zwei Modifikatoren, die den Kampf
// verändern. Ob ein Gegner Elite ist, zeigt sich erst beim Kampfbeginn.
// Dafür gibt es doppelte Erfahrung und doppeltes Gold und sicher Beute mit
// besserer Seltenheit.
//
// Die Wirkungen stecken in combat.ts (`attackRound`), hier stehen die Regeln
// und Zahlen.

import type { CreatureDef } from "./creatures";
import { hash, seededRng } from "./random";

export type EliteAffix = "armored" | "giant" | "regenerating" | "raging" | "vampiric" | "poisonous" | "swift" | "explosive";

/** Chance, dass eine normale Kreatur Elite ist. */
export const ELITE_CHANCE = 0.1;
/** Ab diesem Level der Kreatur kann ein Elite-Gegner zwei Modifikatoren haben … */
export const ELITE_DOUBLE_LEVEL = 30;
/** … mit dieser Chance. */
export const ELITE_DOUBLE_CHANCE = 0.25;
/** Elite-Gegner geben so viel mehr Erfahrung und Gold. */
export const ELITE_REWARD_FACTOR = 2;

/** Gepanzert: so viel mehr Rüstung. */
export const ARMORED_BONUS = 1.5;
/** Riesig: so viel mehr Lebenspunkte. */
export const GIANT_BONUS = 0.6;
/** Regenerierend: heilt sich jede Runde um diesen Anteil seiner LP – ausser er brennt. */
export const REGEN_SHARE = 0.08;
/** Rasend: mehr Schaden, unter der Hälfte der LP noch mehr. */
export const RAGE_BONUS = { base: 0.5, low: 1 };
/** Vampirisch: heilt sich um diesen Anteil des Schadens, den er macht. */
export const VAMPIRE_SHARE = 0.5;
/** Giftig: Jeder Treffer vergiftet – Anteil seines Schadens pro Runde, so viele Runden. */
export const POISON = { percent: 0.5, rounds: 3 };
/** Flink: zwei Angriffe pro Runde mit diesem Anteil des Schadens. */
export const SWIFT_SHARE = 0.75;
/** Explosiv: Beim Tod explodiert er mit diesem Vielfachen seines Schadens (Rüstung zählt, Bollwerk blockt). */
export const EXPLOSION_FACTOR = 2;

export interface EliteAffixDef {
  id: EliteAffix;
  name: string;
  icon: string;
  description: string;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

export const ELITE_AFFIXES: readonly EliteAffixDef[] = [
  { id: "armored", name: "Gepanzert", icon: "🪨", description: `${pct(ARMORED_BONUS)} mehr Rüstung.` },
  { id: "giant", name: "Riesig", icon: "🐘", description: `${pct(GIANT_BONUS)} mehr Lebenspunkte.` },
  {
    id: "regenerating",
    name: "Regenerierend",
    icon: "🌿",
    description: `Heilt sich jede Runde um ${pct(REGEN_SHARE)} seiner Lebenspunkte – Feuer stoppt die Heilung.`,
  },
  {
    id: "raging",
    name: "Rasend",
    icon: "💢",
    description: `${pct(RAGE_BONUS.base)} mehr Schaden, unter der Hälfte seiner Lebenspunkte ${pct(RAGE_BONUS.low)}.`,
  },
  { id: "vampiric", name: "Vampirisch", icon: "🧛", description: `Heilt sich um ${pct(VAMPIRE_SHARE)} des Schadens, den er macht.` },
  {
    id: "poisonous",
    name: "Giftig",
    icon: "☠️",
    description: `Jeder Treffer vergiftet dich ${POISON.rounds} Runden lang.`,
  },
  { id: "swift", name: "Flink", icon: "⚡", description: `Greift zweimal pro Runde an, mit je ${pct(SWIFT_SHARE)} des Schadens.` },
  {
    id: "explosive",
    name: "Explosiv",
    icon: "💥",
    description: `Explodiert, wenn er fällt: ${EXPLOSION_FACTOR}-facher Schaden – Bollwerk blockt die Explosion.`,
  },
];

export function getEliteAffix(id: EliteAffix): EliteAffixDef {
  const def = ELITE_AFFIXES.find((a) => a.id === id);
  if (!def) throw new Error(`Unbekannter Elite-Modifikator: ${id}`);
  return def;
}

/**
 * Ist diese Kreatur in diesem Kampf Elite – und mit welchen Modifikatoren? Leer:
 * ein gewöhnlicher Gegner. Bosse sind nie Elite, sie haben eigene Mechaniken.
 */
export function rollElite(creature: CreatureDef, rng: () => number = Math.random): EliteAffix[] {
  if (creature.boss || rng() >= ELITE_CHANCE) return [];
  const count = creature.level >= ELITE_DOUBLE_LEVEL && rng() < ELITE_DOUBLE_CHANCE ? 2 : 1;
  const pool = ELITE_AFFIXES.map((a) => a.id);
  const picked: EliteAffix[] = [];
  while (picked.length < count) {
    const [id] = pool.splice(Math.floor(rng() * pool.length), 1);
    picked.push(id);
  }
  return picked;
}

/** Grundwerte mit Elite-Modifikatoren: Gepanzert und Riesig – die übrigen wirken erst im Kampf. */
export function eliteStats<T extends { maxHp: number; armor: number }>(stats: T, elite: readonly EliteAffix[]): T {
  return {
    ...stats,
    maxHp: Math.round(stats.maxHp * (elite.includes("giant") ? 1 + GIANT_BONUS : 1)),
    armor: Math.round(stats.armor * (elite.includes("armored") ? 1 + ARMORED_BONUS : 1)),
  };
}

/**
 * Elite im Koop-Dungeon: gewürfelt mit einem Startwert aus Durchgang und Kampf – so wissen
 * Server und die Truhe jedes Spielers ohne Speichern, welcher Kampf ein Elite war.
 */
export function coopElite(runId: string, stage: number, creature: CreatureDef): EliteAffix[] {
  return rollElite(creature, seededRng(hash(`${runId}|elite|${stage}`)));
}
