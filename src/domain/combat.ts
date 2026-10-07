// Rundenbasierter Kampf: Held gegen Kreatur. Reine Logik ohne Grafik –
// Phaser bekommt nur die Ereignisse (Treffer, Heilung, Sieg) zum Animieren.
//
// Ablauf einer Runde:
//   1. optional: ein Trank (höchstens einer pro Runde, jede Sorte einmal pro Kampf)
//   2. Angriff des Helden – normal oder mit einer Waffen-Fähigkeit (kostet Mana) –
//      oder Flucht (kostet Gold, beendet den Kampf)
//   3. Gift, Feuer und Bluten wirken, dann Gegenangriff der Kreatur (falls sie noch steht und nicht betäubt ist)
//   4. Der Held regeneriert etwas Mana

import { getArmorClassSummary, getCombatStats, getEffectiveStats } from "./equipment";
import {
  getCreatureGold,
  getCreatureLoot,
  getCreaturePotionDrop,
  getCreatureStats,
  getCreatureXp,
  rollCreatureGold,
  type CreatureDef,
} from "./creatures";
import { createItem, getBossItems, getItem } from "./items";
import { getLevel } from "./leveling";
import { rollDrop } from "./loot";
import { BUFF_POTIONS, potionHeal, type BuffKind, type PotionDef } from "./potions";
import { hasAbility, skillArmorBonus, skillDamageBonus, type SkillWeapon } from "./skills";
import { bossAbilityDue } from "./bossAbilities";
import { getSetHpMultiplier } from "./bossSets";
import { abilitiesOf, MANA_REGEN, maxManaFor, type AbilityId, type Guard } from "./abilities";
import {
  classAbility,
  classStatBonus,
  CLERIC_POTION_FACTOR,
  CLERIC_REGEN,
  detectHeroClass,
  DUELIST_EXTRA_HIT,
  PLUNDERER_BLEED,
  rageFactor,
  type HeroClassId,
} from "./heroClasses";
import type { Character, Equipment, Loot, OwnedItem } from "./types";
import { attributeDamage, shieldArmorBonus } from "./weaponScaling";

/** Kritische Trefferchance pro Charisma-Punkt (bis zur Obergrenze von 30 %). */
export const CRIT_PER_CHARISMA = 0.002;

/** Kampfwerte des Helden, abgeleitet aus Level, Attributen und Ausrüstung. */
export interface HeroCombatProfile {
  level: number;
  maxHp: number;
  /** Grundschaden pro Treffer (vor Rüstung und Streuung). */
  damage: number;
  armor: number;
  critChance: number;
  /** Zusätzliches Gold nach einem Sieg (0.1 = +10 %). */
  goldBonus: number;
  maxMana: number;
  /** Freigeschaltete Fähigkeiten der angelegten Waffen */
  abilities: AbilityId[];
  /** Aktive Klasse (heroClasses.ts) – oder null */
  heroClass: HeroClassId | null;
  /** Schadensfaktor kritischer Treffer (1,5, Assassine 2) */
  critMultiplier: number;
}

/** Freigeschaltete Fähigkeiten aller angelegten Waffen (je Waffe erste, dann zweite), ohne Doppelte. */
export function availableAbilities(character: Character, equipment: Equipment): AbilityId[] {
  const types = new Set(
    [equipment.weapon1, equipment.weapon2].filter((o) => o !== null).map((o) => getItem(o.itemId).type as SkillWeapon),
  );
  return [...types].flatMap((type) => abilitiesOf(type).filter((a) => hasAbility(character, a.id)).map((a) => a.id));
}

/**
 * Was die Attribute im Kampf bewirken (weaponScaling.ts):
 * - Jede Waffe: +0.25 Schaden pro Punkt in ihrem Attribut – Stärke (Schwerter,
 *   Äxte, Grosshammer), Intelligenz (Stab, Zepter), Ausdauer (Streitkolben,
 *   Schild), Charisma (Dolch, Bogen)
 * - Ausdauer:    +1.5 Lebenspunkte pro Punkt, Schilde +0.25 Rüstung pro Punkt
 * - Intelligenz: +1 Mana pro Punkt
 * - Charisma:    +0.2 % kritische Trefferchance und +0.5 % Gold pro Sieg pro Punkt (max. +100 %)
 * Dazu kommt der Skilltree: +2 % Waffenschaden pro Rang im jeweiligen Waffentyp,
 * beim Schild +2 % Schild-Rüstung pro Rang – und der Ausgleich leichter und
 * mittlerer Rüstung (mehr Mana und Krit, siehe armorClasses.ts).
 */
