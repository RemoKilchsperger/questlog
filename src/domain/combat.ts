// Rundenbasierter Kampf: Held gegen Kreatur. Reine Logik ohne Grafik –
// Phaser bekommt nur die Ereignisse (Treffer, Heilung, Sieg) zum Animieren.
//
// Ablauf einer Runde:
//   1. optional: ein Trank (höchstens einer pro Runde, jede Sorte einmal pro Kampf)
//   2. Angriff des Helden – normal oder mit einer Waffen-Fähigkeit (kostet Mana) –
//      oder Flucht (kostet Gold, beendet den Kampf)
//   3. Gift, Feuer und Bluten wirken, dann Gegenangriff der Kreatur (falls sie noch steht und nicht betäubt ist)
//      und ihrer Begleiter
//   4. Der Held regeneriert etwas Mana
//
// Begleiter (Adds): Manche Bosse kämpfen nicht allein. Der Held wählt sein Ziel
// (Standard: der Boss), Flächen-Fähigkeiten treffen mehrere. Fällt der Boss, ist
// der Kampf gewonnen – die Begleiter fliehen. Besiegte Begleiter bleiben liegen.
//
// Boss-Mechaniken (bossMechanics.ts): Begleiter mit Aufgabe (Heiler, Schildträger,
// Trommler) helfen dem Boss, solange sie stehen. Unter der Hälfte seiner LP
// wechselt der Boss einmal in seine zweite Phase (Raserei und/oder Sammelruf).

import { getArmorClassSummary, getCombatStats, getEffectiveStats } from "./equipment";
import {
  getCreatureGold,
  getCreatureGoldDrop,
  getCreatureLoot,
  getCreaturePotionDrop,
  getCreatureStats,
  getCreature,
  getCreatureXp,
  rollCreatureGold,
  type CreatureDef,
} from "./creatures";
import { createItem, getBossItems, getItem, weaponAbilities } from "./items";
import { getLevel } from "./leveling";
import { rollDrop } from "./loot";
import { BUFF_POTIONS, potionHeal, type BuffKind, type PotionDef } from "./potions";
import { addMaterials, creatureMaterials, type MaterialStock } from "./village";
import { skillArmorBonus, skillDamageBonus, type SkillWeapon } from "./skills";
import { bossAbilityDue } from "./bossAbilities";
import { bossDamageDealtFactor, bossDamageTakenFactor, HEALER_HEAL, phaseDue, type AddRole } from "./bossMechanics";
import {
  eliteStats,
  enemyAdds,
  ELITE_REWARD_FACTOR,
  EXPLOSION_FACTOR,
  POISON,
  RAGE_BONUS,
  REGEN_SHARE,
  SWIFT_SHARE,
  VAMPIRE_SHARE,
  type EliteAffix,
} from "./elites";
import { getSetHpMultiplier } from "./bossSets";
import { freshStunImmunity, MANA_REGEN, maxManaFor, tickStunImmunity, type AbilityDef, type AbilityId, type Guard } from "./abilities";
import {
  classAbility,
  classStatBonus,
  CLERIC_POTION_FACTOR,
  CLERIC_REGEN,
  detectHeroClass,
  DUELIST_EXTRA_HIT,
  PLUNDERER_BLEED,
  lifestealShare,
  rageFactor,
  type HeroClassId,
} from "./heroClasses";
import type { Character, Equipment, Loot, OwnedItem } from "./types";
import { attributeDamage, shieldArmorBonus } from "./weaponScaling";
import { mainWeapon, matchupFactor, matchupOf, WEAPON_KIND, type DotKind } from "./matchups";
import { BLESSING, stacks, type BlessingId } from "./tower";
import {
  critBurns,
  EFFECT,
  effectCritBonus,
  effectDamageFactor,
  effectOf,
  has as hasEffect,
  heroDotRounds,
  type ItemEffectId,
} from "./itemEffects";

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
  /** Hauptwaffe – ihre Schadensart zählt bei normalen Angriffen (matchups.ts). Fehlt bei älteren Profilen. */
  weapon?: SkillWeapon | null;
  /** Spezialeffekte der angelegten Items (itemEffects.ts) – jeder nur einmal */
  itemEffects?: ItemEffectId[];
  /** Faktor auf die Wirkung aller Tränke (Meisteralchemist, village.ts) – fehlt: 1 */
  potionPower?: number;
}

/** Fähigkeiten der angelegten Waffen (erst die der ersten Hand, dann die der zweiten), ohne Doppelte. */
export function availableAbilities(equipment: Equipment): AbilityId[] {
  const weapons = [equipment.weapon1, equipment.weapon2].filter((o) => o !== null);
  return [...new Set(weapons.flatMap(weaponAbilities))];
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
  const itemEffects = equippedEffects(equipment);
  return {
    level,
    maxHp: Math.round((80 + (level - 1) * 12 + stats.endurance * 1.5) * getSetHpMultiplier(equipment) * (1 + bonus.hp)),
    damage: (5 + gear.attack + skillDamageBonus(character, equipment) + attributeDamage(stats, equipment)) * (1 + bonus.damage),
    armor: Math.round((gear.armor + skillArmorBonus(character, equipment) + shieldArmorBonus(stats, equipment)) * (1 + bonus.armor)),
    // Die Klassen-Krit-Chance kommt über die normale Obergrenze hinaus dazu
    critChance: Math.min(0.3, 0.05 + stats.charisma * CRIT_PER_CHARISMA + armorClasses.crit) + bonus.crit,
    goldBonus: Math.min(1, stats.charisma * 0.005) + bonus.gold + (hasEffect(itemEffects, "lucky") ? EFFECT.lucky : 0),
    maxMana: maxManaFor(level, stats.intellect) + armorClasses.mana + (hasEffect(itemEffects, "prepared") ? EFFECT.prepared : 0),
    abilities: availableAbilities(equipment),
    heroClass,
    critMultiplier: bonus.critMultiplier,
    weapon: mainWeapon(
      [equipment.weapon1, equipment.weapon2].filter((o) => o !== null).map((o) => getItem(o.itemId).type as SkillWeapon),
    ),
    itemEffects,
  };
}

