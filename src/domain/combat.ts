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
// Trommler) setzen Fähigkeiten ein, die man kommen sieht und kontern kann. Unter
// der Hälfte seiner LP wechselt der Boss einmal in seine zweite Phase (Raserei
// und/oder Sammelruf).
//
// Absichten (bossIntents.ts): Bosse zeigen jede Runde, was sie vorhaben. Statt
// anzugreifen kann der Held abwehren – halber Schaden und etwas Mana.

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
import { BUFF_POTIONS, getPotion, potionHeal, type BuffKind, type PotionDef } from "./potions";
import { addMaterials, creatureMaterials, type MaterialStock } from "./village";
import {
  bandageHeal,
  bloodburstDamage,
  cooldownSkipChance,
  critMana,
  defendMana,
  defendTaken,
  defendThorns,
  dodgeChance,
  dotTakenFactor,
  echoDue,
  interruptMana,
  manaRegen,
  melts,
  ownDotFactor,
  ownDotRounds,
  potionSkillFactor,
  rankIn,
  riposteFactor,
  rotBurst,
  sanitizeSkills,
  skillCostFactor,
  skillCritBonus,
  skillDamageFactor,
  skillLifesteal,
  skillStatBonus,
  skillStunChance,
  stackPoison,
  wrathFactor,
  SKILL,
  type FoeState,
  type SkillRanks,
  type SkillWeapon,
} from "./skills";
import {
  airborneFactor,
  bossAttacks,
  bossTurnTakenFactor,
  firstBossTurn,
  nextBossTurn,
  plateFactor,
  reflectsAbilities,
  stolenStrike,
  turnAbility,
  untouchable,
  CURSE_DAMAGE,
  CURSE_ROUNDS,
  EYE_REFLECT,
  PLATES_MAX,
  VESSEL_HP,
  VESSEL_MAX,
  type BossTurn,
} from "./bossIntents";
import type { BossAbilityDef } from "./bossAbilities";
import { DRUM_BONUS, DRUM_MAX, phaseDue, RITUAL_HEAL, RITUAL_ROUNDS, SHIELD_EVERY, SHIELD_SHARE, type AddRole } from "./bossMechanics";
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
import { HEROIC_BOSS_LOOT_CHANCE, HEROIC_REWARD_FACTOR } from "./heroic";
import { PACK_MEMBER, packAdds } from "./packs";
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
  /** Ränge im Skilltree (skills.ts) – fehlt, wenn keine vergeben sind */
  skills?: SkillRanks;
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
 * Dazu kommen die Grundwerte aus dem Skilltree (Krit, Rüstung, LP, Mana – skills.ts)
 * und der Ausgleich leichter und mittlerer Rüstung (mehr Mana und Krit, siehe armorClasses.ts).
 */
