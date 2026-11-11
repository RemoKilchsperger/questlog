// Koop-Kampf: 2–4 Helden gegen einen Koop-Boss (Plan: docs/koop-kampf.md) –
// oder nacheinander gegen die Gegner eines Dungeons (docs/koop-dungeons.md).
// Reine Logik wie combat.ts – wer sie ausführt (Host-Browser, später ein
// Server), ist egal. Pro Runde handeln zuerst alle Helden, danach der Gegner.
// Der Gegner heisst hier durchgehend „Boss“, auch wenn es eine normale
// Dungeon-Kreatur ist.
//
// Ablauf einer Runde (`resolveRound`):
//   1. Jeder lebende Held der Reihe nach: optional ein Trank (für sich selbst
//      oder zum Wiederbeleben eines gefallenen Mitspielers), dann Angriff auf
//      sein Ziel – normal oder mit Fähigkeit. Schaden erzeugt Bedrohung.
//   2. Gift, Feuer und Bluten wirken – erst bei den Gegnern, dann bei den Helden.
//   3. Bossphase: Fähigkeit (trifft alle) oder Angriff auf das Ziel mit der
//      höchsten Bedrohung (mit etwas Zufall). Betäubung lässt sie ausfallen.
//      Danach greifen die Begleiter an – jeder ein Ziel nach Bedrohung.
//   4. Mana-Regeneration, Verstärkungen laufen ab.
//
// Begleiter: Dungeon-Bosse bringen sie wie solo mit (creatures.ts) – mit der
// Gruppe skaliert wie die übrigen Dungeon-Gegner. Fällt der Boss, ist der
// Kampf gewonnen. Begleiter mit Aufgabe setzen ihre Fähigkeiten ein, die zweite
// Phase wirkt wie solo (bossMechanics.ts, docs/boss-mechaniken.md).
//
// Absichten (bossIntents.ts, docs/boss-absichten.md): Dungeon-Bosse zeigen wie solo
// jede Runde, was sie vorhaben, und folgen ihrem eigenen Ablauf. Statt anzugreifen
// kann jeder Held abwehren. Raid-Bosse setzen ihre Fähigkeit weiter im festen Takt ein.
//
// Raid-Bosse mit Phasen (docs/raid-bosse.md): Der Sumpfhydra schlägt die Gruppe bei 75, 50 und
// 25 % einen Kopf ab, der als Begleiter weiterkämpft (hydra.ts) – Begleiter kommen hier also auch
// mitten im Kampf dazu.

import { freshStunImmunity, MANA_REGEN, type AbilityDef, type AbilityId, type Guard } from "./abilities";
import {
  classAbility,
  CLERIC_POTION_FACTOR,
  DUELIST_EXTRA_HIT,
  PALADIN_THREAT,
  PLUNDERER_BLEED,
  lifestealShare,
  rageFactor,
  type HeroClassId,
} from "./heroClasses";
import {
  addToChest,
  cooldownText,
  DEFEND_DAMAGE_TAKEN,
  DEFEND_MANA,
  EMPTY_CHEST,
  abilityHits,
  freezeFlag,
  rollBattleReward,
  rollHit,
  stunLands,
  tickCooldowns,
  type ActiveBuff,
  type BattleReward,
  type Combatant,
  type DamageOverTime,
  type DungeonChest,
  type HeroCombatProfile,
} from "./combat";
import { abilityForRound, getBossAbilities, type BossAbilityDef } from "./bossAbilities";
import { DRUM_BONUS, DRUM_MAX, phaseDue, RITUAL_HEAL, RITUAL_ROUNDS, SHIELD_EVERY, SHIELD_SHARE, type AddRole } from "./bossMechanics";
import {
  bossAttacks,
  bossTurnTakenFactor,
  firstBossTurn,
  nextBossTurn,
  plateFactor,
  stolenStrike,
  turnAbility,
  CURSE_DAMAGE,
  COOP_STATIC_PER_HERO,
  CURSE_ROUNDS,
  type BossTurn,
} from "./bossIntents";
import { matchupFactor, matchupOf, WEAPON_KIND } from "./matchups";
import {
  critBurns,
  EFFECT,
  effectCritBonus,
  effectDamageFactor,
  has as hasEffect,
  heroDotRounds,
  type ItemEffectId,
} from "./itemEffects";
import {
  coopElite,
  eliteStats,
  enemyAdds,
  EXPLOSION_FACTOR,
  POISON,
  RAGE_BONUS,
  SWIFT_SHARE,
  VAMPIRE_SHARE,
  type EliteAffix,
} from "./elites";
import { HEROIC_HP, heroicAffixes } from "./heroic";
import { ACID, BLOOD_HEAL, getHydraHead, HEAD_DAMAGE, HEAD_GROW_ROUNDS, HEAD_HP, headDue, hydraAbilityEvery, HYDRA_ID, NECK_TAKEN, VENOM, type HydraHeadKind } from "./hydra";
import { DUNGEONS, getCreature, getCreatureStats, getDungeon, type CreatureDef } from "./creatures";
import { getPotion, potionHeal, type BuffKind } from "./potions";
import { hash, seededRng } from "./random";
import {
  chestReward,
  eliteRoomAffixes,
  getMimic,
  mimicReward,
  stepCreature,
  stepKind,
  type ChestChoice,
  type MerchantOffer,
  type RoomKind,
  type TrapChoice,
} from "./dungeonPaths";
import { BLESSING, stacks, type BlessingId } from "./tower";
import { bandage, canEndure, eliteRegen, healShare, heroRegenShare, layDot, secondWind, tickEnemyEffects } from "./combatCore";
import {
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
  potionSkillFactor,
  rankIn,
  riposteFactor,
  skillCostFactor,
  skillCritBonus,
  skillDamageFactor,
  skillLifesteal,
  wrathFactor,
  SKILL,
  type FoeState,
  type SkillRanks,
  type SkillWeapon,
} from "./skills";
import { DUNGEON_MATERIAL_FACTOR, scaleMaterials } from "./village";

export const COOP_MIN_PLAYERS = 2;
export const COOP_MAX_PLAYERS = 4;
/** Zeit pro Spielerphase – wer nicht wählt, greift normal an. */
export const COOP_TURN_SECONDS = 30;
/** XP und Gold eines Koop-Sieges im Vergleich zu einem Solo-Boss gleichen Levels. */
export const COOP_REWARD_FACTOR = 1.5;
/**
 * Am Ende jeder Runde verliert jeder Held diesen Anteil seiner Bedrohung – so
 * zählt vor allem, wer gerade viel Schaden macht, und das Ziel kann wechseln.
 */
export const THREAT_DECAY = 0.3;
/** Mit Bollwerk zieht der Schildträger diesen Anteil der Boss-Angriffe auf sich – egal wie gross die Gruppe ist. */
export const BULWARK_SHARE = 0.75;

/** Id des Bosses in Ereignissen – Helden haben die Id ihres Spielers. */
export const BOSS = "boss";

export interface CoopBossAbility {
  /** Für Ereignisse und die Animation – bei Raid-Bossen fehlt sie (dann gilt die Boss-Id) */
  id?: string;
  name: string;
  icon: string;
  description: string;
  /** Eingesetzt in jeder Runde, deren Nummer durch `every` teilbar ist */
  every: number;
  multiplier: number;
  /** Trifft alle lebenden Helden statt nur das Ziel */
  aoe?: boolean;
  ignoreArmor?: boolean;
  /** Treffer pro Ziel (Standard 1) */
  hits?: number;
  /** Gift, Feuer, Bluten: Anteil des Boss-Schadens pro Runde */
  poison?: { percent: number; rounds: number };
  burn?: { percent: number; rounds: number };
  bleed?: { percent: number; rounds: number };
  /** Heilt den Boss um diesen Anteil des verursachten Schadens */
  drain?: number;
  /** Raubt jedem getroffenen Helden so viel Mana */
  manaBurn?: number;
  /** Friert einen Helden ein (meist den mit der höchsten Bedrohung): Er setzt die nächste Runde aus. */
  freeze?: boolean;
}

export interface CoopBossDef {
  id: string;
  name: string;
  description: string;
  level: number;
  /** Schlüssel der Grafik in src/game/creatureSprites.ts */
  sprite: string;
  /** Gebiet, dessen Hintergrund die Kampfszene zeigt (backgrounds.ts) */
  areaId: string;
  /** Stärke für 2 Spieler – mehr Spieler skalieren nach oben (siehe `coopBossStats`) */
  power: number;
  ability: CoopBossAbility;
  /** Normale Angriffe heilen den Boss um diesen Anteil des Schadens */
  lifesteal?: number;
}

/** Koop-Bosse, aufsteigend nach Level – jeder mit eigenem Raid-Set (items.ts). */
export const COOP_BOSSES: readonly CoopBossDef[] = [
  {
    id: "swamp-hydra",
    name: "Sumpfhydra",
    description: "Drei Köpfe, ein Hunger. Schlagt ihr einen ab, kämpft er weiter – und lebt er zu lange, wachsen zwei nach.",
    level: 20,
    sprite: "hydra",
    areaId: "mistmarsh",
    power: 2,
    ability: {
      name: "Giftatem",
      icon: "🐍",
      description: "Alle 3 Runden: Giftwolke auf alle Helden, die 3 Runden nachwirkt.",
      every: 3,
      multiplier: 0.7,
      aoe: true,
      poison: { percent: 0.25, rounds: 3 },
    },
  },
  {
    id: "frost-giant",
    name: "Frostriese Hrimgar",
    description: "Ein Riese aus Gletschereis. Wer ihm zu nahe kommt, erstarrt.",
    level: 40,
    sprite: "frost-giant",
    areaId: "frost-peaks",
    power: 2,
    ability: {
      name: "Gletscherstampfer",
      icon: "❄️",
      description: "Alle 3 Runden: Erschütterung auf alle Helden – einer friert ein und setzt eine Runde aus.",
      every: 3,
      multiplier: 0.8,
      aoe: true,
      freeze: true,
    },
  },
  {
    id: "world-eater",
    name: "Weltenverschlinger",
    description: "Ein Schlund aus der Leere. Jeder Biss nährt ihn.",
    level: 60,
    sprite: "world-eater",
    areaId: "void-abyss",
    power: 1.9,
    lifesteal: 0.5,
    ability: {
      name: "Leerenstrudel",
      icon: "🌀",
      description: "Alle 3 Runden: zieht alle Helden in den Strudel (ignoriert Rüstung) und raubt je 30 Mana. Seine Bisse heilen ihn.",
      every: 3,
      multiplier: 0.9,
      aoe: true,
      ignoreArmor: true,
      manaBurn: 30,
    },
  },
];

export function getCoopBoss(id: string): CoopBossDef {
  const boss = COOP_BOSSES.find((b) => b.id === id);
  if (!boss) throw new Error(`Unbekannter Koop-Boss: ${id}`);
  return boss;
}

/** Der Koop-Boss als Kreatur – für Grafik, Werte und Beute wie ein Solo-Boss. */
export function coopBossCreature(boss: CoopBossDef): CreatureDef {
  return { id: boss.id, name: boss.name, sprite: boss.sprite, level: boss.level, boss: true, power: boss.power };
}

/* ───────────── Gegner: Koop-Boss oder Dungeon-Kreatur ───────────── */

/** Ein Gegner im Koop-Kampf – alles, was Logik, Szene und Oberfläche über ihn wissen müssen. */
export interface CoopEnemy {
  id: string;
  name: string;
  sprite: string;
  level: number;
  /** Boss (Koop-Boss oder Dungeon-Endboss) – grösser dargestellt */
  boss: boolean;
  /** Eigens für den Koop gebauter Raid-Boss (sonst Dungeon-Kreatur) */
  raid: boolean;
  /** Gebiet bzw. Dungeon, dessen Hintergrund die Kampfszene zeigt */
  areaId: string;
  /** Fähigkeiten in Einsatzreihenfolge, im Wechsel alle `every` Runden (siehe `abilityForRound`) – leer ohne */
  abilities: CoopBossAbility[];
  /** Normale Angriffe heilen den Gegner um diesen Anteil des Schadens */
  lifesteal?: number;
  creature: CreatureDef;
}

export function getCoopEnemy(id: string): CoopEnemy {
  const boss = COOP_BOSSES.find((b) => b.id === id);
  if (boss) {
    const { name, sprite, level, areaId, ability, lifesteal } = boss;
    const abilities = [{ ...ability, id: boss.id }];
    return { id, name, sprite, level, boss: true, raid: true, areaId, abilities, lifesteal, creature: coopBossCreature(boss) };
  }
  const { creature, area } = getCreature(id);
  if (!area.dungeon) throw new Error(`Kein Koop-Gegner: ${id}`);
  // Dungeon-Bosse behalten ihre Solo-Fähigkeiten: die gegen ein Ziel trifft das Ziel mit der höchsten
  // Bedrohung, die gegen die Gruppe alle – dafür schwächer (siehe DUNGEON_COOP_ABILITY_FACTOR).
  const abilities = getBossAbilities(id).map(coopAbility);
  const { name, sprite, level, boss: isBoss } = creature;
  return { id, name, sprite, level, boss: isBoss, raid: false, areaId: area.id, abilities, creature };
}

/** Eine Fähigkeit eines Dungeon-Bosses im Koop: Die gegen die Gruppe trifft alle, dafür schwächer. */
function coopAbility(ability: BossAbilityDef): CoopBossAbility {
  return ability.target === "group" ? { ...ability, aoe: true, multiplier: ability.multiplier * DUNGEON_COOP_ABILITY_FACTOR } : { ...ability };
}

/**
 * Absicht zu Kampfbeginn – nur Dungeon-Bosse mit Fähigkeiten haben eine (Raid-Bosse folgen ihrem Takt).
 * Die Panzerplatten des Erzkönigs wachsen mit der Gruppe: so viele pro Held wie solo – sonst bricht
 * die Gruppe sie in einer Runde.
 */
const withBossTurn = (enemy: CoopEnemy, players: number): { bossTurn?: BossTurn } => {
  const turn = enemy.raid ? null : firstBossTurn(enemy.id);
  if (!turn) return {};
  return { bossTurn: turn.plates !== undefined ? { ...turn, plates: turn.plates * players, platesMax: turn.plates * players } : turn };
};

