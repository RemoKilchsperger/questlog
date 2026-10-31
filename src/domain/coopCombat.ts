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
// Kampf gewonnen. Begleiter mit Aufgabe und die zweite Phase wirken wie solo
// (bossMechanics.ts, docs/boss-mechaniken.md).

import { freshStunImmunity, MANA_REGEN, tickStunImmunity, type AbilityDef, type AbilityId, type Guard } from "./abilities";
import {
  classAbility,
  CLERIC_POTION_FACTOR,
  CLERIC_REGEN,
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
  EMPTY_CHEST,
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
import { abilityForRound, getBossAbilities } from "./bossAbilities";
import { bossDamageDealtFactor, bossDamageTakenFactor, HEALER_HEAL, phaseDue, type AddRole } from "./bossMechanics";
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
  REGEN_SHARE,
  SWIFT_SHARE,
  VAMPIRE_SHARE,
  type EliteAffix,
} from "./elites";
import { DUNGEONS, getCreature, getCreatureStats, getDungeon, type CreatureDef } from "./creatures";
import { getPotion, potionHeal, type BuffKind } from "./potions";
import { hash, seededRng } from "./random";
import type { SkillWeapon } from "./skills";

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
    description: "Drei Köpfe, ein Hunger. Ihr Giftatem trifft die ganze Gruppe.",
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
  const abilities = getBossAbilities(id).map((ability): CoopBossAbility =>
    ability.target === "group" ? { ...ability, aoe: true, multiplier: ability.multiplier * DUNGEON_COOP_ABILITY_FACTOR } : { ...ability },
  );
  const { name, sprite, level, boss: isBoss } = creature;
  return { id, name, sprite, level, boss: isBoss, raid: false, areaId: area.id, abilities, creature };
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

/** Ist diese Lobby ein Dungeon (sonst ein Raid-Boss)? `id` steht in `boss_id` der Lobby. */
export function isCoopDungeon(id: string): boolean {
  return DUNGEONS.some((d) => d.id === id);
}

/** Name, Mindestlevel und Grafik des Inhalts einer Lobby. Wirft bei Unbekanntem. */
export function coopContent(id: string): { name: string; level: number; sprite: string; description: string } {
  if (isCoopDungeon(id)) {
    const dungeon = getDungeon(id);
    const boss = dungeon.creatures[dungeon.creatures.length - 1];
    return { name: dungeon.name, level: dungeon.minLevel, sprite: boss.sprite, description: dungeon.description };
  }
  const boss = getCoopBoss(id);
  return { name: boss.name, level: boss.level, sprite: boss.sprite, description: boss.description };
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
};

/** Ein Begleiter des Bosses – seine `uid` ist zugleich seine Id in Ereignissen. */
export interface CoopAdd {
  /** "add-1", "add-2", … */
  uid: string;
  creatureId: string;
  /** Aufgabe im Kampf: Heiler, Schildträger, Trommler (bossMechanics.ts) */
  role?: AddRole;
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
  /** „Unbeugsam“ hat in diesem Kampf schon gerettet */
  endured?: boolean;
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
    /** Titanenschlag: Faktor auf den Schaden der nächsten Aktion */
    charged?: number;
    /** Arkane Heilung: heilt `percent` der max. LP am Rundenende */
    renew?: ActiveBuff;
  };
  threat: number;
  /** Auf 0 LP gefallen – handelt nicht und wird nicht angegriffen */
  down: boolean;
  /** Wurde schon einmal wiederbelebt (höchstens einmal pro Kampf) */
  revived: boolean;
}

