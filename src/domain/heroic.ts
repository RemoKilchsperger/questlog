// Heroische Bosse: Wer einen Gebiets- oder Dungeon-Boss einmal besiegt hat, kann
// ihn auf einer höheren Stufe erneut fordern. Der heroische Boss hat mehr
// Lebenspunkte und eine Zusatzmechanik – einen festen Elite-Modifikator, der zu
// ihm passt (elites.ts). Dafür lässt er öfter ein Teil seines Sets fallen und
// gibt mehr Erfahrung und Gold. Er zählt nicht als Elite-Gegner (keine
// Elite-Beute, kein „Elitejäger“). Auch im Koop-Dungeon (coopCombat.ts, Anhang
// HEROIC_SUFFIX an der Lobby) – die Raid-Bosse gibt es nicht heroisch.

import type { BattleState } from "./combat";
import { getEliteAffix, type EliteAffix } from "./elites";

/** So viel mehr Lebenspunkte hat ein heroischer Boss. */
export const HEROIC_HP = 1.5;
/** Chance auf ein Boss-Item (normal: BOSS_ITEM_DROP_CHANCE in combat.ts). */
export const HEROIC_BOSS_LOOT_CHANCE = 0.15;
/** Faktor auf Erfahrung und Gold. */
export const HEROIC_REWARD_FACTOR = 1.5;

/** Die Zusatzmechanik jedes heroischen Bosses – passend zu seinem Wesen. */
export const HEROIC_AFFIX: Readonly<Record<string, EliteAffix>> = {
  // Gebietsbosse
  "goblin-chief": "swift",
  "ancient-lizard": "poisonous",
  "cave-eye": "vampiric",
  "primal-mammoth": "armored",
  "lich-king": "regenerating",
  ignaroth: "raging",
  // Dungeon-Bosse
  "ore-king": "explosive",
  "high-priestess": "poisonous",
  "storm-lord": "swift",
  "void-lord": "vampiric",
};

/** Gibt es diesen Boss heroisch? */
export function hasHeroic(bossId: string): boolean {
  return bossId in HEROIC_AFFIX;
}

/** Modifikatoren des heroischen Bosses – für `startBattle`. */
export function heroicAffixes(bossId: string): EliteAffix[] {
  const affix = HEROIC_AFFIX[bossId];
  if (!affix) throw new Error("Diesen Boss gibt es nicht heroisch.");
  return [affix];
}

/** Heroisch freigeschaltet, sobald der Boss einmal besiegt ist. */
export function isHeroicUnlocked(bossId: string, bossesDefeated: readonly string[]): boolean {
  return hasHeroic(bossId) && bossesDefeated.includes(bossId);
}

/** Was den heroischen Boss ausmacht – für Hinweise in der Oberfläche. */
export function heroicDescription(bossId: string): string {
  const affix = getEliteAffix(HEROIC_AFFIX[bossId]);
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  return `Heroisch: +${pct(HEROIC_HP - 1)} Lebenspunkte und ${affix.icon} ${affix.name} (${affix.description}) Dafür ${pct(HEROIC_BOSS_LOOT_CHANCE)} Chance auf ein Set-Teil und ${pct(HEROIC_REWARD_FACTOR - 1)} mehr Erfahrung und Gold.`;
}

/** Macht aus einem begonnenen Bosskampf (mit `heroicAffixes`) den heroischen: mehr Lebenspunkte. */
export function makeHeroic(state: BattleState): BattleState {
  const maxHp = Math.round(state.enemy.maxHp * HEROIC_HP);
  return { ...state, heroic: true, enemy: { ...state.enemy, maxHp, hp: maxHp } };
}