/** Absicht des Gegners in dieser Runde – bei älteren Kämpfen (ohne gespeicherte) wie zu Kampfbeginn. */
export function coopBossTurn(state: CoopBattleState): BossTurn | null {
  if (state.bossTurn) return state.bossTurn;
  return withBossTurn(getCoopEnemy(state.bossId), state.heroes.length).bossTurn ?? null;
}

/**
 * Dungeon-Gegner pro Spieler über einem: +10 % Lebenspunkte (zusätzlich zu × n) und +40 % Schaden.
 * Per Simulation so abgestimmt, dass 2, 3 und 4 Helden etwa gleich gut durchkommen – ähnlich
 * wie solo mit derselben Ausrüstung, eher etwas leichter (Wiederbeleben, Bollwerk).
 */
export const DUNGEON_COOP_HP_STEP = 0.1;
export const DUNGEON_COOP_DAMAGE_STEP = 0.4;
/**
 * Dungeon-Boss-Fähigkeiten treffen im Koop alle Helden – jeden mit dem Solo-Schaden des Bosses
 * (ohne Gruppenzuschlag) mal diesem Faktor. Per Simulation abgestimmt (docs/koop-dungeons.md).
 */
export const DUNGEON_COOP_ABILITY_FACTOR = 0.75;

/**
 * Kampfwerte des Gegners für `players` Spieler.
 * - Raid-Bosse sind auf zwei ausgelegt: Lebenspunkte × n/2, Schaden +10 % pro Spieler über zwei.
 * - Dungeon-Gegner sind auf einen ausgelegt: Lebenspunkte × n × (1 + 10 % pro Spieler über einem),
 *   Schaden +40 % pro Spieler über einem.
 */
export function coopEnemyStats(enemy: CoopEnemy, players: number): Combatant {
  // Dungeon-Bosse mit Begleitern haben im Koop einen eigenen LP-Faktor (creatures.ts, `withAdds`)
  const { bossFactors } = enemy.creature;
  const creature = bossFactors?.coopHp ? { ...enemy.creature, bossFactors: { ...bossFactors, hp: bossFactors.coopHp } } : enemy.creature;
  const base = getCreatureStats(creature);
  const scale = groupScaling(enemy.raid, players);
  const maxHp = Math.round(base.maxHp * scale.hp);
  return {
    name: enemy.name,
    level: enemy.level,
    maxHp,
    hp: maxHp,
    damage: base.damage * scale.damage,
    armor: base.armor,
    critChance: base.critChance,
  };
}

/** Faktoren auf Lebenspunkte und Schaden für `players` Spieler (siehe `coopEnemyStats`). */
function groupScaling(raid: boolean, players: number): { hp: number; damage: number } {
  const extra = players - 1;
  return raid
    ? { hp: players / 2, damage: 1 + 0.1 * (players - 2) }
    : { hp: players * (1 + DUNGEON_COOP_HP_STEP * extra), damage: 1 + DUNGEON_COOP_DAMAGE_STEP * extra };
}

/**
 * Begleiter wachsen milder mit der Gruppe als ihr Boss: Lebenspunkte × n, Schaden +20 % pro
 * Spieler über einem. Sie greifen zusätzlich an und sollen zerbrechlich bleiben – per Simulation
 * bleiben die Koop-Dungeons so etwa so schaffbar wie ohne Begleiter, der Tempel etwas schwerer.
 */
export const ADD_COOP_DAMAGE_STEP = 0.2;

/** Begleiter des Gegners für `players` Spieler: wie solo auf dem Level ihres Bosses (siehe `startBattle`). */
export function coopAdds(enemy: CoopEnemy, players: number, elite: readonly EliteAffix[] = []): CoopAdd[] {
  const scale = { hp: players, damage: 1 + ADD_COOP_DAMAGE_STEP * (players - 1) };
  // Begleiter des Bosses bzw. der Artgenosse eines Rudelführers
  return enemyAdds(enemy.creature, elite)
    .flatMap((add) => Array.from({ length: add.count }, () => add))
    .map((add, i) => {
      const { creature: def } = getCreature(add.creatureId);
      const stats = getCreatureStats({ ...def, level: enemy.level });
      const maxHp = Math.round(stats.maxHp * add.hp * scale.hp);
      return {
        uid: `add-${i + 1}`,
        creatureId: def.id,
        ...(add.role && { role: add.role }),
        combatant: { name: add.name ?? def.name, level: enemy.level, ...stats, maxHp, hp: maxHp, damage: stats.damage * add.damage * scale.damage },
        effects: {},
      };
    });
}

export function coopBossStats(boss: CoopBossDef, players: number): Combatant {
  return coopEnemyStats(getCoopEnemy(boss.id), players);
}

/* ───────────── Inhalt einer Lobby: Raid-Boss oder Dungeon ───────────── */

/**
 * Heroischer Koop-Dungeon: steht als Anhang in `boss_id` der Lobby (z. B.
 * „abandoned-mine:heroic“) – so braucht die Tabelle keine eigene Spalte.
 */
export const HEROIC_SUFFIX = ":heroic";

/** Inhalt einer Lobby ohne Anhang – und ob er heroisch ist. */
export function parseCoopContent(id: string): { id: string; heroic: boolean } {
  return id.endsWith(HEROIC_SUFFIX) ? { id: id.slice(0, -HEROIC_SUFFIX.length), heroic: true } : { id, heroic: false };
}

/** Ist diese Lobby ein Dungeon (sonst ein Raid-Boss)? `id` steht in `boss_id` der Lobby. */
export function isCoopDungeon(id: string): boolean {
  const content = parseCoopContent(id).id;
  return DUNGEONS.some((d) => d.id === content);
}

/** Name, Mindestlevel und Grafik des Inhalts einer Lobby. Wirft bei Unbekanntem (auch bei heroischen Raid-Bossen). */
export function coopContent(id: string): { name: string; level: number; sprite: string; description: string; heroic: boolean } {
  const { id: contentId, heroic } = parseCoopContent(id);
  if (isCoopDungeon(contentId)) {
    const dungeon = getDungeon(contentId);
    const boss = dungeon.creatures[dungeon.creatures.length - 1];
    return {
      name: heroic ? `${dungeon.name} (heroisch)` : dungeon.name,
      level: dungeon.minLevel,
      sprite: boss.sprite,
      description: dungeon.description,
      heroic,
    };
  }
  if (heroic) throw new Error("Raid-Bosse gibt es nicht heroisch.");
  const boss = getCoopBoss(id);
  return { name: boss.name, level: boss.level, sprite: boss.sprite, description: boss.description, heroic: false };
}

type OverTimeKind = "poison" | "burn" | "bleed";
const OVER_TIME: readonly OverTimeKind[] = ["poison", "burn", "bleed"];

/** Gift/Feuer/Bluten an Gegnern merken sich, wer sie verursacht hat (Bedrohung). */
type SourcedDot = DamageOverTime & { sourceId: string };

/** Wirkungen der Fähigkeiten auf einen Gegner (Boss oder Begleiter) */
export type CoopEnemyEffects = Partial<Record<OverTimeKind, SourcedDot>> & {
  armorBreak?: number;
  /** Geschwächt: macht `percent` weniger Schaden */
  weaken?: ActiveBuff;
  /** Verwundbar: erleidet `percent` mehr Schaden */
  vulnerable?: ActiveBuff;
  /** So viele Runden (inkl. der aktuellen) noch immun gegen Betäubung – gilt für jeden Koop-Gegner */
  stunImmunity?: number;
  /** Betäubt bzw. eingefroren – zählt in der Runde danach (Erschütterung, Kryomant, Schmelzen) */
  dazed?: number;
  chilled?: number;
  /** Erschüttert: in den letzten 2 Runden betäubt – für den Heiligen Hammer */
  shaken?: number;
};

/** Ein Begleiter des Bosses – seine `uid` ist zugleich seine Id in Ereignissen. */
export interface CoopAdd {
  /** "add-1", "add-2", … */
  uid: string;
  creatureId: string;
  /** Aufgabe im Kampf: Heiler, Schildträger, Trommler (bossMechanics.ts) */
  role?: AddRole;
  /** Fortschritt seiner Fähigkeit: Runden im Heilritual, Runden seit dem letzten Schild, Trommelwirbel */
  cast?: number;
  /** Abgeschlagener Kopf der Sumpfhydra (hydra.ts) */
  head?: HydraHeadKind;
  /** Runden, bis aus dem Stumpf ein zweiter Kopf wächst – fehlt, wenn keiner (mehr) nachwächst */
  grow?: number;
  combatant: Combatant;
  effects: CoopEnemyEffects;
}

export interface CoopHero {
  /** Id des Spielers */
  id: string;
  name: string;
  combatant: Combatant;
  mana: number;
  maxMana: number;
  abilities: AbilityId[];
  /** Abklingzeiten: verbleibende Runden (fehlt bei älteren Kämpfen) */
  cooldowns?: Partial<Record<AbilityId, number>>;
  /** Aktive Klasse (heroClasses.ts) – fehlt bei älteren Kämpfen */
  heroClass?: HeroClassId | null;
  /** Hauptwaffe – ihre Schadensart zählt bei normalen Angriffen (matchups.ts). Fehlt bei älteren Kämpfen. */
  weapon?: SkillWeapon | null;
  /** Spezialeffekte der angelegten Items (itemEffects.ts) */
  itemEffects?: ItemEffectId[];
  /** Ränge im Skilltree (skills.ts) – fehlt ohne vergebene Punkte */
  skills?: SkillRanks;
  /** „Unbeugsam“ hat in diesem Kampf schon gerettet */
  endured?: boolean;
  /** Segen aus Schrein und Händler im Dungeon (dungeonPaths.ts) – gelten bis zum Ende des Dungeons */
  blessings?: BlessingId[];
  /** Segen „Zweiter Atem“ hat in diesem Dungeon schon gerettet */
  secondWindUsed?: boolean;
  buffs: Partial<Record<BuffKind, ActiveBuff>>;
  /** Sorten, die in diesem Kampf schon getrunken wurden – jede nur einmal pro Kampf. */
  potionsUsed: string[];
  effects: Partial<Record<OverTimeKind, DamageOverTime>> & {
    bulwark?: boolean;
    /** Eingefroren: setzt die nächste Runde aus */
    frozen?: boolean;
    /** Parade/Vergeltung gegen den nächsten Angriff des Bosses */
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
    /** Säurekopf der Hydra: erlittener Schaden × (1 + percent) */
    corroded?: ActiveBuff;
    /** Eingesetzte Fähigkeiten in diesem Kampf – für das Echo */
    casts?: number;
  };
  threat: number;
  /** Auf 0 LP gefallen – handelt nicht und wird nicht angegriffen */
  down: boolean;
  /** Wurde schon einmal wiederbelebt (höchstens einmal pro Kampf) */
  revived: boolean;
}

export type CoopEvent =
  | { type: "potion"; heroId: string; targetId: string; potionId: string; heal: number; buff?: BuffKind; revive?: boolean }
  /** Ein Held wirft einen Wurftrank auf `target` (BOSS oder uid) – bei der Sprengflasche auf alle Gegner */
  | { type: "thrown"; heroId: string; target: string; potionId: string }
  /** Die Sprengflasche trifft einen Gegner – `absorbed`: so viel hat der Schild des Schildträgers geschluckt */
  | { type: "blast"; heroId: string; target: string; damage: number; absorbed?: number }
  /** Säure frisst die Rüstung an bzw. Rauch schwächt das Ziel */
  | { type: "corroded"; target: string }
  | { type: "smoked"; target: string }
  | { type: "ability"; heroId: string; ability: AbilityId; weapon: SkillWeapon; manaCost: number; echo?: boolean }
  /** Skill „Schemen“: Ein Held weicht einem Angriff aus (`attacker`: BOSS oder uid eines Begleiters) */
  | { type: "dodged"; heroId: string; attacker: string }
  /** Ein Held heilt sich durch eine Fähigkeit – `by`: Ein Mitspieler hat geheilt (Arkane Heilung) */
  | { type: "selfHeal"; heroId: string; heal: number; by?: string }
  /** Läuterung: Gift, Feuer und Bluten auf dem Helden sind weg */
  | { type: "cleansed"; heroId: string }
  /** Parade/Vergeltung fängt Schaden ab und trifft den Boss */
  | { type: "guarded"; heroId: string; prevented: number }
  | { type: "counter"; heroId: string; damage: number }
  /**
   * `attacker`/`target`: Spieler-Id, BOSS oder die uid eines Begleiters.
   * `shielded`: Ein Schildträger hat den Treffer auf den Boss gemindert.
   */
  | {
      type: "hit";
      attacker: string;
      target: string;
      damage: number;
      crit: boolean;
      weapon?: SkillWeapon;
      ability?: AbilityId;
      shielded?: boolean;
      /** Schwäche oder Resistenz des Ziels gegen die Schadensart (matchups.ts) */
      matchup?: "weak" | "resist";
      /** So viel hat der Schild des Schildträgers geschluckt (zusätzlich zu `damage`) */
      absorbed?: number;
      /** Eine Panzerplatte des Erzkönigs hat den Treffer gemindert */
      plated?: boolean;
      /** Der gepanzerte Hals der Hydra hat den Treffer gemindert (ein Kopf lebt noch) */
      neck?: boolean;
    }
  /** Ein Held wehrt ab: kein Angriff, halber Schaden, etwas Mana */
  | { type: "defend"; heroId: string; mana: number }
  /** Das Ritual des Heilers bzw. der Takt des Trommlers ist unterbrochen */
  | { type: "interrupted"; add: string }
  /** Der Heiler setzt sein Ritual fort – `roundsLeft` bis zur Heilung */
  | { type: "ritual"; add: string; roundsLeft: number }
  /** Der Trommler trommelt lauter */
  | { type: "drumming"; add: string; stacks: number }
  /** Der Schildträger hebt einen Schild über den Boss */
  | { type: "bossShield"; add: string; shield: number }
  /** Die letzte Panzerplatte ist ab bzw. sie sind nachgewachsen */
  | { type: "platesBroken" }
  | { type: "platesRegrown" }
  /** Ein Fluch liegt auf einem Helden, ist gebrochen (Schaden oder Läuterung) oder bricht los */
  | { type: "cursed"; heroId: string }
  | { type: "curseBroken"; heroId: string; cleansed?: boolean }
  | { type: "curseBurst"; heroId: string; damage: number }
  /** Der Boss saugt die Kraft einer Fähigkeit auf – `charges`: so viele hat er jetzt */
  | { type: "static"; heroId: string; charges: number }
  /** Der Boss verschlingt eine Fähigkeit eines Helden, schlägt mit ihr zu (Treffer folgen als "hit") – bis die Gruppe sie befreit */
  | { type: "devoured"; heroId: string; ability: AbilityId }
  | { type: "stolen"; heroId: string; ability: AbilityId }
  | { type: "freed"; heroId: string; ability: AbilityId }
  /** Das Ziel (BOSS oder uid eines Begleiters) ist gegen diesen Zustand immun – er wirkt nicht */
  | { type: "immune"; target: string; kind: OverTimeKind }
  /** Ein Heiler unter den Begleitern heilt den Boss */
  | { type: "addHeal"; add: string; heal: number }
  /** Der Boss fällt in seine zweite Phase (bossMechanics.ts) – `rally`: diese Begleiter stehen mit vollen LP (wieder) da */
  | { type: "bossPhase"; bossId: string; rally?: string[] }
  /** Elite „Regenerierend“: Der Gegner heilt sich am Ende der Runde */
  | { type: "enemyRegen"; heal: number }
  /** Elite „Explosiv“: Der Gegner explodiert beim Tod und trifft alle stehenden Helden (Bollwerk blockt) */
  | { type: "explosion"; hits: { heroId: string; damage: number; blocked?: boolean }[] }
  /** `burst`: Blutsturz bzw. Fäulnis lässt Wunde oder Gift platzen */
  | { type: OverTimeKind; target: string; damage: number; burst?: boolean }
  | { type: "bossAbility"; bossId: string; abilityId: string; name: string }
  /** Mit `add`: ein Begleiter statt des Bosses */
  | { type: "stunned"; freeze?: boolean; add?: string }
  | { type: "stunResisted"; freeze?: boolean; add?: string }
  /** Bollwerk blockt – `add`: der Angriff kam von einem Begleiter */
  | { type: "blocked"; heroId: string; add?: string }
  /** Ein Begleiter fällt – der Kampf geht weiter */
  | { type: "addDown"; add: string }
  /** Sumpfhydra: Ein Kopf ist ab und kämpft als Begleiter `add` – `seared`: Feuer hat den Stumpf ausgebrannt */
  | { type: "headSevered"; add: string; head: HydraHeadKind; seared: boolean }
  /** Aus dem Stumpf von `from` ist ein zweiter Kopf `add` gewachsen */
  | { type: "headGrown"; add: string; from: string }
  /** Der Säurekopf ätzt einen Helden – er erleidet mehr Schaden */
  | { type: "etched"; heroId: string; add: string }
  | { type: "down"; heroId: string }
  | { type: "victory" }
  | { type: "wipe" }
  /** Item-Effekt „Dornen“: Der Angreifer (BOSS oder uid) erleidet einen Teil seines Schadens selbst */
  | { type: "thorns"; heroId: string; target: string; damage: number }
  /** Item-Effekt „Unbeugsam“: Der Held überlebt einen tödlichen Treffer mit 1 LP */
  | { type: "endured"; heroId: string }
  /** Segen „Zweiter Atem“: Der Held steht nach einem tödlichen Treffer einmal wieder auf */
  | { type: "secondWind"; heroId: string; heal: number }
  /** Ein Held wurde eingefroren bzw. setzt eingefroren aus */
  | { type: "frozen"; heroId: string }
  | { type: "skipped"; heroId: string }
  /** Der Boss raubt einem Helden Mana bzw. heilt sich durch seinen Biss */
  | { type: "manaBurn"; heroId: string; amount: number }
  | { type: "drain"; heal: number }
  /** Klassen-Regeneration (Kleriker) am Ende der Runde */
  | { type: "regen"; heroId: string; heal: number };

