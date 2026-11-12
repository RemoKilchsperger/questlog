// Simulation der Klassen (Etappe G0, docs/klassen-skilltree-abgleich.md): jede Klasse mit passender
// Ausrüstung, gewürfelten Item-Boni und Fähigkeiten, Heiltränken und einer einfachen, für alle gleichen
// KI gegen die Gebietsbosse – solo und im Koop. Gebraucht von
// - src/domain/classBalance.test.ts: Leitplanken für die Klassenspreizung (läuft immer mit)
// - src/domain/zzClassSim.test.ts: Berichte für das Abstimmen (nur mit SIM_MODE)
//
// Die KI spielt nicht optimal. Die absoluten Siegquoten zählen deshalb weniger als die Reihenfolge der
// Klassen und der Abstand zwischen ihnen (docs/balancing-review-waffen-klassen.md, „Methode“).

import type { AbilityId } from "../domain/abilities";
import {
  abilityBlocker,
  abilityHits,
  attackRound,
  bossTurnOf,
  DEFEND,
  drinkPotion,
  SIGNATURE,
  signatureBlocker,
  getHeroCombatProfile,
  livingAdds,
  potionBlocker,
  setTarget,
  startBattle,
  type BattleState,
  type HeroAction,
  type HeroCombatProfile,
} from "../domain/combat";
import {
  coopAbilityBlocker,
  coopBossTurn,
  coopPotionBlocker,
  coopSignatureBlocker,
  resolveRound,
  startCoopBattle,
  type CoopAction,
  type CoopBattleState,
  type CoopHero,
  type CoopPlayer,
} from "../domain/coopCombat";
import { untouchable } from "../domain/bossIntents";
import { AREAS, type CreatureDef } from "../domain/creatures";
import { classAbility, classStatBonus, type HeroClassId } from "../domain/heroClasses";
import { createItem, indexForLevel } from "../domain/items";
import { totalXpForLevel } from "../domain/leveling";
import { matchupFactor } from "../domain/matchups";
import { getPotion } from "../domain/potions";
import { hash, seededRng } from "../domain/random";
import type { SkillPath } from "../domain/skills";
import type { ArmorClass, Character, Equipment, ItemType, Rarity, StatKey } from "../domain/types";
import { masterPathOrder, pathOrder, withSkills } from "./skills";

/** Ausrüstung einer Klasse – Einhand-Klassen tragen zwei Waffen (Review, „Methode“). */
export interface ClassBuild {
  id: HeroClassId;
  /** Name der Zeile, wenn eine Klasse mehrere Varianten hat (Paladin mit Schwert) */
  label?: string;
  armor: ArmorClass;
  weapons: readonly ItemType[];
  /** Attribut der Waffe: 60 % der Punkte, der Rest in Ausdauer (Ausdauer-Waffen: alles) */
  main: StatKey;
}

export const CLASS_BUILDS: readonly ClassBuild[] = [
  { id: "mage", armor: "light", weapons: ["staff"], main: "intellect" },
  { id: "warlock", armor: "light", weapons: ["scepter", "scepter"], main: "intellect" },
  { id: "assassin", armor: "light", weapons: ["dagger", "dagger"], main: "charisma" },
  { id: "ranger", armor: "medium", weapons: ["bow"], main: "charisma" },
  { id: "duelist", armor: "medium", weapons: ["sword", "sword"], main: "strength" },
  { id: "plunderer", armor: "medium", weapons: ["axe", "axe"], main: "strength" },
  { id: "cleric", armor: "medium", weapons: ["mace", "mace"], main: "endurance" },
  { id: "paladin", armor: "heavy", weapons: ["mace", "shield"], main: "endurance" },
  // Paladin mit Schwert und Schild (Klassen-Kern G3): Geweihte Klinge – das Schwert skaliert mit Ausdauer
  { id: "paladin", label: "paladin-sw", armor: "heavy", weapons: ["sword", "shield"], main: "endurance" },
  { id: "berserker", armor: "heavy", weapons: ["greataxe"], main: "strength" },
  { id: "champion", armor: "heavy", weapons: ["greatsword"], main: "strength" },
  { id: "warden", armor: "heavy", weapons: ["greathammer"], main: "strength" },
];

