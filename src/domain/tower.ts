// Endlos-Turm (docs/endlos-turm.md): Stockwerk für Stockwerk stärkere Gegner auf
// dem Level des Helden, alle 5 Stockwerke ein Boss, alle 3 ein Segen zur Wahl.
// Reine Logik – der Lauf selbst steht im Store (`tower`), gekämpft wird mit combat.ts.

import { AREAS, DUNGEONS, type CreatureDef } from "./creatures";
import { ELITE_AFFIXES, type EliteAffix } from "./elites";
import { hash, seededRng } from "./random";
import type { BattleReward } from "./combat";

/** Ab diesem Level ist der Turm offen. */
export const TOWER_MIN_LEVEL = 10;
/** Jedes so-vielte Stockwerk ist ein Boss. */
export const BOSS_EVERY = 5;
/**
 * Bosse sind auf einen Kampf mit vollen Lebenspunkten ausgelegt – im Turm kommt man angeschlagen an.
 * Darum kämpfen sie mit diesem Anteil der Stockwerk-Stärke.
 */
export const BOSS_FLOOR_FACTOR = 0.45;
/** Nach jedem so-vielten Stockwerk gibt es einen Segen zur Wahl. */
export const BLESSING_EVERY = 3;
/** So viele Segen stehen zur Wahl. */
export const BLESSING_CHOICES = 3;

/**
 * Stärke eines Stockwerks: Faktor auf Lebenspunkte und Schaden des Gegners (wirkt also
 * doppelt). Das erste Stockwerk ist etwas leichter als eine normale Kreatur gleichen Levels.
 */
export function floorPower(floor: number): number {
  return 0.85 + 0.04 * (floor - 1);
}

export const isBossFloor = (floor: number) => floor % BOSS_EVERY === 0;
export const isBlessingFloor = (floor: number) => floor % BLESSING_EVERY === 0;

const NORMAL_POOL: readonly CreatureDef[] = [...AREAS, ...DUNGEONS].flatMap((a) => a.creatures.filter((c) => !c.boss));
const BOSS_POOL: readonly CreatureDef[] = [...AREAS, ...DUNGEONS].flatMap((a) => a.creatures.filter((c) => c.boss));

/** Zufall eines Laufs für ein Stockwerk – gleich beim Neuladen der Seite (Startwert aus Lauf und Stockwerk). */
const floorRng = (seed: string, floor: number, what: string) => seededRng(hash(`${seed}|${floor}|${what}`));

/**
 * Gegner eines Stockwerks: eine zufällige Kreatur (bzw. ein Boss) auf dem Level des Helden,
 * Lebenspunkte und Schaden mit der Stärke des Stockwerks.
 */
export function floorCreature(seed: string, floor: number, heroLevel: number): CreatureDef {
  const pool = isBossFloor(floor) ? BOSS_POOL : NORMAL_POOL;
  const base = pool[Math.floor(floorRng(seed, floor, "creature")() * pool.length)];
  const power = floorPower(floor) * (isBossFloor(floor) ? BOSS_FLOOR_FACTOR : 1);
  return { ...base, level: heroLevel, power: (base.power ?? 1) * power };
}

/** Elite-Chance eines Stockwerks: steigt mit der Höhe (Bosse sind nie Elite). */
export function floorEliteChance(floor: number): number {
  return Math.min(0.8, 0.1 + 0.03 * floor);
}

/** Höchstzahl der Modifikatoren eines Elite-Gegners: ab Stockwerk 10 zwei, ab 20 drei. */
export function floorEliteMax(floor: number): number {
  return floor >= 20 ? 3 : floor >= 10 ? 2 : 1;
}

/** Elite-Modifikatoren des Gegners auf diesem Stockwerk – leer bei gewöhnlichen Gegnern und Bossen. */
export function floorElite(seed: string, floor: number): EliteAffix[] {
  if (isBossFloor(floor)) return [];
  const rng = floorRng(seed, floor, "elite");
  if (rng() >= floorEliteChance(floor)) return [];
  const count = 1 + Math.floor(rng() * floorEliteMax(floor));
  const pool = ELITE_AFFIXES.map((a) => a.id);
  const picked: EliteAffix[] = [];
  while (picked.length < count) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return picked;
}