export type CoopStatus = "active" | "won" | "lost";

export interface CoopBattleState {
  id: string;
  bossId: string;
  round: number;
  /** Ende der aktuellen Spielerphase (ms seit 1970) – danach wird automatisch aufgelöst */
  deadline: number;
  heroes: CoopHero[];
  boss: Combatant;
  bossEffects: CoopEnemyEffects;
  /** Begleiter des Bosses – auch besiegte (LP 0). Fehlt bei älteren Kämpfen. */
  adds?: CoopAdd[];
  /** Der Boss ist in seiner zweiten Phase (bossMechanics.ts) – sie kommt nur einmal */
  phase?: boolean;
  /** Sumpfhydra: so viele Köpfe sind schon abgeschlagen (hydra.ts) */
  heads?: number;
  /** Absicht des Dungeon-Bosses in dieser Runde (bossIntents.ts) – fehlt bei Raid-Bossen und normalen Gegnern */
  bossTurn?: BossTurn;
  /** Schild des Schildträgers über dem Boss: so viel Schaden schluckt er noch */
  bossShield?: number;
  /** Elite-Gegner im Koop-Dungeon: seine Modifikatoren (elites.ts) – fehlt bei gewöhnlichen Gegnern */
  elite?: EliteAffix[];
  /** Heroischer Endboss (heroic.ts): `elite` ist seine Zusatzmechanik, er zählt aber nicht als Elite */
  heroic?: boolean;
  status: CoopStatus;
  log: (CoopEvent & { round: number })[];
  /** Nur in Koop-Dungeons: welcher Dungeon, welcher Kampf. `bossId` ist dann der aktuelle Gegner. */
  dungeon?: CoopDungeonRun;
}

export interface CoopDungeonRun {
  id: string;
  /** Aktueller Schritt des Wegs (dungeonPaths.ts) – Zwischen- und Endboss stehen an ihrem Platz in `creatures` */
  stage: number;
  /** Id des ersten Kampfs – bleibt für den ganzen Dungeon gleich (Startwert für Weg und Beute) */
  runId: string;
  /** Heroischer Dungeon: der Endboss kämpft auf heroischer Stufe */
  heroic?: boolean;
  /** Gewählte Räume, einer pro Schritt – fehlt bei Läufen von vor den Wegen (alles Kämpfe) */
  path?: RoomKind[];
  /** Pro Abschnitt (bis und nach dem Zwischenboss): schon ein Raum ohne Kampf? */
  calm?: [boolean, boolean];
  /** Fallen und Rätsel, die schon vorkamen – keines doppelt */
  seen?: string[];
  /** Stimmen für die Türen der nächsten Gabelung: Index der Tür nach Spieler-Id */
  votes?: Record<string, number>;
  /** Raum ohne Kampf, in dem die Gruppe gerade steht */
  room?: CoopRoom;
  /** Ausgang der Rätsel nach Schritt: gelöst, falsch beantwortet (Schaden) oder Wächter geweckt (Kampf) */
  riddles?: Record<number, "solved" | "wrong" | "guardian">;
  /** Ausgang der Truhen nach Schritt: liegen gelassen, geöffnet (Beute) oder ein Mimic (Kampf) */
  chests?: Record<number, "left" | "opened" | "mimic">;
  /** Segen „Schatzsucher“: an welchen Schritten ihn ein Spieler genommen hat (zählt für die Beute danach) */
  treasure?: Record<string, number[]>;
}

/**
 * Raum ohne Kampf im Koop-Dungeon (coopDungeonPaths.ts). Schrein und Falle: jeder für sich,
 * Händler: jeder kauft selbst, Rätsel: die Mehrheit antwortet. `done`: erledigt, es geht weiter.
 */
export type CoopRoom =
  | { kind: "shrine"; done: boolean; offers: Record<string, BlessingId[]>; chosen: Record<string, BlessingId> }
  | { kind: "merchant"; done: boolean; offers: Record<string, MerchantOffer[]>; bought: Record<string, number[]> }
  | { kind: "trap"; done: boolean; trapId: string; outcomes: Record<string, { choice: TrapChoice; dodged: boolean; damage: number }> }
  | {
      kind: "riddle";
      done: boolean;
      riddleId: string;
      options: string[];
      votes: Record<string, string>;
      outcome?: { answer: string; correct: boolean; damage: number };
    }
  | { kind: "chest"; done: boolean; votes: Record<string, ChestChoice>; outcome?: { choice: ChestChoice; mimic: boolean } };

/** Gewählte Räume – ältere Läufe ohne Weg zählen jeden Schritt als Kampf. */
export function dungeonPath(run: CoopDungeonRun): RoomKind[] {
  return run.path ?? Array.from({ length: run.stage + 1 }, () => "fight" as const);
}

/** Gegner an Schritt `step`: Elite-Raum, Wächter eines Rätsels, Mimic, heroischer Endboss oder ein Gegner, der vielleicht Elite ist. */
function stepFoe(run: CoopDungeonRun, step: number): { creature: CreatureDef; elite: EliteAffix[]; heroic: boolean } {
  const area = getDungeon(run.id);
  const creature = stepCreature(area, run.runId, step);
  if (run.heroic && creature.boss) return { creature, elite: heroicAffixes(creature.id), heroic: true };
  const kind = dungeonPath(run)[step];
  if (kind === "elite") return { creature, elite: eliteRoomAffixes(area, run.runId, step), heroic: false };
  // Der Wächter eines falsch beantworteten Rätsels ist ein gewöhnlicher Gegner
  if (kind === "riddle") return { creature, elite: [], heroic: false };
  // Hinter einer Truhe kämpft man nur, wenn sie ein Mimic ist
  if (kind === "chest") return { creature: getMimic(area), elite: [], heroic: false };
  return { creature, elite: coopElite(run.runId, step, creature), heroic: false };
}

/** Grundwerte des Gegners – Elite-Modifikatoren und, beim heroischen Boss, mehr Lebenspunkte. */
function foeStats(enemy: CoopEnemy, players: number, elite: readonly EliteAffix[], heroic: boolean): Combatant {
  const stats = eliteStats(coopEnemyStats(enemy, players), elite);
  if (!heroic) return stats;
  const maxHp = Math.round(stats.maxHp * HEROIC_HP);
  return { ...stats, maxHp, hp: maxHp };
}

/**
 * Was ein Spieler in einer Runde tut: optional ein Trank (Ziel: er selbst oder
 * ein gefallener Mitspieler), dann ein Angriff – mit `ability` als Fähigkeit.
 * Ein Wurftrank fliegt auf `potion.targetId` (uid eines Begleiters oder BOSS) – so lässt sich
 * ein anderes Ziel bewerfen als angreifen. Steht dort ein Held, fliegt er auf das Ziel des Angriffs.
 */
export interface CoopAction {
  potion?: { potionId: string; targetId: string };
  ability?: AbilityId;
  /** Abwehren statt anzugreifen: halber Schaden in dieser Runde, etwas Mana (geht vor `ability`) */
  defend?: boolean;
  /** Ziel des Angriffs: uid eines Begleiters – fehlt, geht es gegen den Boss */
  target?: string;
}

export interface CoopPlayer {
  id: string;
  name: string;
  profile: HeroCombatProfile;
}

/**
 * Startet einen Koop-Kampf. `contentId` ist ein Raid-Boss oder ein Dungeon –
 * dann beginnt der Kampf gegen dessen ersten Gegner.
 */