export const classBuild = (id: HeroClassId): ClassBuild => CLASS_BUILDS.find((b) => b.id === id)!;

/**
 * Verteilung „Meisterpfad + Zweitpfad“ (docs/skilltree-ueberarbeitung.md, Abschnitt 8): im Meisterpfad
 * genau bis zur Schwelle der Meisterschaft, dann die Meisterschaft (`master`: welche der Gabel), der
 * Rest von oben nach unten in den Zweitpfad. Bei Lv. 60 mit dem neuen Baum 13 + 17 Punkte.
 */
export interface SkillPlan {
  main: SkillPath;
  /** Gabelung auf Stufe 3 im Meisterpfad */
  fork: 0 | 1;
  /** Meisterschaft: 0 die erste, 1 die zweite (gibt es erst mit G2) */
  master: 0 | 1;
  second: SkillPath;
  secondFork: 0 | 1;
}

/**
 * Plan pro Klasse: Meisterpfad = bester Pfad aus dem Review (balancing-review-waffen-klassen.md,
 * Tabelle „Siegquote mit einem Pfad“), Zweitpfad = zweitbester.
 */
export const CLASS_SKILL_PLANS: Readonly<Record<HeroClassId, SkillPlan>> = {
  mage: { main: "arcane", fork: 0, master: 0, second: "plague", secondFork: 1 },
  warlock: { main: "plague", fork: 0, master: 0, second: "arcane", secondFork: 0 },
  assassin: { main: "plague", fork: 0, master: 0, second: "blade", secondFork: 1 },
  ranger: { main: "plague", fork: 1, master: 0, second: "guard", secondFork: 0 },
  duelist: { main: "plague", fork: 0, master: 0, second: "blade", secondFork: 0 },
  plunderer: { main: "blade", fork: 1, master: 0, second: "plague", secondFork: 1 },
  cleric: { main: "guard", fork: 0, master: 0, second: "plague", secondFork: 1 },
  paladin: { main: "guard", fork: 0, master: 0, second: "blade", secondFork: 0 },
  berserker: { main: "blade", fork: 1, master: 0, second: "plague", secondFork: 0 },
  champion: { main: "blade", fork: 0, master: 0, second: "plague", secondFork: 1 },
  warden: { main: "plague", fork: 1, master: 0, second: "guard", secondFork: 0 },
};

/** Reihenfolge der Skillpunkte für einen Plan. */
export const planOrder = (plan: SkillPlan) => [
  ...masterPathOrder(plan.main, plan.fork, plan.master),
  ...pathOrder(plan.second, plan.secondFork),
];

/** Gebietsbosse in der Reihenfolge der Gebiete (Lv. 10 … 60). */
export const AREA_BOSSES: readonly CreatureDef[] = AREAS.map((a) => a.creatures.at(-1)!);

export interface SimHeroOptions {
  rarity?: Rarity;
  /** Skillpunkte: die Pfade der Reihe nach von oben nach unten (Gabelung 0 oder 1), solange Punkte da sind */
  skills?: readonly (readonly [SkillPath, 0 | 1])[];
  /** Skillpunkte nach „Meisterpfad + Zweitpfad“ – ersetzt `skills` */
  plan?: SkillPlan;
  /** Gleiche Ausrüstung, aber ohne Klasse – Vergleichswert für das Budget */
  classless?: boolean;
}

/**
 * Held einer Klasse auf `level`. Die Item-Boni und Fähigkeiten würfelt ein eigener Zufall aus `uid` –
 * so tragen Klasse und klassenloser Vergleich genau dieselbe Ausrüstung.
 */