/** Spezialeffekte der angelegten Items – derselbe Effekt zählt nur einmal. */
export function equippedEffects(equipment: Equipment): ItemEffectId[] {
  const effects = Object.values(equipment)
    .filter((o): o is OwnedItem => o !== null)
    .map((o) => effectOf(o, getItem(o.itemId)))
    .filter((e): e is ItemEffectId => e !== null);
  return [...new Set(effects)];
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
  /**
   * `add`: der beteiligte Begleiter – Ziel des Helden bzw. Angreifer (fehlt: der Boss).
   * `shielded`: Ein Schildträger hat den Treffer auf den Boss gemindert.
   */
  | { type: "hit"; attacker: Side; damage: number; crit: boolean; add?: string; shielded?: boolean; matchup?: "weak" | "resist" }
  /** Das Ziel ist gegen diesen Zustand immun (matchups.ts) – er wirkt nicht */
  | { type: "immune"; kind: DotKind; add?: string }
  /** Ein Heiler unter den Begleitern heilt den Boss */
  | { type: "addHeal"; add: string; heal: number }
  /** Der Boss fällt in seine zweite Phase (bossMechanics.ts) – `rally`: diese Begleiter stehen mit vollen LP (wieder) da */
  | { type: "bossPhase"; bossId: string; rally?: string[] }
  /** Elite „Regenerierend“: Der Gegner heilt sich am Ende der Runde */
  | { type: "enemyRegen"; heal: number }
  /** Elite „Explosiv“: Der Gegner explodiert beim Tod – `blocked`: Bollwerk hat die Explosion abgefangen */
  | { type: "explosion"; damage: number; blocked?: boolean }
  /** Turm-Segen „Dornen“: Der Angreifer erleidet einen Teil seines Schadens selbst */
  | { type: "thorns"; damage: number; add?: string }
  /** Turm-Segen „Zweiter Atem“: Der Held steht einmal wieder auf */
  | { type: "secondWind"; heal: number }
  /** Item-Effekt „Unbeugsam“: Der Held überlebt einen tödlichen Treffer mit 1 LP */
  | { type: "endured" }
  /** Der Held setzt eine Fähigkeit ein – die Treffer folgen als "hit" */
  | { type: "ability"; ability: AbilityId; weapon: SkillWeapon; manaCost: number }
  /** Der Held heilt sich durch eine Fähigkeit (Heiliges Licht, Blutrausch) */
  | { type: "selfHeal"; heal: number }
  /** Läuterung: Gift, Feuer und Bluten auf dem Helden sind weg */
  | { type: "cleansed" }
  /** Parade/Vergeltung fängt einen Teil des gegnerischen Angriffs ab … */
  | { type: "guarded"; prevented: number }
  /** … und der Gegner erleidet Konter- bzw. Rückwurfschaden */
  | { type: "counter"; damage: number }
  /** Giftschaden – `target` ist, wer vergiftet ist */
  | { type: "poison"; target: Side; damage: number; add?: string }
  /** Feuerschaden – `target` ist, wer brennt */
  | { type: "burn"; target: Side; damage: number; add?: string }
  /** Blutungsschaden – `target` ist, wer blutet */
  | { type: "bleed"; target: Side; damage: number; add?: string }
  /** Der betäubte (bei `freeze` eingefrorene) Gegner setzt diese Runde aus */
  | { type: "stunned"; freeze?: boolean; add?: string }
  /** Der Boss ist nach einer Betäubung noch immun und greift trotzdem an */
  | { type: "stunResisted"; freeze?: boolean }
  /** Der Boss setzt seine Fähigkeit ein – die Treffer folgen als "hit" */
  | { type: "bossAbility"; bossId: string; abilityId: string }
  /** Bollwerk hat den Angriff des Gegners komplett geblockt */
  | { type: "blocked"; add?: string }
  /** Der Gegner heilt sich (Lebensentzug) */
  | { type: "drain"; heal: number }
  /** Der Gegner raubt dem Helden Mana */
  | { type: "manaBurn"; amount: number }
  /** Mit `add`: nur ein Begleiter fällt, der Kampf geht weiter */
  | { type: "defeated"; side: Side; add?: string }
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

/** Wirkungen der Fähigkeiten auf einen Gegner */
export interface EnemyEffects {
  poison?: DamageOverTime;
  burn?: DamageOverTime;
  bleed?: DamageOverTime;
  /** Rüstungsminderung für den Rest des Kampfes (0.3 = −30 %) */
  armorBreak?: number;
  /** Geschwächt: macht `percent` weniger Schaden */
  weaken?: ActiveBuff;
  /** Verwundbar: erleidet `percent` mehr Schaden */
  vulnerable?: ActiveBuff;
  /** Bosse: so viele Runden (inkl. der aktuellen) noch immun gegen Betäubung */
  stunImmunity?: number;
}

/** Ein Begleiter des Bosses – eine normale Kreatur, die mitkämpft. */
export interface BattleAdd {
  /** "add-1", "add-2", … */
  uid: string;
  creatureId: string;
  /** Aufgabe im Kampf: Heiler, Schildträger, Trommler (bossMechanics.ts) */
  role?: AddRole;
  combatant: Combatant;
  effects: EnemyEffects;
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
  /** Wirkungen der Fähigkeiten auf den Gegner (den Boss) */
  enemyEffects: EnemyEffects;
  /** Begleiter des Bosses – auch besiegte (LP 0). Fehlt bei älteren Kämpfen. */
  adds?: BattleAdd[];
  /** Ziel des Helden: uid eines Begleiters – fehlt, greift er den Boss an */
  target?: string;
  /** Der Boss ist in seiner zweiten Phase (bossMechanics.ts) – sie kommt nur einmal */
  phase?: boolean;
  /** Elite-Gegner: seine Modifikatoren (elites.ts) – fehlt bei gewöhnlichen Gegnern */
  elite?: EliteAffix[];
  /** Hauptwaffe des Helden – ihre Schadensart zählt bei normalen Angriffen (matchups.ts) */
  heroWeapon?: SkillWeapon | null;
  /** Endlos-Turm: Segen des Laufs (tower.ts) – wirken im Kampf (Fokus, Blutdurst, Henker, Dornen, Alchemie, Zweiter Atem) */
  blessings?: BlessingId[];
  /** Zweiter Atem ist in diesem Lauf schon verbraucht */
  secondWindUsed?: boolean;
  /** Endlos-Turm: das Stockwerk dieses Kampfes (der Gegner kämpft auf dem Level des Helden) */
  towerFloor?: number;
  /** Spezialeffekte der angelegten Items (itemEffects.ts) */
  itemEffects?: ItemEffectId[];
  /** „Unbeugsam“ hat in diesem Kampf schon gerettet */
  endured?: boolean;
  /** Faktor auf die Wirkung aller Tränke (Meisteralchemist) – fehlt: 1 */
  potionPower?: number;
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
    /** Schildwall/Wutschrei: erlittener Schaden × (1 + percent) – negativ: weniger */
    damageTaken?: ActiveBuff;
    /** Titanenschlag: Faktor auf den Schaden der nächsten Aktion */
    charged?: number;
    /** Arkane Heilung: heilt `percent` der max. LP am Rundenende */
    renew?: ActiveBuff;
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
  elite: readonly EliteAffix[] = [],
): BattleState {
  const enemy = eliteStats(getCreatureStats(creature), elite);
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
    heroWeapon: hero.weapon ?? null,
    ...(hero.itemEffects?.length && { itemEffects: hero.itemEffects }),
    ...(hero.potionPower && hero.potionPower !== 1 && { potionPower: hero.potionPower }),
    enemyEffects: {},
    // „Wachsam“: Der erste gegnerische Angriff wird geblockt
    heroEffects: hasEffect(hero.itemEffects, "vigilant") ? { bulwark: true } : {},
    adds: enemyAdds(creature, elite)
      .flatMap((add) => Array.from({ length: add.count }, () => add))
      .map((add, i) => {
        // Begleiter kämpfen auf dem Level ihres Bosses – so wirken ihre Faktoren bei jedem Boss gleich
        const { creature: def } = getCreature(add.creatureId);
        const stats = getCreatureStats({ ...def, level: creature.level });
        const maxHp = Math.round(stats.maxHp * add.hp);
        return {
          uid: `add-${i + 1}`,
          creatureId: def.id,
          ...(add.role && { role: add.role }),
          combatant: { name: add.name ?? def.name, level: creature.level, ...stats, maxHp, hp: maxHp, damage: stats.damage * add.damage },
          effects: {},
        };
      }),
    ...(elite.length > 0 && { elite: [...elite] }),
    status: "active",
    log: [],
  };
}