export type CoopEvent =
  | { type: "potion"; heroId: string; targetId: string; potionId: string; heal: number; buff?: BuffKind; revive?: boolean }
  | { type: "ability"; heroId: string; ability: AbilityId; weapon: SkillWeapon; manaCost: number }
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
    }
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
  | { type: OverTimeKind; target: string; damage: number }
  | { type: "bossAbility"; bossId: string; abilityId: string; name: string }
  /** Mit `add`: ein Begleiter statt des Bosses */
  | { type: "stunned"; freeze?: boolean; add?: string }
  | { type: "stunResisted"; freeze?: boolean; add?: string }
  /** Bollwerk blockt – `add`: der Angriff kam von einem Begleiter */
  | { type: "blocked"; heroId: string; add?: string }
  /** Ein Begleiter fällt – der Kampf geht weiter */
  | { type: "addDown"; add: string }
  | { type: "down"; heroId: string }
  | { type: "victory" }
  | { type: "wipe" }
  /** Item-Effekt „Dornen“: Der Angreifer (BOSS oder uid) erleidet einen Teil seines Schadens selbst */
  | { type: "thorns"; heroId: string; target: string; damage: number }
  /** Item-Effekt „Unbeugsam“: Der Held überlebt einen tödlichen Treffer mit 1 LP */
  | { type: "endured"; heroId: string }
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
  /** Elite-Gegner im Koop-Dungeon: seine Modifikatoren (elites.ts) – fehlt bei gewöhnlichen Gegnern */
  elite?: EliteAffix[];
  status: CoopStatus;
  log: (CoopEvent & { round: number })[];
  /** Nur in Koop-Dungeons: welcher Dungeon, welcher Kampf. `bossId` ist dann der aktuelle Gegner. */
  dungeon?: CoopDungeonRun;
}

export interface CoopDungeonRun {
  id: string;
  /** Index des aktuellen Gegners in `creatures` */
  stage: number;
  /** Id des ersten Kampfs – bleibt für den ganzen Dungeon gleich (Startwert der Beute) */
  runId: string;
}

/**
 * Was ein Spieler in einer Runde tut: optional ein Trank (Ziel: er selbst oder
 * ein gefallener Mitspieler), dann ein Angriff – mit `ability` als Fähigkeit.
 */
export interface CoopAction {
  potion?: { potionId: string; targetId: string };
  ability?: AbilityId;
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
  const dungeon = isCoopDungeon(contentId) ? { id: contentId, stage: 0, runId: id } : undefined;
  const enemy = getCoopEnemy(dungeon ? getDungeon(contentId).creatures[0].id : getCoopBoss(contentId).id);
  const elite = dungeon ? coopElite(dungeon.runId, 0, enemy.creature) : [];
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
    boss: eliteStats(coopEnemyStats(enemy, players.length), elite),
    bossEffects: {},
    adds: coopAdds(enemy, players.length, elite),
    ...(elite.length > 0 && { elite }),
    status: "active",
    log: [],
  };
}

/* ───────────── Dungeons: von Kampf zu Kampf ───────────── */

/** Gefallene stehen zwischen zwei Dungeon-Kämpfen mit diesem Anteil ihrer Lebenspunkte wieder auf. */
export const DUNGEON_REVIVE_HP = 0.25;

/** Gegner eines Koop-Dungeons, in Kampfreihenfolge. */
function dungeonCreatures(state: CoopBattleState): readonly CreatureDef[] {
  return state.dungeon ? getDungeon(state.dungeon.id).creatures : [];
}

/** Gewonnen, und im Dungeon wartet noch ein Gegner? Dann entscheidet der Host: weiter oder aussteigen. */
export function hasNextStage(state: CoopBattleState): boolean {
  return state.dungeon !== undefined && state.status === "won" && state.dungeon.stage < dungeonCreatures(state).length - 1;
}

/** Der nächste Gegner im Dungeon – oder null. */
export function nextStageEnemy(state: CoopBattleState): CoopEnemy | null {
  return hasNextStage(state) ? getCoopEnemy(dungeonCreatures(state)[state.dungeon!.stage + 1].id) : null;
}

/** Bisher gewonnene Kämpfe in diesem Dungeon. */
export function clearedStages(state: CoopBattleState): number {
  if (!state.dungeon) return 0;
  return state.dungeon.stage + (state.status === "won" ? 1 : 0);
}

/** Endboss des Dungeons besiegt? */
export function dungeonCompleted(state: CoopBattleState): boolean {
  return state.dungeon !== undefined && clearedStages(state) === dungeonCreatures(state).length;
}

/**
 * Nächster Kampf im Dungeon – als neuer Kampf mit eigener Id. Die Lebenspunkte
 * werden mitgenommen, Gefallene stehen mit DUNGEON_REVIVE_HP wieder auf. Mana,
 * Abklingzeiten, Tränke, Zustände und Bedrohung beginnen frisch – wie solo.
 */