export function getHeroCombatProfile(character: Character, equipment: Equipment): HeroCombatProfile {
  const level = getLevel(character.totalXp);
  const stats = getEffectiveStats(character.stats, equipment);
  const gear = getCombatStats(equipment);
  const armorClasses = getArmorClassSummary(equipment);
  const heroClass = detectHeroClass(equipment);
  const bonus = classStatBonus(heroClass);
  return {
    level,
    maxHp: Math.round((80 + (level - 1) * 12 + stats.endurance * 1.5) * getSetHpMultiplier(equipment) * (1 + bonus.hp)),
    damage: (5 + gear.attack + skillDamageBonus(character, equipment) + attributeDamage(stats, equipment)) * (1 + bonus.damage),
    armor: Math.round((gear.armor + skillArmorBonus(character, equipment) + shieldArmorBonus(stats, equipment)) * (1 + bonus.armor)),
    // Die Klassen-Krit-Chance kommt über die normale Obergrenze hinaus dazu
    critChance: Math.min(0.3, 0.05 + stats.charisma * CRIT_PER_CHARISMA + armorClasses.crit) + bonus.crit,
    goldBonus: Math.min(1, stats.charisma * 0.005) + bonus.gold,
    maxMana: maxManaFor(level, stats.intellect) + armorClasses.mana,
    abilities: availableAbilities(character, equipment),
    heroClass,
    critMultiplier: bonus.critMultiplier,
  };
}

export type Side = "hero" | "enemy";

export interface Combatant {
  name: string;
  level: number;
  maxHp: number;
  hp: number;
  damage: number;
  armor: number;
  critChance: number;
  /** Schadensfaktor kritischer Treffer – Standard 1,5 */
  critMultiplier?: number;
}

export type BattleEvent =
  /** `heal` = geheilte LP (0 bei Verstärkungstränken), `buff` = welche Verstärkung beginnt */
  | { type: "potion"; potionId: string; heal: number; buff?: BuffKind }
  | { type: "hit"; attacker: Side; damage: number; crit: boolean }
  /** Der Held setzt eine Fähigkeit ein – die Treffer folgen als "hit" */
  | { type: "ability"; ability: AbilityId; weapon: SkillWeapon; manaCost: number }
  /** Der Held heilt sich durch eine Fähigkeit (Heiliges Licht, Blutrausch) */
  | { type: "selfHeal"; heal: number }
  /** Parade/Vergeltung fängt einen Teil des gegnerischen Angriffs ab … */
  | { type: "guarded"; prevented: number }
  /** … und der Gegner erleidet Konter- bzw. Rückwurfschaden */
  | { type: "counter"; damage: number }
  /** Giftschaden – `target` ist, wer vergiftet ist */
  | { type: "poison"; target: Side; damage: number }
  /** Feuerschaden – `target` ist, wer brennt */
  | { type: "burn"; target: Side; damage: number }
  /** Blutungsschaden – `target` ist, wer blutet */
  | { type: "bleed"; target: Side; damage: number }
  /** Der betäubte Gegner setzt diese Runde aus */
  | { type: "stunned" }
  /** Der Boss setzt seine Fähigkeit ein – die Treffer folgen als "hit" */
  | { type: "bossAbility"; bossId: string; abilityId: string }
  /** Bollwerk hat den Angriff des Gegners komplett geblockt */
  | { type: "blocked" }
  /** Der Gegner heilt sich (Lebensentzug) */
  | { type: "drain"; heal: number }
  /** Der Gegner raubt dem Helden Mana */
  | { type: "manaBurn"; amount: number }
  | { type: "defeated"; side: Side }
  | { type: "fled"; goldLost: number }
  /** Klassen-Regeneration (Kleriker) am Ende der Runde */
  | { type: "regen"; heal: number };

/** Schaden pro Runde (Gift, Feuer, Bluten) – ignoriert Rüstung */
export interface DamageOverTime {
  damage: number;
  /** Verbleibende Runden inklusive der aktuellen */
  roundsLeft: number;
}

