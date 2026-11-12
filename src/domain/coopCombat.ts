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
  ASSASSIN_CRIT_THREAT,
  classAbility,
  CLERIC_POTION_FACTOR,
  PALADIN_THREAT,
  rageFactor,
  type HeroClassId,
} from "./heroClasses";
import {
  bannerShare,
  chargeGain,
  emptyTally,
  nextCharge,
  signatureAbility,
  signatureBlocker,
  strongerVulnerable,
  unleashCost,
  verdictBonus,
  CHAMPION_BANNER,
  CLERIC_PRAYER,
  DUELIST_DUEL,
  PALADIN_VERDICT,
  RANGER_MARK,
  WARDEN_BREAKER_WEAKEN,
  WARLOCK_HARVEST,
  type ChargeTally,
} from "./classKit";
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
import { phaseDue, type AddRole } from "./bossMechanics";
import {
  bossAttacks,
  bossTurnTakenFactor,
  firstBossTurn,
  nextBossTurn,
  stolenStrike,
  turnAbility,
  COOP_STATIC_PER_HERO,
  CURSE_ROUNDS,
  type BossTurn,
} from "./bossIntents";
import { matchupFactor, WEAPON_KIND } from "./matchups";
import {
  EFFECT,
  has as hasEffect,
  heroDotRounds,
  type ItemEffectId,
} from "./itemEffects";
import {
  coopElite,
  eliteStats,
  enemyAdds,
  EXPLOSION_FACTOR,
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
import {
  abilityDots,
  bandage,
  canEndure,
  curseBurstDamage,
  damageTakenFactor,
  dodges,
  DOT_ORDER,
  drainHeal,
  drumFactor,
  drumTurn,
  elitePoison,
  eliteRegen,
  eliteStrike,
  guardedDamage,
  guardRetort,
  healerTurn,
  heroDotDamage,
  heroRegenShare,
  layDot,
  ritualHeal,
  secondWind,
  shieldTurn,
  strikeHero,
  thornsDamage,
  thornsShare,
  tickDot,
  tickEnemyEffects,
  tickFoeDots,
  weakenFactor,
  absorbShield,
  abilityBuffs,
  absorbWard,
  armorReduction,
  wardGain,
  cleansed as pureOf,
  debuffFoe,
  defendGain,
  extendDots,
  heroLifesteal,
  layAbilityDots,
  afterHeroHit,
  foeArmor,
  heroVolley,
  strikeFactors,
} from "./combatCore";
import {
  bladeDanceFactor,
  bloodPrice,
  chillsOnStun,
  guardOathHeal,
  hasLifebond,
  coverCost,
  freeCastChance,
  guardsOrBlocks,
  isMultiHit,
  echoDue,
  interruptMana,
  manaRegen,
  potionSkillFactor,
  rankIn,
  riposteFactor,
  skillCostFactor,
  wrathFactor,
  SKILL,
  WARD_MAX_SHARE,
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
/**
 * Heilung erzeugt Bedrohung (docs/klassen-neukonzept.md 4.5): so viel der geheilten LP bzw. des Schildwerts,
 * den Heilfähigkeiten, das Gebet und der Gruppenschild geben. So zieht ein Heiler ohne Tank Angriffe auf sich.
 * Tränke, Regeneration und Lebensraub erzeugen keine.
 */
export const HEAL_THREAT = 0.5;

/**
 * Boss-Raserei im Koop (docs/klassen-neukonzept.md 4.5): Ab Runde COOP_ENRAGE_ROUND macht der Gegner jede
 * Runde COOP_ENRAGE_STEP mehr Schaden (additiv, ohne Obergrenze), heroische Endbosse erst ab
 * COOP_ENRAGE_HEROIC_ROUND. Grund: Heiler, Tank, Wächterschwur und Lebensband können Kämpfe sonst endlos
 * strecken – das kostet nur Zeit. Angekündigt COOP_ENRAGE_WARNING Runden vorher. Gilt nicht für Begleiter
 * und Hydra-Köpfe; im Koop-Dungeon zählt jeder Kampf für sich. Solo gibt es keine Raserei.
 */
export const COOP_ENRAGE_ROUND = 20;
export const COOP_ENRAGE_HEROIC_ROUND = 30;
export const COOP_ENRAGE_STEP = 0.1;
export const COOP_ENRAGE_WARNING = 3;

/** Erste Runde der Raserei – heroische Endbosse (+50 % LP) später. */
export const coopEnrageStart = (heroic: boolean): number => (heroic ? COOP_ENRAGE_HEROIC_ROUND : COOP_ENRAGE_ROUND);

/** Faktor auf den Schaden des Gegners in Runde `round` (1 = keine Raserei) – rein aus der Runde, kein eigenes Feld. */
export function coopEnrageFactor(round: number, heroic: boolean): number {
  const start = coopEnrageStart(heroic);
  return round >= start ? 1 + COOP_ENRAGE_STEP * (round - start + 1) : 1;
}

/** Runden bis zur Raserei, solange sie angekündigt wird (1–COOP_ENRAGE_WARNING) – sonst null. */
export function coopEnrageWarning(round: number, heroic: boolean): number | null {
  const left = coopEnrageStart(heroic) - round;
  return left >= 1 && left <= COOP_ENRAGE_WARNING ? left : null;
}

/** Duellhaltung (Signatur des Duellanten): zieht die Angriffe wie Bollwerk auf sich. */
export const DUEL_TAUNT_SHARE = BULWARK_SHARE;
/**
 * Wächterschwur (Wehr-Meisterschaft): Abwehren zieht die Angriffe auf sich, aber schwächer als Bollwerk –
 * jeder Held kann aushelfen, der Paladin mit Bollwerk bleibt der bessere Tank (docs/skilltree-ueberarbeitung.md 3.5).
 */
export const GUARD_OATH_SHARE = SKILL.guardOath.share;

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

/**
 * Gift/Feuer/Bluten an Gegnern merken sich, wer sie verursacht hat (Bedrohung). `sourceId`: wer zuletzt gelegt
 * hat – seine Skills gelten für Blutsturz. Tausend Schnitte: ein gemeinsamer Bluten-Stapel pro Gegner,
 * `stacksBy` zählt die Stapel pro Held (Bedrohung nach Stapeln). Fehlt bei älteren Kämpfen und ohne Stapel.
 */
type SourcedDot = DamageOverTime & { sourceId: string; stacksBy?: Record<string, number> };

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
  /** Beute markieren (Waldläufer): so viele Runden noch markiert – Krits dagegen laden seine Leiste */
  marked?: number;
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
  /** Klassenleiste: Ladungen (0 bis CHARGE_MAX) – fehlt ohne Klasse und in älteren Kämpfen */
  charge?: number;
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
    /** Klingentanz: Faktor auf den nächsten normalen Angriff nach einer Mehrfachtreffer-Fähigkeit */
    bladeDance?: number;
    /** Schild-Topf (Lebensband): fängt Treffer vor den LP ab, höchstens WARD_MAX_SHARE der max. LP – fehlt bei älteren Kämpfen */
    ward?: number;
    /** Duellhaltung (Duellant): so viele Gegnerzüge noch */
    duel?: number;
    /** Kampfbanner (Champion): ab der Runde nach dem Aufstellen +15 % für ihn, +10 % für die Mitspieler */
    banner?: ActiveBuff;
    /** Paladin: abgewehrter, geblockter und geminderter Schaden seit dem letzten Richtspruch */
    absorbed?: number;
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
  /** `free`: Nachhall – die Fähigkeit kostet kein Mana */
  | { type: "ability"; heroId: string; ability: AbilityId; weapon: SkillWeapon; manaCost: number; echo?: boolean; free?: boolean }
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
      /** Lebensband: So viel hat der Schild des getroffenen Helden geschluckt (zusätzlich zu `damage`) */
      warded?: number;
    }
  /** Blutmagie: Das Mana reicht nicht – der Held zahlt den Rest mit `damage` LP */
  | { type: "bloodMagic"; heroId: string; damage: number }
  /** Lebensband: Heilung über das Maximum wird zum Schild – `by`: ein Mitspieler hat geheilt */
  | { type: "shieldGained"; heroId: string; amount: number; by?: string }
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
  /** `burst`: Blutsturz bzw. Fäulnis lässt Wunde oder Gift platzen; `stacks`: Bluten mit Tausend Schnitte */
  | { type: OverTimeKind; target: string; damage: number; burst?: boolean; stacks?: number }
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
  | { type: "regen"; heroId: string; heal: number }
  /**
   * Ein Held setzt die Signatur seiner Klasse ein (classKit.ts) – Treffer folgen als "hit".
   * `hpCost`: Entfesseln, `absorbed`: abgewehrter Schaden im Richtspruch.
   */
  | { type: "signature"; heroId: string; classId: HeroClassId; hpCost?: number; absorbed?: number }
  /** Die Klassenleiste eines Helden füllt sich um `gained` auf `value` */
  | { type: "charge"; heroId: string; gained: number; value: number }
  /** Seelenernte: DoTs am Ziel wirken sofort – zusammen `damage` */
  | { type: "harvest"; heroId: string; target: string; damage: number }
  /** Beute markieren bzw. Fluch der Seelenernte: Das Ziel erleidet mehr Schaden */
  | { type: "marked"; heroId: string; target: string; curse?: boolean }
  /** Bergbrecher am betäubungsimmunen Ziel: Es macht weniger Schaden */
  | { type: "weakened"; heroId: string; target: string }
  /** Kampfbanner bzw. Duellhaltung beginnt */
  | { type: "banner"; heroId: string }
  | { type: "duel"; heroId: string }
  /** Gebet: Ein gefallener Mitspieler steht wieder auf */
  | { type: "revived"; heroId: string; by: string; heal: number }
  /** Boss-Raserei: `factor` auf den Schaden des Gegners – `roundsLeft`: angekündigt, beginnt in so vielen Runden */
  | { type: "enrage"; factor: number; roundsLeft?: number };

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
  /** Signatur der Klasse (geht vor `ability`, nach `defend`) – der Server prüft die volle Leiste selbst */
  signature?: boolean;
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
      // Die Klassenleiste beginnt jeden Kampf leer
      ...(profile.heroClass && { charge: 0 }),
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
      // Jeder Dungeon-Kampf beginnt mit leerer Klassenleiste
      ...(h.heroClass && { charge: 0 }),
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

/** Manakosten einer Fähigkeit im Koop – mit Klasse und Skilltree (Deckung, Eröffnung in den ersten Runden, Echo). */
export function coopAbilityCost(hero: CoopHero, id: AbilityId, round = 0): number {
  // Segen „Fokus“: billigere Fähigkeiten
  const focus = Math.max(0, 1 - BLESSING.focus * stacks(hero.blessings, "focus"));
  const ability = classAbility(id, hero.heroClass);
  // Deckung zuerst auf die Kosten der Klasse (halbes Bollwerk), mit Untergrenze – dann die Faktoren
  const cost = coverCost(hero.skills, ability.manaCost, guardsOrBlocks(ability));
  return Math.round(cost * skillCostFactor(hero.skills, round, hero.effects.casts) * focus);
}

/** Warum die Signatur nicht geht – oder null. Der Server rechnet die Leiste selbst (resolveRound). */
export function coopSignatureBlocker(hero: CoopHero): string | null {
  if (hero.down) return "Du bist gefallen.";
  return signatureBlocker(hero.heroClass, hero.charge);
}

/** Kampfbanner im Koop: das eigene (+15 %) oder das eines anderen Champions (+10 %) – der höhere Wert zählt. */
export function coopBannerShare(hero: CoopHero, heroes: readonly CoopHero[]): number {
  const others = heroes.some((h) => h !== hero && !h.down && bannerShare(h.effects.banner) > 0) ? CHAMPION_BANNER.group : 0;
  return Math.max(bannerShare(hero.effects.banner), others);
}

/** Warum diese Fähigkeit nicht geht – oder null. `turn`: Absicht des Bosses (verschlungene Fähigkeit). */
export function coopAbilityBlocker(hero: CoopHero, id: AbilityId, turn?: BossTurn | null, round = 0): string | null {
  if (!hero.abilities.includes(id)) return "Diese Fähigkeit liegt auf keiner deiner angelegten Waffen.";
  if (turn?.devoured?.ability === id && turn.devoured.heroId === hero.id) return "Der Gegner hält diese Fähigkeit gefangen.";
  const wait = hero.cooldowns?.[id] ?? 0;
  if (wait > 0) return cooldownText(wait);
  const manaCost = coopAbilityCost(hero, id, round);
  // Blutmagie: Fehlendes Mana zahlt der Held mit LP – nicht unter 25 % (der Server rechnet selbst nach)
  if (bloodPrice(hero.skills, hero.mana, manaCost, hero.combatant.hp, hero.combatant.maxHp) === null) {
    return rankIn(hero.skills, "bloodMagic") > 0
      ? `Nicht genug Mana (${manaCost} nötig) – Blutmagie würde dich unter ${Math.round(SKILL.bloodMagic.floor * 100)} % LP bringen.`
      : `Nicht genug Mana (${manaCost} nötig).`;
  }
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

/**
 * Tausend Schnitte im Koop: Stapel pro Held, nachdem `heroId` einen Stapel gelegt hat (gesamt `stacks`).
 * Am Deckel geht ein Stapel vom Held mit den meisten über – so bleibt die Summe gleich der Stapelzahl.
 */
function stacksAfter(before: SourcedDot | undefined, stacks: number, heroId: string): Record<string, number> {
  const by: Record<string, number> = before?.stacks ? { ...(before.stacksBy ?? { [before.sourceId]: before.stacks }) } : {};
  by[heroId] = (by[heroId] ?? 0) + 1;
  let total = Object.values(by).reduce((sum, n) => sum + n, 0);
  while (total > stacks) {
    const [richest] = Object.entries(by)
      .filter(([id]) => id !== heroId)
      .sort((a, b) => b[1] - a[1])[0] ?? [heroId];
    by[richest] -= 1;
    if (by[richest] <= 0) delete by[richest];
    total--;
  }
  return by;
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
  const applyDot = (foe: Foe, kind: OverTimeKind, base: number, rounds: number, sourceId: string, stack = false) => {
    const before = foe.fx.bleed;
    // Gestapelt wird nur das eigene Gift; ein schwächeres – auch eines Mitspielers – überschreibt kein stärkeres.
    // Tausend Schnitte stapelt dagegen auf das gemeinsame Bluten, egal wer es gelegt hat.
    const laid = layDot<SourcedDot, CoopEnemyEffects>(foe.fx, {
      stackBleed: stack,
      creatureId: foe.creatureId,
      kind,
      base,
      rounds,
      skills: sourceSkills(sourceId),
      alive: foe.c.hp > 0,
      own: foe.fx.poison?.sourceId === sourceId ? foe.fx.poison : undefined,
      tag: { sourceId },
      // Hexer „Verderbnis“ und „Wandelbare Flüche“ – nach der Klasse des Verursachers
      warlock: heroes.find((h) => h.id === sourceId)?.heroClass === "warlock",
    });
    if (laid.immune) {
      events.push({ type: "immune", target: foe.id, kind });
      return;
    }
    foe.fx = laid.fx;
    const after = laid.fx.bleed;
    if (stack && after && after !== before && after.stacks) foe.fx = { ...foe.fx, bleed: { ...after, stacksBy: stacksAfter(before, after.stacks, sourceId) } };
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
  /** Schnitter: Gegner, deren Bluten in dieser Runde schon verlängert wurde (höchstens einmal pro Runde) */
  const reaped = new Set<Foe>();
  /** Konzentration: Helden, die in dieser Runde angegriffen oder abgewehrt haben, ohne Fähigkeit */
  const idle = new Set<string>();
  const enemyIsBoss = enemy.boss;
  /** Helden mit Bollwerk – ihre Bedrohung wird nach der Heldenphase hochgesetzt */
  const taunts: { hero: CoopHero; share: number }[] = [];
  /**
   * Lebensband: Heilung `raw` an `target` durch `healer` – der Teil über dem Maximum wird zum Schild, wenn der Heiler
   * Lebensband hat. `threat`: Heilfähigkeit oder Gebet – erzeugt beim Heiler Bedrohung (HEAL_THREAT).
   */
  const mend = (target: CoopHero, healer: CoopHero, raw: number, report: (heal: number) => void, threat = false) => {
    const heal = Math.min(Math.max(0, target.combatant.maxHp - target.combatant.hp), raw);
    const shield = wardGain(target.combatant, raw, target.effects.ward, hasLifebond(healer.skills));
    target.combatant.hp += heal;
    if (threat) healer.threat += (heal + shield) * HEAL_THREAT;
    report(heal);
    if (shield > 0) {
      target.effects.ward = (target.effects.ward ?? 0) + shield;
      events.push({ type: "shieldGained", heroId: target.id, amount: shield, ...(healer !== target && { by: healer.id }) });
    }
  };
  /** Ein gegnerischer Treffer auf `target`: zuerst fängt sein Schild (Lebensband) ab. */
  const wardHit = (target: CoopHero, damage: number): { damage: number; warded?: number } => {
    if (!target.effects.ward) return { damage };
    const taken = absorbWard(target.effects.ward, damage);
    target.effects.ward = taken.ward;
    return { damage: taken.damage, ...(taken.warded > 0 && { warded: taken.warded }) };
  };
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
    // Wer fällt, verliert seine Klassenleiste
    if (hero.charge !== undefined) hero.charge = 0;
    events.push({ type: "down", heroId: hero.id });
  };
  /** Klassenleiste: Auslöser dieser Runde pro Held (classKit.ts) – der Server rechnet sie selbst */
  const tallies = new Map<string, ChargeTally>();
  const tallyOf = (hero: CoopHero): ChargeTally => {
    let t = tallies.get(hero.id);
    if (!t) tallies.set(hero.id, (t = emptyTally()));
    return t;
  };
  /** Bergbrecher: Diese Gegner betäubt die Signatur des Wächters – zählt für Kryomant als Einfrieren */
  const breakers = new Set<Foe>();
  /** Paladin: abgewehrter, geblockter und geminderter Schaden dieser Runde */
  const absorbedBy = new Map<CoopHero, number>();
  const absorb = (hero: CoopHero, amount: number) => {
    if (hero.heroClass === "paladin" && amount > 0) absorbedBy.set(hero, (absorbedBy.get(hero) ?? 0) + amount);
  };
  /** Ein Begleiter fällt – der Kampf geht weiter. Skill „Seuche“: Sein Gift springt auf einen anderen über. */
  function addDown(foe: Foe) {
    if (foe === boss || foe.c.hp !== 0) return;
    events.push({ type: "addDown", add: foe.id });
    // Klassenleiste: Ein Gegner fällt (Champion) – mit eigenem Gift oder Feuer darauf (Hexer)
    for (const hero of heroes) if (!hero.down) tallyOf(hero).foesDown++;
    for (const id of new Set([foe.fx.poison?.sourceId, foe.fx.burn?.sourceId])) {
      const source = heroes.find((h) => h.id === id);
      if (source) tallyOf(source).dotFoesDown++;
    }
    const poison = foe.fx.poison;
    if (!poison || rankIn(sourceSkills(poison.sourceId), "plague") === 0) return;
    const next = foes.find((f) => f !== foe && f.c.hp > 0 && !f.fx.poison && matchupFactor(f.creatureId, "poison") > 0);
    if (next) next.fx = { ...next.fx, poison };
  }
  /** Item-Effekt „Dornen“: Wer den Helden trifft, erleidet einen Teil davon selbst – Stachelwehr beim Abwehren. */
  const thorns = (hero: CoopHero, foe: Foe, damage: number) => {
    const back = thornsDamage(damage, thornsShare(hero.itemEffects, hero.blessings, defending.has(hero.id), hero.skills), foe.c.hp);
    if (back === 0) return;
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
        // Der Meisteralchemist des Dorfes (potionPower) wirkt bewusst nur im Solo – das Dorf ist Solo-Fortschritt
        const factor =
          (hero.heroClass === "cleric" ? CLERIC_POTION_FACTOR : 1) *
          (hasEffect(hero.itemEffects, "alchemist") ? 1 + EFFECT.alchemist : 1) *
          (1 + BLESSING.alchemy * stacks(hero.blessings, "alchemy")) *
          potionSkillFactor(hero.skills);
        mend(hero, hero, Math.round(potionHeal(potion, hero.combatant.maxHp) * factor), (heal) =>
          events.push({ type: "potion", heroId: hero.id, targetId: hero.id, potionId: potion.id, heal }),
        );
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
    // Signatur: geht vor einer Fähigkeit, nach dem Abwehren – die volle Leiste prüft der Server hier selbst
    const signature = !action.defend && !!action.signature && coopSignatureBlocker(hero) === null;
    tallyOf(hero).signature = signature;
    // Duellhaltung: zieht die Angriffe auf sich wie Bollwerk, solange sie steht (auch in der Runde des Duells)
    if (hero.effects.duel || (signature && hero.heroClass === "duelist")) taunts.push({ hero, share: DUEL_TAUNT_SHARE });
    // Abwehren: kein Angriff, dafür halber Schaden in dieser Runde und etwas Mana
    if (action.defend) {
      const gain = defendGain(hero.mana, hero.maxMana, skills, DEFEND_MANA);
      hero.mana += gain;
      defending.add(hero.id);
      if (rankIn(skills, "riposte") > 0) hero.effects.riposte = riposteFactor(skills);
      events.push({ type: "defend", heroId: hero.id, mana: gain });
      tallyOf(hero).guarded = true;
      // Wächterschwur: Abwehren heilt und zieht die Angriffe auf sich (schwächer als Bollwerk)
      const oath = guardOathHeal(skills);
      if (oath > 0) {
        mend(hero, hero, Math.round(hero.combatant.maxHp * oath), (heal) => heal > 0 && events.push({ type: "selfHeal", heroId: hero.id, heal }));
        taunts.push({ hero, share: GUARD_OATH_SHARE });
      }
      idle.add(hero.id);
      continue;
    }
    const ability =
      !signature && action.ability && !coopAbilityBlocker(hero, action.ability, turn, state.round)
        ? classAbility(action.ability, hero.heroClass)
        : null;
    /** Signatur als Treffer – für alles andere keine Fähigkeit (kein Mana, Echo, Nachhall, Aufladen) */
    const sig = signature && hero.heroClass ? signatureAbility(hero.heroClass, hero.weapon) : null;
    /** Was trifft: Fähigkeit oder Signatur – null beim normalen Angriff */
    const act = ability ?? sig;
    const tally = tallyOf(hero);
    /** Richtspruch: Faktor aus dem abgewehrten Schaden */
    let sigBoost = 1;
    // Echo: Jede dritte Fähigkeit im Kampf kostet nichts und trifft ein zweites Mal mit 30 % Schaden (SKILL.echo.share)
    const echo = !!ability && echoDue(skills, hero.effects.casts);
    const wrath = wrathFactor(hero.effects.wrath);
    const fire = !!ability?.burn;
    const aoe = act?.aoe;
    // Schadensart: die der Fähigkeit bzw. ihrer Waffe, sonst die Hauptwaffe (matchups.ts) – die Signatur hat ihre eigene
    const heroWeapon = ability?.weapon ?? hero.weapon;
    const heroKind = act?.kind ?? (heroWeapon ? WEAPON_KIND[heroWeapon] : null);
    // Titanenschlag: Der nächste normale Angriff nach dem Ausholen macht mehr Schaden – das Ausholen ist damit verbraucht
    const charge = act ? 1 : (hero.effects.charged ?? 1);
    if (!act) hero.effects.charged = undefined;
    // Schattenschritt: Die nächste Aktion trifft sicher kritisch – Finte: der nächste normale Angriff doppelt
    const ambush = !!hero.effects.ambush;
    hero.effects.ambush = undefined;
    const feint = !act && !!hero.effects.feint;
    if (feint) hero.effects.feint = undefined;
    // Konzentration: Runde ohne Fähigkeit – auch wenn die Zeit abläuft (automatischer Angriff); die Signatur zählt nicht
    if (!act) idle.add(hero.id);
    // Mehrfachtreffer-Fähigkeit (Wirbelnde Klingen, Klingentanz, Tausend Schnitte) – nie die Signatur
    const multiHit = !!ability && isMultiHit(abilityHits(ability, hero.combatant.hp, hero.combatant.maxHp));
    // Klingentanz: Der nächste normale Angriff nach einer Mehrfachtreffer-Fähigkeit trifft stärker
    const dance = act ? 1 : (hero.effects.bladeDance ?? 1);
    if (!act) hero.effects.bladeDance = undefined;
    if (multiHit && bladeDanceFactor(skills) > 0) hero.effects.bladeDance = bladeDanceFactor(skills);
    // Ziel: ein lebender Begleiter – sonst der Boss
    const target = adds.find((f) => f.id === action.target && f.c.hp > 0) ?? boss;
    const plain = buffed(hero);
    // Berserker: bei wenig Lebenspunkten mehr Schaden; Kriegsschrei: Verstärkung
    const strong = {
      ...plain,
      damage:
        plain.damage *
        rageFactor(hero.heroClass, hero.combatant.hp, hero.combatant.maxHp) *
        (1 + (hero.effects.empower?.percent ?? 0)) *
        // Kampfbanner: eigenes oder das eines Champions in der Gruppe (stapelt nicht, stapelt mit Kriegsschrei)
        (1 + coopBannerShare(hero, heroes)),
    };
    const threatFactor = hero.heroClass === "paladin" ? PALADIN_THREAT : 1;
    if (ability) {
      const listed = coopAbilityCost(hero, ability.id, state.round);
      // Nachhall: Manchmal kostet die Fähigkeit kein Mana – gewürfelt nur, wer den Knoten hat und etwas zahlen müsste
      const freeChance = freeCastChance(skills);
      const free = listed > 0 && freeChance > 0 && rng() < freeChance;
      const manaCost = free ? 0 : listed;
      // Blutmagie: Reicht das Mana nicht, zahlt der Held den Rest mit LP (coopAbilityBlocker hat die Grenze geprüft)
      const price = bloodPrice(skills, hero.mana, manaCost, hero.combatant.hp, hero.combatant.maxHp) ?? 0;
      hero.mana = price > 0 ? 0 : hero.mana - manaCost;
      if (rankIn(skills, "echo") > 0) hero.effects.casts = (hero.effects.casts ?? 0) + 1;
      // Item-Effekt „Flinke Hand“: eine Runde kürzer abklingen
      used.set(hero.id, hasEffect(hero.itemEffects, "quickHands") ? { id: ability.id, cooldown: ability.cooldown - 1 } : ability);
      events.push({
        type: "ability",
        heroId: hero.id,
        ability: ability.id,
        weapon: ability.weapon,
        manaCost,
        ...(echo && { echo }),
        ...(free && { free }),
      });
      if (price > 0) {
        hero.combatant.hp = Math.max(1, hero.combatant.hp - price);
        events.push({ type: "bloodMagic", heroId: hero.id, damage: price });
      }
      abilitiesUsed++;
      // Kaelthar saugt die Kraft jeder Fähigkeit auf – ausser in der Runde, in der er sich entlädt
      if (turn?.static !== undefined && turn.ability !== "storm-lord-discharge") {
        events.push({ type: "static", heroId: hero.id, charges: turn.static + abilitiesUsed });
      }
      if (ability.cleanse) cleansed.add(hero.id);
      // Parade, Verstärkung, Schildwall, Ausholen, Schattenschritt, Finte
      hero.effects = { ...hero.effects, ...abilityBuffs(ability) };
      // Heilung – Arkane Heilung heilt die Mitspieler mit `groupHeal` mit
      const healed = ability.groupHeal ? heroes.filter((h) => !h.down) : [hero];
      for (const h of healed) {
        const share = h === hero ? 1 : ability.groupHeal!;
        // Lebensband des Heilers: Überheilung wird beim Geheilten zum Schild
        if (ability.heal) {
          mend(
            h,
            hero,
            Math.round(h.combatant.maxHp * ability.heal * share),
            (heal) => {
              if (heal > 0) events.push({ type: "selfHeal", heroId: h.id, heal, ...(h !== hero && { by: hero.id }) });
            },
            true,
          );
        }
        if (ability.renew) h.effects.renew = { percent: ability.renew.percent * share, roundsLeft: ability.renew.rounds };
      }
      const pure = ability.cleanse ? pureOf(hero.effects) : null;
      if (pure) {
        hero.effects = pure;
        events.push({ type: "cleansed", heroId: hero.id });
      }
      if (ability.manaGain) hero.mana = Math.min(hero.maxMana, hero.mana + ability.manaGain);
      if (ability.taunt) taunts.push({ hero, share: BULWARK_SHARE });
      // Zusatzeffekte wirken aufs Ziel – bei Flächenwirkung "all" auf alle Gegner
      for (const foe of aoe === "all" ? living() : [target]) {
        foe.fx = debuffFoe(foe.fx, ability);
        // Die Betäubung würfelt hier – vor Gift und Feuer der Fähigkeit (Brennen macht sie wahrscheinlicher)
        if (stunLands(ability, rng, skills, !!foe.fx.burn)) stunAttempts.set(foe, { ability, hero });
        foe.fx = extendDots(foe.fx, ability);
        layAbilityDots(ability, strong.damage, (kind, base, rounds) => applyDot(foe, kind, base, rounds, hero.id));
      }
      if (ability.bulwark) {
        hero.effects.bulwark = true;
        taunts.push({ hero, share: BULWARK_SHARE });
      }
      // Klassenleiste: Fähigkeit eingesetzt, Heilfähigkeit, Schwächung
      tally.ability = ability.weapon;
      tally.healAbility = !!(ability.heal || ability.renew);
      if (ability.weaken) tally.weakens++;
    }
    // Signatur: was sie vor den Treffern tut – LP-Kosten, Gebet, Haltungen, Richtspruch samt Gruppenschild
    if (sig && hero.heroClass) {
      const heroClass = hero.heroClass;
      const hpCost = heroClass === "berserker" ? unleashCost(hero.combatant.hp) : 0;
      hero.combatant.hp -= hpCost;
      const absorbed = heroClass === "paladin" ? Math.round(hero.effects.absorbed ?? 0) : 0;
      if (heroClass === "paladin") {
        sigBoost = 1 + verdictBonus(absorbed, strong.damage) / sig.multiplier;
        hero.effects.absorbed = 0;
      }
      events.push({ type: "signature", heroId: hero.id, classId: heroClass, ...(hpCost > 0 && { hpCost }), ...(absorbed > 0 && { absorbed }) });
      if (heroClass === "cleric") {
        // Gebet: heilt und reinigt sich und alle lebenden Mitspieler, belebt einen Gefallenen wieder
        for (const h of heroes.filter((x) => !x.down)) {
          const share = h === hero ? CLERIC_PRAYER.self : CLERIC_PRAYER.group;
          mend(
            h,
            hero,
            Math.round(h.combatant.maxHp * share),
            (heal) => {
              if (heal > 0) events.push({ type: "selfHeal", heroId: h.id, heal, ...(h !== hero && { by: hero.id }) });
            },
            true,
          );
          const pure = pureOf(h.effects);
          if (pure) {
            h.effects = pure;
            cleansed.add(h.id);
            events.push({ type: "cleansed", heroId: h.id });
          }
        }
        // Zählt als seine einmalige Wiederbelebung – ohne Gefallene entfällt es
        const fallen = heroes.find((h) => h.down && !h.revived);
        if (fallen) {
          fallen.down = false;
          fallen.revived = true;
          fallen.combatant.hp = Math.max(1, Math.round(fallen.combatant.maxHp * CLERIC_PRAYER.revive));
          events.push({ type: "revived", heroId: fallen.id, by: hero.id, heal: fallen.combatant.hp });
        }
      }
      if (heroClass === "paladin") {
        // Gruppenschild: im gemeinsamen Schild-Topf jedes Mitspielers, zusammen höchstens WARD_MAX_SHARE
        for (const h of heroes.filter((x) => !x.down && x !== hero)) {
          const room = Math.round(h.combatant.maxHp * WARD_MAX_SHARE) - (h.effects.ward ?? 0);
          const amount = Math.max(0, Math.min(room, Math.round(h.combatant.maxHp * PALADIN_VERDICT.groupShield)));
          if (amount <= 0) continue;
          h.effects.ward = (h.effects.ward ?? 0) + amount;
          hero.threat += amount * HEAL_THREAT;
          events.push({ type: "shieldGained", heroId: h.id, amount, by: hero.id });
        }
      }
      if (heroClass === "duelist") {
        hero.effects.duel = DUELIST_DUEL.rounds;
        events.push({ type: "duel", heroId: hero.id });
      }
      if (heroClass === "champion") {
        hero.effects.banner = { percent: CHAMPION_BANNER.self, roundsLeft: CHAMPION_BANNER.rounds + 1 };
        events.push({ type: "banner", heroId: hero.id });
      }
      if (heroClass === "warden" && target.c.hp > 0) {
        // Bergbrecher: Das Ziel ist sicher betäubt – ist es immun, macht es stattdessen weniger Schaden
        if (target.fx.stunImmunity) {
          target.fx = { ...target.fx, weaken: { percent: WARDEN_BREAKER_WEAKEN.percent, roundsLeft: WARDEN_BREAKER_WEAKEN.rounds } };
          events.push({ type: "weakened", heroId: hero.id, target: target.id });
          tally.weakens++;
        } else {
          stunAttempts.set(target, { ability: { ...sig, stun: true }, hero });
          breakers.add(target);
        }
      }
    }
    let dealt = 0;
    /** Getroffene Gegner dieses Helden */
    const dealtTo = new Set<Foe>();
    /** Ein Treffer des Helden – `share` < 1 bei Splash-Schaden auf Umstehende. */
    const strike = (foe: Foe, share: number, echoShare: number) => {
      // Meucheln, Henker, Ausbluten, Heiliger Hammer, Richterstoss, Schwäche/Resistenz, Item-Effekte, Skilltree
      const f = strikeFactors(
        foe,
        {
          ability: act,
          heroKind,
          itemEffects: hero.itemEffects,
          skills,
          blessings: hero.blessings,
          round: state.round,
          critChance: strong.critChance,
          fire,
          riposte,
          wrath,
          echoShare,
          multiHit,
          dance,
        },
        {
          isBoss: foe === boss,
          realBoss: foe === boss && enemyIsBoss,
          elite: foe === boss && (state.elite?.length ?? 0) > 0 && !state.heroic,
          charging: turn?.intent === "charging",
          plates,
        },
      );
      const { matchup, kind, plate, vulnerable } = f;
      const execute = f.finisher * f.bleedBonus * f.shakenBonus * f.headsman;
      const taken = takenBy(foe);
      // Schattenschritt: sicher kritisch
      const sureCrit = ambush;
      const attacker: Combatant = act
        ? {
            ...strong,
            damage:
              strong.damage * act.multiplier * sigBoost * execute * charge * f.charging * vulnerable * share * taken * plate * f.kindFactor * f.itemFactor * f.skillFactor,
            critChance: act.guaranteedCrit || sureCrit ? 1 : f.critChance,
          }
        : {
            ...strong,
            // Segen „Henker“ wirkt wie im Solo auch auf normale Angriffe
            damage: strong.damage * f.headsman * charge * share * vulnerable * taken * plate * f.kindFactor * f.itemFactor * f.skillFactor,
            critChance: sureCrit ? 1 : f.critChance,
          };
      const rolled = rollHit(attacker, { ...foe.c, armor: foeArmor(foe, act) }, rng, rankIn(skills, "piercing") > 0);
      // Der Schild des Schildträgers schluckt direkte Treffer auf den Boss
      const shield = foe === boss ? absorbShield(bossShield, rolled.damage) : { absorbed: 0, damage: rolled.damage, shield: bossShield };
      const absorbed = shield.absorbed;
      bossShield = shield.shield;
      const hit = { ...rolled, damage: shield.damage };
      if (foe === boss) heroHitsOnBoss++;
      else {
        hitAdds.add(foe.id);
        addHitters.set(foe.id, [...(addHitters.get(foe.id) ?? []), hero]);
      }
      dealt += Math.min(foe.c.hp, hit.damage);
      dealtTo.add(foe);
      foe.c.hp = Math.max(0, foe.c.hp - hit.damage);
      // Assassine „Schatten“: Krits erzeugen nur halbe Bedrohung
      hero.threat += rolled.damage * threatFactor * (rolled.crit && hero.heroClass === "assassin" ? ASSASSIN_CRIT_THREAT : 1);
      // Klassenleiste: Treffer, Krits – Waldläufer auch gegen markierte Ziele
      if (hit.damage > 0) tally.dealt = true;
      if (rolled.crit) {
        tally.crits++;
        if (foe.fx.marked) tally.markedCrits++;
      }
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
      // Plünderer, Adrenalin, Schnitter, Schmelzen, Glut, Giftzahn, Frostbiss, Manadieb
      afterHeroHit(
        foe,
        hit.crit,
        { base: strong.damage, heroClass: hero.heroClass, itemEffects: hero.itemEffects, skills, fire, foeState: f.foeState, plain: !ability, multiHit },
        rng,
        {
          dot: (on, kind, base, rounds, stack) => applyDot(on, kind, base, rounds, hero.id, stack),
          mana: (amount) => (hero.mana = Math.min(hero.maxMana, hero.mana + amount)),
          freeze: (frozen) => frozenByItem.set(frozen, hero),
          // Schnitter: das stärkere Bluten eine Runde länger – einmal pro Runde und Gegner, egal welcher Held
          extendBleed: (on) => {
            const bleed = on.fx.bleed;
            if (!bleed || reaped.has(on)) return;
            reaped.add(on);
            on.fx = { ...on.fx, bleed: { ...bleed, roundsLeft: bleed.roundsLeft + SKILL.reaper.extend } };
          },
        },
      );
      addDown(foe);
    };
    // Mehrfachtreffer, Flächen, Echo, Finte, Duellant, Kettenblitz
    heroVolley({
      ability: act,
      hits: () => abilityHits(act, hero.combatant.hp, hero.combatant.maxHp),
      target,
      living,
      volleyOn: () => boss.c.hp > 0,
      fightOn: () => boss.c.hp > 0,
      echo,
      feint,
      plain: !act,
      heroClass: hero.heroClass,
      itemEffects: hero.itemEffects,
      strike,
      rng,
      onExtraHit: () => tally.extraHits++,
    });
    // Wuchtiger Schlag, Arkane Entladung und Bergbrecher haben den Boss getroffen – das bricht sein Aufladen ab
    // (Duellant und Kettenblitz gibt es nur bei normalen Angriffen – sie ändern daran nichts)
    if (act?.interrupt && dealtTo.has(boss)) interruptHit = true;
    // Signatur: was sie nach den Treffern am Ziel tut – Seelenernte (mit Fluch), Markierung
    if (sig && target.c.hp > 0 && boss.c.hp > 0) {
      if (hero.heroClass === "warlock") {
        // Seelenernte: Jedes eigene DoT am Ziel wirkt sofort eine Runde – die Laufzeit bleibt
        let harvested = 0;
        for (const kind of DOT_ORDER) {
          const dot = target.fx[kind];
          const own = dot && (dot.sourceId === hero.id || (dot.stacksBy?.[hero.id] ?? 0) > 0);
          if (!dot || !own || target.c.hp <= 0) continue;
          const damage = Math.max(1, Math.round(dot.damage * WARLOCK_HARVEST.rounds * (1 + (target.fx.vulnerable?.percent ?? 0)) * takenBy(target)));
          target.c.hp = Math.max(0, target.c.hp - damage);
          hero.threat += damage * threatFactor;
          harvested += damage;
        }
        if (harvested > 0) {
          events.push({ type: "harvest", heroId: hero.id, target: target.id, damage: harvested });
          addDown(target);
          mend(hero, hero, Math.round(harvested * WARLOCK_HARVEST.selfHeal), (heal) => heal > 0 && events.push({ type: "selfHeal", heroId: hero.id, heal }));
        }
        // Fluch: 2 Runden +10 % Schaden von allen – zählt als Verwundbar, der höhere Wert zählt
        if (target.c.hp > 0) {
          const curse = { percent: WARLOCK_HARVEST.curse.percent, roundsLeft: WARLOCK_HARVEST.curse.rounds + 1 };
          target.fx = { ...target.fx, vulnerable: strongerVulnerable(target.fx.vulnerable, curse) };
          events.push({ type: "marked", heroId: hero.id, target: target.id, curse: true });
        }
      } else if (hero.heroClass === "ranger") {
        // Beute markieren: 3 volle Runden +15 % Schaden von allen – der höhere Wert mit Jägermal zählt
        const rounds = RANGER_MARK.rounds + 1;
        target.fx = { ...target.fx, vulnerable: strongerVulnerable(target.fx.vulnerable, { percent: RANGER_MARK.percent, roundsLeft: rounds }), marked: rounds };
        events.push({ type: "marked", heroId: hero.id, target: target.id });
      }
    }
    // Lebensraub: Blutrausch, Signatur, Plünderer und Berserker, Item-Effekt „Seelenraub“ und Segen „Blutdurst“
    const lifesteal = heroLifesteal(hero.heroClass, act, hero.blessings, hero.itemEffects, skills, hero.weapon);
    if (lifesteal > 0 && dealt > 0) {
      mend(hero, hero, Math.round(dealt * lifesteal), (heal) => heal > 0 && events.push({ type: "selfHeal", heroId: hero.id, heal }));
    }
  }

  // Spott (Bollwerk, Schildwall, Wächterschwur): erst jetzt, wenn alle Helden gehandelt haben. Jeder bekommt so
  // viel Bedrohung, dass er seinen Anteil der Gruppe hält (Bollwerk 75 % = das Dreifache aller anderen zusammen).
  // Mehrere Spötter: nach Anteil aufsteigend verrechnet – der höchste Anteil gewinnt, bei Gleichstand wer zuletzt handelt.
  for (const { hero: taunter, share } of [...taunts].sort((a, b) => a.share - b.share)) {
    const others = heroes.filter((h) => h !== taunter && !h.down).reduce((sum, h) => sum + h.threat, 0);
    taunter.threat = Math.max(taunter.threat, 20, Math.round((others * share) / (1 - share)));
  }

  // 2. Gift, Feuer, Bluten – erst an den Gegnern, dann an den Helden
  for (const foe of foes) {
    tickFoeDots<SourcedDot, CoopEnemyEffects>(foe, {
      fightOn: () => boss.c.hp > 0,
      scale: (damage) => damage * (1 + (foe.fx.vulnerable?.percent ?? 0)) * takenBy(foe),
      // Blutsturz des Verursachers
      sourceSkills: (effect) => sourceSkills(effect.sourceId),
      damage: (kind, damage, effect, burst) => {
        foe.c.hp = Math.max(0, foe.c.hp - damage);
        if (burst) {
          events.push({ type: "bleed", target: foe.id, damage, burst: true });
          return;
        }
        // Bedrohung für den Verursacher – beim gemeinsamen Stapel (Tausend Schnitte) nach Stapeln verteilt
        const stacksBy = effect.stacksBy ?? { [effect.sourceId]: 1 };
        const total = Object.values(stacksBy).reduce((sum, n) => sum + n, 0);
        for (const [id, n] of Object.entries(stacksBy)) {
          const source = heroes.find((h) => h.id === id && !h.down);
          if (source && total > 0) source.threat += ((damage * n) / total) * (source.heroClass === "paladin" ? PALADIN_THREAT : 1);
          // Klassenleiste: Das DoT wirkt – für jeden Helden mit einem Stapel darin (Hexer, Plünderer)
          if (source) {
            tallyOf(source).dotTicked = true;
            if (kind === "bleed") tallyOf(source).bleedTicked = true;
          }
        }
        const stacked = kind === "bleed" && (effect.stacks ?? 1) > 1 ? { stacks: effect.stacks } : {};
        events.push({ type: kind, target: foe.id, damage, ...stacked });
      },
      down: () => addDown(foe),
    });
  }
  if (boss.c.hp > 0) {
    for (const hero of heroes) {
      for (const kind of DOT_ORDER) {
        const effect = hero.effects[kind];
        if (!effect || hero.down) continue;
        // Gegengift: weniger Schaden durch Gift, Feuer und Bluten
        const damage = heroDotDamage(effect, hero.skills);
        hero.combatant.hp = Math.max(0, hero.combatant.hp - damage);
        events.push({ type: kind, target: hero.id, damage });
        hero.effects[kind] = tickDot(effect);
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
  const hurt = (hero: CoopHero) => damageTakenFactor(hero.effects, defending.has(hero.id), hero.skills, DEFEND_DAMAGE_TAKEN);
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
        // Kryomant: Jede Betäubung zählt als Einfrieren – auch der Bergbrecher (docs/skilltree-ueberarbeitung.md 5.1)
        const freezing = frozen || !!attempt?.ability.freeze;
        if (chillsOnStun(by.skills, freezing || breakers.has(foe))) foe.fx = { ...foe.fx, chilled: 2 };
        interrupters.add(by);
        // Klassenleiste: gelandete Betäubung, Einfrieren (Magier)
        tallyOf(by).stuns++;
        if (freezing) tallyOf(by).freezes++;
      }
      const tag = foe === boss ? {} : { add: foe.id };
      events.push({ type: stunned ? "stunned" : "stunResisted", ...(frozen ? { freeze: true as const } : freezeFlag(attempt!.ability)), ...tag });
      return stunned;
    };
    // Boss-Raserei: ab Runde 20 (heroisch 30) mehr Schaden pro Runde – angekündigt 3 Runden vorher
    const enrage = coopEnrageFactor(state.round, !!state.heroic);
    const enrageIn = coopEnrageWarning(state.round, !!state.heroic);
    if (enrage > 1) events.push({ type: "enrage", factor: enrage });
    else if (enrageIn !== null) events.push({ type: "enrage", factor: 1, roundsLeft: enrageIn });
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
    const drums = drumFactor(adds);
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
      const { rage, swift, hits } = eliteStrike(elite, boss.c);
      const attacker = {
        ...boss.c,
        damage: ((boss.c.damage * (special?.multiplier ?? 1)) / groupScale) * weakenFactor(boss.fx) * drums * rage * swift * enrage,
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
          tallyOf(target).guarded = tallyOf(target).bulwarkBlock = true;
          absorb(target, attacker.damage * (special?.hits ?? hits) * (1 - armorReduction(buffed(target).armor, boss.c.level)));
          continue;
        }
        const defender = special?.ignoreArmor ? { ...buffed(target), armor: 0 } : buffed(target);
        // Item-Effekt „Standhaft“: Boss-Fähigkeiten treffen schwächer
        const attackerFor = {
          ...attacker,
          damage: attacker.damage * hurt(target) * (special && hasEffect(target.itemEffects, "steadfast") ? 1 - EFFECT.steadfast : 1),
        };
        let taken = 0;
        /** Voller Schaden vor der Parade – für Rückwurf und „verhindert“ */
        let raw = 0;
        /** Treffer, denen der Held nicht ausgewichen ist (Schemen) */
        let landed = 0;
        // Parade/Vergeltung mindert alle Treffer dieses Angriffs – Rückwurf und Konter kommen danach einmal.
        // Die Duellhaltung wirkt gegen Angriffe auf ihn allein wie eine Parade, die nicht verbraucht wird.
        const duel: Guard | undefined =
          target.effects.duel && !special?.aoe ? { reduce: DUELIST_DUEL.reduce, counter: DUELIST_DUEL.counter } : undefined;
        const guard = target.effects.guard ?? duel;
        for (let i = 0; i < (special?.hits ?? hits) && target.combatant.hp > 0; i++) {
          if (dodges(target.skills, rng)) {
            events.push({ type: "dodged", heroId: target.id, attacker: BOSS });
            continue;
          }
          landed++;
          if (defending.has(target.id) || guard) warded.add(target);
          const rolled = rollHit(attackerFor, defender, rng);
          // Parade/Vergeltung mindert – davon fängt der Schild (Lebensband) ab
          const parried = guard ? guardedDamage(rolled.damage, guard) : rolled.damage;
          const hit = { ...rolled, ...wardHit(target, parried) };
          target.combatant.hp = Math.max(0, target.combatant.hp - hit.damage);
          raw += rolled.damage;
          taken += hit.damage;
          tallyOf(target).hitsTaken++;
          // Paladin: Was Abwehren und Schildwall gemindert haben
          const factor = hurt(target);
          if (factor > 0 && factor < 1) absorb(target, (rolled.damage * (1 - factor)) / factor);
          events.push({ type: "hit", attacker: BOSS, target: target.id, ...hit });
        }
        thorns(target, boss, taken);
        if (guard && landed > 0) {
          target.effects.guard = undefined;
          events.push({ type: "guarded", heroId: target.id, prevented: raw - taken });
          tallyOf(target).guarded = true;
          absorb(target, raw - taken);
          const counter = guardRetort(
            guard,
            raw,
            target.combatant.hp > 0
              ? (factor) => {
                  const own = buffed(target);
                  const armor = Math.round(boss.c.armor * (1 - (boss.fx.armorBreak ?? 0)));
                  const kind = target.weapon ? WEAPON_KIND[target.weapon] : null;
                  const damage = own.damage * factor * takenBy(boss) * matchupFactor(boss.creatureId, kind);
                  return rollHit({ ...own, damage }, { ...boss.c, armor }, rng).damage;
                }
              : null,
          );
          if (counter > 0 && boss.c.hp > 0) {
            boss.c.hp = Math.max(0, boss.c.hp - counter);
            target.threat += counter * (target.heroClass === "paladin" ? PALADIN_THREAT : 1);
            events.push({ type: "counter", heroId: target.id, damage: counter });
            tallyOf(target).counters++;
          }
        }
        // Lebensentzug wie im Solo: einmal auf den Schaden aller Treffer an diesem Helden
        if (drain > 0 && boss.c.hp > 0) {
          const heal = drainHeal(boss.c, taken, drain);
          boss.c.hp += heal;
          if (heal > 0) events.push({ type: "drain", heal });
        }
        // Wer allem ausgewichen ist, entgeht auch den Zusatzeffekten
        if (landed === 0) {
          knockDown(target);
          continue;
        }
        if (target.combatant.hp > 0) {
          for (const [kind, dot] of abilityDots(special, ((boss.c.damage * drums) / groupScale) * enrage, target.itemEffects)) target.effects[kind] = dot;
          // Elite „Giftig“: Wer getroffen wird, ist vergiftet
          if (elite.includes("poisonous") && taken > 0) target.effects.poison = elitePoison(boss.c.damage * enrage, target.itemEffects);
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
        const damage = curseBurstDamage(victim.combatant.maxHp, hurt(victim));
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
        const ritual = healerTurn(add.cast, stunned || hitAdds.has(add.id));
        add.cast = ritual.cast;
        if (ritual.act === "interrupted") {
          // Nur ein laufendes Ritual zählt als unterbrochen (Unterbrecher)
          if (ritual.wasCasting) {
            events.push({ type: "interrupted", add: add.id });
            for (const hero of addHitters.get(add.id) ?? []) interrupters.add(hero);
          }
        } else if (ritual.act === "ritual") events.push({ type: "ritual", add: add.id, roundsLeft: ritual.roundsLeft });
        else {
          const heal = ritualHeal(boss.c);
          boss.c.hp += heal;
          if (heal > 0) events.push({ type: "addHeal", add: add.id, heal });
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
        const raise = shieldTurn(add.cast, boss.c.maxHp);
        add.cast = raise.cast;
        if (raise.shield > 0) {
          bossShield = raise.shield;
          events.push({ type: "bossShield", add: add.id, shield: bossShield });
          continue;
        }
      }
      if (add.role === "drummer") {
        add.cast = drumTurn(add.cast);
        events.push({ type: "drumming", add: add.id, stacks: add.cast });
      }
      const target = pickBossTarget(heroes, rng)!;
      const strike = strikeHero(add.c, add.fx, buffed(target), { bulwark: !!target.effects.bulwark, skills: target.skills, hurt: hurt(target) }, rng);
      if ("blocked" in strike) {
        shielded.add(target);
        warded.add(target);
        events.push({ type: "blocked", heroId: target.id, add: add.id });
        tallyOf(target).guarded = tallyOf(target).bulwarkBlock = true;
        absorb(target, add.c.damage * weakenFactor(add.fx) * (1 - armorReduction(buffed(target).armor, add.c.level)));
        continue;
      }
      if ("dodged" in strike) {
        events.push({ type: "dodged", heroId: target.id, attacker: add.id });
        continue;
      }
      if (defending.has(target.id)) warded.add(target);
      tallyOf(target).hitsTaken++;
      const addHurt = hurt(target);
      if (addHurt > 0 && addHurt < 1) absorb(target, (strike.hit.damage * (1 - addHurt)) / addHurt);
      const hit = { ...strike.hit, ...wardHit(target, strike.hit.damage) };
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
      // Lebensband: zählt beim Helden selbst (auch für Arkane Heilung eines Mitspielers)
      mend(hero, hero, Math.round(hero.combatant.maxHp * regen), (heal) => heal > 0 && events.push({ type: "regen", heroId: hero.id, heal }));
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
  // Paladin: abgewehrter Schaden sammelt sich bis zum nächsten Richtspruch
  for (const [hero, amount] of absorbedBy) if (!hero.down) hero.effects.absorbed = (hero.effects.absorbed ?? 0) + Math.round(amount);
  // Klassenleiste: Auslöser dieser Runde – die Signatur verbraucht die volle Leiste, die Runde lädt nicht
  for (const hero of heroes) {
    if (hero.charge === undefined) continue;
    const tally = tallyOf(hero);
    if (tally.signature) hero.charge = 0;
    if (hero.down || status !== "active") continue;
    const gained = chargeGain(hero.heroClass, { ...tally, low: hero.combatant.hp < hero.combatant.maxHp * 0.5 });
    if (gained <= 0) continue;
    hero.charge = nextCharge(hero.charge, gained);
    events.push({ type: "charge", heroId: hero.id, gained, value: hero.charge });
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
      ...(h.effects.banner && { banner: tick(h.effects.banner) }),
      ...(h.effects.duel !== undefined && { duel: h.effects.duel > 1 ? h.effects.duel - 1 : undefined }),
    },
    cooldowns: tickCooldowns(h.cooldowns, used.get(h.id) ?? null),
    threat: Math.round(h.threat * (1 - THREAT_DECAY)),
    // Konzentration: mehr Mana in einer Runde ohne Fähigkeit (Angriff oder Abwehren)
    mana: h.down ? h.mana : Math.min(h.maxMana, h.mana + manaRegen(h.skills, MANA_REGEN, idle.has(h.id))),
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
