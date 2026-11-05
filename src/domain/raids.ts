// Überfälle aufs Dorf (docs/ueberfaelle.md): Sobald drei Gebäude stehen, kündigt
// sich alle ein bis zwei Tage eine Bande an. Bis zur Frist kann man das Dorf
// verteidigen – mehrere Wellen und ein Anführer, ohne Heilung dazwischen. Wer
// verliert oder die Frist verpasst, bekommt ein beschädigtes Gebäude (es wirkt eine
// Stufe tiefer, bis es repariert ist) oder ein geplündertes Lager. Die Wehranlage
// schwächt die Angreifer, Begleiter im Dorf stehen Wache. Reine Logik ohne UI, der
// Zufall kommt über `rng` herein; Gegner und Elite würfelt ein Startwert pro Überfall.

import type { BattleReward } from "./combat";
import { AREAS, getCreatureXp, type CreatureDef } from "./creatures";
import { rollElite, type EliteAffix } from "./elites";
import { rollDrop } from "./loot";
import { BOSS_WEIGHTS } from "./quests";
import { hash, seededRng } from "./random";
import {
  BUILDINGS,
  buildingsAtLeast,
  getBuilding,
  materialForLevel,
  missingForBuild,
  type BuildCost,
  type BuildingId,
  type BuildingTier,
  type MaterialId,
  type MaterialStock,
  type Village,
} from "./village";

/* ───────────── Banden ───────────── */

export interface RaidBandDef {
  /** Gebiet, aus dem die Angreifer kommen */
  areaId: string;
  name: string;
  /** „zieht aufs Dorf zu“ – passt zum Namen (Einzahl) */
  approach: string;
}

/** Eine Bande pro Gebiet – sie kommt aus dem Gebiet, zu dem das Level des Helden gehört. */
export const RAID_BANDS: readonly RaidBandDef[] = [
  { areaId: "darkwood", name: "Goblin-Bande", approach: "Eine Goblin-Bande zieht aus dem Düsterwald heran." },
  { areaId: "mistmarsh", name: "Sumpfbrut", approach: "Aus den Nebelsümpfen kriecht die Sumpfbrut aufs Dorf zu." },
  { areaId: "crystal-caves", name: "Höhlenbrut", approach: "Die Höhlenbrut ist aus den Kristallhöhlen gekrochen." },
  { areaId: "frost-peaks", name: "Frostrudel", approach: "Ein Frostrudel kommt von den Gipfeln herunter." },
  { areaId: "shadow-ruins", name: "Untote Horde", approach: "Eine untote Horde wankt aus den Schattenruinen heran." },
  { areaId: "dragon-hoard", name: "Drachenbrut", approach: "Die Drachenbrut hat das Dorf vom Hort aus entdeckt." },
];

export function getBand(areaId: string): RaidBandDef {
  const band = RAID_BANDS.find((b) => b.areaId === areaId);
  if (!band) throw new Error(`Keine Bande für das Gebiet ${areaId}`);
  return band;
}

/* ───────────── Zahlen ───────────── */

/** Überfälle gibt es erst, wenn so viele Gebäude mindestens auf Stufe 1 stehen. */
export const RAID_MIN_BUILDINGS = 3;
/** So lange vor dem Angriff kündigt sich die Bande an – bis dahin kann man verteidigen. */
export const RAID_WARNING_MS = 12 * 3_600_000;
/** Abstand vom Ende eines Überfalls bis zur nächsten Ankündigung. */
export const RAID_GAP_MS = { min: 24 * 3_600_000, max: 48 * 3_600_000 };
/** Wellen vor dem Anführer – der Wachturm hält eine davon auf. */
export const RAID_WAVES: Readonly<Record<BuildingTier, number>> = { 0: 3, 1: 3, 2: 2, 3: 2 };
/** Wehranlage: um so viel schwächer kommen die Angreifer an (Lebenspunkte und Schaden). */
export const WALL_WEAKEN: Readonly<Record<BuildingTier, number>> = { 0: 0, 1: 0.1, 2: 0.15, 3: 0.2 };
/** Jeder Begleiter im Dorf (nicht auf Mission) schwächt die Angreifer zusätzlich … */
export const GUARD_WEAKEN = 0.04;
/** … höchstens so viele zählen. */
export const MAX_GUARDS = 3;
/**
 * Grundstärke der Angreifer: etwas schwächer als eine Kreatur gleichen Levels, denn um einen
 * Überfall kommt man nicht herum. Per Simulation (combat.test.ts) so gewählt, dass ein gut
 * gespielter Held mit seltener Ausrüstung und Heiltränken ihn auch ohne Wehranlage meistens abwehrt.
 */