export type BattleStatus = "active" | "won" | "lost" | "fled";

export interface ActiveBuff {
  /** Zusätzlicher Anteil (0.3 = +30 %) */
  percent: number;
  /** Verbleibende Runden inklusive der aktuellen */
  roundsLeft: number;
}

export interface BattleState {
  id: string;
  creatureId: string;
  hero: Combatant;
  enemy: Combatant;
  round: number;
  potionUsedThisRound: boolean;
  /** Sorten, die in diesem Kampf schon getrunken wurden – jede nur einmal pro Kampf. */
  potionsUsed: string[];
  /** Aktive Verstärkungen des Helden durch Tränke */
  buffs: Partial<Record<BuffKind, ActiveBuff>>;
  mana: number;
  maxMana: number;
  /** Fähigkeiten, die der Held in diesem Kampf einsetzen kann */
  abilities: AbilityId[];
  /** Abklingzeiten: verbleibende Runden, bis die Fähigkeit wieder geht (fehlt bei älteren Kämpfen) */
  cooldowns?: Partial<Record<AbilityId, number>>;
  /** Aktive Klasse des Helden (fehlt bei älteren Kämpfen) */
  heroClass?: HeroClassId | null;
  /** Wirkungen der Fähigkeiten auf den Gegner */
  enemyEffects: {
    poison?: DamageOverTime;
    burn?: DamageOverTime;
    bleed?: DamageOverTime;
    /** Rüstungsminderung für den Rest des Kampfes (0.3 = −30 %) */
    armorBreak?: number;
    /** Geschwächt: macht `percent` weniger Schaden */
    weaken?: ActiveBuff;
    /** Verwundbar: erleidet `percent` mehr Schaden */
    vulnerable?: ActiveBuff;
  };
  /** Wirkungen auf den Helden */
  heroEffects: {
    /** Gift, Feuer und Bluten durch Boss-Fähigkeiten */
    poison?: DamageOverTime;
    burn?: DamageOverTime;
    bleed?: DamageOverTime;
    /** Bollwerk: der nächste gegnerische Angriff wird geblockt */
    bulwark?: boolean;
    /** Parade/Vergeltung gegen den nächsten gegnerischen Angriff */
    guard?: Guard;
    /** Kriegsschrei: mehr Schaden */
    empower?: ActiveBuff;
  };
  status: BattleStatus;
  /** Alle Ereignisse mit Rundennummer – für das Kampfprotokoll. */
  log: (BattleEvent & { round: number })[];
}

/**
 * Beginnt einen Kampf. `heroHp` setzt die Lebenspunkte des Helden – in Dungeons
 * bleiben sie zwischen den Kämpfen erhalten (sonst startet man mit vollen LP).
 */
export function startBattle(
  id: string,
  heroName: string,
  hero: HeroCombatProfile,
  creature: CreatureDef,
  heroHp: number = hero.maxHp,
): BattleState {
  const enemy = getCreatureStats(creature);
  return {
    id,
    creatureId: creature.id,
    hero: {
      name: heroName,
      level: hero.level,
      maxHp: hero.maxHp,
      hp: Math.max(1, Math.min(hero.maxHp, Math.round(heroHp))),
      damage: hero.damage,
      armor: hero.armor,
      critChance: hero.critChance,
      critMultiplier: hero.critMultiplier,
    },
    enemy: { name: creature.name, level: creature.level, hp: enemy.maxHp, ...enemy },
    round: 1,
    potionUsedThisRound: false,
    potionsUsed: [],
    buffs: {},
    mana: hero.maxMana,
    maxMana: hero.maxMana,
    abilities: hero.abilities,
    cooldowns: {},
    heroClass: hero.heroClass,
    enemyEffects: {},
    heroEffects: {},
    status: "active",
    log: [],
  };
}

/** Der Held mit den Werten aktiver Verstärkungen (Schaden, Rüstung). */
export function buffedHero(state: BattleState): Combatant {
  const { hero, buffs } = state;
  return {
    ...hero,
    damage: hero.damage * (1 + (buffs.attack?.percent ?? 0)),
    armor: Math.round(hero.armor * (1 + (buffs.armor?.percent ?? 0))),
  };
}

