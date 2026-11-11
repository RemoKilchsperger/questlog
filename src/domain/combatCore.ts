// Gemeinsamer Kampfkern für Solo (combat.ts) und Koop (coopCombat.ts).
//
// Hier stehen die Regeln, die in beiden Kämpfen gleich gelten – als reine Funktionen, die
// Werte berechnen. Die Runden-Funktionen (attackRound, resolveRound) übernehmen die
// Ergebnisse in ihren eigenen Zustand und melden sie mit ihren eigenen Ereignissen; so
// bleibt der Kern frei von Solo- oder Koop-Eigenheiten (Ziel-Kennungen, mehrere Helden).
//
// Unterschiede zwischen Solo und Koop werden als Parameter übergeben, nicht als Weiche:
// etwa `own` bei Gift – im Koop stapelt sich nur das eigene Gift, im Solo gibt es nur eines.
//
// Der Umbau geschieht in Etappen; der Golden-Master-Test (combatGolden.test.ts) stellt
// sicher, dass sich dabei kein Kampf verändert.

import { tickStunImmunity } from "./abilities";
import type { ActiveBuff, DamageOverTime } from "./combat";
import { REGEN_SHARE, type EliteAffix } from "./elites";
import { CLERIC_REGEN, type HeroClassId } from "./heroClasses";
import { EFFECT, has as hasEffect, type ItemEffectId } from "./itemEffects";
import { matchupFactor, type DotKind } from "./matchups";
import { bandageHeal, ownDotFactor, ownDotRounds, rotBurst, stackPoison, type SkillRanks } from "./skills";
import { BLESSING, stacks, type BlessingId } from "./tower";

/* ───────────────────────── Runden ablaufen lassen ───────────────────────── */

/** Eine Runde einer zeitlich begrenzten Wirkung ist vorbei. */
export function tickBuff<T extends ActiveBuff>(buff: T | undefined): T | undefined {
  return buff && buff.roundsLeft > 1 ? { ...buff, roundsLeft: buff.roundsLeft - 1 } : undefined;
}

/** Eine Runde einer Markierung (betäubt, eingefroren) ist vorbei. */
export const tickMark = (rounds: number | undefined): number | undefined => (rounds && rounds > 1 ? rounds - 1 : undefined);

/** Was jeder Gegner an Wirkungen tragen kann, die am Rundenende ablaufen. */
export interface TickingEnemyEffects {
  weaken?: ActiveBuff;
  vulnerable?: ActiveBuff;
  stunImmunity?: number;
  dazed?: number;
  chilled?: number;
  shaken?: number;
}

/** Am Rundenende laufen Schwächung, Verwundbarkeit und Betäubungs-Immunität eine Runde ab. */
export function tickEnemyEffects<F extends TickingEnemyEffects>(fx: F): F {
  return {
    ...fx,
    weaken: tickBuff(fx.weaken),
    vulnerable: tickBuff(fx.vulnerable),
    stunImmunity: tickStunImmunity(fx.stunImmunity),
    ...(fx.dazed !== undefined && { dazed: tickMark(fx.dazed) }),
    ...(fx.chilled !== undefined && { chilled: tickMark(fx.chilled) }),
    ...(fx.shaken !== undefined && { shaken: tickMark(fx.shaken) }),
  };
}

/* ───────────────────────── Gift, Feuer, Bluten ───────────────────────── */

/**
 * Gift, Feuer oder Bluten trifft auf ein bestehendes derselben Art: Das mit mehr Schaden pro Runde
 * bleibt. Bei Gleichstand gewinnt das neue – es läuft dann wieder volle Runden.
 */
export const strongerDot = <T extends { damage: number }>(current: T | undefined, next: T): T =>
  current && current.damage > next.damage ? current : next;

export type DotEffects<D extends DamageOverTime> = Partial<Record<DotKind, D>> & { vulnerable?: ActiveBuff };

export interface LayDot<D extends DamageOverTime> {
  /** Gegner – für Schwäche und Resistenz (matchups.ts) */
  creatureId: string;
  kind: DotKind;
  /** Schaden pro Runde vor Schwäche/Resistenz und Skills */
  base: number;
  rounds: number;
  /** Skillränge des Verursachers */
  skills: SkillRanks | undefined;
  /** Lebt der Gegner noch? Nur dann kann das Gift platzen (Fäulnis). */
  alive: boolean;
  /** Gift, auf das sich das neue stapelt: im Solo das vorhandene, im Koop nur das eigene */
  own: DamageOverTime | undefined;
  /** Zusätzliche Felder der neuen Wirkung (im Koop der Verursacher) */
  tag?: Omit<D, keyof DamageOverTime>;
}