export const RAID_BASE_POWER = 0.9;
/** Der Anführer ist stärker als seine Bande und immer Elite mit zwei Modifikatoren. */
export const LEADER_POWER = 1.1;
/** Reparieren kostet diesen Anteil der Baukosten der Stufe. */
export const REPAIR_SHARE = 0.25;
/** Ohne beschädigbares Gebäude plündern die Angreifer das Lager. */
export const PLUNDER = { gold: 0.1, materials: 0.2 };
/** Beute der Bande nach dem Sieg: so viel wie diese Anzahl Siege, dazu Material und ein Item. */
export const RAID_BOUNTY = { wins: 10, materials: 5 };

/* ───────────── Zustand ───────────── */

/** Eine angekündigte Bande. */
export interface Raid {
  /** Startwert für Gegner und Elite – gleich nach dem Neuladen */
  id: string;
  areaId: string;
  /** Level der Angreifer: das Level des Helden bei der Ankündigung */
  level: number;
  announcedAt: number;
  /** Frist: Danach greift die Bande an */
  attackAt: number;
}

/** Wie der letzte Überfall ausging – das Dorf zeigt es, bis man es gelesen hat. */
export type RaidReport =
  | { kind: "defended"; areaId: string }
  /** Verloren oder Frist verpasst: ein Gebäude beschädigt (`building`) oder das Lager geplündert */
  | { kind: "lost" | "missed"; areaId: string; building: BuildingId | null; gold: number; materials: MaterialStock }
  /** Festung: Die Wachen haben den Angriff aufgehalten */
  | { kind: "repelled"; areaId: string };

export interface RaidState {
  current: Raid | null;
  /** Ab diesem Zeitpunkt kündigt sich die nächste Bande an (0: sobald Überfälle freigeschaltet sind) */
  next: number;
  /** Beschädigte Gebäude – sie wirken eine Stufe tiefer, bis sie repariert sind */
  damaged: BuildingId[];
  report: RaidReport | null;
}

export const EMPTY_RAIDS: RaidState = { current: null, next: 0, damaged: [], report: null };

/** Gibt es schon Überfälle? Erst ab drei gebauten Gebäuden – vorher gibt es nichts zu holen. */
export function raidsUnlocked(village: Village): boolean {
  return buildingsAtLeast(village, 1) >= RAID_MIN_BUILDINGS;
}

/** Gebiet der Bande: das, zu dem das Level gehört (darüber das letzte). */
export function raidArea(level: number): string {
  return (AREAS.find((a) => level <= a.maxLevel) ?? AREAS[AREAS.length - 1]).id;
}

export function announceRaid(id: string, level: number, now: number): Raid {
  return { id, areaId: raidArea(level), level, announcedAt: now, attackAt: now + RAID_WARNING_MS };
}

const nextGap = (rng: () => number) => RAID_GAP_MS.min + Math.floor(rng() * (RAID_GAP_MS.max - RAID_GAP_MS.min));

/* ───────────── Gegner ───────────── */

/** Kämpfe eines Überfalls: die Wellen und am Ende der Anführer. */
export function raidFights(walls: BuildingTier): number {
  return RAID_WAVES[walls] + 1;
}

/** Faktor auf Lebenspunkte und Schaden der Angreifer – Wehranlage und Wachen. */
export function raidPower(walls: BuildingTier, guards: number): number {
  return RAID_BASE_POWER * (1 - WALL_WEAKEN[walls]) * (1 - GUARD_WEAKEN * Math.min(guards, MAX_GUARDS));
}

export interface RaidFight {
  creature: CreatureDef;
  elite: EliteAffix[];
  leader: boolean;
}