/** Warum dieser Trank gerade nicht getrunken werden kann – oder null, wenn es geht. */
export function potionBlocker(state: BattleState, potion: PotionDef): string | null {
  if (state.status !== "active") return "Der Kampf ist vorbei.";
  if (state.potionsUsed.includes(potion.id)) return "Diese Sorte hast du in diesem Kampf schon getrunken.";
  if (state.potionUsedThisRound) return "Pro Runde ist nur ein Trank erlaubt.";
  if (potion.effect.kind === "heal" && state.hero.hp >= state.hero.maxHp) return "Deine Lebenspunkte sind schon voll.";
  return null;
}

/**
 * Anteil des Schadens, den Rüstung abfängt. Je höher das Level des
 * Angreifers, desto mehr Rüstung braucht es für denselben Schutz.
 */
export function armorReduction(armor: number, attackerLevel: number): number {
  return armor / (armor + 50 + attackerLevel * 10);
}

export function rollHit(
  attacker: Combatant,
  defender: Combatant,
  rng: () => number,
): { damage: number; crit: boolean } {
  const crit = rng() < attacker.critChance;
  const spread = 0.85 + rng() * 0.3;
  const raw = attacker.damage * spread * (1 - armorReduction(defender.armor, attacker.level));
  return { damage: Math.max(1, Math.round(raw * (crit ? (attacker.critMultiplier ?? 1.5) : 1))), crit };
}

export type RoundResult = { state: BattleState; events: BattleEvent[] };

function assertActive(state: BattleState) {
  if (state.status !== "active") throw new Error("Der Kampf ist vorbei.");
}

/**
 * Trank trinken – höchstens einer pro Runde, jede Sorte nur einmal pro Kampf,
 * Heiltränke nicht bei vollen Lebenspunkten. Verstärkungen gelten ab sofort.
 */
export function drinkPotion(state: BattleState, potion: PotionDef): RoundResult {
  const blocker = potionBlocker(state, potion);
  if (blocker) throw new Error(blocker);
  const { effect } = potion;
  const factor = state.heroClass === "cleric" && effect.kind === "heal" ? CLERIC_POTION_FACTOR : 1;
  const heal = Math.min(Math.round(potionHeal(potion, state.hero.maxHp) * factor), state.hero.maxHp - state.hero.hp);
  const buff = effect.kind === "heal" ? undefined : effect.kind;
  const event: BattleEvent = { type: "potion", potionId: potion.id, heal, ...(buff && { buff }) };
  return {
    state: {
      ...state,
      hero: { ...state.hero, hp: state.hero.hp + heal },
      buffs:
        effect.kind === "heal"
          ? state.buffs
          : { ...state.buffs, [effect.kind]: { percent: effect.percent, roundsLeft: effect.rounds } },
      potionUsedThisRound: true,
      potionsUsed: [...state.potionsUsed, potion.id],
      log: [...state.log, { ...event, round: state.round }],
    },
    events: [event],
  };
}

/** Eine Runde Gift/Feuer/Bluten ist vorbei – nach der letzten verschwindet es. */
function tickOverTime(effect: DamageOverTime): DamageOverTime | undefined {
  return effect.roundsLeft > 1 ? { ...effect, roundsLeft: effect.roundsLeft - 1 } : undefined;
}

/** Gift, Feuer und Bluten – in dieser Reihenfolge wirken sie pro Runde. */
const OVER_TIME = ["poison", "burn", "bleed"] as const;

/** Eine Runde einer zeitlich begrenzten Wirkung ist vorbei. */
function tickBuff(buff: ActiveBuff | undefined): ActiveBuff | undefined {
  return buff && buff.roundsLeft > 1 ? { ...buff, roundsLeft: buff.roundsLeft - 1 } : undefined;
}

/** Nach jeder Runde läuft eine Runde der Verstärkungen ab. */
function tickBuffs(buffs: BattleState["buffs"]): BattleState["buffs"] {
  const next: BattleState["buffs"] = {};
  for (const [kind, buff] of Object.entries(buffs) as [BuffKind, ActiveBuff][]) {
    if (buff.roundsLeft > 1) next[kind] = { ...buff, roundsLeft: buff.roundsLeft - 1 };
  }
  return next;
}

/** Hinweis für eine Fähigkeit, die noch abklingt. */
export function cooldownText(rounds: number): string {
  return `Abklingzeit: noch ${rounds} ${rounds === 1 ? "Runde" : "Runden"}.`;
}