export function nextDungeonStage(state: CoopBattleState, id: string, now: number): CoopBattleState {
  if (!hasNextStage(state)) throw new Error("Es gibt keinen nächsten Kampf.");
  const enemy = nextStageEnemy(state)!;
  const stage = state.dungeon!.stage + 1;
  const elite = coopElite(state.dungeon!.runId, stage, enemy.creature);
  return {
    id,
    bossId: enemy.id,
    dungeon: { ...state.dungeon!, stage },
    round: 1,
    deadline: now + COOP_TURN_SECONDS * 1000,
    heroes: state.heroes.map((h) => ({
      ...h,
      combatant: {
        ...h.combatant,
        hp: h.down ? Math.max(1, Math.round(h.combatant.maxHp * DUNGEON_REVIVE_HP)) : h.combatant.hp,
      },
      mana: h.maxMana,
      cooldowns: {},
      buffs: {},
      potionsUsed: [],
      effects: hasEffect(h.itemEffects, "vigilant") ? { bulwark: true } : {},
      endured: false,
      threat: 0,
      down: false,
      revived: false,
    })),
    boss: eliteStats(coopEnemyStats(enemy, state.heroes.length), elite),
    bossEffects: {},
    adds: coopAdds(enemy, state.heroes.length, elite),
    ...(elite.length > 0 && { elite }),
    status: "active",
    log: [],
  };
}

/**
 * Truhe eines Spielers: die Beute aller gewonnenen Kämpfe, wie solo. Gewürfelt
 * mit einem Startwert aus Dungeon-Durchgang, Kampf und Spieler – so zeigt der
 * Zwischenbildschirm schon den echten Inhalt, und nach dem Neuladen ist er gleich.
 */