export function simHero(build: ClassBuild, level: number, uid: string, options: SimHeroOptions = {}): HeroCombatProfile {
  const points = 2 * (level - 1);
  const stats = { strength: 1, intellect: 1, endurance: 1, charisma: 1 };
  if (build.main === "endurance") stats.endurance += points;
  else {
    const main = Math.round(points * 0.6);
    stats[build.main] += main;
    stats.endurance += points - main;
  }
  let character: Character = { name: "Held", totalXp: totalXpForLevel(level), gold: 0, essence: 0, stats, spentPoints: points, skills: {} };
  if (options.plan) character = withSkills(character, planOrder(options.plan));
  else for (const [path, fork] of options.skills ?? []) character = withSkills(character, pathOrder(path, fork));
  const rng = seededRng(hash(uid));
  const rarity = options.rarity ?? "rare";
  const idx = indexForLevel(level);
  const armorId = (slot: string) => (build.armor === "heavy" ? `${slot}-${idx}` : `${slot}-${build.armor}-${idx}`);
  const item = (id: string, n: string) => createItem(id, rarity, `${uid}-${n}`, rng);
  const equipment: Equipment = {
    head: item(armorId("head"), "h"),
    chest: item(armorId("chest"), "c"),
    arms: item(armorId("arms"), "a"),
    legs: item(armorId("legs"), "l"),
    feet: item(armorId("feet"), "f"),
    weapon1: item(`${build.weapons[0]}-${idx}`, "w1"),
    weapon2: build.weapons[1] ? item(`${build.weapons[1]}-${idx}`, "w2") : null,
  };
  const profile = getHeroCombatProfile(character, equipment);
  return options.classless ? withoutClass(profile) : profile;
}

/**
 * Dasselbe Profil ohne Klasse: Die Klassenboni wirken als Faktoren (Krit additiv), darum lassen sie sich
 * genau herausrechnen. Fähigkeiten verlieren ihre Klassen-Variante, weil `classAbility` die Klasse liest.
 */
export function withoutClass(profile: HeroCombatProfile): HeroCombatProfile {
  const bonus = classStatBonus(profile.heroClass);
  return {
    ...profile,
    heroClass: null,
    damage: profile.damage / (1 + bonus.damage),
    maxHp: Math.round(profile.maxHp / (1 + bonus.hp)),
    armor: Math.round(profile.armor / (1 + bonus.armor)),
    critChance: profile.critChance - bonus.crit,
    critMultiplier: 1.5,
    goldBonus: profile.goldBonus - bonus.gold,
  };
}

/* ───────────── Solo ───────────── */

/** Grobe Bewertung einer Fähigkeit im Vergleich zu einem normalen Angriff (= 1). */
function score(state: BattleState, id: AbilityId): number {
  const a = classAbility(id, state.heroClass);
  const hits = abilityHits(a, state.hero.hp, state.hero.maxHp);
  const fx = state.enemyEffects;
  const low = state.hero.hp < state.hero.maxHp * 0.5;
  let v = a.multiplier * hits * (a.ignoreArmor ? 1.3 : 1);
  if (a.guaranteedCrit) v *= state.hero.critChance >= 0.3 ? 1.5 : 1.35;
  if (a.execute && state.enemy.hp < state.enemy.maxHp * a.execute.threshold) v *= a.execute.factor;
  if (a.bleedBonus && fx.bleed) v *= 1 + a.bleedBonus;
  if (a.shakenBonus && fx.shaken) v *= 1 + a.shakenBonus;
  for (const kind of ["poison", "burn", "bleed"] as const) {
    const dot = a[kind];
    if (!dot || matchupFactor(state.creatureId, kind) === 0) continue;
    if ((fx[kind]?.roundsLeft ?? 0) > 1) continue;
    v += dot.percent * dot.rounds * 0.9;
  }
  if (a.heal) v += low ? a.heal * 6 : 0;
  if (a.renew) v += low ? a.renew.percent * a.renew.rounds * 6 : 0;
  if (a.guard) v += 0.7;
  if (a.bulwark) v += 1;
  if (a.damageTaken && a.damageTaken.percent < 0) v += 1;
  if (a.damageTaken && a.damageTaken.percent > 0) v -= 0.3;
  if (a.weaken && !fx.weaken) v += 0.6;
  if (a.vulnerable && !fx.vulnerable) v += a.vulnerable.percent * a.vulnerable.rounds * 1.2;
  if (a.empower && !state.heroEffects.empower) v += a.empower.percent * a.empower.rounds * 1.1;
  if (a.charge) v += 2.0;
  if (a.feint) v += 0.9;
  if (a.ambush) v += 0.5;
  if (a.armorBreak && !fx.armorBreak) v += 0.6;
  if (a.stun && !(fx.stunImmunity ?? 0)) v += 0.9 * (a.stunChance ?? 1);
  if (a.manaGain) v += 0.3;
  if (a.lifesteal && low) v += a.lifesteal * 1.5;
  return v;
}