/**
 * Gegner eines Überfalls: zufällige Kreaturen des Gebiets auf dem Level der Bande, am
 * Ende der stärkste gewöhnliche Gegner des Gebiets als Anführer (Elite mit zwei
 * Modifikatoren). Startwert aus dem Überfall – beim Neuladen dieselben Gegner.
 */
export function raidLineup(raid: Raid, walls: BuildingTier, guards: number): RaidFight[] {
  const area = AREAS.find((a) => a.id === raid.areaId)!;
  const mobs = area.creatures.filter((c) => !c.boss);
  const power = raidPower(walls, guards);
  const rng = seededRng(hash(`raid|${raid.id}`));
  const waves = Array.from({ length: RAID_WAVES[walls] }, () => {
    const base = mobs[Math.floor(rng() * mobs.length)];
    const creature: CreatureDef = { ...base, level: raid.level, power: (base.power ?? 1) * power };
    return { creature, elite: rollElite(creature, rng), leader: false };
  });
  const strongest = mobs[mobs.length - 1];
  const leader: CreatureDef = { ...strongest, level: raid.level, power: (strongest.power ?? 1) * power * LEADER_POWER, midBoss: true };
  return [...waves, { creature: leader, elite: rollElite(leader, rng), leader: true }];
}

/** Beute der Bande nach dem Sieg über den Anführer – kommt zur Beute der Kämpfe in die Truhe. */
export function raidBounty(raid: Raid, heroLevel: number, uid: string, rng: () => number = Math.random): BattleReward {
  const sample = { ...AREAS.find((a) => a.id === raid.areaId)!.creatures[0], level: raid.level };
  return {
    xp: getCreatureXp(sample, heroLevel) * RAID_BOUNTY.wins,
    gold: (3 + raid.level) * RAID_BOUNTY.wins,
    loot: rollDrop(1, BOSS_WEIGHTS, heroLevel, uid, rng),
    bossLoot: null,
    potions: null,
    buffPotion: null,
    materials: { [materialForLevel(raid.level)]: RAID_BOUNTY.materials },
  };
}

/* ───────────── Ausgang ───────────── */

export interface RaidChange {
  raids: RaidState;
  gold: number;
  materials: MaterialStock;
}

/** Gebäude, die ein Überfall beschädigen kann: ab Stufe 2, nicht schon beschädigt, nicht die Wehranlage. */
export function damageable(village: Village, damaged: readonly BuildingId[]): BuildingId[] {
  return BUILDINGS.filter((b) => b.id !== "walls" && village[b.id] >= 2 && !damaged.includes(b.id)).map((b) => b.id);
}

/** Erfolgreich verteidigt: Bericht, und die nächste Bande kommt in ein bis zwei Tagen. */
export function defendRaid(raids: RaidState, now: number, rng: () => number = Math.random): RaidState {
  if (!raids.current) throw new Error("Gerade greift niemand an.");
  return { ...raids, current: null, next: now + nextGap(rng), report: { kind: "defended", areaId: raids.current.areaId } };
}

/**
 * Verloren oder Frist verpasst: Ein zufälliges Gebäude ab Stufe 2 wird beschädigt. Gibt es keines,
 * plündert die Bande das Lager (10 % Gold, 20 % jedes Materials). Eine Festung hält jeden Angriff auf.
 */
export function failRaid(
  raids: RaidState,
  kind: "lost" | "missed",
  village: Village,
  gold: number,
  materials: MaterialStock,
  now: number,
  rng: () => number = Math.random,
): RaidChange {
  const raid = raids.current;
  if (!raid) throw new Error("Gerade greift niemand an.");
  const next = { ...raids, current: null, next: now + nextGap(rng) };
  if (village.walls >= 3) return { raids: { ...next, report: { kind: "repelled", areaId: raid.areaId } }, gold, materials };
  const candidates = damageable(village, raids.damaged);
  if (candidates.length > 0) {
    const building = candidates[Math.floor(rng() * candidates.length)];
    return {
      raids: { ...next, damaged: [...raids.damaged, building], report: { kind, areaId: raid.areaId, building, gold: 0, materials: {} } },
      gold,
      materials,
    };
  }
  const stolenGold = Math.floor(gold * PLUNDER.gold);
  const stolen: MaterialStock = {};
  const rest: MaterialStock = { ...materials };
  for (const [id, count] of Object.entries(materials) as [MaterialId, number][]) {
    const take = Math.floor(count * PLUNDER.materials);
    if (take <= 0) continue;
    stolen[id] = take;
    rest[id] = count - take;
  }
  return {
    raids: { ...next, report: { kind, areaId: raid.areaId, building: null, gold: stolenGold, materials: stolen } },
    gold: gold - stolenGold,
    materials: rest,
  };
}