/** Lebende Begleiter. */
export function livingAdds(state: BattleState): BattleAdd[] {
  return (state.adds ?? []).filter((a) => a.combatant.hp > 0);
}

/** Wählt das Ziel des Helden: einen lebenden Begleiter (uid) oder den Boss (undefined). */
export function setTarget(state: BattleState, target: string | undefined): BattleState {
  if (target !== undefined && !livingAdds(state).some((a) => a.uid === target)) throw new Error("Dieses Ziel gibt es nicht.");
  return { ...state, target };
}

/** Kreaturen der in diesem Kampf besiegten Begleiter – für Belohnung und Aufträge. */
export function defeatedAdds(state: BattleState): CreatureDef[] {
  return (state.adds ?? [])
    .filter((a) => a.combatant.hp === 0)
    .map((a) => ({ ...getCreature(a.creatureId).creature, level: a.combatant.level }));
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
  // Meisteralchemist: alle Tränke wirken stärker
  const power = state.potionPower ?? 1;
  const factor =
    effect.kind === "heal"
      ? (state.heroClass === "cleric" ? CLERIC_POTION_FACTOR : 1) *
        (1 + BLESSING.alchemy * stacks(state.blessings, "alchemy")) *
        (hasEffect(state.itemEffects, "alchemist") ? 1 + EFFECT.alchemist : 1) *
        power
      : 1;
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
          : { ...state.buffs, [effect.kind]: { percent: effect.percent * power, roundsLeft: effect.rounds } },
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
  if (!state.abilities.includes(id)) return "Diese Fähigkeit liegt auf keiner deiner angelegten Waffen.";
  const wait = state.cooldowns?.[id] ?? 0;
  if (wait > 0) return cooldownText(wait);
  const manaCost = abilityCost(state, id);
  if (state.mana < manaCost) return `Nicht genug Mana (${manaCost} nötig).`;
  return null;
}

/** Manakosten einer Fähigkeit – mit Klasse und dem Turm-Segen „Fokus“. */
export function abilityCost(state: Pick<BattleState, "heroClass" | "blessings">, id: AbilityId): number {
  const { manaCost } = classAbility(id, state.heroClass);
  return Math.round(manaCost * Math.max(0, 1 - BLESSING.focus * stacks(state.blessings, "focus")));
}

/** Betäubt die Fähigkeit den Gegner? Manche nur mit einer Chance (Eisstrahl, Schockwelle). */
export function stunLands(ability: AbilityDef | null, rng: () => number): boolean {
  if (!ability?.stun) return false;
  return ability.stunChance === undefined || rng() < ability.stunChance;
}

/** Kennzeichnet Betäubungs-Ereignisse des Eisstrahls als Einfrieren. */
export const freezeFlag = (ability: AbilityDef | null): { freeze?: true } => (ability?.freeze ? { freeze: true } : {});

/** Ein Gegner in der laufenden Runde: der Boss (ohne `add`) oder ein Begleiter. */
interface Foe {
  add?: string;
  /** Für Schwächen und Resistenzen (matchups.ts) */
  creatureId: string;
  role?: AddRole;
  c: Combatant;
  fx: EnemyEffects;
}

/** Rollen der Begleiter (bossMechanics.ts) zählen nur, solange sie stehen. */
const roleHolders = (adds: readonly Foe[]) => adds.map((f) => ({ role: f.role, hp: f.c.hp }));

const foeTag = (foe: Foe): { add?: string } => (foe.add ? { add: foe.add } : {});

/** Am Rundenende laufen Schwächung, Verwundbarkeit und Betäubungs-Immunität eine Runde ab. */
const tickEnemyEffects = (fx: EnemyEffects): EnemyEffects => ({
  ...fx,
  weaken: tickBuff(fx.weaken),
  vulnerable: tickBuff(fx.vulnerable),
  stunImmunity: tickStunImmunity(fx.stunImmunity),
});