/**
 * Die KI: volle Klassenleiste sofort als Signatur, sonst die beste Fähigkeit, wenn sie deutlich mehr bringt als ein
 * Angriff; gegen Abtauchen und Fähigkeiten abwehren.
 */
export function chooseSoloAction(state: BattleState): HeroAction | undefined {
  if (signatureBlocker(state) === null && !untouchable(bossTurnOf(state))) return SIGNATURE;
  // Nach Finte oder Titanenschlag normal angreifen, sonst verpufft es
  if (state.heroEffects.feint || state.heroEffects.charged) return undefined;
  const turn = bossTurnOf(state);
  let best: AbilityId | undefined;
  let bestValue = 1.25;
  for (const id of state.abilities) {
    if (abilityBlocker(state, id) !== null) continue;
    const v = score(state, id);
    if (v > bestValue) {
      best = id;
      bestValue = v;
    }
  }
  if (!best && (turn?.intent === "submerged" || turn?.intent === "ability")) return DEFEND;
  return best;
}

/** Heiltränke wie im Spiel: Laden, ab Lv. 41 auch der grosse aus der Beute. */
const healPotions = (level: number) => (level > 40 ? ["large", "medium", "small"] : ["medium", "small"]).map(getPotion);

/** Höchstzahl Runden, danach gilt der Kampf als verloren (Abbruch gegen Endlosschleifen). */
export const SIM_MAX_ROUNDS = 80;

/** Ein Solo-Kampf bis zum Ende: Heiltrank unter 40 % LP, Begleiter mit Rolle zuerst. */
export function fightSolo(profile: HeroCombatProfile, boss: CreatureDef, rng: () => number): BattleState {
  let state = startBattle("sim", "Held", profile, boss);
  const potions = healPotions(boss.level);
  while (state.status === "active" && state.round < SIM_MAX_ROUNDS) {
    if (state.hero.hp < state.hero.maxHp * 0.4) {
      const potion = potions.find((p) => potionBlocker(state, p) === null);
      if (potion) state = drinkPotion(state, potion).state;
    }
    state = setTarget(state, livingAdds(state).find((a) => a.role)?.uid);
    state = attackRound(state, rng, state.target ? undefined : chooseSoloAction(state)).state;
  }
  return state;
}

export interface SimResult {
  /** Siegquote 0–1 */
  win: number;
  /** Runden im Mittel (alle Kämpfe) */
  rounds: number;
  /** Runden der gewonnenen Kämpfe im Mittel – NaN ohne Sieg */
  winRounds: number;
  /** Schaden am Boss pro Runde in Einheiten D (Schaden pro Treffer des klassenlosen Helden vor Rüstung) */
  dPerRound: number;
}

export interface SoloSimOptions extends SimHeroOptions {
  /** Kämpfe pro Klasse und Boss */
  n: number;
  seed?: number;
}

