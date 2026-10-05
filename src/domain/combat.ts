// Rundenbasierter Kampf: Held gegen Kreatur. Reine Logik ohne Grafik –
// Phaser bekommt nur die Ereignisse (Treffer, Heilung, Sieg) zum Animieren.
//
// Ablauf einer Runde:
//   1. optional: ein Trank (höchstens einer pro Runde, jede Sorte einmal pro Kampf)
//   2. Angriff des Helden – normal oder mit einer Waffen-Fähigkeit (kostet Mana) –
//      oder Flucht (kostet Gold, beendet den Kampf)
//   3. Gift wirkt, dann Gegenangriff der Kreatur (falls sie noch steht und nicht betäubt ist)
//   4. Der Held regeneriert etwas Mana

import { getCombatStats, getEffectiveStats } from "./equipment";
import {
  getCreatureGold,
  getCreatureLoot,
  getCreaturePotionDrop,
  getCreatureStats,
  getCreatureXp,
  type CreatureDef,
} from "./creatures";
import { createItem, getBossItems, getItem } from "./items";
import { getLevel } from "./leveling";
import { rollDrop } from "./loot";
import { BUFF_POTIONS, potionHeal, type BuffKind, type PotionDef } from "./potions";
import { skillArmorBonus, skillDamageBonus, type SkillWeapon } from "./skills";
import { bossAbilityDue } from "./bossAbilities";
import { getSetHpMultiplier } from "./bossSets";
import { ABILITIES, getAbility, MANA_REGEN, maxManaFor } from "./abilities";
import type { Character, Equipment, Loot } from "./types";

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
  /** Fähigkeiten der angelegten Waffen */
  abilities: SkillWeapon[];
}

/** Fähigkeiten aller angelegten Waffen (Schilde haben keine), ohne Doppelte. */
export function availableAbilities(equipment: Equipment): SkillWeapon[] {
  const types = [equipment.weapon1, equipment.weapon2]
    .filter((o) => o !== null)
    .map((o) => getItem(o.itemId).type)
    .filter((t): t is SkillWeapon => ABILITIES.some((a) => a.weapon === t));
  return [...new Set(types)];
}

/**
 * Was die Attribute im Kampf bewirken:
 * - Stärke:      +0.25 Schaden pro Punkt
 * - Ausdauer:    +1.5 Lebenspunkte pro Punkt
 * - Intelligenz: +0.2 % kritische Trefferchance und +1 Mana pro Punkt
 * - Charisma:    +0.5 % Gold pro Sieg pro Punkt (max. +100 %)
 * Dazu kommt der Skilltree: +2 % Waffenschaden pro Rang im jeweiligen Waffentyp,
 * beim Schild +2 % Schild-Rüstung pro Rang.
 */