/**
 * Eine Runde: Angriff des Helden – normal oder mit einer Fähigkeit – auf sein Ziel
 * (Flächen-Fähigkeiten auf mehrere Gegner), danach Gift, Feuer, Bluten und
 * Gegenangriff des Bosses (ausser er ist betäubt) und seiner Begleiter.
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
  let heroEffects = state.heroEffects;
  let mana = state.mana;
  let status: BattleStatus = "active";
  // Der Boss zuerst, dann die Begleiter – Kopien, die sich in dieser Runde ändern
  const boss: Foe = { creatureId: state.creatureId, c: state.enemy, fx: state.enemyEffects };
  const adds: Foe[] = (state.adds ?? []).map((a) => ({ add: a.uid, creatureId: a.creatureId, role: a.role, c: a.combatant, fx: a.effects }));
  /** Gift, Feuer oder Bluten auf einen Gegner legen – mit Schwäche/Resistenz; bei Immunität wirkt es nicht. */
  const applyDot = (foe: Foe, kind: DotKind, base: number, rounds: number) => {
    const factor = matchupFactor(foe.creatureId, kind);
    if (factor === 0) {
      events.push({ type: "immune", kind, ...foeTag(foe) });
      return;
    }
    foe.fx = { ...foe.fx, [kind]: { damage: Math.max(1, Math.round(base * factor)), roundsLeft: rounds } };
  };
  /** Schadensart des Helden in dieser Runde: die der Fähigkeit bzw. ihrer Waffe, sonst die Hauptwaffe */
  const heroKind = (() => {
    if (ability?.kind) return ability.kind;
    const weapon = ability?.weapon ?? state.heroWeapon;
    return weapon ? WEAPON_KIND[weapon] : null;
  })();
  // Titanenschlag: Die Aktion nach dem Ausholen macht mehr Schaden – das Ausholen ist damit verbraucht
  const charge = heroEffects.charged ?? 1;
  if (heroEffects.charged) heroEffects = { ...heroEffects, charged: undefined };
  let phase = state.phase;
  /** Schildträger: Der Boss erleidet weniger Schaden, solange einer steht */
  const takenBy = (foe: Foe) => (foe === boss ? bossDamageTakenFactor(roleHolders(adds)) : 1);
  const foes = [boss, ...adds];
  const living = () => foes.filter((f) => f.c.hp > 0);
  const target = adds.find((f) => f.add === state.target && f.c.hp > 0) ?? boss;
  const aoe = ability?.aoe;
  // Verstärkungen wirken auf Schaden und Rüstung, die Lebenspunkte bleiben die echten.
  const strongBase = buffedHero(state);
  // Berserker: bei wenig Lebenspunkten mehr Schaden; Kriegsschrei: Verstärkung
  const strong = {
    ...strongBase,
    damage:
      strongBase.damage * rageFactor(state.heroClass, hero.hp, hero.maxHp) * (1 + (heroEffects.empower?.percent ?? 0)),
    // Item-Effekt „Letztes Gefecht“: mehr Rüstung bei wenig Lebenspunkten
    armor:
      hasEffect(state.itemEffects, "lastStand") && hero.hp < hero.maxHp * EFFECT.lastStand.threshold
        ? Math.round(strongBase.armor * (1 + EFFECT.lastStand.armor))
        : strongBase.armor,
  };
  const effects = state.itemEffects;
  const bossIsBoss = getCreature(state.creatureId).creature.boss;
  /** Vom Item-Effekt „Frostbiss“ eingefrorene Gegner – sie setzen diese Runde aus */
  const frozenByItem = new Set<Foe>();

  // 1. Aktion des Helden
  if (ability) {
    const manaCost = abilityCost(state, ability.id);
    mana -= manaCost;
    events.push({ type: "ability", ability: ability.id, weapon: ability.weapon, manaCost });
    if (ability.bulwark) heroEffects = { ...heroEffects, bulwark: true };
    if (ability.guard) heroEffects = { ...heroEffects, guard: ability.guard };
    // +1, weil die Verstärkung erst ab der nächsten Runde zählt (am Rundenende läuft eine ab)
    if (ability.empower) heroEffects = { ...heroEffects, empower: { percent: ability.empower.percent, roundsLeft: ability.empower.rounds + 1 } };
    if (ability.heal) {
      const heal = Math.min(hero.maxHp - hero.hp, Math.round(hero.maxHp * ability.heal));
      hero = { ...hero, hp: hero.hp + heal };
      if (heal > 0) events.push({ type: "selfHeal", heal });
    }
    if (ability.cleanse && (heroEffects.poison || heroEffects.burn || heroEffects.bleed)) {
      heroEffects = { ...heroEffects, poison: undefined, burn: undefined, bleed: undefined };
      events.push({ type: "cleansed" });
    }
    if (ability.damageTaken) heroEffects = { ...heroEffects, damageTaken: { percent: ability.damageTaken.percent, roundsLeft: ability.damageTaken.rounds } };
    if (ability.charge) heroEffects = { ...heroEffects, charged: ability.charge };
    if (ability.renew) heroEffects = { ...heroEffects, renew: { percent: ability.renew.percent, roundsLeft: ability.renew.rounds } };
    if (ability.manaGain) mana = Math.min(state.maxMana, mana + ability.manaGain);
    // Zusatzeffekte wirken aufs Ziel – bei Flächenwirkung "all" auf alle Gegner
    for (const foe of aoe === "all" ? living() : [target]) {
      if (ability.weaken) foe.fx = { ...foe.fx, weaken: { percent: ability.weaken.percent, roundsLeft: ability.weaken.rounds } };
      if (ability.vulnerable) {
        foe.fx = { ...foe.fx, vulnerable: { percent: ability.vulnerable.percent, roundsLeft: ability.vulnerable.rounds } };
      }
      if (ability.armorBreak) foe.fx = { ...foe.fx, armorBreak: ability.armorBreak };
      for (const kind of OVER_TIME) {
        const effect = ability[kind];
        if (effect) applyDot(foe, kind, strong.damage * effect.percent, effect.rounds);
      }
    }
  }
  const vulnerableOf = (foe: Foe) => 1 + (foe.fx.vulnerable?.percent ?? 0);
  const armorOf = (foe: Foe) => (ability?.ignoreArmor ? 0 : Math.round(foe.c.armor * (1 - (foe.fx.armorBreak ?? 0))));
  /** Ein gefallener Begleiter – der Kampf geht weiter. */
  const addDown = (foe: Foe) => {
    if (foe.add && foe.c.hp === 0) events.push({ type: "defeated", side: "enemy", add: foe.add });
  };
  let dealtByHero = 0;
  /** Ein Treffer des Helden – `share` < 1 bei Splash-Schaden auf Umstehende. */
  const strike = (foe: Foe, share = 1) => {
    // Finisher (Meucheln): mehr Schaden gegen angeschlagene Gegner
    const finisher = ability?.execute && foe.c.hp < foe.c.maxHp * ability.execute.threshold ? ability.execute.factor : 1;
    // Turm-Segen „Henker“: mehr Schaden gegen angeschlagene Gegner
    const headsman = foe.c.hp < foe.c.maxHp * BLESSING.executioner.threshold ? 1 + BLESSING.executioner.bonus * stacks(state.blessings, "executioner") : 1;
    // Ausbluten: mehr Schaden gegen blutende Gegner
    const execute = finisher * headsman * (ability?.bleedBonus && foe.fx.bleed ? 1 + ability.bleedBonus : 1);
    const taken = takenBy(foe);
    // Schwäche oder Resistenz gegen die Schadensart der Waffe – „Runenklinge“ zählt auch als Magie, wenn das wirksamer ist
    const kind =
      heroKind && hasEffect(effects, "runeblade") && matchupFactor(foe.creatureId, "magic") > matchupFactor(foe.creatureId, heroKind)
        ? "magic"
        : heroKind;
    const matchup = kind ? matchupOf(foe.creatureId, kind) : null;
    const kindFactor = matchupFactor(foe.creatureId, kind);
    // Item-Effekte: Kriegstrommel, Henkersbeil, Aderlass, Elitejäger, Bossschlächter, Sog – dazu Allsehend (Krit)
    const foeBoss = foe === boss && bossIsBoss;
    const itemFactor = effectDamageFactor(effects, {
      round: state.round,
      foeHp: foe.c.hp,
      foeMaxHp: foe.c.maxHp,
      foeBleeding: foe.fx.bleed !== undefined,
      foeBoss,
      foeElite: foe === boss && (state.elite?.length ?? 0) > 0,
    });
    const critChance = strong.critChance + effectCritBonus(effects, foeBoss);
    const attacker: Combatant = ability
      ? {
          ...strong,
          damage: strong.damage * ability.multiplier * execute * charge * vulnerableOf(foe) * share * taken * kindFactor * itemFactor,
          critChance: ability.guaranteedCrit ? 1 : critChance,
        }
      : { ...strong, damage: strong.damage * headsman * charge * share * vulnerableOf(foe) * taken * kindFactor * itemFactor, critChance };
    const heroHit = rollHit(attacker, { ...foe.c, armor: armorOf(foe) }, rng);
    dealtByHero += Math.min(foe.c.hp, heroHit.damage);
    foe.c = { ...foe.c, hp: Math.max(0, foe.c.hp - heroHit.damage) };
    events.push({
      type: "hit",
      attacker: "hero",
      ...heroHit,
      ...foeTag(foe),
      ...(taken < 1 && { shielded: true }),
      ...((matchup === "weak" || matchup === "resist") && { matchup }),
    });
    // Plünderer: kritische Treffer lassen bluten
    if (heroHit.crit && state.heroClass === "plunderer" && foe.c.hp > 0) {
      const damage = strong.damage * PLUNDERER_BLEED.percent * matchupFactor(foe.creatureId, "bleed");
      if (damage > 0 && (foe.fx.bleed?.damage ?? 0) <= damage) applyDot(foe, "bleed", strong.damage * PLUNDERER_BLEED.percent, PLUNDERER_BLEED.rounds);
    }
    // Item-Effekte bei einem Treffer: Glut/Drachenfeuer, Giftzahn, Frostbiss, Manadieb
    if (foe.c.hp > 0) {
      if (heroHit.crit && critBurns(effects)) applyDot(foe, "burn", strong.damage * EFFECT.ember.percent, EFFECT.ember.rounds);
      if (hasEffect(effects, "venomFang") && rng() < EFFECT.venomFang.chance) {
        applyDot(foe, "poison", strong.damage * EFFECT.venomFang.percent, EFFECT.venomFang.rounds);
      }
      if (hasEffect(effects, "frostBite") && rng() < EFFECT.frostBite) frozenByItem.add(foe);
    }
    if (hasEffect(effects, "manaThief")) mana = Math.min(state.maxMana, mana + EFFECT.manaThief);
    addDown(foe);
  };
  for (let i = 0; i < (ability?.hits ?? 1) && boss.c.hp > 0; i++) {
    if (aoe === "all") {
      for (const foe of living()) strike(foe);
    } else if (aoe === "spread") {
      // Jeder Treffer geht an einen zufälligen Gegner
      const options = living();
      strike(options.length > 1 ? options[Math.floor(rng() * options.length)] : options[0]);
    } else {
      if (target.c.hp === 0) break;
      strike(target);
      if (typeof aoe === "object") for (const foe of living()) if (foe !== target) strike(foe, aoe.splash);
    }
  }
  // Duellant: Chance auf einen zweiten Schlag bei normalen Angriffen
  if (!ability && state.heroClass === "duelist" && target.c.hp > 0 && boss.c.hp > 0 && rng() < DUELIST_EXTRA_HIT) strike(target);
  // Item-Effekt „Kettenblitz“: Ein normaler Angriff springt auf einen zweiten Gegner über
  if (!ability && hasEffect(effects, "chainLightning") && boss.c.hp > 0 && rng() < EFFECT.chainLightning.chance) {
    const others = living().filter((f) => f !== target);
    if (others.length > 0) strike(others[Math.floor(rng() * others.length)], EFFECT.chainLightning.share);
  }
  // Lebensraub: Blutrausch und Plünderer
  const lifesteal =
    lifestealShare(state.heroClass, ability) +
    BLESSING.bloodthirst * stacks(state.blessings, "bloodthirst") +
    (hasEffect(effects, "soulDrain") ? EFFECT.soulDrain : 0);
  if (lifesteal > 0 && dealtByHero > 0) {
    const heal = Math.min(hero.maxHp - hero.hp, Math.round(dealtByHero * lifesteal));
    hero = { ...hero, hp: hero.hp + heal };
    if (heal > 0) events.push({ type: "selfHeal", heal });
  }

  // 2. Gift, Feuer und Bluten wirken nach der Aktion des Helden – erst bei den Gegnern, dann beim Helden
  for (const foe of foes) {
    for (const kind of OVER_TIME) {
      const effect = foe.fx[kind];
      if (effect && foe.c.hp > 0 && boss.c.hp > 0) {
        const damage = Math.max(1, Math.round(effect.damage * vulnerableOf(foe) * takenBy(foe)));
        foe.c = { ...foe.c, hp: Math.max(0, foe.c.hp - damage) };
        events.push({ type: kind, target: "enemy", damage, ...foeTag(foe) });
        foe.fx = { ...foe.fx, [kind]: tickOverTime(effect) };
        addDown(foe);
      }
    }
  }
  for (const kind of OVER_TIME) {
    const effect = heroEffects[kind];
    if (effect && boss.c.hp > 0 && hero.hp > 0) {
      hero = { ...hero, hp: Math.max(0, hero.hp - effect.damage) };
      events.push({ type: kind, target: "hero", damage: effect.damage });
      heroEffects = { ...heroEffects, [kind]: tickOverTime(effect) };
    }
  }

  // 3. Gegenangriff (entfällt bei Betäubung) – Bosse setzen regelmässig ihre Fähigkeit ein,
  //    danach greifen die Begleiter an. Bei Flächenwirkung "all" würfelt jeder Gegner seine Betäubung.
  const stunned = new Set<Foe>();
  if (boss.c.hp > 0 && hero.hp > 0) {
    for (const foe of aoe === "all" ? living() : [target]) if (foe.c.hp > 0 && stunLands(ability, rng)) stunned.add(foe);
    for (const foe of frozenByItem) if (foe.c.hp > 0) stunned.add(foe);
  }
  const elite = state.elite ?? [];
  /** Schildwall/Wutschrei: Faktor auf den Schaden, den der Held erleidet */
  const hurt = Math.max(0, 1 + (heroEffects.damageTaken?.percent ?? 0));
  /** Turm-Segen „Dornen“: Wer den Helden trifft, erleidet einen Teil davon selbst. */
  const thorns = (foe: Foe, damage: number) => {
    const share = BLESSING.thorns * stacks(state.blessings, "thorns") + (hasEffect(effects, "thorns") ? EFFECT.thorns : 0);
    if (share <= 0 || damage <= 0 || foe.c.hp <= 0) return;
    const back = Math.max(1, Math.round(damage * share));
    foe.c = { ...foe.c, hp: Math.max(0, foe.c.hp - back) };
    events.push({ type: "thorns", damage: back, ...foeTag(foe) });
    addDown(foe);
  };
  /** Der Gegner fällt – ein explosiver Elite reisst den Helden womöglich mit (Bollwerk blockt). */
  const enemyDown = () => {
    if (elite.includes("explosive") && hero.hp > 0) {
      if (heroEffects.bulwark) {
        heroEffects = { ...heroEffects, bulwark: undefined };
        events.push({ type: "explosion", damage: 0, blocked: true });
      } else {
        const blast = rollHit({ ...boss.c, damage: boss.c.damage * EXPLOSION_FACTOR * hurt, critChance: 0 }, strong, rng);
        hero = { ...hero, hp: Math.max(0, hero.hp - blast.damage) };
        events.push({ type: "explosion", damage: blast.damage });
      }
    }
    status = hero.hp === 0 ? "lost" : "won";
    events.push({ type: "defeated", side: hero.hp === 0 ? "hero" : "enemy" });
  };
  if (boss.c.hp === 0) {
    enemyDown();
  } else if (hero.hp === 0) {
    status = "lost";
    events.push({ type: "defeated", side: "hero" });
  } else {
    // Zweite Phase: Raserei und/oder Sammelruf – wirkt schon auf den folgenden Gegenangriff
    const nextPhase = phaseDue(state.creatureId, phase, boss.c);
    if (nextPhase) {
      phase = true;
      if (nextPhase.enrage) boss.c = { ...boss.c, damage: boss.c.damage * (1 + nextPhase.enrage) };
      // Sammelruf: nur gewöhnliche Begleiter – wer Heiler, Schildträger oder Trommler besiegt hat, ist ihn los
      const rallied = nextPhase.rally ? adds.filter((f) => !f.role) : [];
      for (const foe of rallied) {
        foe.c = { ...foe.c, hp: foe.c.maxHp };
        foe.fx = {};
      }
      events.push({ type: "bossPhase", bossId: state.creatureId, ...(nextPhase.rally && { rally: rallied.map((f) => f.add!) }) });
    }
    // Trommler: Der Boss macht mehr Schaden, solange einer steht
    const drums = bossDamageDealtFactor(roleHolders(adds));
    // Bollwerk blockt den ganzen gegnerischen Zug – Boss und Begleiter samt Zusatzeffekten.
    const bulwark = heroEffects.bulwark;
    let blocked = false;
    /** Eingefroren durch Frostbiss oder eine Fähigkeit? */
    const freezeOf = (foe: Foe) => (frozenByItem.has(foe) ? { freeze: true as const } : freezeFlag(ability));
    if (stunned.has(boss) && !boss.fx.stunImmunity) {
      events.push({ type: "stunned", ...freezeOf(boss) });
      // Bosse sind danach einige Runden immun
      if (getCreature(state.creatureId).creature.boss) boss.fx = { ...boss.fx, stunImmunity: freshStunImmunity() };
    } else {
      if (stunned.has(boss)) events.push({ type: "stunResisted", ...freezeOf(boss) });
      const special = bossAbilityDue(state.creatureId, state.round);
      if (special) events.push({ type: "bossAbility", bossId: special.bossId, abilityId: special.id });
      if (bulwark) {
        events.push({ type: "blocked" });
        blocked = true;
      } else {
        // Geschwächte Gegner machen weniger Schaden
        const weakened = 1 - (boss.fx.weaken?.percent ?? 0);
        // Elite: Rasend macht mehr Schaden (unter halben LP noch mehr), Flink schlägt zweimal schwächer zu
        const rage = elite.includes("raging") ? 1 + (boss.c.hp < boss.c.maxHp / 2 ? RAGE_BONUS.low : RAGE_BONUS.base) : 1;
        const swift = elite.includes("swift");
        const attacker = {
          ...boss.c,
          damage:
            boss.c.damage *
            (special?.multiplier ?? 1) *
            weakened *
            drums *
            rage *
            hurt *
            (swift ? SWIFT_SHARE : 1) *
            // Item-Effekt „Standhaft“: Boss-Fähigkeiten treffen schwächer
            (special && hasEffect(effects, "steadfast") ? 1 - EFFECT.steadfast : 1),
        };
        const defender = special?.ignoreArmor ? { ...strong, armor: 0 } : strong;
        // Parade/Vergeltung wirkt nur gegen den Boss – den grossen Treffer
        const guard = heroEffects.guard;
        let dealt = 0;
        let raw = 0;
        for (let i = 0; i < (special?.hits ?? (swift ? 2 : 1)) && hero.hp > 0; i++) {
          const enemyHit = rollHit(attacker, defender, rng);
          // Parade/Vergeltung: nur ein Teil des Schadens kommt durch
          const damage = guard ? Math.max(1, Math.round(enemyHit.damage * guard.reduce)) : enemyHit.damage;
          raw += enemyHit.damage;
          hero = { ...hero, hp: Math.max(0, hero.hp - damage) };
          dealt += damage;
          events.push({ type: "hit", attacker: "enemy", ...enemyHit, damage });
        }
        thorns(boss, dealt);
        if (guard) {
          heroEffects = { ...heroEffects, guard: undefined };
          events.push({ type: "guarded", prevented: raw - dealt });
          let counter = guard.reflect ? Math.round(raw * guard.reflect) : 0;
          if (guard.counter && hero.hp > 0) {
            const damage = strong.damage * guard.counter * takenBy(boss) * matchupFactor(boss.creatureId, heroKind);
            counter += rollHit({ ...strong, damage }, { ...boss.c, armor: armorOf(boss) }, rng).damage;
          }
          if (counter > 0) {
            boss.c = { ...boss.c, hp: Math.max(0, boss.c.hp - counter) };
            events.push({ type: "counter", damage: counter });
          }
        }
        // Lebensentzug der Boss-Fähigkeit bzw. Elite „Vampirisch“
        const drain = special?.drain ?? (elite.includes("vampiric") ? VAMPIRE_SHARE : 0);
        if (drain > 0 && boss.c.hp > 0) {
          const heal = Math.min(boss.c.maxHp - boss.c.hp, Math.round(dealt * drain));
          boss.c = { ...boss.c, hp: boss.c.hp + heal };
          if (heal > 0) events.push({ type: "drain", heal });
        }
        // Elite „Giftig“: Wer getroffen wird, ist vergiftet
        if (elite.includes("poisonous") && dealt > 0 && hero.hp > 0) {
          const rounds = heroDotRounds(effects, "poison", POISON.rounds);
          heroEffects = { ...heroEffects, poison: { damage: Math.max(1, Math.round(boss.c.damage * POISON.percent)), roundsLeft: rounds } };
        }
        if (special?.manaBurn) {
          const amount = Math.min(mana, special.manaBurn);
          mana -= amount;
          if (amount > 0) events.push({ type: "manaBurn", amount });
        }
        for (const kind of OVER_TIME) {
          const effect = special?.[kind];
          if (!effect) continue;
          const damage = Math.max(1, Math.round(boss.c.damage * drums * effect.percent));
          // Reinheit kürzt, Drachenfeuer macht gegen Feuer immun
          const rounds = heroDotRounds(effects, kind, effect.rounds);
          if (rounds > 0) heroEffects = { ...heroEffects, [kind]: { damage, roundsLeft: rounds } };
        }
      }
    }
    // Begleiter: je ein normaler Angriff, solange Boss und Held stehen – Heiler heilen stattdessen den Boss
    for (const foe of adds) {
      if (foe.c.hp === 0 || boss.c.hp === 0 || hero.hp === 0) continue;
      if (stunned.has(foe)) {
        events.push({ type: "stunned", ...freezeOf(foe), ...foeTag(foe) });
      } else if (foe.role === "healer") {
        const heal = Math.min(boss.c.maxHp - boss.c.hp, Math.round(boss.c.maxHp * HEALER_HEAL));
        boss.c = { ...boss.c, hp: boss.c.hp + heal };
        if (heal > 0) events.push({ type: "addHeal", add: foe.add!, heal });
      } else if (bulwark) {
        events.push({ type: "blocked", ...foeTag(foe) });
        blocked = true;
      } else {
        const weakened = 1 - (foe.fx.weaken?.percent ?? 0);
        const enemyHit = rollHit({ ...foe.c, damage: foe.c.damage * weakened * hurt }, strong, rng);
        hero = { ...hero, hp: Math.max(0, hero.hp - enemyHit.damage) };
        events.push({ type: "hit", attacker: "enemy", ...enemyHit, ...foeTag(foe) });
        thorns(foe, enemyHit.damage);
      }
    }
    if (blocked) heroEffects = { ...heroEffects, bulwark: undefined };
    if (boss.c.hp === 0) {
      enemyDown();
    } else if (hero.hp === 0) {
      status = "lost";
      events.push({ type: "defeated", side: "hero" });
    }
  }

  // Elite „Regenerierend“: heilt sich am Ende der Runde – ausser er brennt
  const burning = boss.fx.burn !== undefined || events.some((e) => e.type === "burn" && e.target === "enemy" && !e.add);
  if (status === "active" && elite.includes("regenerating") && !burning) {
    const heal = Math.min(boss.c.maxHp - boss.c.hp, Math.round(boss.c.maxHp * REGEN_SHARE));
    if (heal > 0) {
      boss.c = { ...boss.c, hp: boss.c.hp + heal };
      events.push({ type: "enemyRegen", heal });
    }
  }

  // Kleriker, Item-Effekt „Lebensquell“ und Arkane Heilung: Regeneration am Ende der Runde
  const regen =
    (state.heroClass === "cleric" ? CLERIC_REGEN : 0) +
    (hasEffect(effects, "wellspring") ? EFFECT.wellspring : 0) +
    (heroEffects.renew?.percent ?? 0);
  if (status === "active" && regen > 0 && hero.hp > 0) {
    const heal = Math.min(hero.maxHp - hero.hp, Math.round(hero.maxHp * regen));
    if (heal > 0) {
      hero = { ...hero, hp: hero.hp + heal };
      events.push({ type: "regen", heal });
    }
  }

  // Item-Effekt „Unbeugsam“: einmal pro Kampf mit 1 LP überleben (vor dem Zweiten Atem des Turms)
  let endured = state.endured;
  if (status === "lost" && hero.hp === 0 && boss.c.hp > 0 && !endured && hasEffect(effects, "unyielding")) {
    const last = events.at(-1);
    if (last?.type === "defeated" && last.side === "hero") events.pop();
    hero = { ...hero, hp: 1 };
    status = "active";
    endured = true;
    events.push({ type: "endured" });
  }

  // Turm-Segen „Zweiter Atem“: Wer fällt, steht einmal pro Lauf wieder auf (der Gegner lebt noch)
  let secondWindUsed = state.secondWindUsed;
  if (status === "lost" && hero.hp === 0 && boss.c.hp > 0 && !secondWindUsed && stacks(state.blessings, "secondWind") > 0) {
    const last = events.at(-1);
    if (last?.type === "defeated" && last.side === "hero") events.pop();
    const heal = Math.round(hero.maxHp * BLESSING.secondWind);
    hero = { ...hero, hp: heal };
    status = "active";
    secondWindUsed = true;
    events.push({ type: "secondWind", heal });
  }

  return {
    state: {
      ...state,
      ...(secondWindUsed && { secondWindUsed }),
      ...(endured && { endured }),
      hero,
      enemy: boss.c,
      enemyEffects: tickEnemyEffects(boss.fx),
      ...(state.adds && {
        adds: state.adds.map((a, i) => ({ ...a, combatant: adds[i].c, effects: tickEnemyEffects(adds[i].fx) })),
      }),
      // Ist das gewählte Ziel gefallen, geht es wieder gegen den Boss
      target: target.add !== undefined && target.c.hp > 0 ? target.add : undefined,
      ...(phase && { phase }),
      heroEffects: {
        ...heroEffects,
        empower: tickBuff(heroEffects.empower),
        damageTaken: tickBuff(heroEffects.damageTaken),
        renew: tickBuff(heroEffects.renew),
      },
      mana: Math.min(state.maxMana, mana + MANA_REGEN),
      // Item-Effekt „Flinke Hand“: eine Runde kürzer abklingen
      cooldowns: tickCooldowns(
        state.cooldowns,
        ability && (hasEffect(effects, "quickHands") ? { id: ability.id, cooldown: ability.cooldown - 1 } : ability),
      ),
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
  /** Sicheres Baumaterial fürs Dorf (village.ts) – fehlt bei älteren Belohnungen */
  materials?: MaterialStock;
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
  /** Baumaterial fürs Dorf – fehlt bei älteren Truhen */
  materials?: MaterialStock;
}

export const EMPTY_CHEST: DungeonChest = { xp: 0, gold: 0, items: [], potions: {}, materials: {} };

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
    materials: addMaterials(chest.materials ?? {}, reward.materials),
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

/** Besiegte Begleiter geben diesen Anteil ihrer Erfahrung und ihres durchschnittlichen Golds – Beute gibt es nur vom Boss. */
export const ADD_REWARD_SHARE = 0.5;

/**
 * Belohnung für einen Sieg: XP, Gold (mit Charisma-Bonus), ggf. ein Item, Tränke und
 * bei Bossen ein Boss-Item – dazu etwas XP und Gold für besiegte Begleiter.
 */
export function rollBattleReward(
  creature: CreatureDef,
  hero: HeroCombatProfile,
  uid: string,
  rng: () => number = Math.random,
  addsDefeated: readonly CreatureDef[] = [],
  elite = false,
): BattleReward {
  // Elite: sichere Beute mit den Seltenheiten eines Bosses, doppelte Erfahrung und sicheres, doppeltes Gold
  if (elite) {
    const { dropChance, weights } = getCreatureLoot({ ...creature, boss: true });
    const potionDrop = getCreaturePotionDrop(creature);
    const { min, max } = getCreatureGoldDrop(creature);
    return {
      xp: getCreatureXp(creature, hero.level) * ELITE_REWARD_FACTOR,
      loot: rollDrop(dropChance, weights, creature.level, uid, rng),
      potions: rng() < potionDrop.chance ? { potionId: potionDrop.potionId, count: potionDrop.count } : null,
      bossLoot: null,
      buffPotion: rollBuffPotion(rng),
      gold: Math.round((min + Math.floor(rng() * (max - min + 1))) * ELITE_REWARD_FACTOR * (1 + hero.goldBonus)),
      materials: creatureMaterials(creature, true),
    };
  }
  const { dropChance, weights } = getCreatureLoot(creature);
  const potionDrop = getCreaturePotionDrop(creature);
  const addXp = addsDefeated.reduce((sum, add) => sum + Math.round(getCreatureXp(add, hero.level) * ADD_REWARD_SHARE), 0);
  const addGold = addsDefeated.reduce(
    (sum, add) => sum + getCreatureGold(add) * getCreatureGoldDrop(add).chance * ADD_REWARD_SHARE,
    0,
  );
  return {
    xp: getCreatureXp(creature, hero.level) + addXp,
    loot: rollDrop(dropChance, weights, creature.level, uid, rng),
    potions: rng() < potionDrop.chance ? { potionId: potionDrop.potionId, count: potionDrop.count } : null,
    bossLoot: rollBossLoot(creature, `${uid}-boss`, rng),
    buffPotion: rollBuffPotion(rng),
    gold: Math.round((rollCreatureGold(creature, rng) + addGold) * (1 + hero.goldBonus)),
    materials: creatureMaterials(creature),
  };
}