/** Eine Klasse gegen einen Boss: `n` Kämpfe mit festem Zufall. */
export function simulateSolo(build: ClassBuild, boss: CreatureDef, options: SoloSimOptions): SimResult {
  const seed = options.seed ?? 1;
  const rng = seededRng(hash(`${build.label ?? build.id}|${boss.id}|${seed}`));
  let wins = 0;
  let rounds = 0;
  let winRounds = 0;
  let d = 0;
  for (let i = 0; i < options.n; i++) {
    const uid = `${build.label ?? build.id}-${boss.id}-${seed}-${i}`;
    const profile = simHero(build, boss.level, uid, options);
    // D misst immer am klassenlosen Helden mit derselben Ausrüstung – so ist der Klassenbonus sichtbar
    const unit = options.classless ? profile.damage : withoutClass(profile).damage;
    const end = fightSolo(profile, boss, rng);
    if (end.status === "won") {
      wins++;
      winRounds += end.round;
    }
    rounds += end.round;
    d += (end.enemy.maxHp - end.enemy.hp) / Math.max(1, end.round) / unit;
  }
  return { win: wins / options.n, rounds: rounds / options.n, winRounds: wins > 0 ? winRounds / wins : NaN, dPerRound: d / options.n };
}

export interface ClassRow {
  /** Klasse bzw. Variante (ClassBuild.label) oder "classless" */
  id: string;
  /** Pro Boss in der Reihenfolge von `bosses` */
  results: SimResult[];
  /** Mittlere Siegquote über alle Bosse, 0–1 */
  meanWin: number;
  meanRounds: number;
  meanD: number;
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);

function row(id: ClassRow["id"], results: SimResult[]): ClassRow {
  return {
    id,
    results,
    meanWin: mean(results.map((r) => r.win)),
    meanRounds: mean(results.map((r) => r.rounds)),
    meanD: mean(results.map((r) => r.dPerRound)),
  };
}

/** Alle Klassen gegen die Bosse – die Klassenspreizung (Review Nr. 22). */
export function classSpread(options: SoloSimOptions & { bosses?: readonly CreatureDef[]; builds?: readonly ClassBuild[] }): ClassRow[] {
  const bosses = options.bosses ?? AREA_BOSSES;
  return (options.builds ?? CLASS_BUILDS).map((build) => row(build.label ?? build.id, bosses.map((boss) => simulateSolo(build, boss, options))));
}

/**
 * Budget-Messung (docs/klassen-neukonzept.md 4.2): Schaden pro Runde in D mit Klasse und ohne – mit
 * derselben Ausrüstung und demselben Zufall. `value` = Mehrwert der Klasse (0.25 = +25 %).
 */
export function classBudget(
  build: ClassBuild,
  options: SoloSimOptions & { bosses?: readonly CreatureDef[] },
): { withClass: ClassRow; classless: ClassRow; value: number } {
  const bosses = options.bosses ?? AREA_BOSSES;
  const withClass = row(build.label ?? build.id, bosses.map((boss) => simulateSolo(build, boss, options)));
  const classless = row("classless", bosses.map((boss) => simulateSolo(build, boss, { ...options, classless: true })));
  return { withClass, classless, value: withClass.meanD / classless.meanD - 1 };
}

/* ───────────── Koop ───────────── */

/** Grobe Bewertung einer Fähigkeit im Koop (normaler Angriff = 1). */
function coopScore(hero: CoopHero, id: AbilityId): number {
  const a = classAbility(id, hero.heroClass);
  const low = hero.combatant.hp < hero.combatant.maxHp * 0.5;
  let v = a.multiplier * (a.hits ?? 1) * (a.ignoreArmor ? 1.3 : 1);
  for (const kind of ["poison", "burn", "bleed"] as const) {
    const dot = a[kind];
    if (dot) v += dot.percent * dot.rounds * 0.9;
  }
  if (a.heal) v += low ? a.heal * 6 : 0;
  if (a.groupHeal) v += 0.5;
  if (a.empower) v += a.empower.percent * a.empower.rounds;
  if (a.vulnerable) v += a.vulnerable.percent * a.vulnerable.rounds;
  if (a.bulwark || a.guard) v += 0.6;
  if (a.charge) v += 1.5;
  return v;
}