export function getHeroCombatProfile(character: Character, equipment: Equipment): HeroCombatProfile {
  const level = getLevel(character.totalXp);
  const stats = getEffectiveStats(character.stats, equipment);
  const gear = getCombatStats(equipment);
  const armorClasses = getArmorClassSummary(equipment);
  const heroClass = detectHeroClass(equipment);
  const bonus = classStatBonus(heroClass);
  const itemEffects = equippedEffects(equipment);
  const skills = sanitizeSkills(character.skills);
  const skill = skillStatBonus(skills);
  return {
    level,
    maxHp: Math.round((80 + (level - 1) * 12 + stats.endurance * 1.5) * getSetHpMultiplier(equipment) * (1 + bonus.hp) * (1 + skill.hp)),
    damage: (5 + gear.attack + attributeDamage(stats, equipment)) * (1 + bonus.damage),
    armor: Math.round((gear.armor + shieldArmorBonus(stats, equipment)) * (1 + bonus.armor) * (1 + skill.armor)),
    // Die Krit-Chance von Klasse und Skilltree kommt über die normale Obergrenze hinaus dazu
    critChance: Math.min(0.3, 0.05 + stats.charisma * CRIT_PER_CHARISMA + armorClasses.crit) + bonus.crit + skill.crit,
    goldBonus: Math.min(1, stats.charisma * 0.005) + bonus.gold + (hasEffect(itemEffects, "lucky") ? EFFECT.lucky : 0),
    maxMana:
      maxManaFor(level, stats.intellect) + armorClasses.mana + (hasEffect(itemEffects, "prepared") ? EFFECT.prepared : 0) + skill.mana,
    abilities: availableAbilities(equipment),
    heroClass,
    critMultiplier: bonus.critMultiplier,
    weapon: mainWeapon(
      [equipment.weapon1, equipment.weapon2].filter((o) => o !== null).map((o) => getItem(o.itemId).type as SkillWeapon),
    ),
    itemEffects,
    ...(Object.keys(skills).length > 0 && { skills }),
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
   * Der Held wirft einen Wurftrank (potions.ts) auf sein Ziel (`add`, fehlt: der Boss) –
   * was er anrichtet, folgt als eigene Ereignisse. `missed`: Der Boss ist abgetaucht.
   */
  | { type: "thrown"; potionId: string; add?: string; missed?: boolean }
  /** Die Sprengflasche trifft einen Gegner – `absorbed`: so viel hat der Schild des Schildträgers geschluckt */
  | { type: "blast"; damage: number; add?: string; absorbed?: number }
  /** Die Säure frisst die Rüstung des Ziels an */
  | { type: "corroded"; add?: string }
  /** Der Rauch nimmt dem Ziel die Sicht – es macht weniger Schaden */
  | { type: "smoked"; add?: string }
  /**
   * `add`: der beteiligte Begleiter – Ziel des Helden bzw. Angreifer (fehlt: der Boss).
   * `shielded`: Ein Schildträger hat den Treffer auf den Boss gemindert.
   */
  | {
      type: "hit";
      attacker: Side;
      damage: number;
      crit: boolean;
      add?: string;
      shielded?: boolean;
      matchup?: "weak" | "resist";
      /** So viel hat der Schild des Schildträgers geschluckt (zusätzlich zu `damage`) */
      absorbed?: number;
      /** Eine Panzerplatte des Erzkönigs hat den Treffer gemindert */
      plated?: boolean;
      /** Der Boss ist in der Luft – der Nahkampf streift ihn nur */
      grazed?: boolean;
    }
  /** Der Boss ist abgetaucht – der Angriff des Helden geht ins Leere */
  | { type: "evaded" }
  /** Der Boss taucht ab und greift nicht an – `extinguished`: das Wasser löscht sein Feuer */
  | { type: "submerged"; extinguished?: boolean }
  /** Die letzte Panzerplatte ist ab … */
  | { type: "platesBroken" }
  /** … und sie sind nachgewachsen */
  | { type: "platesRegrown" }
  /** Das Seelengefäss lässt den Boss wieder aufstehen – mit `heal` LP */
  | { type: "risen"; heal: number }
  /** Ein Fluch liegt auf dem Helden und zählt herunter */
  | { type: "cursed" }
  /** Der Fluch ist gebrochen – durch Schaden am Boss oder Läuterung (`cleansed`) */
  | { type: "curseBroken"; cleansed?: boolean }
  /** Der Fluch bricht los */
  | { type: "curseBurst"; damage: number }
  /** Der Boss saugt die Kraft einer Fähigkeit auf – `charges`: so viele hat er jetzt */
  | { type: "static"; charges: number }
  /** Der Boss verschlingt eine Fähigkeit des Helden … */
  | { type: "devoured"; ability: AbilityId }
  /** … schlägt mit ihr zu (die Treffer folgen als "hit") … */
  | { type: "stolen"; ability: AbilityId }
  /** … bis der Held sie befreit */
  | { type: "freed"; ability: AbilityId }
  /** Der Held wehrt ab: kein Angriff, halber Schaden, etwas Mana */
  | { type: "defend"; mana: number }
  /** Das offene Höhlenauge wirft die Fähigkeit zurück – der Held erleidet `damage` */
  | { type: "reflected"; damage: number }
  /** Der Boss lädt auf (greift nicht an) – `roundsLeft` bis zum Auslösen */
  | { type: "charging"; roundsLeft: number }
  /** Aufladen des Bosses bzw. Ritual eines Begleiters (`add`) ist unterbrochen */
  | { type: "interrupted"; add?: string }
  /** Der Boss taumelt nach dem abgebrochenen Aufladen und greift nicht an */
  | { type: "staggered" }
  /** Der Schildträger hebt einen Schild über den Boss */
  | { type: "bossShield"; add: string; shield: number }
  /** Der Trommler trommelt lauter */
  | { type: "drumming"; add: string; stacks: number }
  /** Der Heiler setzt sein Ritual fort – `roundsLeft` bis zur Heilung */
  | { type: "ritual"; add: string; roundsLeft: number }
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
  | { type: "ability"; ability: AbilityId; weapon: SkillWeapon; manaCost: number; echo?: boolean }
  /** Skill „Schemen“: Der Held weicht einem Angriff aus (`add`: von einem Begleiter) */
  | { type: "dodged"; add?: string }
  /** Der Held heilt sich durch eine Fähigkeit (Heiliges Licht, Blutrausch) */
  | { type: "selfHeal"; heal: number }
  /** Läuterung: Gift, Feuer und Bluten auf dem Helden sind weg */
  | { type: "cleansed" }
  /** Parade/Vergeltung fängt einen Teil des gegnerischen Angriffs ab … */
  | { type: "guarded"; prevented: number }
  /** … und der Gegner erleidet Konter- bzw. Rückwurfschaden */
  | { type: "counter"; damage: number }
  /** Giftschaden – `target` ist, wer vergiftet ist; `burst`: Fäulnis lässt das Gift platzen */
  | { type: "poison"; target: Side; damage: number; add?: string; burst?: boolean }
  /** Feuerschaden – `target` ist, wer brennt */
  | { type: "burn"; target: Side; damage: number; add?: string }
  /** Blutungsschaden – `target` ist, wer blutet; `burst`: Blutsturz lässt die Wunde platzen */
  | { type: "bleed"; target: Side; damage: number; add?: string; burst?: boolean }
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
  /** `pack`: Das erste Tier eines Rudels fällt, seine Artgenossen kämpfen weiter */
  | { type: "defeated"; side: Side; add?: string; pack?: true }
  | { type: "fled"; goldLost: number }
  /** Klassen-Regeneration (Kleriker) am Ende der Runde */
  | { type: "regen"; heal: number };

/** Schaden pro Runde (Gift, Feuer, Bluten) – ignoriert Rüstung */
export interface DamageOverTime {
  damage: number;
  /** Verbleibende Runden inklusive der aktuellen */
  roundsLeft: number;
  /** Gift mit Schleichendem Gift/Fäulnis: so viele Stapel (fehlt: 1) */
  stacks?: number;
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
  /** Vom Helden betäubt bzw. eingefroren – zählt in der Runde danach (Erschütterung, Kryomant, Schmelzen) */
  dazed?: number;
  chilled?: number;
  /** Erschüttert: in den letzten 2 Runden betäubt – für den Heiligen Hammer */
  shaken?: number;
}

/** Ein Begleiter des Bosses – eine normale Kreatur, die mitkämpft. */
export interface BattleAdd {
  /** "add-1", "add-2", … */
  uid: string;
  creatureId: string;
  /** Aufgabe im Kampf: Heiler, Schildträger, Trommler (bossMechanics.ts) */
  role?: AddRole;
  /** Fortschritt seiner Fähigkeit: Runden im Heilritual, Runden seit dem letzten Schild, Trommelwirbel */
  cast?: number;
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
  /** Bereitgehaltener Wurftrank – er fliegt mit dem nächsten Zug … */
  thrown?: string;
  /** … auf das Ziel beim Bereitlegen (uid eines Begleiters, sonst der Boss) – angreifen lässt sich danach ein anderes */
  thrownAt?: string;
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
  /** Absicht des Bosses in dieser Runde (bossIntents.ts) – fehlt bei normalen Kreaturen und älteren Kämpfen */
  bossTurn?: BossTurn;
  /** Schild des Schildträgers über dem Boss: so viel Schaden schluckt er noch */
  bossShield?: number;
  /** Elite-Gegner: seine Modifikatoren (elites.ts) – fehlt bei gewöhnlichen Gegnern */
  elite?: EliteAffix[];
  /** Heroischer Boss (heroic.ts): `elite` ist seine Zusatzmechanik, er zählt aber nicht als Elite */
  heroic?: boolean;
  /** Seltener Gegner (rares.ts): Id der Variante – `elite` sind seine festen Modifikatoren */
  rare?: string;
  /** Rudel (packs.ts): Die Begleiter sind Artgenossen – fällt der Gegner, geht der Kampf gegen sie weiter */
  pack?: boolean;
  /** Hauptwaffe des Helden – ihre Schadensart zählt bei normalen Angriffen (matchups.ts) */
  heroWeapon?: SkillWeapon | null;
  /** Endlos-Turm: Segen des Laufs (tower.ts) – wirken im Kampf (Fokus, Blutdurst, Henker, Dornen, Alchemie, Zweiter Atem) */
  blessings?: BlessingId[];
  /** Zweiter Atem ist in diesem Lauf schon verbraucht */
  secondWindUsed?: boolean;
  /** Endlos-Turm: das Stockwerk dieses Kampfes (der Gegner kämpft auf dem Level des Helden) */
  towerFloor?: number;
  /** Überfall aufs Dorf (raids.ts): der wievielte Kampf (ab 1) – der Gegner kämpft auf dem Level der Bande */
  raidWave?: number;
  /** Spezialeffekte der angelegten Items (itemEffects.ts) */
  itemEffects?: ItemEffectId[];
  /** „Unbeugsam“ hat in diesem Kampf schon gerettet */
  endured?: boolean;
  /** Faktor auf die Wirkung aller Tränke (Meisteralchemist) – fehlt: 1 */
  potionPower?: number;
  /** Ränge im Skilltree (skills.ts) – fehlt ohne vergebene Punkte */
  skills?: SkillRanks;
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
    /** Titanenschlag: Faktor auf den Schaden des nächsten normalen Angriffs */
    charged?: number;
    /** Schattenschritt: Die nächste Aktion trifft sicher kritisch */
    ambush?: boolean;
    /** Finte: Der nächste normale Angriff trifft doppelt */
    feint?: boolean;
    /** Arkane Heilung: heilt `percent` der max. LP am Rundenende */
    renew?: ActiveBuff;
    /** Gegenschlag: Faktor auf die Aktion nach dem Abwehren */
    riposte?: number;
    /** Zorn des Bollwerks: Stapel */
    wrath?: number;
    /** Notverband hat in diesem Kampf schon geheilt */
    bandaged?: boolean;
    /** Eingesetzte Fähigkeiten in diesem Kampf – für das Echo */
    casts?: number;
  };
  status: BattleStatus;
  /** Alle Ereignisse mit Rundennummer – für das Kampfprotokoll. */
  log: (BattleEvent & { round: number })[];
}

/**
 * Beginnt einen Kampf. `heroHp` setzt die Lebenspunkte des Helden – in Dungeons
 * bleiben sie zwischen den Kämpfen erhalten (sonst startet man mit vollen LP).
 * `pack`: ein Rudel aus schwächeren Artgenossen statt eines Gegners (packs.ts).
 */
export function startBattle(
  id: string,
  heroName: string,
  hero: HeroCombatProfile,
  creature: CreatureDef,
  heroHp: number = hero.maxHp,
  elite: readonly EliteAffix[] = [],
  pack = false,
): BattleState {
  const single = eliteStats(getCreatureStats(creature), elite);
  const enemy = pack ? { ...single, maxHp: Math.round(single.maxHp * PACK_MEMBER.hp), damage: single.damage * PACK_MEMBER.damage } : single;
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
    ...(hero.skills && { skills: hero.skills }),
    enemyEffects: {},
    // „Wachsam“: Der erste gegnerische Angriff wird geblockt
    heroEffects: hasEffect(hero.itemEffects, "vigilant") ? { bulwark: true } : {},
    adds: (pack ? packAdds(creature) : enemyAdds(creature, elite))
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
    ...(pack && { pack }),
    ...withBossTurn(creature.id),
    status: "active",
    log: [],
  };
}

const withBossTurn = (creatureId: string): { bossTurn?: BossTurn } => {
  const turn = firstBossTurn(creatureId);
  return turn ? { bossTurn: turn } : {};
};

/** Absicht des Bosses in dieser Runde – bei älteren Kämpfen (ohne gespeicherte) wie zu Kampfbeginn. */
export function bossTurnOf(state: BattleState): BossTurn | null {
  return state.bossTurn ?? firstBossTurn(state.creatureId, state.round);
}

/** Abwehren: so viel des Schadens kommt in dieser Runde noch durch … */
export const DEFEND_DAMAGE_TAKEN = 0.5;
/** … und so viel Mana gibt es zusätzlich. */
export const DEFEND_MANA = 10;
/** Was Abwehren mit diesen Skills bringt (Gefasst, Fels) – für die Anzeige. */
export function defendEffect(skills: SkillRanks | undefined): { taken: number; mana: number } {
  return { taken: defendTaken(skills, DEFEND_DAMAGE_TAKEN), mana: defendMana(skills, DEFEND_MANA) };
}
/** Statt einer Fähigkeit: abwehren. */
export const DEFEND = "defend";
export type HeroAction = AbilityId | typeof DEFEND;

