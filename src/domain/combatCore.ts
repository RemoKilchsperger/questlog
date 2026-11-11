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

import { tickStunImmunity, type Guard } from "./abilities";
import { DRUM_BONUS, DRUM_MAX, RITUAL_HEAL, RITUAL_ROUNDS, SHIELD_EVERY, SHIELD_SHARE, type AddRole } from "./bossMechanics";
import { CURSE_DAMAGE } from "./bossIntents";
import type { ActiveBuff, Combatant, DamageOverTime } from "./combat";
import { POISON, RAGE_BONUS, REGEN_SHARE, SWIFT_SHARE, type EliteAffix } from "./elites";
import { CLERIC_REGEN, type HeroClassId } from "./heroClasses";
import { EFFECT, has as hasEffect, heroDotRounds, type ItemEffectId } from "./itemEffects";
import { matchupFactor, type DotKind } from "./matchups";
import {
  bandageHeal,
  bloodburstDamage,
  defendTaken,
  defendThorns,
  dodgeChance,
  dotTakenFactor,
  ownDotFactor,
  ownDotRounds,
  rotBurst,
  stackPoison,
  type SkillRanks,
} from "./skills";
import { BLESSING, stacks, type BlessingId } from "./tower";

/* ───────────────────────── Treffer ───────────────────────── */

/**
 * Anteil des Schadens, den Rüstung abfängt. Je höher das Level des
 * Angreifers, desto mehr Rüstung braucht es für denselben Schutz.
 */
export function armorReduction(armor: number, attackerLevel: number): number {
  return armor / (armor + 50 + attackerLevel * 10);
}

/** Ein Treffer mit Krit-Chance, Streuung (±15 %) und Rüstung. */
export function rollHit(
  attacker: Combatant,
  defender: Combatant,
  rng: () => number,
  /** Skill „Durchschlag“: Kritische Treffer ignorieren die Rüstung */
  critPierces = false,
): { damage: number; crit: boolean } {
  const crit = rng() < attacker.critChance;
  const spread = 0.85 + rng() * 0.3;
  const armor = crit && critPierces ? 0 : defender.armor;
  const raw = attacker.damage * spread * (1 - armorReduction(armor, attacker.level));
  return { damage: Math.max(1, Math.round(raw * (crit ? (attacker.critMultiplier ?? 1.5) : 1))), crit };
}

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

/* ───────────────────────── Gift, Feuer, Bluten pro Runde ───────────────────────── */

/** Eine Runde Gift/Feuer/Bluten ist vorbei – nach der letzten verschwindet es. */
export function tickDot<D extends DamageOverTime>(effect: D): D | undefined {
  return effect.roundsLeft > 1 ? { ...effect, roundsLeft: effect.roundsLeft - 1 } : undefined;
}

/** Gift, Feuer und Bluten – in dieser Reihenfolge wirken sie pro Runde. */
export const DOT_ORDER = ["poison", "burn", "bleed"] as const;

export interface FoeDotTicks<D extends DamageOverTime> {
  /** Läuft der Kampf noch (steht ein Gegner)? Sonst wirkt nichts mehr. */
  fightOn: () => boolean;
  /** Schaden mit Verwundbarkeit und Absicht des Bosses – in der Reihenfolge des Aufrufers (Gleitkomma) */
  scale: (damage: number) => number;
  /** Skillränge des Verursachers – für Blutsturz */
  sourceSkills: (effect: D) => SkillRanks | undefined;
  /** Schaden anrichten und melden (Lebenspunkte, Ereignis, ggf. Bedrohung) */
  damage: (kind: DotKind, damage: number, effect: D, burst: boolean) => void;
  /** Danach: ist der Gegner gefallen? */
  down: () => void;
}

/**
 * Gift, Feuer und Bluten eines Gegners wirken eine Runde: Schaden, eine Runde weniger –
 * und Blutsturz, wenn das Bluten ausläuft. Fällt der Gegner oder endet der Kampf, wirkt der Rest nicht mehr.
 */
export function tickFoeDots<D extends DamageOverTime, F extends DotEffects<D>>(
  foe: { c: { hp: number }; fx: F },
  o: FoeDotTicks<D>,
): void {
  for (const kind of DOT_ORDER) {
    const effect = foe.fx[kind] as D | undefined;
    if (!effect || foe.c.hp <= 0 || !o.fightOn()) continue;
    o.damage(kind, Math.max(1, Math.round(o.scale(effect.damage))), effect, false);
    const next = tickDot(effect);
    foe.fx = { ...foe.fx, [kind]: next };
    o.down();
    // Blutsturz: Läuft das Bluten aus, platzt die Wunde
    const burst = kind === "bleed" && !next && foe.c.hp > 0 && o.fightOn() ? bloodburstDamage(o.sourceSkills(effect), effect.damage) : 0;
    if (burst > 0) {
      o.damage("bleed", Math.max(1, Math.round(o.scale(burst))), effect, true);
      o.down();
    }
  }
}