/**
 * Nach einer Runde: Abklingzeiten laufen ab. Die gerade eingesetzte Fähigkeit
 * bekommt ihre volle Abklingzeit – sie ist die nächsten `cooldown` Runden gesperrt.
 */
export function tickCooldowns(
  cooldowns: Partial<Record<AbilityId, number>> | undefined,
  used: { id: AbilityId; cooldown: number } | null,
): Partial<Record<AbilityId, number>> {
  const next: Partial<Record<AbilityId, number>> = {};
  for (const [id, rounds] of Object.entries(cooldowns ?? {}) as [AbilityId, number][]) {
    if (rounds > 1) next[id] = rounds - 1;
  }
  if (used && used.cooldown > 0) next[used.id] = used.cooldown;
  return next;
}

/** Warum diese Fähigkeit gerade nicht geht – oder null. */
export function abilityBlocker(state: BattleState, id: AbilityId): string | null {
  if (state.status !== "active") return "Der Kampf ist vorbei.";
  if (!state.abilities.includes(id)) return "Dafür brauchst du die passende Waffe und die freigeschaltete Fähigkeit.";
  const wait = state.cooldowns?.[id] ?? 0;
  if (wait > 0) return cooldownText(wait);
  const { manaCost } = classAbility(id, state.heroClass);
  if (state.mana < manaCost) return `Nicht genug Mana (${manaCost} nötig).`;
  return null;
}

/**
 * Eine Runde: Angriff des Helden – normal oder mit einer Fähigkeit –,
 * danach Gift, Feuer, Bluten und Gegenangriff der Kreatur (ausser sie ist betäubt).
 * Am Ende regeneriert der Held etwas Mana.
 */