/** Lebende Begleiter. */
export function livingAdds(state: BattleState): BattleAdd[] {
  return (state.adds ?? []).filter((a) => a.combatant.hp > 0);
}

/** Wählt das Ziel des Helden: einen lebenden Begleiter (uid) oder den Boss (undefined). */
export function setTarget(state: BattleState, target: string | undefined): BattleState {
  if (target !== undefined && !livingAdds(state).some((a) => a.uid === target)) throw new Error("Dieses Ziel gibt es nicht.");
  if (target === undefined && state.enemy.hp === 0) throw new Error("Dieses Ziel gibt es nicht.");
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
  if (potion.effect.kind === "throw" && potion.effect.throw !== "blast" && !state.target && untouchable(bossTurnOf(state))) {
    return "Der Gegner ist abgetaucht – wirf auf einen Begleiter oder warte.";
  }
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
  /** Skill „Durchschlag“: Kritische Treffer ignorieren die Rüstung */
  critPierces = false,
): { damage: number; crit: boolean } {
  const crit = rng() < attacker.critChance;
  const spread = 0.85 + rng() * 0.3;
  const armor = crit && critPierces ? 0 : defender.armor;
  const raw = attacker.damage * spread * (1 - armorReduction(armor, attacker.level));
  return { damage: Math.max(1, Math.round(raw * (crit ? (attacker.critMultiplier ?? 1.5) : 1))), crit };
}

export type RoundResult = { state: BattleState; events: BattleEvent[] };

function assertActive(state: BattleState) {
  if (state.status !== "active") throw new Error("Der Kampf ist vorbei.");
}

/**
 * Trank trinken – höchstens einer pro Runde, jede Sorte nur einmal pro Kampf,
 * Heiltränke nicht bei vollen Lebenspunkten. Verstärkungen gelten ab sofort.
 * Ein Wurftrank zählt genauso, fliegt aber erst mit dem Zug des Helden (attackRound) –
 * auf das jetzt gewählte Ziel, auch wenn der Held danach ein anderes angreift.
 */
export function drinkPotion(state: BattleState, potion: PotionDef): RoundResult {
  const blocker = potionBlocker(state, potion);
  if (blocker) throw new Error(blocker);
  const { effect } = potion;
  if (effect.kind === "throw") {
    return {
      state: { ...state, thrown: potion.id, thrownAt: state.target, potionUsedThisRound: true, potionsUsed: [...state.potionsUsed, potion.id] },
      events: [],
    };
  }
  // Meisteralchemist: alle Tränke wirken stärker
  const power = state.potionPower ?? 1;
  const factor =
    effect.kind === "heal"
      ? (state.heroClass === "cleric" ? CLERIC_POTION_FACTOR : 1) *
        (1 + BLESSING.alchemy * stacks(state.blessings, "alchemy")) *
        (hasEffect(state.itemEffects, "alchemist") ? 1 + EFFECT.alchemist : 1) *
        potionSkillFactor(state.skills) *
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
  if (state.bossTurn?.devoured?.ability === id) return `${state.enemy.name} hält diese Fähigkeit gefangen.`;
  const wait = state.cooldowns?.[id] ?? 0;
  if (wait > 0) return cooldownText(wait);
  const manaCost = abilityCost(state, id);
  if (state.mana < manaCost) return `Nicht genug Mana (${manaCost} nötig).`;
  return null;
}

/** Manakosten einer Fähigkeit – mit Klasse, dem Turm-Segen „Fokus“ und dem Skilltree (Eröffnung, Echo). */
export function abilityCost(
  state: Pick<BattleState, "heroClass" | "blessings"> & Partial<Pick<BattleState, "skills" | "round" | "heroEffects">>,
  id: AbilityId,
): number {
  const { manaCost } = classAbility(id, state.heroClass);
  const skill = skillCostFactor(state.skills, state.round ?? 0, state.heroEffects?.casts);
  return Math.round(manaCost * Math.max(0, 1 - BLESSING.focus * stacks(state.blessings, "focus")) * skill);
}

/**
 * Betäubt die Fähigkeit den Gegner? Manche nur mit einer Chance (Eisstrahl, Schockwelle) – Wuchtschlag und
 * Kryomant erhöhen sie. Der Eisstrahl friert brennende Gegner öfter ein (`burning`).
 */
export function stunLands(ability: AbilityDef | null, rng: () => number, skills?: SkillRanks, burning = false): boolean {
  if (!ability?.stun) return false;
  const chance = burning && ability.freezeVsBurning ? ability.freezeVsBurning : ability.stunChance;
  return chance === undefined || rng() < skillStunChance(skills, chance, !!ability.freeze);
}

/** Raserei: unter halben LP mehr Treffer. */
export function abilityHits(ability: AbilityDef | null, hp: number, maxHp: number): number {
  if (!ability) return 1;
  return ability.frenzyHits && hp < maxHp * 0.5 ? ability.frenzyHits : (ability.hits ?? 1);
}

/**
 * Gift, Feuer oder Bluten trifft auf ein bestehendes derselben Art: Das mit mehr Schaden pro Runde
 * bleibt. Bei Gleichstand gewinnt das neue – es läuft dann wieder volle Runden.
 */
export const strongerDot = <T extends { damage: number }>(current: T | undefined, next: T): T =>
  current && current.damage > next.damage ? current : next;

/** Eine Runde einer Markierung (betäubt, eingefroren) ist vorbei. */
const tickMark = (rounds: number | undefined): number | undefined => (rounds && rounds > 1 ? rounds - 1 : undefined);

/** Kennzeichnet Betäubungs-Ereignisse des Eisstrahls als Einfrieren. */
export const freezeFlag = (ability: AbilityDef | null): { freeze?: true } => (ability?.freeze ? { freeze: true } : {});

/** Ein Gegner in der laufenden Runde: der Boss (ohne `add`) oder ein Begleiter. */
interface Foe {
  add?: string;
  /** Für Schwächen und Resistenzen (matchups.ts) */
  creatureId: string;
  role?: AddRole;
  /** Fortschritt der Fähigkeit eines Begleiters mit Aufgabe (BattleAdd.cast) */
  cast?: number;
  c: Combatant;
  fx: EnemyEffects;
}

const foeTag = (foe: Foe): { add?: string } => (foe.add ? { add: foe.add } : {});

/** Xal'Zar schlägt mit einer verschlungenen Fähigkeit des Helden zu – wie eine eigene Boss-Fähigkeit. */
function stolenAbility(state: BattleState, id: AbilityId): BossAbilityDef {
  const ability = classAbility(id, state.heroClass);
  return { id: `stolen-${id}`, bossId: state.creatureId, name: ability.name, icon: ability.icon, description: "", every: 0, ...stolenStrike(ability) };
}

/** Am Rundenende laufen Schwächung, Verwundbarkeit und Betäubungs-Immunität eine Runde ab. */
const tickEnemyEffects = (fx: EnemyEffects): EnemyEffects => ({
  ...fx,
  weaken: tickBuff(fx.weaken),
  vulnerable: tickBuff(fx.vulnerable),
  stunImmunity: tickStunImmunity(fx.stunImmunity),
  ...(fx.dazed !== undefined && { dazed: tickMark(fx.dazed) }),
  ...(fx.chilled !== undefined && { chilled: tickMark(fx.chilled) }),
  ...(fx.shaken !== undefined && { shaken: tickMark(fx.shaken) }),
});

/**
 * Eine Runde: Angriff des Helden – normal oder mit einer Fähigkeit – auf sein Ziel
 * (Flächen-Fähigkeiten auf mehrere Gegner) oder Abwehren (`DEFEND`), danach Gift,
 * Feuer, Bluten und der Zug des Bosses (ausser er ist betäubt) und seiner Begleiter.
 * Am Ende regeneriert der Held etwas Mana, und der Boss wählt seine nächste Absicht.
 */