/** Gift, Feuer oder Bluten am Helden: so viel Schaden in dieser Runde – Gegengift mindert ihn. */
export const heroDotDamage = (effect: DamageOverTime, skills: SkillRanks | undefined): number =>
  Math.max(1, Math.round(effect.damage * dotTakenFactor(skills)));

/** Gift, Feuer und Bluten, die eine Boss-Fähigkeit beim Getroffenen hinterlässt (`base`: Schaden des Bosses). */
export function abilityDots(
  ability: Partial<Record<DotKind, { percent: number; rounds: number }>> | null | undefined,
  base: number,
  itemEffects: readonly ItemEffectId[] | undefined,
): [DotKind, DamageOverTime][] {
  const dots: [DotKind, DamageOverTime][] = [];
  for (const kind of DOT_ORDER) {
    const effect = ability?.[kind];
    if (!effect) continue;
    // Reinheit kürzt, Drachenfeuer macht gegen Feuer immun
    const rounds = heroDotRounds(itemEffects, kind, effect.rounds);
    if (rounds > 0) dots.push([kind, { damage: Math.max(1, Math.round(base * effect.percent)), roundsLeft: rounds }]);
  }
  return dots;
}

/** Elite „Giftig“: Wer getroffen wird, ist vergiftet. */
export const elitePoison = (damage: number, itemEffects: readonly ItemEffectId[] | undefined): DamageOverTime => ({
  damage: Math.max(1, Math.round(damage * POISON.percent)),
  roundsLeft: heroDotRounds(itemEffects, "poison", POISON.rounds),
});

/* ───────────────────────── Angriff auf einen Helden ───────────────────────── */

/** Geschwächte Gegner machen weniger Schaden. */
export const weakenFactor = (fx: { weaken?: ActiveBuff }): number => 1 - (fx.weaken?.percent ?? 0);

/** Trommler: Jeder Schlag eines stehenden Trommlers macht den Boss stärker. */
export const drumFactor = (adds: readonly { role?: AddRole; cast?: number; c: { hp: number } }[]): number =>
  1 + DRUM_BONUS * adds.reduce((sum, f) => sum + (f.role === "drummer" && f.c.hp > 0 ? (f.cast ?? 0) : 0), 0);

/**
 * Elite-Modifikatoren des Angreifers: Rasend macht mehr Schaden (unter halben LP noch mehr),
 * Flink schlägt zweimal schwächer zu.
 */
export function eliteStrike(elite: readonly EliteAffix[], c: { hp: number; maxHp: number }): { rage: number; swift: number; hits: number } {
  const rage = elite.includes("raging") ? 1 + (c.hp < c.maxHp / 2 ? RAGE_BONUS.low : RAGE_BONUS.base) : 1;
  const swift = elite.includes("swift");
  return { rage, swift: swift ? SWIFT_SHARE : 1, hits: swift ? 2 : 1 };
}

/**
 * Faktor auf den Schaden, den ein Held erleidet: Schildwall/Wutschrei, Säure – und Abwehren
 * halbiert (Fels: noch weniger).
 */
export function damageTakenFactor(
  effects: { damageTaken?: ActiveBuff; corroded?: ActiveBuff },
  defending: boolean,
  skills: SkillRanks | undefined,
  defendBase: number,
): number {
  const base = Math.max(0, 1 + (effects.damageTaken?.percent ?? 0));
  const acid = effects.corroded ? base * (1 + effects.corroded.percent) : base;
  return acid * (defending ? defendTaken(skills, defendBase) : 1);
}

/** Schemen: Weicht der Held aus? Zieht nur Zufall, wenn er es überhaupt kann. */
export function dodges(skills: SkillRanks | undefined, rng: () => number): boolean {
  const dodge = dodgeChance(skills);
  return dodge > 0 && rng() < dodge;
}

/** Parade/Vergeltung: nur ein Teil des Schadens kommt durch. */
export const guardedDamage = (damage: number, guard: Guard | undefined): number =>
  guard ? Math.max(1, Math.round(damage * guard.reduce)) : damage;