export function getHeroCombatProfile(character: Character, equipment: Equipment): HeroCombatProfile {
  const level = getLevel(character.totalXp);
  const stats = getEffectiveStats(character.stats, equipment);
  const gear = getCombatStats(equipment);
  return {
    level,
    maxHp: Math.round((80 + (level - 1) * 12 + stats.endurance * 1.5) * getSetHpMultiplier(equipment)),
    damage: 5 + gear.attack + skillDamageBonus(character, equipment) + stats.strength * 0.25,
    armor: gear.armor + skillArmorBonus(character, equipment),
    critChance: Math.min(0.3, 0.05 + stats.intellect * 0.002),
    goldBonus: Math.min(1, stats.charisma * 0.005),
    maxMana: maxManaFor(level, stats.intellect),
    abilities: availableAbilities(equipment),
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
}

export type BattleEvent =
  /** `heal` = geheilte LP (0 bei Verstärkungstränken), `buff` = welche Verstärkung beginnt */
  | { type: "potion"; potionId: string; heal: number; buff?: BuffKind }
  | { type: "hit"; attacker: Side; damage: number; crit: boolean }
  /** Der Held setzt eine Fähigkeit ein – die Treffer folgen als "hit" */
  | { type: "ability"; weapon: SkillWeapon; manaCost: number }
  /** Giftschaden – `target` ist, wer vergiftet ist */
  | { type: "poison"; target: Side; damage: number }
  /** Der betäubte Gegner setzt diese Runde aus */
  | { type: "stunned" }
  /** Der Boss setzt seine Fähigkeit ein – die Treffer folgen als "hit" */
  | { type: "bossAbility"; bossId: string }
  /** Bollwerk hat den Angriff des Gegners komplett geblockt */
  | { type: "blocked" }
  /** Der Gegner heilt sich (Lebensentzug) */
  | { type: "drain"; heal: number }
  /** Der Gegner raubt dem Helden Mana */
  | { type: "manaBurn"; amount: number }
  | { type: "defeated"; side: Side }
  | { type: "fled"; goldLost: number };

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
  abilities: SkillWeapon[];
  /** Wirkungen der Fähigkeiten auf den Gegner */
  enemyEffects: {
    poison?: { damage: number; roundsLeft: number };
    /** Rüstungsminderung für den Rest des Kampfes (0.3 = −30 %) */
    armorBreak?: number;
  };
  /** Wirkungen auf den Helden */
  heroEffects: {
    /** Gift/Verbrennung durch Boss-Fähigkeiten */
    poison?: { damage: number; roundsLeft: number };
    /** Bollwerk: der nächste gegnerische Angriff wird geblockt */
    bulwark?: boolean;
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
    },
    enemy: { name: creature.name, level: creature.level, hp: enemy.maxHp, ...enemy },
    round: 1,
    potionUsedThisRound: false,
    potionsUsed: [],
    buffs: {},
    mana: hero.maxMana,
    maxMana: hero.maxMana,
    abilities: hero.abilities,
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
  return { damage: Math.max(1, Math.round(raw * (crit ? 1.5 : 1))), crit };
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
  const heal = Math.min(potionHeal(potion, state.hero.maxHp), state.hero.maxHp - state.hero.hp);
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

/** Eine Runde Gift ist vorbei – nach der letzten verschwindet es. */
function tickPoison(poison: { damage: number; roundsLeft: number }) {
  return poison.roundsLeft > 1 ? { ...poison, roundsLeft: poison.roundsLeft - 1 } : undefined;
}

/** Nach jeder Runde läuft eine Runde der Verstärkungen ab. */
function tickBuffs(buffs: BattleState["buffs"]): BattleState["buffs"] {
  const next: BattleState["buffs"] = {};
  for (const [kind, buff] of Object.entries(buffs) as [BuffKind, ActiveBuff][]) {
    if (buff.roundsLeft > 1) next[kind] = { ...buff, roundsLeft: buff.roundsLeft - 1 };
  }
  return next;
}

/** Warum diese Fähigkeit gerade nicht geht – oder null. */
export function abilityBlocker(state: BattleState, weapon: SkillWeapon): string | null {
  if (state.status !== "active") return "Der Kampf ist vorbei.";
  if (!state.abilities.includes(weapon)) return "Dafür brauchst du die passende Waffe.";
  const { manaCost } = getAbility(weapon);
  if (state.mana < manaCost) return `Nicht genug Mana (${manaCost} nötig).`;
  return null;
}

/**
 * Eine Runde: Angriff des Helden – normal oder mit einer Fähigkeit –,
 * danach Gift und Gegenangriff der Kreatur (ausser sie ist betäubt).
 * Am Ende regeneriert der Held etwas Mana.
 */
export function attackRound(
  state: BattleState,
  rng: () => number = Math.random,
  abilityWeapon?: SkillWeapon,
): RoundResult {
  assertActive(state);
  const ability = abilityWeapon ? getAbility(abilityWeapon) : null;
  if (abilityWeapon) {
    const blocker = abilityBlocker(state, abilityWeapon);
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
  const strong = buffedHero(state);

  // 1. Aktion des Helden
  if (ability) {
    mana -= ability.manaCost;
    events.push({ type: "ability", weapon: ability.weapon, manaCost: ability.manaCost });
    if (ability.bulwark) heroEffects = { ...heroEffects, bulwark: true };
    if (ability.armorBreak) enemyEffects = { ...enemyEffects, armorBreak: ability.armorBreak };
    if (ability.poison) {
      const damage = Math.max(1, Math.round(strong.damage * ability.poison.percent));
      enemyEffects = { ...enemyEffects, poison: { damage, roundsLeft: ability.poison.rounds } };
    }
  }
  const attacker: Combatant = ability
    ? {
        ...strong,
        damage: strong.damage * ability.multiplier,
        critChance: ability.guaranteedCrit ? 1 : strong.critChance,
      }
    : strong;
  const targetArmor = ability?.ignoreArmor ? 0 : Math.round(enemy.armor * (1 - (enemyEffects.armorBreak ?? 0)));
  for (let i = 0; i < (ability?.hits ?? 1) && enemy.hp > 0; i++) {
    const heroHit = rollHit(attacker, { ...enemy, armor: targetArmor }, rng);
    enemy = { ...enemy, hp: Math.max(0, enemy.hp - heroHit.damage) };
    events.push({ type: "hit", attacker: "hero", ...heroHit });
  }

  // 2. Gift wirkt nach der Aktion des Helden – erst beim Gegner, dann beim Helden
  const poison = enemyEffects.poison;
  if (poison && enemy.hp > 0) {
    enemy = { ...enemy, hp: Math.max(0, enemy.hp - poison.damage) };
    events.push({ type: "poison", target: "enemy", damage: poison.damage });
    enemyEffects = { ...enemyEffects, poison: tickPoison(poison) };
  }
  const heroPoison = heroEffects.poison;
  if (heroPoison && enemy.hp > 0) {
    hero = { ...hero, hp: Math.max(0, hero.hp - heroPoison.damage) };
    events.push({ type: "poison", target: "hero", damage: heroPoison.damage });
    heroEffects = { ...heroEffects, poison: tickPoison(heroPoison) };
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
    if (special) events.push({ type: "bossAbility", bossId: special.bossId });
    if (heroEffects.bulwark) {
      // Bollwerk blockt den ganzen Angriff samt Zusatzeffekten.
      events.push({ type: "blocked" });
      heroEffects = { ...heroEffects, bulwark: undefined };
    } else {
      const attacker = special ? { ...enemy, damage: enemy.damage * special.multiplier } : enemy;
      const defender = special?.ignoreArmor ? { ...strong, armor: 0 } : strong;
      let dealt = 0;
      for (let i = 0; i < (special?.hits ?? 1) && hero.hp > 0; i++) {
        const enemyHit = rollHit(attacker, defender, rng);
        hero = { ...hero, hp: Math.max(0, hero.hp - enemyHit.damage) };
        dealt += enemyHit.damage;
        events.push({ type: "hit", attacker: "enemy", ...enemyHit });
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
      if (special?.poison) {
        const damage = Math.max(1, Math.round(enemy.damage * special.poison.percent));
        heroEffects = { ...heroEffects, poison: { damage, roundsLeft: special.poison.rounds } };
      }
    }
    if (hero.hp === 0) {
      status = "lost";
      events.push({ type: "defeated", side: "hero" });
    }
  }

  return {
    state: {
      ...state,
      hero,
      enemy,
      enemyEffects,
      heroEffects,
      mana: Math.min(state.maxMana, mana + MANA_REGEN),
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
 * Fliehen kostet so viel Gold, wie ein Sieg gebracht hätte (höchstens das,
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

/** Chance pro Sieg auf einen Angriffs- oder Rüstungstrank – bei jedem Gegner gleich. */
export const BUFF_POTION_DROP_CHANCE = 0.06;

export function rollBuffPotion(rng: () => number = Math.random): string | null {
  if (rng() >= BUFF_POTION_DROP_CHANCE) return null;
  return BUFF_POTIONS[Math.floor(rng() * BUFF_POTIONS.length)].id;
}

/** Chance pro Bosssieg auf eines seiner vier legendären Boss-Items. */
export const BOSS_ITEM_DROP_CHANCE = 0.05;

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
    gold: Math.round(getCreatureGold(creature) * (1 + hero.goldBonus)),
    loot: rollDrop(dropChance, weights, creature.level, uid, rng),
    potions: rng() < potionDrop.chance ? { potionId: potionDrop.potionId, count: potionDrop.count } : null,
    bossLoot: rollBossLoot(creature, `${uid}-boss`, rng),
    buffPotion: rollBuffPotion(rng),
  };
}