export interface CoopSimResult {
  status: CoopBattleState["status"];
  rounds: number;
  /** Gefallene Helden am Ende (auch wiederbelebte, die wieder fielen) */
  down: number;
}

export interface CoopSimOptions {
  /** Abbruch nach so vielen Runden (gilt als Niederlage) */
  maxRounds?: number;
  /** Wer abwehrt, statt anzugreifen (z. B. ein Tank, der den Kampf in die Länge zieht): Held → Chance pro Runde */
  defendChance?: Record<string, number>;
}

/**
 * Ein Koop-Kampf gegen einen Raid-Boss (oder den ersten Gegner eines Dungeons): Heiltrank unter 40 % LP,
 * Gefallene mit einem Heiltrank zurückholen, sonst die beste Fähigkeit oder ein normaler Angriff.
 */
export function fightCoop(contentId: string, players: CoopPlayer[], rng: () => number, options: CoopSimOptions = {}): CoopSimResult {
  let state = startCoopBattle("sim", contentId, players, 0);
  const maxRounds = options.maxRounds ?? SIM_MAX_ROUNDS;
  let now = 0;
  const heals = ["large", "medium", "small"];
  while (state.status === "active" && state.round <= maxRounds) {
    const turn = coopBossTurn(state);
    const actions: Record<string, CoopAction> = {};
    for (const hero of state.heroes) {
      if (hero.down) continue;
      const action: CoopAction = {};
      const fallen = state.heroes.find((h) => h.down && !h.revived);
      const usable = (target: string) => heals.find((p) => coopPotionBlocker(state, hero.id, p, target) === null);
      const revive = fallen && usable(fallen.id);
      const drink = hero.combatant.hp < hero.combatant.maxHp * 0.4 && usable(hero.id);
      if (revive && fallen) action.potion = { potionId: revive, targetId: fallen.id };
      else if (drink) action.potion = { potionId: drink, targetId: hero.id };
      if (rng() < (options.defendChance?.[hero.id] ?? 0)) action.defend = true;
      else if (coopSignatureBlocker(hero) === null) action.signature = true;
      else {
        let best: AbilityId | undefined;
        let bestValue = 1.2;
        for (const id of hero.abilities) {
          if (coopAbilityBlocker(hero, id, turn, state.round) !== null) continue;
          const v = coopScore(hero, id);
          if (v > bestValue) {
            best = id;
            bestValue = v;
          }
        }
        if (best) action.ability = best;
      }
      // Begleiter mit Aufgabe und abgeschlagene Hydra-Köpfe (gepanzerter Hals) zuerst
      const first = (state.adds ?? []).find((a) => (a.role || a.head) && a.combatant.hp > 0);
      if (first) action.target = first.uid;
      actions[hero.id] = action;
    }
    now += 1000;
    state = resolveRound(state, actions, rng, now).state;
  }
  return {
    status: state.status === "active" ? "lost" : state.status,
    rounds: state.round - (state.status === "active" ? 0 : 1),
    down: state.heroes.filter((h) => h.down).length,
  };
}

/** Spieler für einen Koop-Kampf: je eine Klasse auf `level`, Ausrüstung wie solo. */
export function coopPlayers(classes: readonly HeroClassId[], level: number, uid: string, options: SimHeroOptions = {}): CoopPlayer[] {
  return classes.map((id, i) => ({
    id: `p${i}`,
    name: `${id}-${i}`,
    profile: simHero(classBuild(id), level, `${uid}-${i}`, options),
  }));
}

/** Kurzform für Berichte: Prozent ohne Nachkommastellen. */
export const pct = (v: number) => `${Math.round(v * 100)}`;