/** Bonus auf Erfahrung und Gold pro Stockwerk – je höher, desto mehr lohnt sich das Risiko. */
export function floorRewardFactor(floor: number): number {
  return 1 + 0.05 * (floor - 1);
}

/**
 * Der Turm ist für die Rangliste da, nicht zum Farmen: Erfahrung und Gold nur ein Bruchteil eines
 * normalen Kampfes, Items und Tränke fast nur von Bossen (Elite-Gegner manchmal), keine
 * Verstärkungstränke und keine Boss-Items.
 */
export const TOWER_REWARD = { xp: 0.25, gold: 0.3, eliteItemChance: 0.2 };

/** Belohnung eines Stockwerks aus der normalen Kampfbeute (`rollBattleReward`) – deutlich gekürzt. */
export function towerReward(
  reward: BattleReward,
  floor: number,
  blessings: readonly BlessingId[],
  elite: boolean,
  rng: () => number = Math.random,
): BattleReward {
  const factor = floorRewardFactor(floor) * (1 + BLESSING.treasure * stacks(blessings, "treasure"));
  const boss = isBossFloor(floor);
  return {
    xp: Math.max(1, Math.round(reward.xp * TOWER_REWARD.xp * factor)),
    gold: Math.round(reward.gold * TOWER_REWARD.gold * factor),
    loot: boss || (elite && rng() < TOWER_REWARD.eliteItemChance) ? reward.loot : null,
    potions: boss ? reward.potions : null,
    bossLoot: null,
    buffPotion: null,
    // Baumaterial wie bei jedem Sieg – passend zum Level des Gegners
    materials: reward.materials,
  };
}

/* ───────────── Segen ───────────── */

export type BlessingId =
  | "might"
  | "ancestors"
  | "vitality"
  | "rest"
  | "precision"
  | "focus"
  | "bloodthirst"
  | "executioner"
  | "thorns"
  | "alchemy"
  | "treasure"
  | "secondWind";

export interface BlessingDef {
  id: BlessingId;
  name: string;
  icon: string;
  description: string;
  /** Nur einmal pro Lauf wählbar */
  once?: boolean;
}

/** Zahlen der Segen – pro Stapel. */
export const BLESSING = {
  might: 0.15,
  ancestors: 0.2,
  vitality: 0.15,
  rest: 0.4,
  precision: 0.08,
  focus: 0.25,
  bloodthirst: 0.08,
  executioner: { threshold: 0.3, bonus: 0.4 },
  thorns: 0.2,
  alchemy: 0.5,
  treasure: 0.25,
  secondWind: 0.3,
} as const;

const pct = (v: number) => `${Math.round(v * 100)} %`;

export const BLESSINGS: readonly BlessingDef[] = [
  { id: "might", name: "Kraft", icon: "⚔️", description: `+${pct(BLESSING.might)} Schaden.` },
  { id: "ancestors", name: "Bollwerk der Ahnen", icon: "🛡️", description: `+${pct(BLESSING.ancestors)} Rüstung.` },
  { id: "vitality", name: "Vitalität", icon: "❤️", description: `+${pct(BLESSING.vitality)} maximale Lebenspunkte – und sofort um so viel geheilt.` },
  { id: "rest", name: "Rast", icon: "🏕️", description: `Heilt sofort ${pct(BLESSING.rest)} deiner Lebenspunkte.` },
  { id: "precision", name: "Präzision", icon: "🎯", description: `+${pct(BLESSING.precision)} kritische Trefferchance.` },
  { id: "focus", name: "Fokus", icon: "💧", description: `Fähigkeiten kosten ${pct(BLESSING.focus)} weniger Mana.` },
  { id: "bloodthirst", name: "Blutdurst", icon: "🧛", description: `Heilt dich um ${pct(BLESSING.bloodthirst)} des Schadens, den du machst.` },
  {
    id: "executioner",
    name: "Henker",
    icon: "🪓",
    description: `+${pct(BLESSING.executioner.bonus)} Schaden gegen Gegner unter ${pct(BLESSING.executioner.threshold)} Lebenspunkten.`,
  },
  { id: "thorns", name: "Dornen", icon: "🌵", description: `Wirft ${pct(BLESSING.thorns)} des Schadens zurück, den dir Gegner zufügen.` },
  { id: "alchemy", name: "Alchemie", icon: "⚗️", description: `Heiltränke heilen ${pct(BLESSING.alchemy)} mehr.` },
  { id: "treasure", name: "Schatzsucher", icon: "💰", description: `+${pct(BLESSING.treasure)} Erfahrung und Gold für die Truhe.` },
  {
    id: "secondWind",
    name: "Zweiter Atem",
    icon: "🕊️",
    description: `Fällst du, stehst du einmal mit ${pct(BLESSING.secondWind)} deiner Lebenspunkte wieder auf.`,
    once: true,
  },
];