export function startCoopBattle(id: string, contentId: string, players: CoopPlayer[], now: number): CoopBattleState {
  if (players.length < COOP_MIN_PLAYERS || players.length > COOP_MAX_PLAYERS) {
    throw new Error(`Ein Koop-Kampf braucht ${COOP_MIN_PLAYERS}–${COOP_MAX_PLAYERS} Spieler.`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length || players.some((p) => p.id === BOSS || p.id.startsWith("add-"))) {
    throw new Error("Ungültige Spieler-Ids.");
  }
  const content = parseCoopContent(contentId);
  const dungeon: CoopDungeonRun | undefined = isCoopDungeon(content.id)
    ? { id: content.id, stage: 0, runId: id, path: ["fight"], ...(content.heroic && { heroic: true }) }
    : undefined;
  // Im Dungeon: der Eingangskampf des Wegs (dungeonPaths.ts)
  const foe = dungeon ? stepFoe(dungeon, 0) : null;
  const enemy = getCoopEnemy(foe ? foe.creature.id : getCoopBoss(content.id).id);
  const { elite, heroic } = foe ?? { elite: [], heroic: false };
  return {
    id,
    bossId: enemy.id,
    ...(dungeon && { dungeon }),
    round: 1,
    deadline: now + COOP_TURN_SECONDS * 1000,
    heroes: players.map(({ id: heroId, name, profile }) => ({
      id: heroId,
      name,
      combatant: {
        name,
        level: profile.level,
        maxHp: profile.maxHp,
        hp: profile.maxHp,
        damage: profile.damage,
        armor: profile.armor,
        critChance: profile.critChance,
        critMultiplier: profile.critMultiplier,
      },
      weapon: profile.weapon ?? null,
      ...(profile.itemEffects?.length && { itemEffects: profile.itemEffects }),
      ...(profile.skills && { skills: profile.skills }),
      mana: profile.maxMana,
      maxMana: profile.maxMana,
      abilities: profile.abilities,
      cooldowns: {},
      heroClass: profile.heroClass,
      buffs: {},
      potionsUsed: [],
      // „Wachsam“: Der erste gegnerische Angriff wird geblockt
      effects: hasEffect(profile.itemEffects, "vigilant") ? { bulwark: true } : {},
      threat: 0,
      down: false,
      revived: false,
    })),
    boss: foeStats(enemy, players.length, elite, heroic),
    bossEffects: {},
    adds: coopAdds(enemy, players.length, elite),
    ...withBossTurn(enemy, players.length),
    ...(elite.length > 0 && { elite }),
    ...(heroic && { heroic }),
    status: "active",
    log: [],
  };
}

/* ───────────── Dungeons: von Schritt zu Schritt ───────────── */

/** Gefallene stehen zwischen zwei Dungeon-Kämpfen (und beim Betreten eines Raums) mit diesem Anteil ihrer Lebenspunkte wieder auf. */
export const DUNGEON_REVIVE_HP = 0.25;

/** Gefallene stehen wieder auf – zu Beginn eines neuen Kampfs oder Raums. */
export function reviveHeroes(heroes: readonly CoopHero[]): CoopHero[] {
  return heroes.map((h) =>
    h.down
      ? { ...h, down: false, combatant: { ...h.combatant, hp: Math.max(1, Math.round(h.combatant.maxHp * DUNGEON_REVIVE_HP)) } }
      : h,
  );
}

/** Schritte eines Koop-Dungeons (Eingang, Gabelungen, Zwischen- und Endboss). */
function dungeonCreatures(state: CoopBattleState): readonly CreatureDef[] {
  return state.dungeon ? getDungeon(state.dungeon.id).creatures : [];
}

/** Gewonnen, und im Dungeon wartet noch ein Schritt? Dann geht es per Tür oder auf Wunsch des Hosts weiter. */
export function hasNextStage(state: CoopBattleState): boolean {
  return state.dungeon !== undefined && state.status === "won" && state.dungeon.stage < dungeonCreatures(state).length - 1;
}

/** Der nächste Gegner, wenn er feststeht (Zwischen- oder Endboss) – an einer Gabelung null. */
export function nextStageEnemy(state: CoopBattleState): CoopEnemy | null {
  if (!hasNextStage(state)) return null;
  const area = getDungeon(state.dungeon!.id);
  const step = state.dungeon!.stage + 1;
  return stepKind(area, step) === "fork" ? null : getCoopEnemy(area.creatures[step].id);
}

/** Bisher geschaffte Schritte in diesem Dungeon – ein Raum zählt, sobald er erledigt ist. */
export function clearedStages(state: CoopBattleState): number {
  if (!state.dungeon) return 0;
  const room = state.dungeon.room;
  return state.dungeon.stage + (state.status === "won" && (!room || room.done) ? 1 : 0);
}

/** Endboss des Dungeons besiegt? */
export function dungeonCompleted(state: CoopBattleState): boolean {
  return state.dungeon !== undefined && clearedStages(state) === dungeonCreatures(state).length;
}

/**
 * Kampf am aktuellen Schritt von `run` – als neuer Kampf mit eigener Id. Die Lebenspunkte
 * werden mitgenommen, Gefallene stehen mit DUNGEON_REVIVE_HP wieder auf. Mana,
 * Abklingzeiten, Tränke, Zustände und Bedrohung beginnen frisch – wie solo. Segen bleiben.
 */
export function startDungeonFight(state: CoopBattleState, run: CoopDungeonRun, id: string, now: number): CoopBattleState {
  const { creature, elite, heroic } = stepFoe(run, run.stage);
  const enemy = getCoopEnemy(creature.id);
  const dungeon: CoopDungeonRun = { ...run };
  delete dungeon.votes;
  delete dungeon.room;
  return {
    id,
    bossId: enemy.id,
    dungeon,
    round: 1,
    deadline: now + COOP_TURN_SECONDS * 1000,
    heroes: reviveHeroes(state.heroes).map((h) => ({
      ...h,
      mana: h.maxMana,
      cooldowns: {},
      buffs: {},
      potionsUsed: [],
      effects: hasEffect(h.itemEffects, "vigilant") ? { bulwark: true } : {},
      endured: false,
      threat: 0,
      revived: false,
    })),
    boss: foeStats(enemy, state.heroes.length, elite, heroic),
    bossEffects: {},
    adds: coopAdds(enemy, state.heroes.length, elite),
    ...withBossTurn(enemy, state.heroes.length),
    ...(elite.length > 0 && { elite }),
    ...(heroic && { heroic }),
    status: "active",
    log: [],
  };
}

/** Nächster Kampf, wenn er feststeht (Zwischen- oder Endboss) – an Gabelungen wird abgestimmt (coopDungeonPaths.ts). */
export function nextDungeonStage(state: CoopBattleState, id: string, now: number): CoopBattleState {
  if (!hasNextStage(state)) throw new Error("Es gibt keinen nächsten Kampf.");
  const run = state.dungeon!;
  const stage = run.stage + 1;
  if (stepKind(getDungeon(run.id), stage) === "fork") throw new Error("An einer Gabelung wählt die Gruppe eine Tür.");
  return startDungeonFight(state, { ...run, stage, path: [...dungeonPath(run), "fight"] }, id, now);
}

/**
 * Truhe eines Spielers: die Beute aller geschafften Schritte, wie solo – Kämpfe, Fallen,
 * gelöste Rätsel, geöffnete Truhen und besiegte Mimics. Gewürfelt mit einem Startwert aus Dungeon-Durchgang, Schritt und Spieler –
 * so zeigt der Zwischenbildschirm schon den echten Inhalt, und nach dem Neuladen ist er gleich.
 */
export function rollCoopDungeonChest(state: CoopBattleState, hero: HeroCombatProfile, playerId: string): DungeonChest {
  if (!state.dungeon) return EMPTY_CHEST;
  const run = state.dungeon;
  const path = dungeonPath(run);
  let chest = EMPTY_CHEST;
  for (let i = 0; i < clearedStages(state); i++) {
    const rng = seededRng(hash(`${run.runId}|${i}|${playerId}`));
    const uid = `${run.runId}-${i}-${playerId}`;
    const foe = stepFoe(run, i);
    const kind = path[i] ?? "fight";
    const riddle = run.riddles?.[i];
    let reward: BattleReward | null = null;
    if (kind === "fight" || kind === "elite" || (kind === "riddle" && riddle === "guardian")) {
      // Der heroische Endboss zählt nicht als Elite, gibt aber mehr (heroic.ts)
      reward = rollBattleReward(foe.creature, hero, uid, rng, [], !foe.heroic && foe.elite.length > 0, foe.heroic);
    } else if (kind === "trap") {
      // Hinter der Falle: Beute wie von einem Gegner, ohne Erfahrung
      reward = { ...rollBattleReward(foe.creature, hero, uid, rng), xp: 0 };
    } else if (kind === "riddle" && riddle === "solved") {
      reward = { ...rollBattleReward(foe.creature, hero, uid, rng, [], true), xp: 0 };
    } else if (kind === "chest" && run.chests?.[i] === "mimic") {
      reward = mimicReward(foe.creature, hero, uid, rng);
    } else if (kind === "chest" && run.chests?.[i] === "opened") {
      reward = chestReward(stepCreature(getDungeon(run.id), run.runId, i), hero, uid, rng);
    }
    if (!reward) continue;
    // Segen „Schatzsucher“: mehr Erfahrung und Gold für alles danach
    const factor = 1 + BLESSING.treasure * (run.treasure?.[playerId] ?? []).filter((step) => step < i).length;
    // Dungeons geben doppelt so viel Baumaterial – wie solo
    chest = addToChest(chest, {
      ...reward,
      xp: Math.round(reward.xp * factor),
      gold: Math.round(reward.gold * factor),
      materials: scaleMaterials(reward.materials, DUNGEON_MATERIAL_FACTOR),
    });
  }
  return chest;
}

/** Held mit den Werten aktiver Verstärkungen. */
function buffed(hero: CoopHero): Combatant {
  // Item-Effekt „Letztes Gefecht“: mehr Rüstung bei wenig Lebenspunkten
  const lastStand =
    hasEffect(hero.itemEffects, "lastStand") && hero.combatant.hp < hero.combatant.maxHp * EFFECT.lastStand.threshold
      ? 1 + EFFECT.lastStand.armor
      : 1;
  return {
    ...hero.combatant,
    damage: hero.combatant.damage * (1 + (hero.buffs.attack?.percent ?? 0)),
    armor: Math.round(hero.combatant.armor * (1 + (hero.buffs.armor?.percent ?? 0)) * lastStand),
  };
}

/** Warum dieser Trank nicht geht – oder null. Ziel: man selbst oder ein gefallener Mitspieler. */
export function coopPotionBlocker(state: CoopBattleState, heroId: string, potionId: string, targetId: string): string | null {
  const hero = state.heroes.find((h) => h.id === heroId);
  const potion = getPotion(potionId);
  // Wurftränke fliegen auf einen Gegner – einen Mitspieler braucht es nicht
  const target = potion.effect.kind === "throw" ? hero : state.heroes.find((h) => h.id === targetId);
  if (!hero || !target) return "Unbekannter Held.";
  if (hero.down) return "Du bist gefallen.";
  if (hero.potionsUsed.includes(potionId)) return "Diese Sorte hast du in diesem Kampf schon eingesetzt.";
  if (potion.effect.kind === "throw") return null;
  if (target.id !== hero.id) {
    if (!target.down) return "Nur gefallene Mitspieler lassen sich wiederbeleben.";
    if (target.revived) return `${target.name} wurde schon einmal wiederbelebt.`;
    if (potion.effect.kind !== "heal") return "Zum Wiederbeleben braucht es einen Heiltrank.";
    return null;
  }
  if (potion.effect.kind === "heal" && hero.combatant.hp >= hero.combatant.maxHp) return "Deine Lebenspunkte sind schon voll.";
  return null;
}

/** Manakosten einer Fähigkeit im Koop – mit Klasse und Skilltree (Eröffnung in Runde 1, Echo). */
export function coopAbilityCost(hero: CoopHero, id: AbilityId, round = 0): number {
  // Segen „Fokus“: billigere Fähigkeiten
  const focus = Math.max(0, 1 - BLESSING.focus * stacks(hero.blessings, "focus"));
  return Math.round(classAbility(id, hero.heroClass).manaCost * skillCostFactor(hero.skills, round, hero.effects.casts) * focus);
}

/** Warum diese Fähigkeit nicht geht – oder null. `turn`: Absicht des Bosses (verschlungene Fähigkeit). */
export function coopAbilityBlocker(hero: CoopHero, id: AbilityId, turn?: BossTurn | null, round = 0): string | null {
  if (!hero.abilities.includes(id)) return "Diese Fähigkeit liegt auf keiner deiner angelegten Waffen.";
  if (turn?.devoured?.ability === id && turn.devoured.heroId === hero.id) return "Der Gegner hält diese Fähigkeit gefangen.";
  const wait = hero.cooldowns?.[id] ?? 0;
  if (wait > 0) return cooldownText(wait);
  const manaCost = coopAbilityCost(hero, id, round);
  if (hero.mana < manaCost) return `Nicht genug Mana (${manaCost} nötig).`;
  return null;
}

/**
 * Ziel des Bosses, gewichtet nach Bedrohung: Wer 60 % der Bedrohung der Gruppe
 * hat, wird mit 60 % Wahrscheinlichkeit angegriffen. Ohne Bedrohung (z. B. in
 * der ersten Runde) ist jeder lebende Held gleich wahrscheinlich.
 */
export function pickBossTarget(heroes: CoopHero[], rng: () => number): CoopHero | null {
  const alive = heroes.filter((h) => !h.down);
  if (alive.length === 0) return null;
  // +1, damit auch Helden ohne Bedrohung eine kleine Chance behalten
  const weights = alive.map((h) => h.threat + 1);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < alive.length; i++) {
    roll -= weights[i];
    if (roll < 0) return alive[i];
  }
  return alive[alive.length - 1];
}

/** Ein Gegner in der laufenden Runde: der Boss (Id BOSS) oder ein Begleiter (seine uid). */
interface Foe {
  id: string;
  /** Für Schwächen und Resistenzen (matchups.ts) */
  creatureId: string;
  role?: AddRole;
  /** Fortschritt der Fähigkeit eines Begleiters mit Aufgabe (CoopAdd.cast) */
  cast?: number;
  /** Kopf der Hydra und Runden bis zum zweiten (CoopAdd.head, CoopAdd.grow) */
  head?: HydraHeadKind;
  grow?: number;
  c: Combatant;
  fx: CoopEnemyEffects;
}

/** Die stärkste Schadens-Fähigkeit eines Helden (Multiplikator × Treffer) – die verschlingt Xal'Zar. */
function strongestAbility(hero: CoopHero): AbilityDef | null {
  return (
    hero.abilities
      .map((id) => classAbility(id, hero.heroClass))
      .filter((a) => a.multiplier > 0 && a.hits !== 0)
      .sort((a, b) => b.multiplier * (b.hits ?? 1) - a.multiplier * (a.hits ?? 1))[0] ?? null
  );
}

/** Xal'Zar schlägt mit der verschlungenen Fähigkeit eines Helden zu – wie mit einer eigenen gegen ein Ziel. */
function stolenAbility(hero: CoopHero | undefined, id: AbilityId): CoopBossAbility {
  const ability = classAbility(id, hero?.heroClass);
  return { id: `stolen-${id}`, name: ability.name, icon: ability.icon, description: "", every: 0, ...stolenStrike(ability) };
}

/**
 * Löst eine Runde auf. Fehlende Aktionen (Zeit abgelaufen) gelten als normaler
 * Angriff; ungültige Tränke, Fähigkeiten oder Ziele werden ignoriert – der Held
 * greift dann normal bzw. den Boss an, damit ein veralteter Klick nie die Runde blockiert.
 */