export function rollCoopDungeonChest(state: CoopBattleState, hero: HeroCombatProfile, playerId: string): DungeonChest {
  if (!state.dungeon) return EMPTY_CHEST;
  const { runId } = state.dungeon;
  const creatures = dungeonCreatures(state);
  let chest = EMPTY_CHEST;
  for (let i = 0; i < clearedStages(state); i++) {
    const rng = seededRng(hash(`${runId}|${i}|${playerId}`));
    const elite = coopElite(runId, i, creatures[i]).length > 0;
    chest = addToChest(chest, rollBattleReward(creatures[i], hero, `${runId}-${i}-${playerId}`, rng, [], elite));
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
  const target = state.heroes.find((h) => h.id === targetId);
  if (!hero || !target) return "Unbekannter Held.";
  if (hero.down) return "Du bist gefallen.";
  if (hero.potionsUsed.includes(potionId)) return "Diese Sorte hast du in diesem Kampf schon getrunken.";
  const potion = getPotion(potionId);
  if (target.id !== hero.id) {
    if (!target.down) return "Nur gefallene Mitspieler lassen sich wiederbeleben.";
    if (target.revived) return `${target.name} wurde schon einmal wiederbelebt.`;
    if (potion.effect.kind !== "heal") return "Zum Wiederbeleben braucht es einen Heiltrank.";
    return null;
  }
  if (potion.effect.kind === "heal" && hero.combatant.hp >= hero.combatant.maxHp) return "Deine Lebenspunkte sind schon voll.";
  return null;
}

/** Warum diese Fähigkeit nicht geht – oder null. */
export function coopAbilityBlocker(hero: CoopHero, id: AbilityId): string | null {
  if (!hero.abilities.includes(id)) return "Diese Fähigkeit liegt auf keiner deiner angelegten Waffen.";
  const wait = hero.cooldowns?.[id] ?? 0;
  if (wait > 0) return cooldownText(wait);
  const { manaCost } = classAbility(id, hero.heroClass);
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
  c: Combatant;
  fx: CoopEnemyEffects;
}

/** Am Rundenende laufen Schwächung, Verwundbarkeit und Betäubungs-Immunität eine Runde ab. */
function tickEnemyEffects(fx: CoopEnemyEffects): CoopEnemyEffects {
  const tick = (b: ActiveBuff | undefined) => (b && b.roundsLeft > 1 ? { ...b, roundsLeft: b.roundsLeft - 1 } : undefined);
  return { ...fx, weaken: tick(fx.weaken), vulnerable: tick(fx.vulnerable), stunImmunity: tickStunImmunity(fx.stunImmunity) };
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
  const adds: Foe[] = (state.adds ?? []).map((a) => ({ id: a.uid, creatureId: a.creatureId, role: a.role, c: { ...a.combatant }, fx: { ...a.effects } }));
  /** Gift, Feuer oder Bluten auf einen Gegner legen – mit Schwäche/Resistenz; bei Immunität wirkt es nicht. */
  const applyDot = (foe: Foe, kind: OverTimeKind, base: number, rounds: number, sourceId: string) => {
    const factor = matchupFactor(foe.creatureId, kind);
    if (factor === 0) {
      events.push({ type: "immune", target: foe.id, kind });
      return;
    }
    foe.fx = { ...foe.fx, [kind]: { damage: Math.max(1, Math.round(base * factor)), roundsLeft: rounds, sourceId } };
  };
  const foes = [boss, ...adds];
  let phase = state.phase;
  /** Rollen der Begleiter zählen nur, solange sie stehen */
  const roleHolders = () => adds.map((f) => ({ role: f.role, hp: f.c.hp }));
  /** Schildträger: Der Boss erleidet weniger Schaden, solange einer steht */
  const takenBy = (foe: Foe) => (foe === boss ? bossDamageTakenFactor(roleHolders()) : 1);
  const living = () => foes.filter((f) => f.c.hp > 0);
  /** Fähigkeit, die einen Gegner in dieser Runde betäuben würde */
  const stunAttempts = new Map<Foe, AbilityDef>();
  /** Vom Item-Effekt „Frostbiss“ eingefrorene Gegner – sie setzen diese Runde aus */
  const frozenByItem = new Set<Foe>();
  const enemyIsBoss = getCoopEnemy(state.bossId).boss;
  /** Helden mit Bollwerk – ihre Bedrohung wird nach der Heldenphase hochgesetzt */
  const taunts: CoopHero[] = [];
  const byId = (id: string) => heroes.find((h) => h.id === id)!;
  const knockDown = (hero: CoopHero) => {
    if (hero.combatant.hp > 0 || hero.down) return;
    // Item-Effekt „Unbeugsam“: einmal pro Kampf mit 1 LP überleben
    if (hasEffect(hero.itemEffects, "unyielding") && !hero.endured) {
      hero.combatant.hp = 1;
      hero.endured = true;
      events.push({ type: "endured", heroId: hero.id });
      return;
    }
    hero.down = true;
    hero.threat = 0;
    hero.effects = {};
    hero.buffs = {};
    events.push({ type: "down", heroId: hero.id });
  };
  /** Ein Begleiter fällt – der Kampf geht weiter. */
  const addDown = (foe: Foe) => {
    if (foe !== boss && foe.c.hp === 0) events.push({ type: "addDown", add: foe.id });
  };
  /** Item-Effekt „Dornen“: Wer den Helden trifft, erleidet einen Teil davon selbst. */
  const thorns = (hero: CoopHero, foe: Foe, damage: number) => {
    if (!hasEffect(hero.itemEffects, "thorns") || damage <= 0 || foe.c.hp <= 0) return;
    const back = Math.max(1, Math.round(damage * EFFECT.thorns));
    foe.c.hp = Math.max(0, foe.c.hp - back);
    events.push({ type: "thorns", heroId: hero.id, target: foe.id, damage: back });
    addDown(foe);
  };

  /** Pro Held die in dieser Runde eingesetzte Fähigkeit (für die Abklingzeit) */
  const used = new Map<string, { id: AbilityId; cooldown: number }>();

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
      if (target.id !== hero.id) {
        // Wiederbeleben: steht mit der Heilwirkung des Tranks wieder auf
        target.down = false;
        target.revived = true;
        target.combatant.hp = Math.max(1, potionHeal(potion, target.combatant.maxHp));
        events.push({ type: "potion", heroId: hero.id, targetId: target.id, potionId: potion.id, heal: target.combatant.hp, revive: true });
      } else if (potion.effect.kind === "heal") {
        const factor = (hero.heroClass === "cleric" ? CLERIC_POTION_FACTOR : 1) * (hasEffect(hero.itemEffects, "alchemist") ? 1 + EFFECT.alchemist : 1);
        const heal = Math.min(Math.round(potionHeal(potion, hero.combatant.maxHp) * factor), hero.combatant.maxHp - hero.combatant.hp);
        hero.combatant.hp += heal;
        events.push({ type: "potion", heroId: hero.id, targetId: hero.id, potionId: potion.id, heal });
      } else {
        const { kind, percent, rounds } = potion.effect;
        hero.buffs = { ...hero.buffs, [kind]: { percent, roundsLeft: rounds } };
        events.push({ type: "potion", heroId: hero.id, targetId: hero.id, potionId: potion.id, heal: 0, buff: kind });
      }
    }

    const ability = action.ability && !coopAbilityBlocker(hero, action.ability) ? classAbility(action.ability, hero.heroClass) : null;
    const aoe = ability?.aoe;
    // Schadensart: die der Fähigkeit bzw. ihrer Waffe, sonst die Hauptwaffe (matchups.ts)
    const heroWeapon = ability?.weapon ?? hero.weapon;
    const heroKind = ability?.kind ?? (heroWeapon ? WEAPON_KIND[heroWeapon] : null);
    // Titanenschlag: Die Aktion nach dem Ausholen macht mehr Schaden – das Ausholen ist damit verbraucht
    const charge = hero.effects.charged ?? 1;
    hero.effects.charged = undefined;
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
      hero.mana -= ability.manaCost;
      // Item-Effekt „Flinke Hand“: eine Runde kürzer abklingen
      used.set(hero.id, hasEffect(hero.itemEffects, "quickHands") ? { id: ability.id, cooldown: ability.cooldown - 1 } : ability);
      events.push({ type: "ability", heroId: hero.id, ability: ability.id, weapon: ability.weapon, manaCost: ability.manaCost });
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
      if (ability.manaGain) hero.mana = Math.min(hero.maxMana, hero.mana + ability.manaGain);
      if (ability.taunt) taunts.push(hero);
      // Zusatzeffekte wirken aufs Ziel – bei Flächenwirkung "all" auf alle Gegner
      for (const foe of aoe === "all" ? living() : [target]) {
        if (ability.weaken) foe.fx = { ...foe.fx, weaken: { percent: ability.weaken.percent, roundsLeft: ability.weaken.rounds } };
        if (ability.vulnerable) {
          foe.fx = { ...foe.fx, vulnerable: { percent: ability.vulnerable.percent, roundsLeft: ability.vulnerable.rounds } };
        }
        if (ability.armorBreak) foe.fx = { ...foe.fx, armorBreak: ability.armorBreak };
        if (stunLands(ability, rng)) stunAttempts.set(foe, ability);
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
    /** Ein Treffer des Helden – `share` < 1 bei Splash-Schaden auf Umstehende. */
    const strike = (foe: Foe, share = 1) => {
      // Finisher (Meucheln), Ausbluten und Verwundbarkeit des Gegners
      const execute =
        (ability?.execute && foe.c.hp < foe.c.maxHp * ability.execute.threshold ? ability.execute.factor : 1) *
        (ability?.bleedBonus && foe.fx.bleed ? 1 + ability.bleedBonus : 1);
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
        foeElite: foe === boss && (state.elite?.length ?? 0) > 0,
      });
      const critChance = strong.critChance + effectCritBonus(effects, foeBoss);
      const attacker: Combatant = ability
        ? {
            ...strong,
            damage: strong.damage * ability.multiplier * execute * charge * vulnerable * share * taken * kindFactor * itemFactor,
            critChance: ability.guaranteedCrit ? 1 : critChance,
          }
        : { ...strong, damage: strong.damage * charge * share * vulnerable * taken * kindFactor * itemFactor, critChance };
      const armor = ability?.ignoreArmor ? 0 : Math.round(foe.c.armor * (1 - (foe.fx.armorBreak ?? 0)));
      const hit = rollHit(attacker, { ...foe.c, armor }, rng);
      dealt += Math.min(foe.c.hp, hit.damage);
      foe.c.hp = Math.max(0, foe.c.hp - hit.damage);
      hero.threat += hit.damage * threatFactor;
      events.push({
        type: "hit",
        attacker: hero.id,
        target: foe.id,
        ...hit,
        ...(ability && { weapon: ability.weapon, ability: ability.id }),
        ...(taken < 1 && { shielded: true }),
        ...((matchup === "weak" || matchup === "resist") && { matchup }),
      });
      // Plünderer: kritische Treffer lassen bluten
      if (hit.crit && hero.heroClass === "plunderer" && foe.c.hp > 0) {
        const damage = strong.damage * PLUNDERER_BLEED.percent * matchupFactor(foe.creatureId, "bleed");
        if (damage > 0 && (foe.fx.bleed?.damage ?? 0) <= damage) {
          applyDot(foe, "bleed", strong.damage * PLUNDERER_BLEED.percent, PLUNDERER_BLEED.rounds, hero.id);
        }
      }
      // Item-Effekte bei einem Treffer: Glut/Drachenfeuer, Giftzahn, Frostbiss, Manadieb
      if (foe.c.hp > 0) {
        if (hit.crit && critBurns(effects)) applyDot(foe, "burn", strong.damage * EFFECT.ember.percent, EFFECT.ember.rounds, hero.id);
        if (hasEffect(effects, "venomFang") && rng() < EFFECT.venomFang.chance) {
          applyDot(foe, "poison", strong.damage * EFFECT.venomFang.percent, EFFECT.venomFang.rounds, hero.id);
        }
        if (hasEffect(effects, "frostBite") && rng() < EFFECT.frostBite) frozenByItem.add(foe);
      }
      if (hasEffect(effects, "manaThief")) hero.mana = Math.min(hero.maxMana, hero.mana + EFFECT.manaThief);
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
    if (!ability && hero.heroClass === "duelist" && target.c.hp > 0 && boss.c.hp > 0 && rng() < DUELIST_EXTRA_HIT) strike(target);
    // Item-Effekt „Kettenblitz“: Ein normaler Angriff springt auf einen zweiten Gegner über
    if (!ability && hasEffect(hero.itemEffects, "chainLightning") && boss.c.hp > 0 && rng() < EFFECT.chainLightning.chance) {
      const others = living().filter((f) => f !== target);
      if (others.length > 0) strike(others[Math.floor(rng() * others.length)], EFFECT.chainLightning.share);
    }
    // Lebensraub: Blutrausch, Plünderer und Item-Effekt „Seelenraub“
    const lifesteal = lifestealShare(hero.heroClass, ability) + (hasEffect(hero.itemEffects, "soulDrain") ? EFFECT.soulDrain : 0);
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
      foe.fx = { ...foe.fx, [kind]: effect.roundsLeft > 1 ? { ...effect, roundsLeft: effect.roundsLeft - 1 } : undefined };
      addDown(foe);
    }
  }
  if (boss.c.hp > 0) {
    for (const hero of heroes) {
      for (const kind of OVER_TIME) {
        const effect = hero.effects[kind];
        if (!effect || hero.down) continue;
        hero.combatant.hp = Math.max(0, hero.combatant.hp - effect.damage);
        events.push({ type: kind, target: hero.id, damage: effect.damage });
        hero.effects[kind] = effect.roundsLeft > 1 ? { ...effect, roundsLeft: effect.roundsLeft - 1 } : undefined;
        knockDown(hero);
      }
    }
  }

  // 3. Gegnerphase: erst der Boss, dann die Begleiter
  let status: CoopStatus = "active";
  const elite = state.elite ?? [];
  /** Wie Gruppen-Fähigkeiten: Was alle trifft, trifft jeden mit dem Schaden wie solo (ohne Gruppenzuschlag) */
  const soloScale = 1 + DUNGEON_COOP_DAMAGE_STEP * (heroes.length - 1);
  /** Schildwall/Wutschrei: Faktor auf den Schaden, den ein Held erleidet */
  const hurt = (hero: CoopHero) => Math.max(0, 1 + (hero.effects.damageTaken?.percent ?? 0));
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
      if (stunned) foe.fx = { ...foe.fx, stunImmunity: freshStunImmunity() };
      const tag = foe === boss ? {} : { add: foe.id };
      events.push({ type: stunned ? "stunned" : "stunResisted", ...(frozen ? { freeze: true as const } : freezeFlag(attempt!)), ...tag });
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
    // Trommler: Der Boss macht mehr Schaden, solange einer steht
    const drums = bossDamageDealtFactor(roleHolders());
    if (!stunnedNow(boss)) {
      const enemy = getCoopEnemy(state.bossId);
      const special = abilityForRound(enemy.abilities, state.round);
      if (special) events.push({ type: "bossAbility", bossId: enemy.id, abilityId: special.id ?? enemy.id, name: special.name });
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
          events.push({ type: "blocked", heroId: target.id });
          continue;
        }
        const defender = special?.ignoreArmor ? { ...buffed(target), armor: 0 } : buffed(target);
        // Item-Effekt „Standhaft“: Boss-Fähigkeiten treffen schwächer
        const attackerFor = {
          ...attacker,
          damage: attacker.damage * hurt(target) * (special && hasEffect(target.itemEffects, "steadfast") ? 1 - EFFECT.steadfast : 1),
        };
        let taken = 0;
        for (let i = 0; i < (special?.hits ?? (swift ? 2 : 1)) && target.combatant.hp > 0; i++) {
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
      }
      if (special?.freeze) {
        const frozen = pickBossTarget(heroes, rng);
        if (frozen) {
          frozen.effects.frozen = true;
          events.push({ type: "frozen", heroId: frozen.id });
        }
      }
    }
    // Begleiter: je ein normaler Angriff auf ein Ziel nach Bedrohung, solange der Boss steht – Heiler heilen stattdessen den Boss
    for (const add of adds) {
      if (add.c.hp <= 0 || boss.c.hp <= 0 || heroes.every((h) => h.down) || stunnedNow(add)) continue;
      if (add.role === "healer") {
        const heal = Math.min(boss.c.maxHp - boss.c.hp, Math.round(boss.c.maxHp * HEALER_HEAL));
        boss.c.hp += heal;
        if (heal > 0) events.push({ type: "addHeal", add: add.id, heal });
        continue;
      }
      const target = pickBossTarget(heroes, rng)!;
      if (target.effects.bulwark) {
        shielded.add(target);
        events.push({ type: "blocked", heroId: target.id, add: add.id });
        continue;
      }
      const hit = rollHit({ ...add.c, damage: add.c.damage * (1 - (add.fx.weaken?.percent ?? 0)) * hurt(target) }, buffed(target), rng);
      target.combatant.hp = Math.max(0, target.combatant.hp - hit.damage);
      events.push({ type: "hit", attacker: add.id, target: target.id, ...hit });
      thorns(target, add, hit.damage);
      knockDown(target);
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
  if (status === "active" && elite.includes("regenerating") && !burning) {
    const heal = Math.min(boss.c.maxHp - boss.c.hp, Math.round(boss.c.maxHp * REGEN_SHARE));
    if (heal > 0) {
      boss.c.hp += heal;
      events.push({ type: "enemyRegen", heal });
    }
  }

  // Kleriker: Regeneration am Ende der Runde
  if (status === "active") {
    for (const hero of heroes) {
      // Kleriker, Item-Effekt „Lebensquell“ und Arkane Heilung
      const regen =
        (hero.heroClass === "cleric" ? CLERIC_REGEN : 0) +
        (hasEffect(hero.itemEffects, "wellspring") ? EFFECT.wellspring : 0) +
        (hero.effects.renew?.percent ?? 0);
      if (hero.down || regen <= 0) continue;
      const heal = Math.min(hero.combatant.maxHp - hero.combatant.hp, Math.round(hero.combatant.maxHp * regen));
      if (heal > 0) {
        hero.combatant.hp += heal;
        events.push({ type: "regen", heroId: hero.id, heal });
      }
    }
  }

  // 4. Mana, Verstärkungen und abklingende Bedrohung
  const tick = (b: ActiveBuff | undefined) => (b && b.roundsLeft > 1 ? { ...b, roundsLeft: b.roundsLeft - 1 } : undefined);
  heroes = heroes.map((h) => ({
    ...h,
    effects: { ...h.effects, empower: tick(h.effects.empower), damageTaken: tick(h.effects.damageTaken), renew: tick(h.effects.renew) },
    cooldowns: tickCooldowns(h.cooldowns, used.get(h.id) ?? null),
    threat: Math.round(h.threat * (1 - THREAT_DECAY)),
    mana: h.down ? h.mana : Math.min(h.maxMana, h.mana + MANA_REGEN),
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
      ...(state.adds && {
        adds: state.adds.map((a, i) => ({ ...a, combatant: adds[i].c, effects: tickEnemyEffects(adds[i].fx) })),
      }),
      ...(phase && { phase }),
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

/** Die Fähigkeit, die der Gegner in dieser Runde einsetzt – oder null (für die Ankündigung). */
export function coopAbilityDue(state: CoopBattleState): CoopBossAbility | null {
  return abilityForRound(getCoopEnemy(state.bossId).abilities, state.round);
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