export function attackRound(
  state: BattleState,
  rng: () => number = Math.random,
  abilityId?: AbilityId,
): RoundResult {
  assertActive(state);
  const ability = abilityId ? classAbility(abilityId, state.heroClass) : null;
  if (abilityId) {
    const blocker = abilityBlocker(state, abilityId);
    if (blocker) throw new Error(blocker);
  }
  const events: BattleEvent[] = [];
  let hero = state.hero;
  let enemy = state.enemy;
  let enemyEffects = state.enemyEffects;
  let heroEffects = state.heroEffects;
  let mana = state.mana;
  let status: BattleStatus = "active";
  // Verstärkungen wirken auf Schaden und Rüstung, die Lebenspunkte bleiben die echten.
  const strongBase = buffedHero(state);
  // Berserker: bei wenig Lebenspunkten mehr Schaden; Kriegsschrei: Verstärkung
  const strong = {
    ...strongBase,
    damage:
      strongBase.damage * rageFactor(state.heroClass, hero.hp, hero.maxHp) * (1 + (heroEffects.empower?.percent ?? 0)),
  };

  // 1. Aktion des Helden
  if (ability) {
    mana -= ability.manaCost;
    events.push({ type: "ability", ability: ability.id, weapon: ability.weapon, manaCost: ability.manaCost });
    if (ability.bulwark) heroEffects = { ...heroEffects, bulwark: true };
    if (ability.guard) heroEffects = { ...heroEffects, guard: ability.guard };
    // +1, weil die Verstärkung erst ab der nächsten Runde zählt (am Rundenende läuft eine ab)
    if (ability.empower) heroEffects = { ...heroEffects, empower: { percent: ability.empower.percent, roundsLeft: ability.empower.rounds + 1 } };
    if (ability.weaken) enemyEffects = { ...enemyEffects, weaken: { percent: ability.weaken.percent, roundsLeft: ability.weaken.rounds } };
    if (ability.vulnerable) {
      enemyEffects = { ...enemyEffects, vulnerable: { percent: ability.vulnerable.percent, roundsLeft: ability.vulnerable.rounds } };
    }
    if (ability.heal) {
      const heal = Math.min(hero.maxHp - hero.hp, Math.round(hero.maxHp * ability.heal));
      hero = { ...hero, hp: hero.hp + heal };
      if (heal > 0) events.push({ type: "selfHeal", heal });
    }
    if (ability.armorBreak) enemyEffects = { ...enemyEffects, armorBreak: ability.armorBreak };
    for (const kind of OVER_TIME) {
      const effect = ability[kind];
      if (!effect) continue;
      const damage = Math.max(1, Math.round(strong.damage * effect.percent));
      enemyEffects = { ...enemyEffects, [kind]: { damage, roundsLeft: effect.rounds } };
    }
  }
  // Finisher (Meucheln): mehr Schaden gegen angeschlagene Gegner
  const execute = ability?.execute && enemy.hp < enemy.maxHp * ability.execute.threshold ? ability.execute.factor : 1;
  const vulnerable = 1 + (enemyEffects.vulnerable?.percent ?? 0);
  const attacker: Combatant = ability
    ? {
        ...strong,
        damage: strong.damage * ability.multiplier * execute * vulnerable,
        critChance: ability.guaranteedCrit ? 1 : strong.critChance,
      }
    : { ...strong, damage: strong.damage * vulnerable };
  const targetArmor = ability?.ignoreArmor ? 0 : Math.round(enemy.armor * (1 - (enemyEffects.armorBreak ?? 0)));
  let dealtByHero = 0;
  const strike = () => {
    const heroHit = rollHit(attacker, { ...enemy, armor: targetArmor }, rng);
    dealtByHero += Math.min(enemy.hp, heroHit.damage);
    enemy = { ...enemy, hp: Math.max(0, enemy.hp - heroHit.damage) };
    events.push({ type: "hit", attacker: "hero", ...heroHit });
    // Plünderer: kritische Treffer lassen bluten
    if (heroHit.crit && state.heroClass === "plunderer" && enemy.hp > 0) {
      const damage = Math.max(1, Math.round(strong.damage * PLUNDERER_BLEED.percent));
      if ((enemyEffects.bleed?.damage ?? 0) <= damage) {
        enemyEffects = { ...enemyEffects, bleed: { damage, roundsLeft: PLUNDERER_BLEED.rounds } };
      }
    }
  };
  for (let i = 0; i < (ability?.hits ?? 1) && enemy.hp > 0; i++) strike();
  // Duellant: Chance auf einen zweiten Schlag bei normalen Angriffen
  if (!ability && state.heroClass === "duelist" && enemy.hp > 0 && rng() < DUELIST_EXTRA_HIT) strike();
  // Blutrausch: Lebensraub
  if (ability?.lifesteal && dealtByHero > 0) {
    const heal = Math.min(hero.maxHp - hero.hp, Math.round(dealtByHero * ability.lifesteal));
    hero = { ...hero, hp: hero.hp + heal };
    if (heal > 0) events.push({ type: "selfHeal", heal });
  }

  // 2. Gift, Feuer und Bluten wirken nach der Aktion des Helden – erst beim Gegner, dann beim Helden
  for (const kind of OVER_TIME) {
    const effect = enemyEffects[kind];
    if (effect && enemy.hp > 0) {
      const damage = Math.round(effect.damage * vulnerable);
      enemy = { ...enemy, hp: Math.max(0, enemy.hp - damage) };
      events.push({ type: kind, target: "enemy", damage });
      enemyEffects = { ...enemyEffects, [kind]: tickOverTime(effect) };
    }
  }
  for (const kind of OVER_TIME) {
    const effect = heroEffects[kind];
    if (effect && enemy.hp > 0 && hero.hp > 0) {
      hero = { ...hero, hp: Math.max(0, hero.hp - effect.damage) };
      events.push({ type: kind, target: "hero", damage: effect.damage });
      heroEffects = { ...heroEffects, [kind]: tickOverTime(effect) };
    }
  }

  // 3. Gegenangriff (entfällt bei Betäubung) – Bosse setzen regelmässig ihre Fähigkeit ein
  if (enemy.hp === 0) {
    status = "won";
    events.push({ type: "defeated", side: "enemy" });
  } else if (hero.hp === 0) {
    status = "lost";
    events.push({ type: "defeated", side: "hero" });
  } else if (ability?.stun) {
    events.push({ type: "stunned" });
  } else {
    const special = bossAbilityDue(state.creatureId, state.round);
    if (special) events.push({ type: "bossAbility", bossId: special.bossId, abilityId: special.id });
    if (heroEffects.bulwark) {
      // Bollwerk blockt den ganzen Angriff samt Zusatzeffekten.
      events.push({ type: "blocked" });
      heroEffects = { ...heroEffects, bulwark: undefined };
    } else {
      // Geschwächte Gegner machen weniger Schaden
      const weakened = 1 - (enemyEffects.weaken?.percent ?? 0);
      const attacker = { ...enemy, damage: enemy.damage * (special?.multiplier ?? 1) * weakened };
      const defender = special?.ignoreArmor ? { ...strong, armor: 0 } : strong;
      const guard = heroEffects.guard;
      let dealt = 0;
      let raw = 0;
      for (let i = 0; i < (special?.hits ?? 1) && hero.hp > 0; i++) {
        const enemyHit = rollHit(attacker, defender, rng);
        // Parade/Vergeltung: nur ein Teil des Schadens kommt durch
        const damage = guard ? Math.max(1, Math.round(enemyHit.damage * guard.reduce)) : enemyHit.damage;
        raw += enemyHit.damage;
        hero = { ...hero, hp: Math.max(0, hero.hp - damage) };
        dealt += damage;
        events.push({ type: "hit", attacker: "enemy", ...enemyHit, damage });
      }
      if (guard) {
        heroEffects = { ...heroEffects, guard: undefined };
        events.push({ type: "guarded", prevented: raw - dealt });
        let counter = guard.reflect ? Math.round(raw * guard.reflect) : 0;
        if (guard.counter && hero.hp > 0) {
          counter += rollHit({ ...strong, damage: strong.damage * guard.counter }, { ...enemy, armor: targetArmor }, rng).damage;
        }
        if (counter > 0) {
          enemy = { ...enemy, hp: Math.max(0, enemy.hp - counter) };
          events.push({ type: "counter", damage: counter });
        }
      }
      if (special?.drain) {
        const heal = Math.min(enemy.maxHp - enemy.hp, Math.round(dealt * special.drain));
        enemy = { ...enemy, hp: enemy.hp + heal };
        if (heal > 0) events.push({ type: "drain", heal });
      }
      if (special?.manaBurn) {
        const amount = Math.min(mana, special.manaBurn);
        mana -= amount;
        if (amount > 0) events.push({ type: "manaBurn", amount });
      }
      for (const kind of OVER_TIME) {
        const effect = special?.[kind];
        if (!effect) continue;
        const damage = Math.max(1, Math.round(enemy.damage * effect.percent));
        heroEffects = { ...heroEffects, [kind]: { damage, roundsLeft: effect.rounds } };
      }
    }
    if (enemy.hp === 0) {
      status = "won";
      events.push({ type: "defeated", side: "enemy" });
    } else if (hero.hp === 0) {
      status = "lost";
      events.push({ type: "defeated", side: "hero" });
    }
  }

  // Kleriker: Regeneration am Ende der Runde
  if (status === "active" && state.heroClass === "cleric" && hero.hp > 0) {
    const heal = Math.min(hero.maxHp - hero.hp, Math.round(hero.maxHp * CLERIC_REGEN));
    if (heal > 0) {
      hero = { ...hero, hp: hero.hp + heal };
      events.push({ type: "regen", heal });
    }
  }

  return {
    state: {
      ...state,
      hero,
      enemy,
      enemyEffects: { ...enemyEffects, weaken: tickBuff(enemyEffects.weaken), vulnerable: tickBuff(enemyEffects.vulnerable) },
      heroEffects: { ...heroEffects, empower: tickBuff(heroEffects.empower) },
      mana: Math.min(state.maxMana, mana + MANA_REGEN),
      cooldowns: tickCooldowns(state.cooldowns, ability),
      status,
      round: status === "active" ? state.round + 1 : state.round,
      potionUsedThisRound: false,
      buffs: tickBuffs(state.buffs),
      log: [...state.log, ...events.map((e) => ({ ...e, round: state.round }))],
    },
    events,
  };
}