export function getBlessing(id: BlessingId): BlessingDef {
  const def = BLESSINGS.find((b) => b.id === id);
  if (!def) throw new Error(`Unbekannter Segen: ${id}`);
  return def;
}

/** Wie oft ein Segen gewählt wurde. */
export const stacks = (blessings: readonly BlessingId[] | undefined, id: BlessingId) => (blessings ?? []).filter((b) => b === id).length;

/** Drei (mit „Turmläufer“ vier) verschiedene Segen zur Wahl nach diesem Stockwerk – einmalige nur, wenn noch nicht gewählt. */
export function blessingOffer(seed: string, floor: number, taken: readonly BlessingId[], count = BLESSING_CHOICES): BlessingId[] {
  const rng = floorRng(seed, floor, "blessing");
  const pool = BLESSINGS.filter((b) => !(b.once && taken.includes(b.id))).map((b) => b.id);
  const offer: BlessingId[] = [];
  while (offer.length < count && pool.length > 0) offer.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return offer;
}

/** Kampfwerte mit den Segen: Kraft, Ahnen, Vitalität und Präzision wirken auf das Profil. */
export function blessedProfile<T extends { damage: number; armor: number; maxHp: number; critChance: number }>(
  profile: T,
  blessings: readonly BlessingId[],
): T {
  return {
    ...profile,
    damage: profile.damage * (1 + BLESSING.might * stacks(blessings, "might")),
    armor: Math.round(profile.armor * (1 + BLESSING.ancestors * stacks(blessings, "ancestors"))),
    maxHp: Math.round(profile.maxHp * (1 + BLESSING.vitality * stacks(blessings, "vitality"))),
    critChance: profile.critChance + BLESSING.precision * stacks(blessings, "precision"),
  };
}

/* ───────────── Rekorde ───────────── */

/** Kalenderwoche nach ISO 8601 („2026-W44“) – die Turm-Rangliste beginnt jeden Montag neu. */
export function isoWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Turm-Rekorde im Spielstand und im öffentlichen Profil. */
export interface TowerRecord {
  /** Höchstes geschafftes Stockwerk aller Zeiten */
  best: number;
  /** Höchstes geschafftes Stockwerk in der Woche `week` */
  weekBest: number;
  week: string;
}

export const EMPTY_TOWER_RECORD: TowerRecord = { best: 0, weekBest: 0, week: "" };

/** Ein geschafftes Stockwerk eintragen – eine neue Woche beginnt bei 0. */
export function recordFloor(record: TowerRecord, floor: number, week: string = isoWeek()): TowerRecord {
  const weekBest = record.week === week ? Math.max(record.weekBest, floor) : floor;
  return { best: Math.max(record.best, floor), weekBest, week };
}

/** Bestes Stockwerk dieser Woche (0, wenn der Rekord aus einer älteren Woche stammt). */
export const weekBest = (record: TowerRecord, week: string = isoWeek()) => (record.week === week ? record.weekBest : 0);