/**
 * Lässt Banden kommen und angreifen: Ist die Frist verstrichen (und man kämpft gerade nicht
 * gegen sie), greift die Bande an wie bei einer Niederlage. Danach – oder wenn noch keine
 * Bande da ist – kündigt sich zur Zeit `next` die nächste an. War man lange weg, trifft es
 * höchstens einen Angriff: Die nächste Bande kündigt sich erst an, wenn man wieder da ist.
 */
export function refreshRaids(
  raids: RaidState,
  ctx: { village: Village; heroLevel: number; gold: number; materials: MaterialStock; now: number; fighting: boolean },
  newId: () => string,
  rng: () => number = Math.random,
): RaidChange {
  const { village, heroLevel, now } = ctx;
  let change: RaidChange = { raids, gold: ctx.gold, materials: ctx.materials };
  if (raids.current && now >= raids.current.attackAt && !ctx.fighting) {
    change = failRaid(raids, "missed", village, ctx.gold, ctx.materials, now, rng);
  }
  const state = change.raids;
  if (state.current || !raidsUnlocked(village)) return change;
  // Nach einem Angriff liegt `next` in der Zukunft – die nächste Bande kommt frühestens dann
  if (now < state.next) return change;
  return { ...change, raids: { ...state, current: announceRaid(newId(), heroLevel, now) } };
}

/* ───────────── Schaden und Reparatur ───────────── */

/** Ausbaustufen, wie sie gerade wirken: Beschädigte Gebäude eine Stufe tiefer. */
export function effectiveVillage(village: Village, damaged: readonly BuildingId[]): Village {
  if (damaged.length === 0) return village;
  const result = { ...village };
  for (const id of damaged) result[id] = Math.max(0, village[id] - 1) as BuildingTier;
  return result;
}

/** Reparatur: ein Viertel der Baukosten der aktuellen Stufe (aufgerundet). */
export function repairCost(village: Village, id: BuildingId): BuildCost {
  const cost = getBuilding(id).tiers[village[id]].cost;
  if (!cost) throw new Error("Hier gibt es nichts zu reparieren.");
  return {
    gold: Math.ceil(cost.gold * REPAIR_SHARE),
    materials: Object.fromEntries(Object.entries(cost.materials).map(([m, n]) => [m, Math.ceil(n * REPAIR_SHARE)])),
  };
}

export function repair(
  raids: RaidState,
  village: Village,
  id: BuildingId,
  gold: number,
  materials: MaterialStock,
): RaidChange {
  if (!raids.damaged.includes(id)) throw new Error(`${getBuilding(id).name} ist nicht beschädigt.`);
  const cost = repairCost(village, id);
  const missing = missingForBuild(cost, gold, materials);
  if (missing.gold > 0) throw new Error("Nicht genug Gold.");
  if (Object.keys(missing.materials).length > 0) throw new Error("Nicht genug Material.");
  const rest = { ...materials };
  for (const [m, need] of Object.entries(cost.materials) as [MaterialId, number][]) rest[m] = (rest[m] ?? 0) - need;
  return { raids: { ...raids, damaged: raids.damaged.filter((d) => d !== id) }, gold: gold - cost.gold, materials: rest };
}

/** Wer ausbaut, repariert gleich mit: Die neue Stufe ist heil. */
export function repairedByBuild(raids: RaidState, id: BuildingId): RaidState {
  return raids.damaged.includes(id) ? { ...raids, damaged: raids.damaged.filter((d) => d !== id) } : raids;
}