/**
 * Fliehen kostet die durchschnittliche Gold-Beute der Kreatur (höchstens das,
 * was der Held besitzt). Die Kreatur bekommt keinen Gegenangriff mehr.
 */
export function fleeCost(creature: CreatureDef, gold: number): number {
  return Math.min(gold, getCreatureGold(creature));
}

export function flee(state: BattleState, goldLost: number): RoundResult {
  assertActive(state);
  const event: BattleEvent = { type: "fled", goldLost };
  return {
    state: { ...state, status: "fled", log: [...state.log, { ...event, round: state.round }] },
    events: [event],
  };
}

export interface BattleReward {
  xp: number;
  gold: number;
  loot: Loot;
  /** Seltenes, einzigartiges Boss-Item (zusätzlich zur normalen Beute) */
  bossLoot: Loot;
  potions: { potionId: string; count: number } | null;
  /** Seltener Angriffs- oder Rüstungstrank (ID), zusätzlich zu den Heiltränken */
  buffPotion: string | null;
}

/**
 * Dungeon-Truhe: Im Dungeon wird die Beute aller Kämpfe gesammelt und erst
 * am Ende (oder beim freiwilligen Verlassen) auf einmal gutgeschrieben.
 * Bei einer Niederlage ist die Truhe verloren.
 */