export function attackRound(
  state: BattleState,
  rng: () => number = Math.random,
  action?: HeroAction,
): RoundResult {
  assertActive(state);
  const defending = action === DEFEND;
  const abilityId = defending ? undefined : action;
  const ability = abilityId ? classAbility(abilityId, state.heroClass) : null;
  if (abilityId) {
    const blocker = abilityBlocker(state, abilityId);
    if (blocker) throw new Error(blocker);
  }
  const turn = bossTurnOf(state);
  /** Treffer des Helden auf den Boss – für die Wut des Krummzahn */
  let heroHitsOnBoss = 0;
  /** Begleiter, die der Held in dieser Runde getroffen hat – das unterbricht ein Heilritual */
  const hitAdds = new Set<string>();
  let bossShield = state.bossShield ?? 0;
  /** Erzkönig: Panzerplatten – jeder Treffer bricht eine ab (fehlt bei anderen Bossen) */
  let plates = turn?.plates;
  /** Sumpfechse: abgetaucht – nicht angreifbar */
  const hidden = untouchable(turn);
  /** Gewöhnliche Begleiter, die in dieser Runde fallen – sie laden das Seelengefäss auf */
  let addsDown = 0;
  let risen = false;
  const events: BattleEvent[] = [];
  let hero = state.hero;
  let heroEffects = state.heroEffects;
  let mana = state.mana;
  let status: BattleStatus = "active";
  /** Ränge im Skilltree (skills.ts) */
  const skills = state.skills;
  // Der Boss zuerst, dann die Begleiter – Kopien, die sich in dieser Runde ändern
  const boss: Foe = { creatureId: state.creatureId, c: state.enemy, fx: state.enemyEffects };
  const adds: Foe[] = (state.adds ?? []).map((a) => ({ add: a.uid, creatureId: a.creatureId, role: a.role, cast: a.cast, c: a.combatant, fx: a.effects }));
  /** Rudel (packs.ts): Der Kampf läuft, bis alle Tiere liegen – nicht nur das erste */
  const pack = !!state.pack;
  /** Steht noch ein Gegner? Sonst ist der Kampf gewonnen. */
  const standing = () => boss.c.hp > 0 || (pack && adds.some((f) => f.c.hp > 0));
  /** Das erste Tier des Rudels liegt schon – sein Fall ist gemeldet */
  let packLeadDown = pack && state.enemy.hp === 0;
  /**
   * Ein gefallener Begleiter – der Kampf geht weiter. Im Rudel auch das erste Tier, solange ein anderes steht.
   * Skill „Seuche“: Sein Gift springt auf einen anderen über.
   */
  const addDown = (foe: Foe) => {
    if (foe.c.hp !== 0) return;
    if (foe.add) {
      events.push({ type: "defeated", side: "enemy", add: foe.add });
      if (!foe.role) addsDown++;
    } else {
      if (!pack || packLeadDown || !adds.some((f) => f.c.hp > 0)) return;
      packLeadDown = true;
      events.push({ type: "defeated", side: "enemy", pack: true });
    }
    const poison = foe.fx.poison;
    if (!poison || rankIn(skills, "plague") === 0) return;
    const next = [boss, ...adds].find((f) => f !== foe && f.c.hp > 0 && !f.fx.poison && matchupFactor(f.creatureId, "poison") > 0);
    if (next) next.fx = { ...next.fx, poison };
  };
  /**
   * Gift, Feuer oder Bluten auf einen Gegner legen – mit Schwäche/Resistenz; bei Immunität wirkt es nicht.
   * Der Skilltree macht es stärker oder länger, Gift stapelt sich (Schleichendes Gift) und platzt (Fäulnis).
   * Ein schwächeres Feuer, Gift oder Bluten überschreibt kein stärkeres.
   */
  const applyDot = (foe: Foe, kind: DotKind, base: number, rounds: number) => {
    const factor = matchupFactor(foe.creatureId, kind);
    if (factor === 0) {
      events.push({ type: "immune", kind, ...foeTag(foe) });
      return;
    }
    const damage = Math.max(1, Math.round(base * factor * ownDotFactor(skills, kind)));
    const length = ownDotRounds(skills, kind, rounds);
    if (kind !== "poison") {
      foe.fx = { ...foe.fx, [kind]: strongerDot(foe.fx[kind], { damage, roundsLeft: length }) };
      return;
    }
    const poison = strongerDot(foe.fx.poison, stackPoison(skills, foe.fx.poison, damage, length));
    const burst = rotBurst(skills, poison);
    if (burst > 0 && foe.c.hp > 0) {
      const dealt = Math.max(1, Math.round(burst * (1 + (foe.fx.vulnerable?.percent ?? 0))));
      foe.c = { ...foe.c, hp: Math.max(0, foe.c.hp - dealt) };
      foe.fx = { ...foe.fx, poison: undefined };
      events.push({ type: "poison", target: "enemy", damage: dealt, burst: true, ...foeTag(foe) });
      addDown(foe);
      return;
    }
    foe.fx = { ...foe.fx, poison };
  };
  /** Schadensart des Helden in dieser Runde: die der Fähigkeit bzw. ihrer Waffe, sonst die Hauptwaffe */
  const heroKind = (() => {
    if (ability?.kind) return ability.kind;
    const weapon = ability?.weapon ?? state.heroWeapon;
    return weapon ? WEAPON_KIND[weapon] : null;
  })();
  // Titanenschlag: Der nächste normale Angriff nach dem Ausholen macht mehr Schaden – das Ausholen ist damit verbraucht
  const plainAttack = !ability && !defending;
  const charge = plainAttack ? (heroEffects.charged ?? 1) : 1;
  if (plainAttack && heroEffects.charged) heroEffects = { ...heroEffects, charged: undefined };
  // Schattenschritt: Die nächste Aktion trifft sicher kritisch – Finte: der nächste normale Angriff doppelt
  const ambush = !defending && !!heroEffects.ambush;
  if (ambush) heroEffects = { ...heroEffects, ambush: undefined };
  const feint = plainAttack && !!heroEffects.feint;
  if (feint) heroEffects = { ...heroEffects, feint: undefined };
  /** Wuchtiger Schlag hat den Boss getroffen – das bricht sein Aufladen ab */
  let interruptHit = false;
  // Gegenschlag: Die Aktion nach dem Abwehren macht mehr Schaden – wer wieder abwehrt, lädt ihn neu
  const riposte = heroEffects.riposte ?? 1;
  if (heroEffects.riposte) heroEffects = { ...heroEffects, riposte: undefined };
  if (defending && rankIn(skills, "riposte") > 0) heroEffects = { ...heroEffects, riposte: riposteFactor(skills) };
  // Echo: Jede dritte Fähigkeit im Kampf kostet nichts und trifft ein zweites Mal mit halbem Schaden
  const echo = !!ability && echoDue(skills, heroEffects.casts);
  if (ability && rankIn(skills, "echo") > 0) heroEffects = { ...heroEffects, casts: (heroEffects.casts ?? 0) + 1 };
  const wrath = wrathFactor(heroEffects.wrath);
  let phase = state.phase;
  /** Absicht des Bosses: Taumelnd oder mit geschlossenem Auge erleidet er mehr Schaden */
  const takenBy = (foe: Foe) => (foe === boss ? bossTurnTakenFactor(turn) : 1);
  const foes = [boss, ...adds];
  const living = () => foes.filter((f) => f.c.hp > 0);
  /** Ohne gewähltes Ziel geht es gegen den Boss – im Rudel gegen das nächste Tier, wenn das erste liegt */
  const fallback = boss.c.hp > 0 || !pack ? boss : (adds.find((f) => f.c.hp > 0) ?? boss);
  const target = adds.find((f) => f.add === state.target && f.c.hp > 0) ?? fallback;
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

  // 0. Ein bereitgehaltener Wurftrank fliegt vor der Aktion – auch beim Abwehren (potions.ts)
  const thrown = state.thrown ? getPotion(state.thrown) : null;
  if (thrown?.effect.kind === "throw") {
    const { effect } = thrown;
    // Meisteralchemist: Wurftränke wirken stärker
    const power = state.potionPower ?? 1;
    const blast = effect.throw === "blast";
    const aim = adds.find((f) => f.add === state.thrownAt && f.c.hp > 0) ?? fallback;
    const missed = !blast && aim === boss && hidden;
    events.push({ type: "thrown", potionId: thrown.id, ...(!blast && foeTag(aim)), ...(missed && { missed }) });
    for (const foe of (blast ? living() : missed ? [] : [aim]).filter((f) => !(f === boss && hidden))) {
      if (effect.throw === "burn" || effect.throw === "poison") {
        applyDot(foe, effect.throw, strong.damage * effect.percent * power, effect.rounds);
      } else if (effect.throw === "freeze") {
        frozenByItem.add(foe);
      } else if (effect.throw === "acid") {
        foe.fx = { ...foe.fx, armorBreak: Math.max(foe.fx.armorBreak ?? 0, effect.percent * power) };
        events.push({ type: "corroded", ...foeTag(foe) });
        // Die Säure frisst zwei Panzerplatten des Erzkönigs weg
        if (foe === boss && plates !== undefined && plates > 0) {
          plates = Math.max(0, plates - 2);
          if (plates === 0) events.push({ type: "platesBroken" });
        }
      } else if (effect.throw === "smoke") {
        foe.fx = { ...foe.fx, weaken: { percent: effect.percent * power, roundsLeft: effect.rounds } };
        events.push({ type: "smoked", ...foeTag(foe) });
      } else {
        // Sprengflasche: ignoriert Rüstung, der Schild des Schildträgers schluckt sie aber
        const raw = Math.max(1, Math.round(strong.damage * effect.percent * power * (1 + (foe.fx.vulnerable?.percent ?? 0)) * takenBy(foe)));
        const absorbed = foe === boss ? Math.min(bossShield, raw) : 0;
        bossShield -= absorbed;
        const damage = raw - absorbed;
        foe.c = { ...foe.c, hp: Math.max(0, foe.c.hp - damage) };
        if (foe === boss) heroHitsOnBoss++;
        else if (foe.add) hitAdds.add(foe.add);
        events.push({ type: "blast", damage, ...foeTag(foe), ...(absorbed > 0 && { absorbed }) });
        addDown(foe);
      }
    }
  }

  // 1. Aktion des Helden
  if (defending) {
    const gain = Math.min(state.maxMana - mana, defendMana(skills, DEFEND_MANA));
    mana += gain;
    events.push({ type: "defend", mana: gain });
  }
  if (ability) {
    const manaCost = abilityCost(state, ability.id);
    mana -= manaCost;
    events.push({ type: "ability", ability: ability.id, weapon: ability.weapon, manaCost, ...(echo && { echo }) });
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
    if (ability.ambush) heroEffects = { ...heroEffects, ambush: true };
    if (ability.feint) heroEffects = { ...heroEffects, feint: true };
    if (ability.renew) heroEffects = { ...heroEffects, renew: { percent: ability.renew.percent, roundsLeft: ability.renew.rounds } };
    if (ability.manaGain) mana = Math.min(state.maxMana, mana + ability.manaGain);
    // Zusatzeffekte wirken aufs Ziel – bei Flächenwirkung "all" auf alle Gegner (nicht auf einen abgetauchten Boss)
    for (const foe of (aoe === "all" ? living() : [target]).filter((f) => !(f === boss && hidden))) {
      if (ability.weaken) foe.fx = { ...foe.fx, weaken: { percent: ability.weaken.percent, roundsLeft: ability.weaken.rounds } };
      if (ability.vulnerable) {
        foe.fx = { ...foe.fx, vulnerable: { percent: ability.vulnerable.percent, roundsLeft: ability.vulnerable.rounds } };
      }
      if (ability.armorBreak) foe.fx = { ...foe.fx, armorBreak: ability.armorBreak };
      // Fluch der Schwäche: Gift und Feuer auf dem Ziel halten länger
      if (ability.extendDots) {
        for (const kind of ["poison", "burn"] as const) {
          const dot = foe.fx[kind];
          if (dot) foe.fx = { ...foe.fx, [kind]: { ...dot, roundsLeft: dot.roundsLeft + ability.extendDots } };
        }
      }
      for (const kind of OVER_TIME) {
        const effect = ability[kind];
        if (effect) applyDot(foe, kind, strong.damage * effect.percent, effect.rounds);
      }
    }
  }
  const vulnerableOf = (foe: Foe) => 1 + (foe.fx.vulnerable?.percent ?? 0);
  const armorOf = (foe: Foe) => (ability?.ignoreArmor ? 0 : Math.round(foe.c.armor * (1 - (foe.fx.armorBreak ?? 0))));
  /** Lichkönig: Fällt er, solange das Seelengefäss geladen ist, steht er einmal wieder auf. */
  const rise = () => {
    // Nur wer ein Seelengefäss hat – sonst stünde jeder Gegner auf, dessen Begleiter mit ihm fallen
    if (turn?.vessel === undefined) return;
    const charges = Math.min(VESSEL_MAX, (turn?.vessel ?? 0) + addsDown);
    if (boss.c.hp > 0 || risen || charges <= 0 || hero.hp <= 0) return;
    risen = true;
    const heal = Math.round(boss.c.maxHp * VESSEL_HP * charges);
    boss.c = { ...boss.c, hp: heal };
    boss.fx = {};
    events.push({ type: "risen", heal });
  };
  let dealtByHero = 0;
  let evaded = false;
  /** Echo: Der zweite Durchgang einer Fähigkeit trifft mit halbem Schaden */
  let echoShare = 1;
  const fire = !!ability?.burn;
  /** Ein Treffer des Helden – `share` < 1 bei Splash-Schaden auf Umstehende. */
  const strike = (foe: Foe, share = 1) => {
    // Die abgetauchte Sumpfechse ist nicht zu treffen
    if (foe === boss && hidden) {
      if (!evaded) events.push({ type: "evaded" });
      evaded = true;
      return;
    }
    // Finisher (Meucheln): mehr Schaden gegen angeschlagene Gegner
    const finisher = ability?.execute && foe.c.hp < foe.c.maxHp * ability.execute.threshold ? ability.execute.factor : 1;
    // Turm-Segen „Henker“: mehr Schaden gegen angeschlagene Gegner
    const headsman = foe.c.hp < foe.c.maxHp * BLESSING.executioner.threshold ? 1 + BLESSING.executioner.bonus * stacks(state.blessings, "executioner") : 1;
    // Ausbluten: mehr Schaden gegen blutende Gegner, Heiliger Hammer gegen erschütterte
    const execute =
      finisher *
      headsman *
      (ability?.bleedBonus && foe.fx.bleed ? 1 + ability.bleedBonus : 1) *
      (ability?.shakenBonus && foe.fx.shaken ? 1 + ability.shakenBonus : 1);
    // Schattenschritt: sicher kritisch – Richterstoss: stärker gegen einen aufladenden Boss
    const sureCrit = ambush;
    const charging = ability?.chargingBonus && foe === boss && turn?.intent === "charging" ? 1 + ability.chargingBonus : 1;
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
      foeElite: foe === boss && (state.elite?.length ?? 0) > 0 && !state.heroic,
    });
    // Skilltree: Hinrichter, Erschütterung, Pyromant, Kryomant, Schmelzen – dazu Gegenschlag, Zorn und Echo
    const foeState: FoeState = {
      hp: foe.c.hp,
      maxHp: foe.c.maxHp,
      bleeding: foe.fx.bleed !== undefined,
      burning: foe.fx.burn !== undefined,
      dazed: !!foe.fx.dazed,
      chilled: !!foe.fx.chilled,
    };
    const skillFactor = skillDamageFactor(skills, foeState, fire) * riposte * wrath * echoShare;
    const critChance = strong.critChance + effectCritBonus(effects, foeBoss) + skillCritBonus(skills, foeState);
    // Panzerplatten des Erzkönigs, Ignaroth in der Luft – nur direkte Treffer auf den Boss
    const plate = foe === boss ? plateFactor(plates) : 1;
    const air = foe === boss ? airborneFactor(turn, ability?.weapon ?? state.heroWeapon) : 1;
    const direct = taken * plate * air;
    const attacker: Combatant = ability
      ? {
          ...strong,
          damage:
            strong.damage * ability.multiplier * execute * charge * charging * vulnerableOf(foe) * share * direct * kindFactor * itemFactor * skillFactor,
          critChance: ability.guaranteedCrit || sureCrit ? 1 : critChance,
        }
      : {
          ...strong,
          damage: strong.damage * headsman * charge * share * vulnerableOf(foe) * direct * kindFactor * itemFactor * skillFactor,
          critChance: sureCrit ? 1 : critChance,
        };
    const heroHit = rollHit(attacker, { ...foe.c, armor: armorOf(foe) }, rng, rankIn(skills, "piercing") > 0);
    // Das offene Höhlenauge wirft Fähigkeiten zurück – der Held erleidet einen Teil, das Auge nichts
    if (foe === boss && ability && reflectsAbilities(turn)) {
      const damage = Math.max(1, Math.round(heroHit.damage * EYE_REFLECT));
      hero = { ...hero, hp: Math.max(0, hero.hp - damage) };
      events.push({ type: "reflected", damage });
      return;
    }
    // Der Schild des Schildträgers schluckt direkte Treffer auf den Boss
    const absorbed = foe === boss ? Math.min(bossShield, heroHit.damage) : 0;
    bossShield -= absorbed;
    const damage = heroHit.damage - absorbed;
    if (foe === boss) heroHitsOnBoss++;
    else if (foe.add) hitAdds.add(foe.add);
    if (foe === boss && ability?.interrupt) interruptHit = true;
    dealtByHero += Math.min(foe.c.hp, damage);
    foe.c = { ...foe.c, hp: Math.max(0, foe.c.hp - damage) };
    events.push({
      type: "hit",
      attacker: "hero",
      ...heroHit,
      damage,
      ...foeTag(foe),
      ...(taken < 1 && { shielded: true }),
      ...(absorbed > 0 && { absorbed }),
      ...(plate < 1 && { plated: true }),
      ...(air < 1 && { grazed: true }),
      ...((matchup === "weak" || matchup === "resist") && { matchup }),
    });
    // Jeder Treffer bricht eine Panzerplatte ab, Wucht gleich zwei
    if (foe === boss && plates !== undefined && plates > 0) {
      plates = Math.max(0, plates - (kind === "blunt" ? 2 : 1));
      if (plates === 0) events.push({ type: "platesBroken" });
    }
    // Plünderer: kritische Treffer lassen bluten
    if (heroHit.crit && state.heroClass === "plunderer" && foe.c.hp > 0) {
      const damage = strong.damage * PLUNDERER_BLEED.percent * matchupFactor(foe.creatureId, "bleed");
      if (damage > 0 && (foe.fx.bleed?.damage ?? 0) <= damage) applyDot(foe, "bleed", strong.damage * PLUNDERER_BLEED.percent, PLUNDERER_BLEED.rounds);
    }
    // Skills bei kritischen Treffern: Adrenalin (Mana), Schnitter (Bluten), Offene Wunde (länger bluten)
    if (heroHit.crit) {
      mana = Math.min(state.maxMana, mana + critMana(skills));
      if (foe.c.hp > 0 && rankIn(skills, "reaper") > 0 && (foe.fx.bleed?.damage ?? 0) <= strong.damage * SKILL.reaper.percent) {
        applyDot(foe, "bleed", strong.damage * SKILL.reaper.percent, SKILL.reaper.rounds);
      }
      const bleed = foe.fx.bleed;
      if (foe.c.hp > 0 && foeState.bleeding && bleed && rankIn(skills, "openWound") > 0) {
        foe.fx = { ...foe.fx, bleed: { ...bleed, roundsLeft: bleed.roundsLeft + 1 } };
      }
    }
    // Schmelzen: Das Feuer taut den eingefrorenen Gegner auf
    if (melts(skills, foeState.chilled, fire)) foe.fx = { ...foe.fx, chilled: undefined };
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
  // Wer abwehrt, greift nicht an
  const volley = () => {
    for (let i = 0; i < (defending ? 0 : abilityHits(ability, hero.hp, hero.maxHp)) && standing() && hero.hp > 0; i++) {
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
  };
  volley();
  if (echo && ability && ability.multiplier > 0) {
    echoShare = SKILL.echo.share;
    volley();
    echoShare = 1;
  }
  // Finte: Der normale Angriff trifft ein zweites Mal
  if (feint && target.c.hp > 0 && standing()) strike(target);
  // Duellant: Chance auf einen zweiten Schlag bei normalen Angriffen
  if (plainAttack && state.heroClass === "duelist" && target.c.hp > 0 && standing() && rng() < DUELIST_EXTRA_HIT) strike(target);
  // Item-Effekt „Kettenblitz“: Ein normaler Angriff springt auf einen zweiten Gegner über
  if (plainAttack && hasEffect(effects, "chainLightning") && standing() && rng() < EFFECT.chainLightning.chance) {
    const others = living().filter((f) => f !== target);
    if (others.length > 0) strike(others[Math.floor(rng() * others.length)], EFFECT.chainLightning.share);
  }
  // Lebensraub: Blutrausch und Plünderer
  const lifesteal =
    lifestealShare(state.heroClass, ability) +
    BLESSING.bloodthirst * stacks(state.blessings, "bloodthirst") +
    (hasEffect(effects, "soulDrain") ? EFFECT.soulDrain : 0) +
    skillLifesteal(skills);
  if (lifesteal > 0 && dealtByHero > 0) {
    const heal = Math.min(hero.maxHp - hero.hp, Math.round(dealtByHero * lifesteal));
    hero = { ...hero, hp: hero.hp + heal };
    if (heal > 0) events.push({ type: "selfHeal", heal });
  }
  rise();
  // Kaelthar saugt die Kraft jeder Fähigkeit auf – ausser in der Runde, in der er sich entlädt
  if (ability && turn?.static !== undefined && turn.ability !== "storm-lord-discharge" && boss.c.hp > 0) {
    events.push({ type: "static", charges: turn.static + 1 });
  }

  // 2. Gift, Feuer und Bluten wirken nach der Aktion des Helden – erst bei den Gegnern, dann beim Helden.
  //    Taucht die Sumpfechse ab, löscht das Wasser ihr Feuer.
  let extinguished = false;
  if (hidden && boss.fx.burn) {
    boss.fx = { ...boss.fx, burn: undefined };
    extinguished = true;
  }
  for (const foe of foes) {
    for (const kind of OVER_TIME) {
      const effect = foe.fx[kind];
      if (effect && foe.c.hp > 0 && standing()) {
        const damage = Math.max(1, Math.round(effect.damage * vulnerableOf(foe) * takenBy(foe)));
        foe.c = { ...foe.c, hp: Math.max(0, foe.c.hp - damage) };
        events.push({ type: kind, target: "enemy", damage, ...foeTag(foe) });
        const next = tickOverTime(effect);
        foe.fx = { ...foe.fx, [kind]: next };
        addDown(foe);
        // Blutsturz: Läuft das Bluten aus, platzt die Wunde
        const burst = kind === "bleed" && !next && foe.c.hp > 0 && standing() ? bloodburstDamage(skills, effect.damage) : 0;
        if (burst > 0) {
          const dealt = Math.max(1, Math.round(burst * vulnerableOf(foe) * takenBy(foe)));
          foe.c = { ...foe.c, hp: Math.max(0, foe.c.hp - dealt) };
          events.push({ type: "bleed", target: "enemy", damage: dealt, burst: true, ...foeTag(foe) });
          addDown(foe);
        }
      }
    }
  }
  for (const kind of OVER_TIME) {
    const effect = heroEffects[kind];
    if (effect && standing() && hero.hp > 0) {
      // Gegengift: weniger Schaden durch Gift, Feuer und Bluten
      const damage = Math.max(1, Math.round(effect.damage * dotTakenFactor(skills)));
      hero = { ...hero, hp: Math.max(0, hero.hp - damage) };
      events.push({ type: kind, target: "hero", damage });
      heroEffects = { ...heroEffects, [kind]: tickOverTime(effect) };
    }
  }

  // 3. Gegenangriff (entfällt bei Betäubung) – Bosse setzen regelmässig ihre Fähigkeit ein,
  //    danach greifen die Begleiter an. Bei Flächenwirkung "all" würfelt jeder Gegner seine Betäubung.
  rise();
  /** Was der Boss in der Heldenphase samt Gift, Feuer und Bluten verloren hat – bricht womöglich sein Aufladen ab */
  const bossDamageTaken = state.enemy.hp - boss.c.hp;
  // Neferets Fluch bricht, wenn sie genug LP verloren hat oder der Held sich läutert
  const curse = turn?.curse;
  const curseBroken = !!curse && boss.c.hp > 0 && (boss.c.hp <= curse.breakAt || !!ability?.cleanse);
  if (curseBroken) events.push({ type: "curseBroken", ...(boss.c.hp > curse.breakAt && { cleansed: true }) });
  let bossStunned = false;
  /** Xal'Zar hat diese Fähigkeit verschlungen */
  let devoured: AbilityId | undefined;
  /** Diese Boss-Fähigkeit hat den Helden erreicht – Neferets Fluch der Mumie legt den Fluch */
  let abilityLanded: string | undefined;
  const stunned = new Set<Foe>();
  if (standing() && hero.hp > 0) {
    // Ein abgetauchter Boss ist auch nicht zu betäuben
    for (const foe of aoe === "all" ? living() : [target]) {
      if (foe.c.hp > 0 && !(foe === boss && hidden) && stunLands(ability, rng, skills, !!foe.fx.burn)) stunned.add(foe);
    }
    for (const foe of frozenByItem) if (foe.c.hp > 0) stunned.add(foe);
  }
  /** Skills: Betäubte (Erschütterung) und Eingefrorene (Kryomant, Schmelzen) sind in der Runde danach markiert */
  const markStunned = (foe: Foe) => {
    // Erschüttert: zählt in den 2 Runden danach (Heiliger Hammer)
    foe.fx = { ...foe.fx, shaken: 3 };
    if (rankIn(skills, "concussion") > 0) foe.fx = { ...foe.fx, dazed: 2 };
    const frozen = frozenByItem.has(foe) || !!ability?.freeze;
    if (frozen && (rankIn(skills, "cryomancer") > 0 || rankIn(skills, "melt") > 0)) foe.fx = { ...foe.fx, chilled: 2 };
  };
  const elite = state.elite ?? [];
  /** Schildwall/Wutschrei: Faktor auf den Schaden, den der Held erleidet – Abwehren halbiert (Fels: noch weniger) */
  const hurt = Math.max(0, 1 + (heroEffects.damageTaken?.percent ?? 0)) * (defending ? defendTaken(skills, DEFEND_DAMAGE_TAKEN) : 1);
  /** Schemen: Chance, einem Angriff auszuweichen */
  const dodge = dodgeChance(skills);
  /** Zorn des Bollwerks: In dieser Runde abgewehrt, geblockt oder pariert */
  let warded = false;
  /** Turm-Segen „Dornen“: Wer den Helden trifft, erleidet einen Teil davon selbst – Stachelwehr beim Abwehren. */
  const thorns = (foe: Foe, damage: number) => {
    const share =
      BLESSING.thorns * stacks(state.blessings, "thorns") +
      (hasEffect(effects, "thorns") ? EFFECT.thorns : 0) +
      (defending ? defendThorns(skills) : 0);
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
  if (!standing()) {
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
    // Trommler: Der Boss macht mehr Schaden, je lauter er trommelt (seine Wirbel aus den Runden davor)
    const drums = 1 + DRUM_BONUS * adds.reduce((sum, f) => sum + (f.role === "drummer" && f.c.hp > 0 ? (f.cast ?? 0) : 0), 0);
    // Bollwerk blockt den ganzen gegnerischen Zug – Boss und Begleiter samt Zusatzeffekten.
    const bulwark = heroEffects.bulwark;
    let blocked = false;
    /** Eingefroren durch Frostbiss oder eine Fähigkeit? */
    const freezeOf = (foe: Foe) => (frozenByItem.has(foe) ? { freeze: true as const } : freezeFlag(ability));
    if (boss.c.hp === 0) {
      // Rudel: Das erste Tier liegt – es greifen nur noch seine Artgenossen an
    } else if (stunned.has(boss) && !boss.fx.stunImmunity) {
      bossStunned = true;
      events.push({ type: "stunned", ...freezeOf(boss) });
      markStunned(boss);
      // Bosse sind danach einige Runden immun
      if (getCreature(state.creatureId).creature.boss) boss.fx = { ...boss.fx, stunImmunity: freshStunImmunity() };
    } else if (!bossAttacks(turn)) {
      // Aufladen, Taumeln, Abtauchen, Verschlingen: kein Angriff – eine Betäubung, die abprallt, zählt nicht
      if (stunned.has(boss)) events.push({ type: "stunResisted", ...freezeOf(boss) });
      if (turn?.intent === "charging") events.push({ type: "charging", roundsLeft: turn.charge?.roundsLeft ?? 1 });
      else if (turn?.intent === "submerged") events.push({ type: "submerged", ...(extinguished && { extinguished }) });
      else if (turn?.intent === "devour") {
        // Xal'Zar verschlingt die stärkste Fähigkeit des Helden – eine Betäubung hätte es verhindert
        const strongest = state.abilities
          .map((id) => classAbility(id, state.heroClass))
          .filter((a) => a.multiplier > 0 && a.hits !== 0)
          .sort((a, b) => b.multiplier * (b.hits ?? 1) - a.multiplier * (a.hits ?? 1))[0];
        if (strongest) {
          devoured = strongest.id;
          events.push({ type: "devoured", ability: strongest.id });
        }
      } else events.push({ type: "staggered" });
    } else {
      if (stunned.has(boss)) events.push({ type: "stunResisted", ...freezeOf(boss) });
      // Xal'Zar schlägt mit der verschlungenen Fähigkeit zu
      const stolenId = turn?.intent === "stolen" ? (turn.devoured?.ability as AbilityId | undefined) : undefined;
      const special: BossAbilityDef | null = stolenId ? stolenAbility(state, stolenId) : turnAbility(turn);
      if (stolenId) events.push({ type: "stolen", ability: stolenId });
      else if (special) events.push({ type: "bossAbility", bossId: special.bossId, abilityId: special.id });
      if (bulwark) {
        events.push({ type: "blocked" });
        blocked = true;
        warded = true;
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
        /** Treffer, denen der Held nicht ausgewichen ist (Schemen) */
        let landed = 0;
        for (let i = 0; i < (special?.hits ?? (swift ? 2 : 1)) && hero.hp > 0; i++) {
          if (dodge > 0 && rng() < dodge) {
            events.push({ type: "dodged" });
            continue;
          }
          landed++;
          const enemyHit = rollHit(attacker, defender, rng);
          // Parade/Vergeltung: nur ein Teil des Schadens kommt durch
          const damage = guard ? Math.max(1, Math.round(enemyHit.damage * guard.reduce)) : enemyHit.damage;
          raw += enemyHit.damage;
          hero = { ...hero, hp: Math.max(0, hero.hp - damage) };
          dealt += damage;
          events.push({ type: "hit", attacker: "enemy", ...enemyHit, damage });
        }
        if (landed > 0 && (defending || guard)) warded = true;
        thorns(boss, dealt);
        if (special && hero.hp > 0 && landed > 0) abilityLanded = special.id;
        if (guard && landed > 0) {
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
            addDown(boss);
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
        // Wer ausweicht, entgeht auch den Zusatzeffekten
        if (special?.manaBurn && landed > 0) {
          const amount = Math.min(mana, special.manaBurn);
          mana -= amount;
          if (amount > 0) events.push({ type: "manaBurn", amount });
        }
        for (const kind of OVER_TIME) {
          const effect = special?.[kind];
          if (!effect || landed === 0) continue;
          const damage = Math.max(1, Math.round(boss.c.damage * drums * effect.percent));
          // Reinheit kürzt, Drachenfeuer macht gegen Feuer immun
          const rounds = heroDotRounds(effects, kind, effect.rounds);
          if (rounds > 0) heroEffects = { ...heroEffects, [kind]: { damage, roundsLeft: rounds } };
        }
      }
    }
    // Neferets Fluch bricht los – auch wenn sie betäubt ist; Bollwerk hilft nicht, Abwehren schon
    if (curse && !curseBroken && curse.roundsLeft <= 1 && hero.hp > 0 && boss.c.hp > 0) {
      const damage = Math.max(1, Math.round(hero.maxHp * CURSE_DAMAGE * hurt));
      hero = { ...hero, hp: Math.max(0, hero.hp - damage) };
      events.push({ type: "curseBurst", damage });
    }
    // Begleiter, solange Boss und Held stehen: Die mit Aufgabe setzen ihre Fähigkeit ein
    // (bossMechanics.ts), sonst je ein normaler Angriff
    for (const foe of adds) {
      if (foe.c.hp === 0 || !standing() || hero.hp === 0) continue;
      const tag = { add: foe.add! };
      if (foe.role === "healer") {
        // Heilritual: Ein Treffer oder eine Betäubung unterbricht es – angreifen tut der Heiler nie
        if (stunned.has(foe)) {
          events.push({ type: "stunned", ...freezeOf(foe), ...tag });
          markStunned(foe);
        }
        if (stunned.has(foe) || hitAdds.has(foe.add!)) {
          events.push({ type: "interrupted", ...tag });
          foe.cast = 0;
          continue;
        }
        const cast = (foe.cast ?? 0) + 1;
        if (cast >= RITUAL_ROUNDS) {
          foe.cast = 0;
          const heal = Math.min(boss.c.maxHp - boss.c.hp, Math.round(boss.c.maxHp * RITUAL_HEAL));
          boss.c = { ...boss.c, hp: boss.c.hp + heal };
          if (heal > 0) events.push({ type: "addHeal", ...tag, heal });
        } else {
          foe.cast = cast;
          events.push({ type: "ritual", ...tag, roundsLeft: RITUAL_ROUNDS - cast });
        }
        continue;
      }
      if (stunned.has(foe)) {
        events.push({ type: "stunned", ...freezeOf(foe), ...tag });
        markStunned(foe);
        // Der Trommler kommt aus dem Takt
        if (foe.role === "drummer" && foe.cast) {
          foe.cast = 0;
          events.push({ type: "interrupted", ...tag });
        }
        continue;
      }
      if (foe.role === "shield") {
        // Statt anzugreifen hebt er regelmässig den Schild – auch durch ein Bollwerk hindurch
        const cast = (foe.cast ?? 0) + 1;
        foe.cast = cast % SHIELD_EVERY;
        if (cast >= SHIELD_EVERY) {
          bossShield = Math.round(boss.c.maxHp * SHIELD_SHARE);
          events.push({ type: "bossShield", ...tag, shield: bossShield });
          continue;
        }
      }
      if (foe.role === "drummer") {
        foe.cast = Math.min(DRUM_MAX, (foe.cast ?? 0) + 1);
        events.push({ type: "drumming", ...tag, stacks: foe.cast });
      }
      if (bulwark) {
        events.push({ type: "blocked", ...foeTag(foe) });
        blocked = true;
        warded = true;
      } else if (dodge > 0 && rng() < dodge) {
        events.push({ type: "dodged", ...foeTag(foe) });
      } else {
        const weakened = 1 - (foe.fx.weaken?.percent ?? 0);
        const enemyHit = rollHit({ ...foe.c, damage: foe.c.damage * weakened * hurt }, strong, rng);
        hero = { ...hero, hp: Math.max(0, hero.hp - enemyHit.damage) };
        events.push({ type: "hit", attacker: "enemy", ...enemyHit, ...foeTag(foe) });
        thorns(foe, enemyHit.damage);
        if (defending) warded = true;
      }
    }
    if (blocked) heroEffects = { ...heroEffects, bulwark: undefined };
    // Zorn des Bollwerks: ein Stapel pro Runde, in der der Held abgewehrt, geblockt oder pariert hat
    if (warded && rankIn(skills, "wrath") > 0) heroEffects = { ...heroEffects, wrath: Math.min(SKILL.wrath.max, (heroEffects.wrath ?? 0) + 1) };
    rise();
    if (!standing()) {
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

  // Notverband: Wer zum ersten Mal unter 30 % fällt, heilt sich einmal pro Kampf
  const bandage = status === "active" ? bandageHeal(skills, hero.hp, hero.maxHp, heroEffects.bandaged) : 0;
  if (bandage > 0) {
    const heal = Math.min(hero.maxHp - hero.hp, Math.round(hero.maxHp * bandage));
    hero = { ...hero, hp: hero.hp + heal };
    heroEffects = { ...heroEffects, bandaged: true };
    events.push({ type: "selfHeal", heal });
  }

  // Item-Effekt „Unbeugsam“: einmal pro Kampf mit 1 LP überleben (vor dem Zweiten Atem des Turms)
  let endured = state.endured;
  if (status === "lost" && hero.hp === 0 && standing() && !endured && hasEffect(effects, "unyielding")) {
    const last = events.at(-1);
    if (last?.type === "defeated" && last.side === "hero") events.pop();
    hero = { ...hero, hp: 1 };
    status = "active";
    endured = true;
    events.push({ type: "endured" });
  }

  // Turm-Segen „Zweiter Atem“: Wer fällt, steht einmal pro Lauf wieder auf (der Gegner lebt noch)
  let secondWindUsed = state.secondWindUsed;
  if (status === "lost" && hero.hp === 0 && standing() && !secondWindUsed && stacks(state.blessings, "secondWind") > 0) {
    const last = events.at(-1);
    if (last?.type === "defeated" && last.side === "hero") events.pop();
    const heal = Math.round(hero.maxHp * BLESSING.secondWind);
    hero = { ...hero, hp: heal };
    status = "active";
    secondWindUsed = true;
    events.push({ type: "secondWind", heal });
  }

  // Der Boss wählt seine Absicht für die nächste Runde
  const nextTurn =
    turn && status === "active"
      ? nextBossTurn(state.creatureId, turn, {
          round: state.round + 1,
          heroHits: heroHitsOnBoss,
          damageTaken: bossDamageTaken,
          bossMaxHp: boss.c.maxHp,
          // Wuchtiger Schlag bricht das Aufladen ab wie eine Betäubung
          stunned: bossStunned || interruptHit,
          bossHp: boss.c.hp,
          heroAbility: !!ability,
          addsDown,
          risen,
          ...(abilityLanded && { abilityLanded }),
          curseBroken,
          ...(plates !== undefined && { platesLeft: plates }),
          ...(devoured && { devoured }),
        })
      : null;
  if (nextTurn?.curse && abilityLanded && nextTurn.curse.roundsLeft === CURSE_ROUNDS && !turn?.curse) events.push({ type: "cursed" });
  if (turn?.plates === 0 && nextTurn?.plates === PLATES_MAX) events.push({ type: "platesRegrown" });
  if (turn?.devoured && nextTurn && !nextTurn.devoured) events.push({ type: "freed", ability: turn.devoured.ability as AbilityId });

  // Unterbrecher: Mana für eine Betäubung, ein unterbrochenes Ritual oder einen taumelnden Boss
  const interrupted =
    events.some((e) => e.type === "stunned" || e.type === "interrupted") || (turn?.intent === "charging" && nextTurn?.intent === "staggered");
  if (status === "active" && interrupted) mana = Math.min(state.maxMana, mana + interruptMana(skills));
  // Nachhall: Manchmal löst die Fähigkeit keine Abklingzeit aus
  const skipChance = cooldownSkipChance(skills);
  const cooldownUsed = ability && !(skipChance > 0 && rng() < skipChance) ? ability : null;

  return {
    state: {
      ...state,
      ...(secondWindUsed && { secondWindUsed }),
      ...(endured && { endured }),
      hero,
      enemy: boss.c,
      enemyEffects: tickEnemyEffects(boss.fx),
      ...(state.adds && {
        adds: state.adds.map((a, i) => ({
          ...a,
          ...(adds[i].cast !== undefined && { cast: adds[i].cast }),
          combatant: adds[i].c,
          effects: tickEnemyEffects(adds[i].fx),
        })),
      }),
      // Ist das gewählte Ziel gefallen, geht es wieder gegen den Boss – im Rudel gegen das nächste Tier, wenn das erste liegt
      target: target.add !== undefined && target.c.hp > 0 ? target.add : boss.c.hp > 0 || !pack ? undefined : adds.find((f) => f.c.hp > 0)?.add,
      ...(phase && { phase }),
      ...(nextTurn && { bossTurn: nextTurn }),
      bossShield: bossShield > 0 ? bossShield : undefined,
      heroEffects: {
        ...heroEffects,
        empower: tickBuff(heroEffects.empower),
        damageTaken: tickBuff(heroEffects.damageTaken),
        renew: tickBuff(heroEffects.renew),
      },
      mana: Math.min(state.maxMana, mana + manaRegen(skills, MANA_REGEN)),
      // Item-Effekt „Flinke Hand“: eine Runde kürzer abklingen
      cooldowns: tickCooldowns(
        state.cooldowns,
        cooldownUsed && (hasEffect(effects, "quickHands") ? { id: cooldownUsed.id, cooldown: cooldownUsed.cooldown - 1 } : cooldownUsed),
      ),
      status,
      round: status === "active" ? state.round + 1 : state.round,
      potionUsedThisRound: false,
      thrown: undefined,
      thrownAt: undefined,
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
export function rollBossLoot(
  creature: CreatureDef,
  uid: string,
  rng: () => number = Math.random,
  chance = BOSS_ITEM_DROP_CHANCE,
): Loot {
  const items = getBossItems(creature.id);
  if (items.length === 0 || rng() >= chance) return null;
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
  /** Heroischer Boss (heroic.ts): öfter ein Boss-Item, mehr Erfahrung und Gold */
  heroic = false,
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
  const factor = heroic ? HEROIC_REWARD_FACTOR : 1;
  return {
    xp: Math.round((getCreatureXp(creature, hero.level) + addXp) * factor),
    loot: rollDrop(dropChance, weights, creature.level, uid, rng),
    potions: rng() < potionDrop.chance ? { potionId: potionDrop.potionId, count: potionDrop.count } : null,
    bossLoot: rollBossLoot(creature, `${uid}-boss`, rng, heroic ? HEROIC_BOSS_LOOT_CHANCE : BOSS_ITEM_DROP_CHANCE),
    buffPotion: rollBuffPotion(rng),
    gold: Math.round((rollCreatureGold(creature, rng) + addGold) * (1 + hero.goldBonus) * factor),
    materials: creatureMaterials(creature),
  };
}