export function resolveRound(
  state: CoopBattleState,
  actions: Record<string, CoopAction>,
  rng: () => number = Math.random,
  now: number = Date.now(),
): { state: CoopBattleState; events: CoopEvent[] } {
  if (state.status !== "active") throw new Error("Der Kampf ist vorbei.");
  const events: CoopEvent[] = [];
  let heroes = state.heroes.map((h) => ({ ...h, combatant: { ...h.combatant }, effects: { ...h.effects } }));
  // Der Boss zuerst, dann die Begleiter – Kopien, die sich in dieser Runde ändern
  const boss: Foe = { id: BOSS, creatureId: state.bossId, c: { ...state.boss }, fx: { ...state.bossEffects } };
  const adds: Foe[] = (state.adds ?? []).map((a) => ({
    id: a.uid,
    creatureId: a.creatureId,
    role: a.role,
    cast: a.cast,
    head: a.head,
    grow: a.grow,
    c: { ...a.combatant },
    fx: { ...a.effects },
  }));
  const enemy = getCoopEnemy(state.bossId);
  /** Absicht des Bosses in dieser Runde (nur Dungeon-Bosse) */
  const turn = coopBossTurn(state);
  /** Erzkönig: Panzerplatten – jeder Treffer bricht eine ab (fehlt bei anderen Bossen) */
  let plates = turn?.plates;
  let bossShield = state.bossShield ?? 0;
  /** Treffer der Helden auf den Boss und getroffene Begleiter (unterbricht ein Heilritual) */
  let heroHitsOnBoss = 0;
  const hitAdds = new Set<string>();
  /** Wer welchen Begleiter getroffen hat, und wer betäubt oder unterbrochen hat (Unterbrecher) */
  const addHitters = new Map<string, CoopHero[]>();
  const interrupters = new Set<CoopHero>();
  /** Zorn des Bollwerks: Helden, die in dieser Runde abgewehrt, geblockt oder pariert haben */
  const warded = new Set<CoopHero>();
  /** Eingesetzte Fähigkeiten der Gruppe – sie laden Kaelthar auf */
  let abilitiesUsed = 0;
  /** Wer abwehrt, und wer sich geläutert hat (bricht einen Fluch) */
  const defending = new Set<string>();
  const cleansed = new Set<string>();
  /** Skillränge des Helden, der Gift, Feuer oder Bluten gelegt hat */
  const sourceSkills = (sourceId: string | undefined) => heroes.find((h) => h.id === sourceId)?.skills;
  /**
   * Gift, Feuer oder Bluten auf einen Gegner legen – mit Schwäche/Resistenz; bei Immunität wirkt es nicht.
   * Der Skilltree des Verursachers macht es stärker oder länger; sein eigenes Gift stapelt sich und platzt (Fäulnis).
   */
  const applyDot = (foe: Foe, kind: OverTimeKind, base: number, rounds: number, sourceId: string) => {
    // Gestapelt wird nur das eigene Gift; ein schwächeres – auch eines Mitspielers – überschreibt kein stärkeres
    const laid = layDot<SourcedDot, CoopEnemyEffects>(foe.fx, {
      creatureId: foe.creatureId,
      kind,
      base,
      rounds,
      skills: sourceSkills(sourceId),
      alive: foe.c.hp > 0,
      own: foe.fx.poison?.sourceId === sourceId ? foe.fx.poison : undefined,
      tag: { sourceId },
    });
    if (laid.immune) {
      events.push({ type: "immune", target: foe.id, kind });
      return;
    }
    foe.fx = laid.fx;
    if (laid.burst === undefined) return;
    foe.c.hp = Math.max(0, foe.c.hp - laid.burst);
    events.push({ type: "poison", target: foe.id, damage: laid.burst, burst: true });
    addDown(foe);
  };
  const foes = [boss, ...adds];
  let phase = state.phase;
  let heads = state.heads ?? 0;
  /** Köpfe, die in dieser Runde erst in den Kampf gefallen bzw. gewachsen sind – sie handeln ab der nächsten */
  const newHeads = new Set<Foe>();
  /** Ein Kopf der Hydra fällt in den Kampf (bzw. wächst nach) – mit `grow` Runden, bis ein zweiter wächst */
  const spawnHead = (kind: HydraHeadKind, grow: number | undefined): Foe => {
    const maxHp = Math.round(boss.c.maxHp * HEAD_HP);
    const foe: Foe = {
      id: `add-${adds.length + 1}`,
      creatureId: state.bossId,
      head: kind,
      ...(grow !== undefined && { grow }),
      c: { ...boss.c, name: getHydraHead(kind).name, maxHp, hp: maxHp, damage: state.boss.damage * HEAD_DAMAGE },
      fx: {},
    };
    adds.push(foe);
    foes.push(foe);
    newHeads.add(foe);
    return foe;
  };
  /** Sumpfhydra: Solange ein Kopf lebt, schützt sie ihr gepanzerter Hals */
  const neckGuarded = () => adds.some((f) => f.head && f.c.hp > 0);
  /** Absicht des Bosses: Taumelnd oder mit geschlossenem Auge erleidet er mehr Schaden – der Hals der Hydra weniger */
  const takenBy = (foe: Foe) => (foe === boss ? bossTurnTakenFactor(turn) * (neckGuarded() ? NECK_TAKEN : 1) : 1);
  const living = () => foes.filter((f) => f.c.hp > 0);
  /** Fähigkeit, die einen Gegner in dieser Runde betäuben würde */
  const stunAttempts = new Map<Foe, { ability: AbilityDef; hero: CoopHero }>();
  /** Vom Item-Effekt „Frostbiss“ eingefrorene Gegner – sie setzen diese Runde aus */
  const frozenByItem = new Map<Foe, CoopHero>();
  const enemyIsBoss = enemy.boss;
  /** Helden mit Bollwerk – ihre Bedrohung wird nach der Heldenphase hochgesetzt */
  const taunts: CoopHero[] = [];
  const byId = (id: string) => heroes.find((h) => h.id === id)!;
  const knockDown = (hero: CoopHero) => {
    if (hero.combatant.hp > 0 || hero.down) return;
    // Item-Effekt „Unbeugsam“: einmal pro Kampf mit 1 LP überleben
    if (canEndure(hero.itemEffects, hero.endured)) {
      hero.combatant.hp = 1;
      hero.endured = true;
      events.push({ type: "endured", heroId: hero.id });
      return;
    }
    // Segen „Zweiter Atem“: einmal pro Dungeon wieder aufstehen
    const standUp = secondWind(hero.blessings, hero.secondWindUsed, hero.combatant.maxHp);
    if (standUp > 0) {
      hero.combatant.hp = standUp;
      hero.secondWindUsed = true;
      events.push({ type: "secondWind", heroId: hero.id, heal: hero.combatant.hp });
      return;
    }
    hero.down = true;
    hero.threat = 0;
    hero.effects = {};
    hero.buffs = {};
    events.push({ type: "down", heroId: hero.id });
  };
  /** Ein Begleiter fällt – der Kampf geht weiter. Skill „Seuche“: Sein Gift springt auf einen anderen über. */
  function addDown(foe: Foe) {
    if (foe === boss || foe.c.hp !== 0) return;
    events.push({ type: "addDown", add: foe.id });
    const poison = foe.fx.poison;
    if (!poison || rankIn(sourceSkills(poison.sourceId), "plague") === 0) return;
    const next = foes.find((f) => f !== foe && f.c.hp > 0 && !f.fx.poison && matchupFactor(f.creatureId, "poison") > 0);
    if (next) next.fx = { ...next.fx, poison };
  }
  /** Item-Effekt „Dornen“: Wer den Helden trifft, erleidet einen Teil davon selbst – Stachelwehr beim Abwehren. */
  const thorns = (hero: CoopHero, foe: Foe, damage: number) => {
    const share =
      (hasEffect(hero.itemEffects, "thorns") ? EFFECT.thorns : 0) +
      (defending.has(hero.id) ? defendThorns(hero.skills) : 0) +
      BLESSING.thorns * stacks(hero.blessings, "thorns");
    if (share <= 0 || damage <= 0 || foe.c.hp <= 0) return;
    const back = Math.max(1, Math.round(damage * share));
    foe.c.hp = Math.max(0, foe.c.hp - back);
    events.push({ type: "thorns", heroId: hero.id, target: foe.id, damage: back });
    addDown(foe);
  };

  /** Pro Held die in dieser Runde eingesetzte Fähigkeit (für die Abklingzeit) */
  const used = new Map<string, { id: AbilityId; cooldown: number }>();
  /** Ein Wuchtiger Schlag hat den Boss getroffen – das bricht sein Aufladen ab */
  let interruptHit = false;

  // 1. Die Helden handeln der Reihe nach.
  for (const hero of heroes) {
    if (hero.down || boss.c.hp <= 0) continue;
    if (hero.effects.frozen) {
      // Eingefroren: diese Runde keine Aktion, danach taut der Held auf
      hero.effects.frozen = undefined;
      events.push({ type: "skipped", heroId: hero.id });
      continue;
    }
    const action = actions[hero.id] ?? {};

    if (action.potion && !coopPotionBlocker({ ...state, heroes }, hero.id, action.potion.potionId, action.potion.targetId)) {
      const potion = getPotion(action.potion.potionId);
      const target = byId(action.potion.targetId);
      hero.potionsUsed = [...hero.potionsUsed, potion.id];
      if (potion.effect.kind === "throw") {
        // Wurftrank: fliegt vor der Aktion auf sein Ziel – die Sprengflasche auf alle Gegner
        const { effect } = potion;
        const { targetId } = action.potion;
        const at = heroes.some((h) => h.id === targetId) ? action.target : targetId;
        const aim = adds.find((f) => f.id === at && f.c.hp > 0) ?? boss;
        const base = buffed(hero).damage * effect.percent;
        events.push({ type: "thrown", heroId: hero.id, target: aim.id, potionId: potion.id });
        for (const foe of effect.throw === "blast" ? living() : [aim]) {
          if (effect.throw === "burn" || effect.throw === "poison") {
            applyDot(foe, effect.throw, base, effect.rounds, hero.id);
          } else if (effect.throw === "freeze") {
            frozenByItem.set(foe, hero);
          } else if (effect.throw === "acid") {
            foe.fx = { ...foe.fx, armorBreak: Math.max(foe.fx.armorBreak ?? 0, effect.percent) };
            events.push({ type: "corroded", target: foe.id });
            // Die Säure frisst zwei Panzerplatten des Erzkönigs weg
            if (foe === boss && plates !== undefined && plates > 0) {
              plates = Math.max(0, plates - 2);
              if (plates === 0) events.push({ type: "platesBroken" });
            }
          } else if (effect.throw === "smoke") {
            foe.fx = { ...foe.fx, weaken: { percent: effect.percent, roundsLeft: effect.rounds } };
            events.push({ type: "smoked", target: foe.id });
          } else {
            // Sprengflasche: ignoriert Rüstung, der Schild des Schildträgers schluckt sie aber
            const raw = Math.max(1, Math.round(base * (1 + (foe.fx.vulnerable?.percent ?? 0)) * takenBy(foe)));
            const absorbed = foe === boss ? Math.min(bossShield, raw) : 0;
            bossShield -= absorbed;
            const damage = raw - absorbed;
            foe.c.hp = Math.max(0, foe.c.hp - damage);
            hero.threat += raw * (hero.heroClass === "paladin" ? PALADIN_THREAT : 1);
            if (foe === boss) heroHitsOnBoss++;
            else {
              hitAdds.add(foe.id);
              addHitters.set(foe.id, [...(addHitters.get(foe.id) ?? []), hero]);
            }
            events.push({ type: "blast", heroId: hero.id, target: foe.id, damage, ...(absorbed > 0 && { absorbed }) });
            addDown(foe);
          }
        }
      } else if (target.id !== hero.id) {
        // Wiederbeleben: steht mit der Heilwirkung des Tranks wieder auf
        target.down = false;
        target.revived = true;
        target.combatant.hp = Math.max(1, potionHeal(potion, target.combatant.maxHp));
        events.push({ type: "potion", heroId: hero.id, targetId: target.id, potionId: potion.id, heal: target.combatant.hp, revive: true });
      } else if (potion.effect.kind === "heal") {
        const factor =
          (hero.heroClass === "cleric" ? CLERIC_POTION_FACTOR : 1) *
          (hasEffect(hero.itemEffects, "alchemist") ? 1 + EFFECT.alchemist : 1) *
          (1 + BLESSING.alchemy * stacks(hero.blessings, "alchemy")) *
          potionSkillFactor(hero.skills);
        const heal = Math.min(Math.round(potionHeal(potion, hero.combatant.maxHp) * factor), hero.combatant.maxHp - hero.combatant.hp);
        hero.combatant.hp += heal;
        events.push({ type: "potion", heroId: hero.id, targetId: hero.id, potionId: potion.id, heal });
      } else {
        const { kind, percent, rounds } = potion.effect as Extract<typeof potion.effect, { kind: BuffKind }>;
        hero.buffs = { ...hero.buffs, [kind]: { percent, roundsLeft: rounds } };
        events.push({ type: "potion", heroId: hero.id, targetId: hero.id, potionId: potion.id, heal: 0, buff: kind });
      }
    }

    const skills = hero.skills;
    // Gegenschlag: Die Aktion nach dem Abwehren macht mehr Schaden – wer wieder abwehrt, lädt ihn neu
    const riposte = hero.effects.riposte ?? 1;
    hero.effects.riposte = undefined;
    // Abwehren: kein Angriff, dafür halber Schaden in dieser Runde und etwas Mana
    if (action.defend) {
      const gain = Math.min(hero.maxMana - hero.mana, defendMana(skills, DEFEND_MANA));
      hero.mana += gain;
      defending.add(hero.id);
      if (rankIn(skills, "riposte") > 0) hero.effects.riposte = riposteFactor(skills);
      events.push({ type: "defend", heroId: hero.id, mana: gain });
      continue;
    }
    const ability =
      action.ability && !coopAbilityBlocker(hero, action.ability, turn, state.round) ? classAbility(action.ability, hero.heroClass) : null;
    // Echo: Jede dritte Fähigkeit im Kampf kostet nichts und trifft ein zweites Mal mit halbem Schaden
    const echo = !!ability && echoDue(skills, hero.effects.casts);
    const wrath = wrathFactor(hero.effects.wrath);
    let echoShare = 1;
    const fire = !!ability?.burn;
    const aoe = ability?.aoe;
    // Schadensart: die der Fähigkeit bzw. ihrer Waffe, sonst die Hauptwaffe (matchups.ts)
    const heroWeapon = ability?.weapon ?? hero.weapon;
    const heroKind = ability?.kind ?? (heroWeapon ? WEAPON_KIND[heroWeapon] : null);
    // Titanenschlag: Der nächste normale Angriff nach dem Ausholen macht mehr Schaden – das Ausholen ist damit verbraucht
    const charge = ability ? 1 : (hero.effects.charged ?? 1);
    if (!ability) hero.effects.charged = undefined;
    // Schattenschritt: Die nächste Aktion trifft sicher kritisch – Finte: der nächste normale Angriff doppelt
    const ambush = !!hero.effects.ambush;
    hero.effects.ambush = undefined;
    const feint = !ability && !!hero.effects.feint;
    if (feint) hero.effects.feint = undefined;
    // Ziel: ein lebender Begleiter – sonst der Boss
    const target = adds.find((f) => f.id === action.target && f.c.hp > 0) ?? boss;
    const plain = buffed(hero);
    // Berserker: bei wenig Lebenspunkten mehr Schaden; Kriegsschrei: Verstärkung
    const strong = {
      ...plain,
      damage:
        plain.damage *
        rageFactor(hero.heroClass, hero.combatant.hp, hero.combatant.maxHp) *
        (1 + (hero.effects.empower?.percent ?? 0)),
    };
    const threatFactor = hero.heroClass === "paladin" ? PALADIN_THREAT : 1;
    if (ability) {
      const manaCost = coopAbilityCost(hero, ability.id, state.round);
      hero.mana -= manaCost;
      if (rankIn(skills, "echo") > 0) hero.effects.casts = (hero.effects.casts ?? 0) + 1;
      // Item-Effekt „Flinke Hand“: eine Runde kürzer abklingen – Nachhall: manchmal gar nicht
      const skip = cooldownSkipChance(skills);
      if (!(skip > 0 && rng() < skip)) {
        used.set(hero.id, hasEffect(hero.itemEffects, "quickHands") ? { id: ability.id, cooldown: ability.cooldown - 1 } : ability);
      }
      events.push({ type: "ability", heroId: hero.id, ability: ability.id, weapon: ability.weapon, manaCost, ...(echo && { echo }) });
      abilitiesUsed++;
      // Kaelthar saugt die Kraft jeder Fähigkeit auf – ausser in der Runde, in der er sich entlädt
      if (turn?.static !== undefined && turn.ability !== "storm-lord-discharge") {
        events.push({ type: "static", heroId: hero.id, charges: turn.static + abilitiesUsed });
      }
      if (ability.cleanse) cleansed.add(hero.id);
      if (ability.guard) hero.effects.guard = ability.guard;
      // +1, weil die Verstärkung erst ab der nächsten Runde zählt
      if (ability.empower) hero.effects.empower = { percent: ability.empower.percent, roundsLeft: ability.empower.rounds + 1 };
      // Heilung – Arkane Heilung heilt die Mitspieler mit `groupHeal` mit
      const healed = ability.groupHeal ? heroes.filter((h) => !h.down) : [hero];
      for (const h of healed) {
        const share = h === hero ? 1 : ability.groupHeal!;
        if (ability.heal) {
          const heal = Math.min(h.combatant.maxHp - h.combatant.hp, Math.round(h.combatant.maxHp * ability.heal * share));
          h.combatant.hp += heal;
          if (heal > 0) events.push({ type: "selfHeal", heroId: h.id, heal, ...(h !== hero && { by: hero.id }) });
        }
        if (ability.renew) h.effects.renew = { percent: ability.renew.percent * share, roundsLeft: ability.renew.rounds };
      }
      if (ability.cleanse && (hero.effects.poison || hero.effects.burn || hero.effects.bleed)) {
        hero.effects = { ...hero.effects, poison: undefined, burn: undefined, bleed: undefined };
        events.push({ type: "cleansed", heroId: hero.id });
      }
      if (ability.damageTaken) hero.effects.damageTaken = { percent: ability.damageTaken.percent, roundsLeft: ability.damageTaken.rounds };
      if (ability.charge) hero.effects.charged = ability.charge;
      if (ability.ambush) hero.effects.ambush = true;
      if (ability.feint) hero.effects.feint = true;
      if (ability.manaGain) hero.mana = Math.min(hero.maxMana, hero.mana + ability.manaGain);
      if (ability.taunt) taunts.push(hero);
      // Zusatzeffekte wirken aufs Ziel – bei Flächenwirkung "all" auf alle Gegner
      for (const foe of aoe === "all" ? living() : [target]) {
        if (ability.weaken) foe.fx = { ...foe.fx, weaken: { percent: ability.weaken.percent, roundsLeft: ability.weaken.rounds } };
        if (ability.vulnerable) {
          foe.fx = { ...foe.fx, vulnerable: { percent: ability.vulnerable.percent, roundsLeft: ability.vulnerable.rounds } };
        }
        if (ability.armorBreak) foe.fx = { ...foe.fx, armorBreak: ability.armorBreak };
        if (stunLands(ability, rng, skills, !!foe.fx.burn)) stunAttempts.set(foe, { ability, hero });
        // Fluch der Schwäche: Gift und Feuer auf dem Ziel halten länger
        if (ability.extendDots) {
          for (const kind of ["poison", "burn"] as const) {
            const dot = foe.fx[kind];
            if (dot) foe.fx = { ...foe.fx, [kind]: { ...dot, roundsLeft: dot.roundsLeft + ability.extendDots } };
          }
        }
        for (const kind of OVER_TIME) {
          const effect = ability[kind];
          if (effect) applyDot(foe, kind, strong.damage * effect.percent, effect.rounds, hero.id);
        }
      }
      if (ability.bulwark) {
        hero.effects.bulwark = true;
        taunts.push(hero);
      }
    }
    let dealt = 0;
    /** Getroffene Gegner dieses Helden */
    const dealtTo = new Set<Foe>();
    /** Ein Treffer des Helden – `share` < 1 bei Splash-Schaden auf Umstehende. */
    const strike = (foe: Foe, share = 1) => {
      // Finisher (Meucheln), Ausbluten und Verwundbarkeit des Gegners
      const execute =
        (ability?.execute && foe.c.hp < foe.c.maxHp * ability.execute.threshold ? ability.execute.factor : 1) *
        (ability?.bleedBonus && foe.fx.bleed ? 1 + ability.bleedBonus : 1) *
        // Heiliger Hammer: mehr Schaden gegen erschütterte Gegner
        (ability?.shakenBonus && foe.fx.shaken ? 1 + ability.shakenBonus : 1) *
        // Segen „Henker“: mehr Schaden gegen angeschlagene Gegner
        (foe.c.hp < foe.c.maxHp * BLESSING.executioner.threshold ? 1 + BLESSING.executioner.bonus * stacks(hero.blessings, "executioner") : 1);
      const vulnerable = 1 + (foe.fx.vulnerable?.percent ?? 0);
      const taken = takenBy(foe);
      const effects = hero.itemEffects;
      // Schwäche oder Resistenz gegen die Schadensart der Waffe – „Runenklinge“ zählt auch als Magie, wenn das wirksamer ist
      const kind =
        heroKind && hasEffect(effects, "runeblade") && matchupFactor(foe.creatureId, "magic") > matchupFactor(foe.creatureId, heroKind)
          ? "magic"
          : heroKind;
      const matchup = kind ? matchupOf(foe.creatureId, kind) : null;
      const kindFactor = matchupFactor(foe.creatureId, kind);
      // Item-Effekte: Kriegstrommel, Henkersbeil, Aderlass, Elitejäger, Bossschlächter, Sog – dazu Allsehend (Krit)
      const foeBoss = foe === boss && enemyIsBoss;
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
      // Panzerplatten des Erzkönigs – nur direkte Treffer auf den Boss
      const plate = foe === boss ? plateFactor(plates) : 1;
      // Schattenschritt: sicher kritisch – Richterstoss: stärker gegen einen aufladenden Boss
      const sureCrit = ambush;
      const charging = ability?.chargingBonus && foe === boss && turn?.intent === "charging" ? 1 + ability.chargingBonus : 1;
      const attacker: Combatant = ability
        ? {
            ...strong,
            damage:
              strong.damage * ability.multiplier * execute * charge * charging * vulnerable * share * taken * plate * kindFactor * itemFactor * skillFactor,
            critChance: ability.guaranteedCrit || sureCrit ? 1 : critChance,
          }
        : {
            ...strong,
            damage: strong.damage * charge * share * vulnerable * taken * plate * kindFactor * itemFactor * skillFactor,
            critChance: sureCrit ? 1 : critChance,
          };
      const armor = ability?.ignoreArmor ? 0 : Math.round(foe.c.armor * (1 - (foe.fx.armorBreak ?? 0)));
      const rolled = rollHit(attacker, { ...foe.c, armor }, rng, rankIn(skills, "piercing") > 0);
      // Der Schild des Schildträgers schluckt direkte Treffer auf den Boss
      const absorbed = foe === boss ? Math.min(bossShield, rolled.damage) : 0;
      bossShield -= absorbed;
      const hit = { ...rolled, damage: rolled.damage - absorbed };
      if (foe === boss) heroHitsOnBoss++;
      else {
        hitAdds.add(foe.id);
        addHitters.set(foe.id, [...(addHitters.get(foe.id) ?? []), hero]);
      }
      dealt += Math.min(foe.c.hp, hit.damage);
      dealtTo.add(foe);
      foe.c.hp = Math.max(0, foe.c.hp - hit.damage);
      hero.threat += rolled.damage * threatFactor;
      events.push({
        type: "hit",
        attacker: hero.id,
        target: foe.id,
        ...hit,
        ...(ability && { weapon: ability.weapon, ability: ability.id }),
        ...(taken < 1 && (foe === boss && neckGuarded() ? { neck: true } : { shielded: true })),
        ...(absorbed > 0 && { absorbed }),
        ...(plate < 1 && { plated: true }),
        ...((matchup === "weak" || matchup === "resist") && { matchup }),
      });
      // Jeder Treffer bricht eine Panzerplatte ab, Wucht gleich zwei
      if (foe === boss && plates !== undefined && plates > 0) {
        plates = Math.max(0, plates - (kind === "blunt" ? 2 : 1));
        if (plates === 0) events.push({ type: "platesBroken" });
      }
      // Plünderer: kritische Treffer lassen bluten
      if (hit.crit && hero.heroClass === "plunderer" && foe.c.hp > 0) {
        const damage = strong.damage * PLUNDERER_BLEED.percent * matchupFactor(foe.creatureId, "bleed");
        if (damage > 0 && (foe.fx.bleed?.damage ?? 0) <= damage) {
          applyDot(foe, "bleed", strong.damage * PLUNDERER_BLEED.percent, PLUNDERER_BLEED.rounds, hero.id);
        }
      }
      // Skills bei kritischen Treffern: Adrenalin (Mana), Schnitter (Bluten), Offene Wunde (länger bluten)
      if (hit.crit) {
        hero.mana = Math.min(hero.maxMana, hero.mana + critMana(skills));
        if (foe.c.hp > 0 && rankIn(skills, "reaper") > 0 && (foe.fx.bleed?.damage ?? 0) <= strong.damage * SKILL.reaper.percent) {
          applyDot(foe, "bleed", strong.damage * SKILL.reaper.percent, SKILL.reaper.rounds, hero.id);
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
        if (hit.crit && critBurns(effects)) applyDot(foe, "burn", strong.damage * EFFECT.ember.percent, EFFECT.ember.rounds, hero.id);
        if (hasEffect(effects, "venomFang") && rng() < EFFECT.venomFang.chance) {
          applyDot(foe, "poison", strong.damage * EFFECT.venomFang.percent, EFFECT.venomFang.rounds, hero.id);
        }
        if (hasEffect(effects, "frostBite") && rng() < EFFECT.frostBite) frozenByItem.set(foe, hero);
      }
      if (hasEffect(effects, "manaThief")) hero.mana = Math.min(hero.maxMana, hero.mana + EFFECT.manaThief);
      addDown(foe);
    };
    const volley = () => {
      for (let i = 0; i < abilityHits(ability, hero.combatant.hp, hero.combatant.maxHp) && boss.c.hp > 0; i++) {
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
    }
    // Finte: Der normale Angriff trifft ein zweites Mal
    if (feint && target.c.hp > 0 && boss.c.hp > 0) strike(target);
    // Wuchtiger Schlag hat den Boss getroffen – das bricht sein Aufladen ab
    if (ability?.interrupt && dealtTo.has(boss)) interruptHit = true;
    // Duellant: Chance auf einen zweiten Schlag bei normalen Angriffen
    if (!ability && hero.heroClass === "duelist" && target.c.hp > 0 && boss.c.hp > 0 && rng() < DUELIST_EXTRA_HIT) strike(target);
    // Item-Effekt „Kettenblitz“: Ein normaler Angriff springt auf einen zweiten Gegner über
    if (!ability && hasEffect(hero.itemEffects, "chainLightning") && boss.c.hp > 0 && rng() < EFFECT.chainLightning.chance) {
      const others = living().filter((f) => f !== target);
      if (others.length > 0) strike(others[Math.floor(rng() * others.length)], EFFECT.chainLightning.share);
    }
    // Lebensraub: Blutrausch, Plünderer, Item-Effekt „Seelenraub“ und Segen „Blutdurst“
    const lifesteal =
      lifestealShare(hero.heroClass, ability) +
      (hasEffect(hero.itemEffects, "soulDrain") ? EFFECT.soulDrain : 0) +
      skillLifesteal(skills) +
      BLESSING.bloodthirst * stacks(hero.blessings, "bloodthirst");
    if (lifesteal > 0 && dealt > 0) {
      const heal = Math.min(hero.combatant.maxHp - hero.combatant.hp, Math.round(dealt * lifesteal));
      hero.combatant.hp += heal;
      if (heal > 0) events.push({ type: "selfHeal", heroId: hero.id, heal });
    }
  }

  // Bollwerk: erst jetzt, wenn alle Helden gehandelt haben – der Schildträger bekommt so viel
  // Bedrohung, dass er BULWARK_SHARE der Gruppe hält (bei 75 % das Dreifache aller anderen zusammen)
  for (const taunter of taunts) {
    const others = heroes.filter((h) => h !== taunter && !h.down).reduce((sum, h) => sum + h.threat, 0);
    taunter.threat = Math.max(taunter.threat, 20, Math.round((others * BULWARK_SHARE) / (1 - BULWARK_SHARE)));
  }

  // 2. Gift, Feuer, Bluten – erst an den Gegnern, dann an den Helden
  for (const foe of foes) {
    for (const kind of OVER_TIME) {
      const effect = foe.fx[kind];
      if (!effect || foe.c.hp <= 0 || boss.c.hp <= 0) continue;
      const damage = Math.max(1, Math.round(effect.damage * (1 + (foe.fx.vulnerable?.percent ?? 0)) * takenBy(foe)));
      foe.c.hp = Math.max(0, foe.c.hp - damage);
      const source = heroes.find((h) => h.id === effect.sourceId && !h.down);
      if (source) source.threat += damage * (source.heroClass === "paladin" ? PALADIN_THREAT : 1);
      events.push({ type: kind, target: foe.id, damage });
      const ending = effect.roundsLeft <= 1;
      foe.fx = { ...foe.fx, [kind]: ending ? undefined : { ...effect, roundsLeft: effect.roundsLeft - 1 } };
      addDown(foe);
      // Blutsturz des Verursachers: Läuft das Bluten aus, platzt die Wunde
      const burst = kind === "bleed" && ending && foe.c.hp > 0 && boss.c.hp > 0 ? bloodburstDamage(sourceSkills(effect.sourceId), effect.damage) : 0;
      if (burst > 0) {
        const dealt = Math.max(1, Math.round(burst * (1 + (foe.fx.vulnerable?.percent ?? 0)) * takenBy(foe)));
        foe.c.hp = Math.max(0, foe.c.hp - dealt);
        events.push({ type: "bleed", target: foe.id, damage: dealt, burst: true });
        addDown(foe);
      }
    }
  }
  if (boss.c.hp > 0) {
    for (const hero of heroes) {
      for (const kind of OVER_TIME) {
        const effect = hero.effects[kind];
        if (!effect || hero.down) continue;
        // Gegengift: weniger Schaden durch Gift, Feuer und Bluten
        const damage = Math.max(1, Math.round(effect.damage * dotTakenFactor(hero.skills)));
        hero.combatant.hp = Math.max(0, hero.combatant.hp - damage);
        events.push({ type: kind, target: hero.id, damage });
        hero.effects[kind] = effect.roundsLeft > 1 ? { ...effect, roundsLeft: effect.roundsLeft - 1 } : undefined;
        knockDown(hero);
      }
    }
  }

  /** Was der Boss in der Heldenphase samt Gift, Feuer und Bluten verloren hat */
  const bossDamageTaken = state.boss.hp - boss.c.hp;
  // Neferets Fluch bricht, wenn sie genug LP verloren hat oder sich der Verfluchte läutert
  const curse = turn?.curse;
  const curseCleansed = !!curse?.heroId && cleansed.has(curse.heroId);
  const curseBroken = !!curse && boss.c.hp > 0 && (boss.c.hp <= curse.breakAt || curseCleansed);
  if (curseBroken) events.push({ type: "curseBroken", heroId: curse.heroId ?? "", ...(boss.c.hp > curse.breakAt && { cleansed: true }) });
  let bossStunned = false;
  /** Xal'Zar hat diese Fähigkeit dieses Helden verschlungen */
  let devoured: { heroId: string; ability: AbilityId } | undefined;
  /** Neferet: Fluch der Mumie hat getroffen (auf wen), bzw. der Fluch springt über */
  let abilityLanded: string | undefined;
  let cursedHero: string | undefined;
  let curseJumpTo: string | undefined;

  // 3. Gegnerphase: erst der Boss, dann die Begleiter
  let status: CoopStatus = "active";
  const elite = state.elite ?? [];
  /** Wie Gruppen-Fähigkeiten: Was alle trifft, trifft jeden mit dem Schaden wie solo (ohne Gruppenzuschlag) */
  const soloScale = 1 + DUNGEON_COOP_DAMAGE_STEP * (heroes.length - 1);
  /** Schildwall/Wutschrei: Faktor auf den Schaden, den ein Held erleidet */
  const hurt = (hero: CoopHero) =>
    Math.max(0, 1 + (hero.effects.damageTaken?.percent ?? 0)) *
    (1 + (hero.effects.corroded?.percent ?? 0)) *
    (defending.has(hero.id) ? defendTaken(hero.skills, DEFEND_DAMAGE_TAKEN) : 1);
  /** Der Gegner fällt – ein explosiver Elite trifft alle stehenden Helden (Bollwerk blockt). Fallen alle, ist der Kampf verloren. */
  const enemyDown = () => {
    if (elite.includes("explosive")) {
      const hits: { heroId: string; damage: number; blocked?: boolean }[] = [];
      for (const hero of heroes.filter((h) => !h.down)) {
        if (hero.effects.bulwark) {
          hero.effects.bulwark = undefined;
          hits.push({ heroId: hero.id, damage: 0, blocked: true });
          continue;
        }
        const blast = rollHit({ ...boss.c, damage: ((boss.c.damage * EXPLOSION_FACTOR) / soloScale) * hurt(hero), critChance: 0 }, buffed(hero), rng);
        hero.combatant.hp = Math.max(0, hero.combatant.hp - blast.damage);
        hits.push({ heroId: hero.id, damage: blast.damage });
      }
      events.push({ type: "explosion", hits });
      for (const hero of heroes) knockDown(hero);
    }
    if (heroes.every((h) => h.down)) {
      status = "lost";
      events.push({ type: "wipe" });
    } else {
      status = "won";
      events.push({ type: "victory" });
    }
  };
  if (boss.c.hp <= 0) {
    enemyDown();
  } else if (heroes.every((h) => h.down)) {
    status = "lost";
    events.push({ type: "wipe" });
  } else {
    /** Helden, deren Bollwerk in dieser Runde geblockt hat – es hält bis zum Ende der Gegnerphase */
    const shielded = new Set<CoopHero>();
    /** Betäubt? Nach einer Betäubung ist jeder Gegner einige Runden immun. */
    const stunnedNow = (foe: Foe): boolean => {
      const attempt = stunAttempts.get(foe);
      const frozen = frozenByItem.has(foe);
      if ((!attempt && !frozen) || foe.c.hp <= 0) return false;
      const stunned = !foe.fx.stunImmunity;
      if (stunned) {
        foe.fx = { ...foe.fx, stunImmunity: freshStunImmunity() };
        // Skills des Betäubenden: Erschütterung und Kryomant/Schmelzen markieren, Unterbrecher gibt Mana
        const by = attempt?.hero ?? frozenByItem.get(foe)!;
        // Erschüttert: zählt in den 2 Runden danach (Heiliger Hammer)
        foe.fx = { ...foe.fx, shaken: 3 };
        if (rankIn(by.skills, "concussion") > 0) foe.fx = { ...foe.fx, dazed: 2 };
        const freezing = frozen || !!attempt?.ability.freeze;
        if (freezing && (rankIn(by.skills, "cryomancer") > 0 || rankIn(by.skills, "melt") > 0)) foe.fx = { ...foe.fx, chilled: 2 };
        interrupters.add(by);
      }
      const tag = foe === boss ? {} : { add: foe.id };
      events.push({ type: stunned ? "stunned" : "stunResisted", ...(frozen ? { freeze: true as const } : freezeFlag(attempt!.ability)), ...tag });
      return stunned;
    };
    // Zweite Phase: Raserei und/oder Sammelruf – wirkt schon auf die folgende Gegnerphase
    const nextPhase = phaseDue(state.bossId, phase, boss.c);
    if (nextPhase) {
      phase = true;
      if (nextPhase.enrage) boss.c.damage *= 1 + nextPhase.enrage;
      // Sammelruf: nur gewöhnliche Begleiter – wer Heiler, Schildträger oder Trommler besiegt hat, ist ihn los
      const rallied = nextPhase.rally ? adds.filter((f) => !f.role) : [];
      for (const add of rallied) {
        add.c.hp = add.c.maxHp;
        add.fx = {};
      }
      events.push({ type: "bossPhase", bossId: state.bossId, ...(nextPhase.rally && { rally: rallied.map((f) => f.id) }) });
    }
    // Sumpfhydra: Unter 75, 50 und 25 % fällt ein Kopf – höchstens einer pro Runde
    const head = state.bossId === HYDRA_ID ? headDue(heads, boss.c.hp, boss.c.maxHp) : null;
    if (head) {
      heads++;
      // Feuer brennt den Stumpf aus: Brennt die Hydra gerade, wächst dieser Kopf nicht nach
      const seared = boss.fx.burn !== undefined || events.some((e) => e.type === "burn" && e.target === BOSS);
      const severed = spawnHead(head.kind, seared ? undefined : HEAD_GROW_ROUNDS);
      events.push({ type: "headSevered", add: severed.id, head: head.kind, seared });
    }
    // Trommler: Der Boss macht mehr Schaden, je lauter er trommelt (seine Wirbel aus den Runden davor)
    const drums = 1 + DRUM_BONUS * adds.reduce((sum, f) => sum + (f.role === "drummer" && f.c.hp > 0 ? (f.cast ?? 0) : 0), 0);
    if (stunnedNow(boss)) {
      bossStunned = true;
    } else if (!bossAttacks(turn)) {
      // Xal'Zar verschlingt die stärkste Fähigkeit des Helden mit der meisten Bedrohung
      if (turn?.intent === "devour") {
        const victim = [...heroes].filter((h) => !h.down && strongestAbility(h)).sort((a, b) => b.threat - a.threat)[0];
        if (victim) {
          devoured = { heroId: victim.id, ability: strongestAbility(victim)!.id };
          events.push({ type: "devoured", ...devoured });
        }
      }
    } else {
      // Dungeon-Bosse: die Fähigkeit ihres Ablaufs – Xal'Zar schlägt mit der verschlungenen zu. Raid-Bosse: fester Takt.
      const stolenFrom = turn?.intent === "stolen" ? turn.devoured : undefined;
      const scripted = turnAbility(turn);
      const special = stolenFrom
        ? stolenAbility(heroes.find((h) => h.id === stolenFrom.heroId), stolenFrom.ability as AbilityId)
        : turn
          ? scripted && coopAbility(scripted)
          : abilityForRound(raidAbilities(enemy, heads), state.round);
      if (stolenFrom) events.push({ type: "stolen", heroId: stolenFrom.heroId ?? "", ability: stolenFrom.ability as AbilityId });
      else if (special) events.push({ type: "bossAbility", bossId: enemy.id, abilityId: special.id ?? enemy.id, name: special.name });
      // Geschwächt (Erdbeben, Fluch): weniger Schaden
      // Gruppen-Fähigkeiten der Dungeon-Bosse treffen alle – jeden mit dem Schaden wie solo, ohne den
      // Gruppenzuschlag. Fähigkeiten gegen ein Ziel haben ihn wie normale Angriffe.
      const groupScale = special?.aoe && !enemy.raid ? soloScale : 1;
      // Elite: Rasend macht mehr Schaden (unter halben LP noch mehr), Flink schlägt zweimal schwächer zu
      const rage = elite.includes("raging") ? 1 + (boss.c.hp < boss.c.maxHp / 2 ? RAGE_BONUS.low : RAGE_BONUS.base) : 1;
      const swift = elite.includes("swift");
      const attacker = {
        ...boss.c,
        damage:
          ((boss.c.damage * (special?.multiplier ?? 1)) / groupScale) *
          (1 - (boss.fx.weaken?.percent ?? 0)) *
          drums *
          rage *
          (swift ? SWIFT_SHARE : 1),
      };
      const targets = special?.aoe ? heroes.filter((h) => !h.down) : [pickBossTarget(heroes, rng)!];
      /**
       * Lebensentzug: Fähigkeit (`drain`) bzw. normale Bisse (`lifesteal`, Elite „Vampirisch“) heilen den Boss.
       * Trifft die Fähigkeit alle, teilt sich der Entzug auf – sonst heilte sich der Boss zu viert vierfach.
       */
      const drain = special ? (special.drain ?? 0) / targets.length : (enemy.lifesteal ?? (elite.includes("vampiric") ? VAMPIRE_SHARE : 0));
      for (const target of targets) {
        if (target.effects.bulwark) {
          // Bollwerk blockt den Angriff samt Zusatzeffekten
          shielded.add(target);
          warded.add(target);
          events.push({ type: "blocked", heroId: target.id });
          continue;
        }
        const dodge = dodgeChance(target.skills);
        const defender = special?.ignoreArmor ? { ...buffed(target), armor: 0 } : buffed(target);
        // Item-Effekt „Standhaft“: Boss-Fähigkeiten treffen schwächer
        const attackerFor = {
          ...attacker,
          damage: attacker.damage * hurt(target) * (special && hasEffect(target.itemEffects, "steadfast") ? 1 - EFFECT.steadfast : 1),
        };
        let taken = 0;
        /** Treffer, denen der Held nicht ausgewichen ist (Schemen) */
        let landed = 0;
        for (let i = 0; i < (special?.hits ?? (swift ? 2 : 1)) && target.combatant.hp > 0; i++) {
          if (dodge > 0 && rng() < dodge) {
            events.push({ type: "dodged", heroId: target.id, attacker: BOSS });
            continue;
          }
          landed++;
          if (defending.has(target.id) || target.effects.guard) warded.add(target);
          const rolled = rollHit(attackerFor, defender, rng);
          // Parade/Vergeltung: nur ein Teil kommt durch, dann Konter bzw. Rückwurf (nur beim ersten Treffer)
          const guard = target.effects.guard;
          const hit = guard ? { ...rolled, damage: Math.max(1, Math.round(rolled.damage * guard.reduce)) } : rolled;
          target.combatant.hp = Math.max(0, target.combatant.hp - hit.damage);
          taken += hit.damage;
          events.push({ type: "hit", attacker: BOSS, target: target.id, ...hit });
          if (guard) {
            target.effects.guard = undefined;
            events.push({ type: "guarded", heroId: target.id, prevented: rolled.damage - hit.damage });
            let counter = guard.reflect ? Math.round(rolled.damage * guard.reflect) : 0;
            if (guard.counter && target.combatant.hp > 0) {
              const own = buffed(target);
              const armor = Math.round(boss.c.armor * (1 - (boss.fx.armorBreak ?? 0)));
              const kind = target.weapon ? WEAPON_KIND[target.weapon] : null;
              const damage = own.damage * guard.counter * takenBy(boss) * matchupFactor(boss.creatureId, kind);
              counter += rollHit({ ...own, damage }, { ...boss.c, armor }, rng).damage;
            }
            if (counter > 0 && boss.c.hp > 0) {
              boss.c.hp = Math.max(0, boss.c.hp - counter);
              target.threat += counter * (target.heroClass === "paladin" ? PALADIN_THREAT : 1);
              events.push({ type: "counter", heroId: target.id, damage: counter });
            }
          }
          if (drain > 0 && boss.c.hp > 0) {
            const heal = Math.min(boss.c.maxHp - boss.c.hp, Math.round(hit.damage * drain));
            boss.c.hp += heal;
            if (heal > 0) events.push({ type: "drain", heal });
          }
        }
        thorns(target, boss, taken);
        // Wer allem ausgewichen ist, entgeht auch den Zusatzeffekten
        if (landed === 0) {
          knockDown(target);
          continue;
        }
        if (target.combatant.hp > 0) {
          for (const kind of OVER_TIME) {
            const effect = special?.[kind];
            if (!effect) continue;
            const damage = Math.max(1, Math.round(((boss.c.damage * drums) / groupScale) * effect.percent));
            // Reinheit kürzt, Drachenfeuer macht gegen Feuer immun
            const rounds = heroDotRounds(target.itemEffects, kind, effect.rounds);
            if (rounds > 0) target.effects[kind] = { damage, roundsLeft: rounds };
          }
          // Elite „Giftig“: Wer getroffen wird, ist vergiftet
          if (elite.includes("poisonous") && taken > 0) {
            const rounds = heroDotRounds(target.itemEffects, "poison", POISON.rounds);
            target.effects.poison = { damage: Math.max(1, Math.round(boss.c.damage * POISON.percent)), roundsLeft: rounds };
          }
        }
        if (special?.manaBurn && target.combatant.hp > 0) {
          const amount = Math.min(target.mana, special.manaBurn);
          target.mana -= amount;
          if (amount > 0) events.push({ type: "manaBurn", heroId: target.id, amount });
        }
        knockDown(target);
        // Neferet: Der Fluch der Mumie verflucht den Getroffenen mit der meisten Bedrohung
        if (special?.id && !target.down) {
          abilityLanded = special.id;
          if (!cursedHero || target.threat > byId(cursedHero).threat) cursedHero = target.id;
        }
      }
      if (special?.freeze) {
        const frozen = pickBossTarget(heroes, rng);
        if (frozen) {
          frozen.effects.frozen = true;
          events.push({ type: "frozen", heroId: frozen.id });
        }
      }
    }
    // Neferets Fluch bricht los – auch wenn sie betäubt ist; Bollwerk hilft nicht, Abwehren schon.
    // Danach springt er auf einen anderen Helden über.
    if (curse && !curseBroken && curse.roundsLeft <= 1 && boss.c.hp > 0) {
      const living = heroes.filter((h) => !h.down);
      const victim = living.find((h) => h.id === curse.heroId) ?? pickBossTarget(heroes, rng);
      if (victim) {
        const damage = Math.max(1, Math.round(victim.combatant.maxHp * CURSE_DAMAGE * hurt(victim)));
        victim.combatant.hp = Math.max(0, victim.combatant.hp - damage);
        events.push({ type: "curseBurst", heroId: victim.id, damage });
        knockDown(victim);
        const others = heroes.filter((h) => !h.down && h !== victim);
        if (others.length > 0) curseJumpTo = others[Math.floor(rng() * others.length)].id;
      }
    }
    // Begleiter, solange der Boss steht: Die mit Aufgabe setzen ihre Fähigkeit ein (bossMechanics.ts),
    // sonst je ein normaler Angriff auf ein Ziel nach Bedrohung
    for (const add of adds) {
      if (add.c.hp <= 0 || boss.c.hp <= 0 || heroes.every((h) => h.down) || newHeads.has(add)) continue;
      const stunned = stunnedNow(add);
      if (add.head === "blood") {
        // Blutkopf: beisst nicht, sondern heilt die Hydra – betäubt nicht
        if (stunned) continue;
        const heal = Math.min(boss.c.maxHp - boss.c.hp, Math.round(boss.c.maxHp * BLOOD_HEAL));
        boss.c.hp += heal;
        if (heal > 0) events.push({ type: "addHeal", add: add.id, heal });
        continue;
      }
      if (add.role === "healer") {
        // Heilritual: Ein Treffer oder eine Betäubung unterbricht es – angreifen tut der Heiler nie
        if (stunned || hitAdds.has(add.id)) {
          if (add.cast) {
            events.push({ type: "interrupted", add: add.id });
            for (const hero of addHitters.get(add.id) ?? []) interrupters.add(hero);
          }
          add.cast = 0;
          continue;
        }
        const cast = (add.cast ?? 0) + 1;
        if (cast >= RITUAL_ROUNDS) {
          add.cast = 0;
          const heal = Math.min(boss.c.maxHp - boss.c.hp, Math.round(boss.c.maxHp * RITUAL_HEAL));
          boss.c.hp += heal;
          if (heal > 0) events.push({ type: "addHeal", add: add.id, heal });
        } else {
          add.cast = cast;
          events.push({ type: "ritual", add: add.id, roundsLeft: RITUAL_ROUNDS - cast });
        }
        continue;
      }
      if (stunned) {
        // Der Trommler kommt aus dem Takt
        if (add.role === "drummer" && add.cast) {
          add.cast = 0;
          events.push({ type: "interrupted", add: add.id });
        }
        continue;
      }
      if (add.role === "shield") {
        // Statt anzugreifen hebt er regelmässig den Schild
        const cast = (add.cast ?? 0) + 1;
        add.cast = cast % SHIELD_EVERY;
        if (cast >= SHIELD_EVERY) {
          bossShield = Math.round(boss.c.maxHp * SHIELD_SHARE);
          events.push({ type: "bossShield", add: add.id, shield: bossShield });
          continue;
        }
      }
      if (add.role === "drummer") {
        add.cast = Math.min(DRUM_MAX, (add.cast ?? 0) + 1);
        events.push({ type: "drumming", add: add.id, stacks: add.cast });
      }
      const target = pickBossTarget(heroes, rng)!;
      if (target.effects.bulwark) {
        shielded.add(target);
        warded.add(target);
        events.push({ type: "blocked", heroId: target.id, add: add.id });
        continue;
      }
      const dodge = dodgeChance(target.skills);
      if (dodge > 0 && rng() < dodge) {
        events.push({ type: "dodged", heroId: target.id, attacker: add.id });
        continue;
      }
      if (defending.has(target.id)) warded.add(target);
      const hit = rollHit({ ...add.c, damage: add.c.damage * (1 - (add.fx.weaken?.percent ?? 0)) * hurt(target) }, buffed(target), rng);
      target.combatant.hp = Math.max(0, target.combatant.hp - hit.damage);
      events.push({ type: "hit", attacker: add.id, target: target.id, ...hit });
      thorns(target, add, hit.damage);
      if (add.head && hit.damage > 0 && target.combatant.hp > 0) {
        if (add.head === "venom") {
          // Giftbiss: Das Gift stapelt sich bis VENOM.max – ein stärkeres (Giftatem) bleibt
          const stack = Math.max(1, Math.round(add.c.damage * VENOM.percent));
          const rounds = heroDotRounds(target.itemEffects, "poison", VENOM.rounds);
          const current = target.effects.poison?.damage ?? 0;
          const damage = Math.max(current, Math.min(stack * VENOM.max, current + stack));
          if (rounds > 0) target.effects.poison = { damage, roundsLeft: rounds };
        } else {
          // Säurebiss: Das Ziel erleidet mehr Schaden
          target.effects.corroded = { percent: ACID.percent, roundsLeft: ACID.rounds };
          events.push({ type: "etched", heroId: target.id, add: add.id });
        }
      }
      knockDown(target);
    }
    // Sumpfhydra: Lebt ein Kopf zu lange, wächst aus seinem Stumpf ein zweiter, gleicher Kopf
    if (boss.c.hp > 0) {
      for (const add of [...adds]) {
        if (!add.head || add.grow === undefined || add.c.hp <= 0 || newHeads.has(add)) continue;
        add.grow--;
        if (add.grow > 0) continue;
        add.grow = undefined;
        const twin = spawnHead(add.head, undefined);
        events.push({ type: "headGrown", add: twin.id, from: add.id });
      }
    }
    for (const hero of shielded) hero.effects.bulwark = undefined;
    if (boss.c.hp <= 0) {
      // Konter oder Rückwurf hat den Boss erledigt
      enemyDown();
    } else if (heroes.every((h) => h.down)) {
      status = "lost";
      events.push({ type: "wipe" });
    }
  }

  // Elite „Regenerierend“: heilt sich am Ende der Runde – ausser er brennt
  const burning = boss.fx.burn !== undefined || events.some((e) => e.type === "burn" && e.target === BOSS);
  const enemyHeal = status === "active" ? eliteRegen(boss.c, elite, burning) : 0;
  if (enemyHeal > 0) {
    boss.c.hp += enemyHeal;
    events.push({ type: "enemyRegen", heal: enemyHeal });
  }

  if (status === "active") {
    // Kleriker, Item-Effekt „Lebensquell“ und Arkane Heilung: Regeneration am Ende der Runde
    for (const hero of heroes) {
      const regen = heroRegenShare(hero.heroClass, hero.itemEffects, hero.effects.renew);
      if (hero.down || regen <= 0) continue;
      const heal = healShare(hero.combatant.hp, hero.combatant.maxHp, regen);
      if (heal > 0) {
        hero.combatant.hp += heal;
        events.push({ type: "regen", heroId: hero.id, heal });
      }
    }
    // Notverband: Wer zum ersten Mal unter 30 % fällt, heilt sich einmal pro Kampf
    for (const hero of heroes) {
      const heal = hero.down ? 0 : bandage(hero.skills, hero.combatant.hp, hero.combatant.maxHp, hero.effects.bandaged);
      if (heal <= 0) continue;
      hero.combatant.hp += heal;
      hero.effects.bandaged = true;
      events.push({ type: "selfHeal", heroId: hero.id, heal });
    }
  }

  // Der Boss wählt seine Absicht für die nächste Runde
  const nextTurn =
    turn && status === "active"
      ? nextBossTurn(state.bossId, turn, {
          round: state.round + 1,
          heroHits: heroHitsOnBoss,
          damageTaken: bossDamageTaken,
          bossMaxHp: boss.c.maxHp,
          // Wuchtiger Schlag bricht das Aufladen ab wie eine Betäubung
          stunned: bossStunned || interruptHit,
          bossHp: boss.c.hp,
          abilitiesUsed,
          staticMax: COOP_STATIC_PER_HERO * heroes.length,
          ...(abilityLanded && { abilityLanded }),
          ...(cursedHero && { cursedHero }),
          ...(curseJumpTo && { curseJumpTo }),
          curseBroken,
          ...(plates !== undefined && { platesLeft: plates }),
          ...(devoured && { devoured: devoured.ability, devouredFrom: devoured.heroId }),
        })
      : null;
  const fresh = nextTurn?.curse;
  if (fresh?.heroId && fresh.roundsLeft === CURSE_ROUNDS && fresh !== turn?.curse) events.push({ type: "cursed", heroId: fresh.heroId });
  if (turn?.plates === 0 && (nextTurn?.plates ?? 0) > 0) events.push({ type: "platesRegrown" });
  if (turn?.devoured && nextTurn && !nextTurn.devoured) {
    events.push({ type: "freed", heroId: turn.devoured.heroId ?? "", ability: turn.devoured.ability as AbilityId });
  }

  // Unterbrecher: Wer betäubt, ein Ritual unterbrochen oder den Boss ins Taumeln gebracht hat, bekommt Mana
  if (turn?.intent === "charging" && nextTurn?.intent === "staggered") for (const hero of heroes) interrupters.add(hero);
  for (const hero of interrupters) if (!hero.down) hero.mana = Math.min(hero.maxMana, hero.mana + interruptMana(hero.skills));
  // Zorn des Bollwerks: ein Stapel pro Runde, in der der Held abgewehrt, geblockt oder pariert hat
  for (const hero of warded) {
    if (!hero.down && rankIn(hero.skills, "wrath") > 0) hero.effects.wrath = Math.min(SKILL.wrath.max, (hero.effects.wrath ?? 0) + 1);
  }

  // 4. Mana, Verstärkungen und abklingende Bedrohung
  const tick = (b: ActiveBuff | undefined) => (b && b.roundsLeft > 1 ? { ...b, roundsLeft: b.roundsLeft - 1 } : undefined);
  heroes = heroes.map((h) => ({
    ...h,
    effects: {
      ...h.effects,
      empower: tick(h.effects.empower),
      damageTaken: tick(h.effects.damageTaken),
      renew: tick(h.effects.renew),
      corroded: tick(h.effects.corroded),
    },
    cooldowns: tickCooldowns(h.cooldowns, used.get(h.id) ?? null),
    threat: Math.round(h.threat * (1 - THREAT_DECAY)),
    mana: h.down ? h.mana : Math.min(h.maxMana, h.mana + manaRegen(h.skills, MANA_REGEN)),
    buffs: Object.fromEntries(
      Object.entries(h.buffs)
        .filter(([, b]) => b && b.roundsLeft > 1)
        .map(([k, b]) => [k, { ...b!, roundsLeft: b!.roundsLeft - 1 }]),
    ),
  }));

  return {
    state: {
      ...state,
      heroes,
      boss: boss.c,
      bossEffects: tickEnemyEffects(boss.fx),
      ...((state.adds || adds.length > 0) && {
        adds: adds.map((f, i) => ({
          ...state.adds?.[i],
          uid: f.id,
          creatureId: f.creatureId,
          ...(f.role && { role: f.role }),
          ...(f.cast !== undefined && { cast: f.cast }),
          ...(f.head && { head: f.head, grow: f.grow }),
          combatant: f.c,
          effects: tickEnemyEffects(f.fx),
        })),
      }),
      ...(phase && { phase }),
      ...(heads > 0 && { heads }),
      ...(nextTurn && { bossTurn: nextTurn }),
      bossShield: bossShield > 0 ? bossShield : undefined,
      status,
      round: status === "active" ? state.round + 1 : state.round,
      deadline: now + COOP_TURN_SECONDS * 1000,
      log: [...state.log, ...events.map((e) => ({ ...e, round: state.round }))],
    },
    events,
  };
}

/** Koop-Erfolge eines Helden – im Spielstand und im öffentlichen Profil. */
export interface CoopStats {
  wins: number;
  /** Ids der Koop-Bosse, die der Held mindestens einmal besiegt hat */
  bosses: string[];
}

export const EMPTY_COOP_STATS: CoopStats = { wins: 0, bosses: [] };

export function recordCoopWin(stats: CoopStats, bossId: string): CoopStats {
  return { wins: stats.wins + 1, bosses: stats.bosses.includes(bossId) ? stats.bosses : [...stats.bosses, bossId] };
}

/** Fähigkeiten im Takt – ohne Köpfe rast die Sumpfhydra und setzt ihren Giftatem öfter ein (hydra.ts). */
function raidAbilities(enemy: CoopEnemy, heads: number | undefined): CoopBossAbility[] {
  const every = enemy.id === HYDRA_ID ? hydraAbilityEvery(heads) : null;
  return every ? enemy.abilities.map((a) => ({ ...a, every })) : enemy.abilities;
}

/** Die Fähigkeit, die der Gegner in dieser Runde einsetzt – oder null (für die Ankündigung). */
export function coopAbilityDue(state: CoopBattleState): CoopBossAbility | null {
  const turn = coopBossTurn(state);
  if (!turn) return abilityForRound(raidAbilities(getCoopEnemy(state.bossId), state.heads), state.round);
  const ability = turnAbility(turn);
  return ability && coopAbility(ability);
}

/**
 * Beute eines Spielers nach einem Koop-Sieg – jeder würfelt selbst. Wie ein
 * Solo-Boss gleichen Levels (garantiertes Item, Tränke), XP und Gold × 1,5.
 */
export function rollCoopReward(bossId: string, hero: HeroCombatProfile, uid: string, rng: () => number = Math.random): BattleReward {
  const reward = rollBattleReward(coopBossCreature(getCoopBoss(bossId)), hero, uid, rng);
  return {
    ...reward,
    xp: Math.round(reward.xp * COOP_REWARD_FACTOR),
    gold: Math.round(reward.gold * COOP_REWARD_FACTOR),
  };
}