export interface DungeonChest {
  xp: number;
  gold: number;
  /** Boss-Items zuerst, dann die übrige Beute in Fundreihenfolge */
  items: OwnedItem[];
  /** Trank-ID → Anzahl */
  potions: Record<string, number>;
}

export const EMPTY_CHEST: DungeonChest = { xp: 0, gold: 0, items: [], potions: {} };

/** Legt die Belohnung eines Kampfes in die Truhe. */
export function addToChest(chest: DungeonChest, reward: BattleReward): DungeonChest {
  const potions = { ...chest.potions };
  if (reward.potions) potions[reward.potions.potionId] = (potions[reward.potions.potionId] ?? 0) + reward.potions.count;
  if (reward.buffPotion) potions[reward.buffPotion] = (potions[reward.buffPotion] ?? 0) + 1;
  const bossItems = [...chest.items.filter((i) => getItem(i.itemId).bossId), reward.bossLoot];
  const otherItems = [...chest.items.filter((i) => !getItem(i.itemId).bossId), reward.loot];
  return {
    xp: chest.xp + reward.xp,
    gold: chest.gold + reward.gold,
    items: [...bossItems, ...otherItems].filter((i) => i !== null),
    potions,
  };
}

/** Anzahl der Dinge in der Truhe (Items und Tränke) – für Hinweise wie „5 Beutestücke“. */
export function chestCount(chest: DungeonChest): number {
  return chest.items.length + Object.values(chest.potions).reduce((sum, n) => sum + n, 0);
}

/** Chance pro Sieg auf einen Angriffs- oder Rüstungstrank – bei jedem Gegner gleich. */
export const BUFF_POTION_DROP_CHANCE = 0.06;

export function rollBuffPotion(rng: () => number = Math.random): string | null {
  if (rng() >= BUFF_POTION_DROP_CHANCE) return null;
  return BUFF_POTIONS[Math.floor(rng() * BUFF_POTIONS.length)].id;
}

/** Chance pro Bosssieg (Gebiets- und Dungeon-Bosse) auf eines seiner legendären Boss-Items. */
export const BOSS_ITEM_DROP_CHANCE = 0.1;

/** Boss-Items gibt es nur von ihrem Boss – immer legendär. */
export function rollBossLoot(creature: CreatureDef, uid: string, rng: () => number = Math.random): Loot {
  const items = getBossItems(creature.id);
  if (items.length === 0 || rng() >= BOSS_ITEM_DROP_CHANCE) return null;
  return createItem(items[Math.floor(rng() * items.length)].id, "legendary", uid, rng);
}

/** Belohnung für einen Sieg: XP, Gold (mit Charisma-Bonus), ggf. ein Item, Tränke und bei Bossen ein Boss-Item. */
export function rollBattleReward(
  creature: CreatureDef,
  hero: HeroCombatProfile,
  uid: string,
  rng: () => number = Math.random,
): BattleReward {
  const { dropChance, weights } = getCreatureLoot(creature);
  const potionDrop = getCreaturePotionDrop(creature);
  return {
    xp: getCreatureXp(creature),
    loot: rollDrop(dropChance, weights, creature.level, uid, rng),
    potions: rng() < potionDrop.chance ? { potionId: potionDrop.potionId, count: potionDrop.count } : null,
    bossLoot: rollBossLoot(creature, `${uid}-boss`, rng),
    buffPotion: rollBuffPotion(rng),
    gold: Math.round(rollCreatureGold(creature, rng) * (1 + hero.goldBonus)),
  };
}