export type LayDotResult<F> =
  /** Der Gegner ist immun – nichts passiert */
  | { immune: true }
  /** Die Wirkung liegt (oder ein stärkeres bleibt) */
  | { immune: false; fx: F; burst?: undefined }
  /** Fäulnis: Das Gift ist geplatzt und richtet sofort `burst` Schaden an */
  | { immune: false; fx: F; burst: number };

/**
 * Gift, Feuer oder Bluten auf einen Gegner legen – mit Schwäche/Resistenz; bei Immunität wirkt es nicht.
 * Der Skilltree des Verursachers macht es stärker oder länger, Gift stapelt sich (Schleichendes Gift)
 * und platzt (Fäulnis). Ein schwächeres Feuer, Gift oder Bluten überschreibt kein stärkeres.
 */
export function layDot<D extends DamageOverTime, F extends DotEffects<D>>(fx: F, o: LayDot<D>): LayDotResult<F> {
  const factor = matchupFactor(o.creatureId, o.kind);
  if (factor === 0) return { immune: true };
  const damage = Math.max(1, Math.round(o.base * factor * ownDotFactor(o.skills, o.kind)));
  const length = ownDotRounds(o.skills, o.kind, o.rounds);
  const tagged = (dot: DamageOverTime) => ({ ...dot, ...o.tag }) as D;
  if (o.kind !== "poison") {
    return { immune: false, fx: { ...fx, [o.kind]: strongerDot(fx[o.kind], tagged({ damage, roundsLeft: length })) } };
  }
  const poison = stackPoison(o.skills, o.own, damage, length);
  const burst = rotBurst(o.skills, poison);
  if (burst > 0 && o.alive) {
    const dealt = Math.max(1, Math.round(burst * (1 + (fx.vulnerable?.percent ?? 0))));
    return { immune: false, fx: { ...fx, poison: undefined }, burst: dealt };
  }
  return { immune: false, fx: { ...fx, poison: strongerDot(fx.poison, tagged(poison)) } };
}

/* ───────────────────────── Rundenende ───────────────────────── */

/** Heilung um einen Anteil der maximalen LP – nie über das Maximum. */
export const healShare = (hp: number, maxHp: number, share: number): number =>
  Math.min(maxHp - hp, Math.round(maxHp * share));

/** Elite „Regenerierend“: So viel heilt sich der Gegner am Rundenende – nicht, solange er brennt. */
export function eliteRegen(c: { hp: number; maxHp: number }, elite: readonly EliteAffix[], burning: boolean): number {
  if (!elite.includes("regenerating") || burning) return 0;
  return Math.max(0, healShare(c.hp, c.maxHp, REGEN_SHARE));
}

/** Regeneration des Helden am Rundenende: Kleriker, Item-Effekt „Lebensquell“ und Arkane Heilung. */
export function heroRegenShare(
  heroClass: HeroClassId | null | undefined,
  itemEffects: readonly ItemEffectId[] | undefined,
  renew: ActiveBuff | undefined,
): number {
  return (heroClass === "cleric" ? CLERIC_REGEN : 0) + (hasEffect(itemEffects, "wellspring") ? EFFECT.wellspring : 0) + (renew?.percent ?? 0);
}

/** Notverband: Wer zum ersten Mal unter 30 % fällt, heilt sich einmal pro Kampf – so viel. */
export function bandage(skills: SkillRanks | undefined, hp: number, maxHp: number, used: boolean | undefined): number {
  const share = bandageHeal(skills, hp, maxHp, used);
  return share > 0 ? healShare(hp, maxHp, share) : 0;
}

/** Item-Effekt „Unbeugsam“: einmal pro Kampf mit 1 LP überleben. */
export const canEndure = (itemEffects: readonly ItemEffectId[] | undefined, endured: boolean | undefined): boolean =>
  !endured && hasEffect(itemEffects, "unyielding");

/** Segen „Zweiter Atem“: einmal pro Lauf wieder aufstehen – mit so vielen LP (0: geht nicht). */
export function secondWind(blessings: readonly BlessingId[] | undefined, used: boolean | undefined, maxHp: number): number {
  return !used && stacks(blessings, "secondWind") > 0 ? Math.round(maxHp * BLESSING.secondWind) : 0;
}