/**
 * Parade/Vergeltung nach dem Treffer: Rückwurf eines Teils des vollen Schadens (`raw`),
 * dazu der Konter – `counter` würfelt ihn mit seinem Faktor; ohne `counter` gibt es keinen (Held liegt).
 */
export function guardRetort(guard: Guard, raw: number, counter: ((factor: number) => number) | null): number {
  const reflected = guard.reflect ? Math.round(raw * guard.reflect) : 0;
  return reflected + (guard.counter && counter ? counter(guard.counter) : 0);
}

/** Lebensentzug: So viel heilt sich der Angreifer an `dealt` Schaden – nie über das Maximum. */
export const drainHeal = (c: { hp: number; maxHp: number }, dealt: number, share: number): number =>
  Math.min(c.maxHp - c.hp, Math.round(dealt * share));

/** Dornen: Anteil des erlittenen Schadens, der zurückgeht – Turm-Segen, Item-Effekt und Stachelwehr beim Abwehren. */
export function thornsShare(
  itemEffects: readonly ItemEffectId[] | undefined,
  blessings: readonly BlessingId[] | undefined,
  defending: boolean,
  skills: SkillRanks | undefined,
): number {
  return (
    BLESSING.thorns * stacks(blessings, "thorns") +
    (hasEffect(itemEffects, "thorns") ? EFFECT.thorns : 0) +
    (defending ? defendThorns(skills) : 0)
  );
}

/** Dornen: so viel geht an den Angreifer zurück – 0, wenn nichts zurückgeht. */
export const thornsDamage = (damage: number, share: number, attackerHp: number): number =>
  share <= 0 || damage <= 0 || attackerHp <= 0 ? 0 : Math.max(1, Math.round(damage * share));

/** Neferets Fluch bricht los: so viel Schaden (Bollwerk hilft nicht, Abwehren schon). */
export const curseBurstDamage = (maxHp: number, hurt: number): number => Math.max(1, Math.round(maxHp * CURSE_DAMAGE * hurt));

/**
 * Ein gewöhnlicher Angriff auf einen Helden: Bollwerk blockt, Schemen weicht aus, sonst trifft er –
 * geschwächt und mit dem Faktor, den der Held erleidet.
 */
export function strikeHero(
  attacker: Combatant,
  fx: { weaken?: ActiveBuff },
  defender: Combatant,
  o: { bulwark: boolean; skills: SkillRanks | undefined; hurt: number },
  rng: () => number,
): { blocked: true } | { dodged: true } | { hit: { damage: number; crit: boolean } } {
  if (o.bulwark) return { blocked: true };
  if (dodges(o.skills, rng)) return { dodged: true };
  return { hit: rollHit({ ...attacker, damage: attacker.damage * weakenFactor(fx) * o.hurt }, defender, rng) };
}

/* ───────────────────────── Begleiter mit Aufgabe ───────────────────────── */

/**
 * Heiler: Ein Treffer oder eine Betäubung unterbricht das Heilritual; sonst zählt es hoch
 * und heilt den Boss nach RITUAL_ROUNDS Runden.
 */
export function healerTurn(
  cast: number | undefined,
  interrupted: boolean,
): { cast: number } & ({ act: "interrupted"; wasCasting: boolean } | { act: "heal" } | { act: "ritual"; roundsLeft: number }) {
  if (interrupted) return { cast: 0, act: "interrupted", wasCasting: !!cast };
  const next = (cast ?? 0) + 1;
  return next >= RITUAL_ROUNDS ? { cast: 0, act: "heal" } : { cast: next, act: "ritual", roundsLeft: RITUAL_ROUNDS - next };
}

/** Heilritual: so viel heilt der Boss. */
export const ritualHeal = (boss: { hp: number; maxHp: number }): number => healShare(boss.hp, boss.maxHp, RITUAL_HEAL);

/** Schildträger: Statt anzugreifen hebt er regelmässig den Schild – dann so viel Schild für den Boss (sonst 0). */
export function shieldTurn(cast: number | undefined, bossMaxHp: number): { cast: number; shield: number } {
  const next = (cast ?? 0) + 1;
  return { cast: next % SHIELD_EVERY, shield: next >= SHIELD_EVERY ? Math.round(bossMaxHp * SHIELD_SHARE) : 0 };
}

/** Trommler: Jede Runde wird er lauter – bis DRUM_MAX. */
export const drumTurn = (cast: number | undefined): number => Math.min(DRUM_MAX, (cast ?? 0) + 1);
