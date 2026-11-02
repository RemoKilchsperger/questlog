// Begleiter und Missionen (docs/begleiter.md): In der Taverne wirbt man Begleiter
// an, rüstet sie mit Items aus dem Inventar aus und schickt sie auf Missionen, die
// in Echtzeit laufen. Ob eine Mission gelingt, hängt vom Gearscore ab. Traits geben
// mehr Beute, EP, Gearscore oder kürzere Missionen. Begleiter kämpfen nicht mit.
// Der Zufall kommt über `rng` herein, das Ergebnis wird schon beim Losschicken
// ausgewürfelt – neu laden ändert also nichts.

import { AREAS } from "./creatures";
import { EMPTY_EQUIPMENT, equipItem, unequipItem } from "./equipment";
import { gearScore, itemScore } from "./gearScore";
import { ARMOR_SLOTS, getItem, getRarity } from "./items";
import { getLevel, MAX_LEVEL, totalXpForLevel, xpRewardBase } from "./leveling";
import { rollDrop, rollRarity } from "./loot";
import { BOSS_WEIGHTS, KILL_WEIGHTS } from "./quests";
import { materialForLevel, type BuildingTier, type MaterialStock } from "./village";
import type { EquipSlot, Equipment, OwnedItem, Rarity } from "./types";

/* ───────────── Traits ───────────── */

export type TraitId = "treasure" | "gatherer" | "essence" | "plunder" | "eager" | "mentor" | "veteran" | "lucky" | "swift";

export interface TraitDef {
  id: TraitId;
  name: string;
  icon: string;
  /** Wirkung pro Seltenheit – Anteile (0.1 = +10 %), bei Glückspilz Prozentpunkte */
  values: Record<Rarity, number>;
  /** „mehr Gold aus Missionen“ – steht hinter dem Wert */
  text: string;
}

export const TRAITS: readonly TraitDef[] = [
  { id: "treasure", name: "Schatzsucher", icon: "💰", values: { common: 0.1, rare: 0.2, epic: 0.3, legendary: 0.45 }, text: "Gold aus Missionen" },
  { id: "gatherer", name: "Sammler", icon: "🪵", values: { common: 0.1, rare: 0.2, epic: 0.3, legendary: 0.45 }, text: "Material aus Missionen" },
  { id: "essence", name: "Essenzgespür", icon: "✨", values: { common: 0.1, rare: 0.2, epic: 0.3, legendary: 0.45 }, text: "Essenz aus Missionen" },
  { id: "plunder", name: "Plünderer", icon: "🎁", values: { common: 0.1, rare: 0.2, epic: 0.35, legendary: 0.5 }, text: "Item-Chance" },
  { id: "eager", name: "Lernbegierig", icon: "📖", values: { common: 0.1, rare: 0.2, epic: 0.35, legendary: 0.5 }, text: "EP für sich selbst" },
  { id: "mentor", name: "Lehrmeister", icon: "🎓", values: { common: 0.05, rare: 0.1, epic: 0.15, legendary: 0.25 }, text: "EP für die anderen Begleiter der Mission" },
  { id: "veteran", name: "Kampferprobt", icon: "🛡️", values: { common: 0.03, rare: 0.06, epic: 0.1, legendary: 0.15 }, text: "Gearscore" },
  { id: "lucky", name: "Glückspilz", icon: "🍀", values: { common: 0.03, rare: 0.05, epic: 0.08, legendary: 0.12 }, text: "Erfolgschance" },
  { id: "swift", name: "Flink", icon: "🏃", values: { common: 0.1, rare: 0.15, epic: 0.2, legendary: 0.3 }, text: "Missionsdauer" },
];

export function getTrait(id: TraitId): TraitDef {
  const def = TRAITS.find((t) => t.id === id);
  if (!def) throw new Error(`Unbekannter Trait: ${id}`);
  return def;
}

export interface CompanionTrait {
  id: TraitId;
  rarity: Rarity;
}

/** „+20 % Gold aus Missionen“, „+5 Prozentpunkte Erfolgschance“, „−15 % Missionsdauer“ */
export function traitText(trait: CompanionTrait): string {
  const def = getTrait(trait.id);
  const value = Math.round(def.values[trait.rarity] * 100);
  if (trait.id === "lucky") return `+${value} Prozentpunkte ${def.text}`;
  if (trait.id === "swift") return `−${value} % ${def.text}`;
  return `+${value} % ${def.text}`;
}

/* ───────────── Begleiter ───────────── */

export interface Companion {
  id: string;
  name: string;
  /** Gesamt-EP – das Level wird daraus berechnet wie beim Helden */
  totalXp: number;
  traits: CompanionTrait[];
  /** Items aus dem Inventar des Helden – solange sie hier liegen, gehören sie dem Begleiter */
  equipment: Equipment;
}

export function companionLevel(companion: Companion): number {
  return getLevel(companion.totalXp);
}

/** Wert eines Traits für diesen Begleiter – 0, wenn er ihn nicht hat. */
export function traitValue(companion: Companion, id: TraitId): number {
  const trait = companion.traits.find((t) => t.id === id);
  return trait ? getTrait(id).values[trait.rarity] : 0;
}

/** Summe eines Traits über alle Begleiter einer Mission. */
function traitSum(companions: readonly Companion[], id: TraitId): number {
  return companions.reduce((sum, c) => sum + traitValue(c, id), 0);
}

/** Gearscore wie beim Helden, dazu „Kampferprobt“. */
export function companionGearScore(companion: Companion): number {
  return Math.round(gearScore(companion.equipment) * (1 + traitValue(companion, "veteran")));
}

/**
 * EP gutschreiben. Begleiter werden höchstens so stark wie der Held: Hat er
 * dessen Level erreicht, verfallen weitere EP.
 */
export function addCompanionXp(companion: Companion, xp: number, heroLevel: number): Companion {
  const cap = Math.max(companion.totalXp, totalXpForLevel(heroLevel));
  return { ...companion, totalXp: Math.min(cap, companion.totalXp + xp) };
}

/* ───────────── Taverne ───────────── */

export interface TavernRules {
  /** So viele Begleiter kann man haben */
  slots: number;
  /** Traits pro Kandidat … */
  traits: number;
  /** … und die Chance auf einen weiteren */
  extraTraitChance: number;
  /** Seltenheit der Traits */
  weights: Record<Rarity, number>;
}

export const TAVERN_RULES: Readonly<Record<BuildingTier, TavernRules>> = {
  0: { slots: 0, traits: 0, extraTraitChance: 0, weights: { common: 1, rare: 0, epic: 0, legendary: 0 } },
  1: { slots: 2, traits: 1, extraTraitChance: 0, weights: { common: 80, rare: 20, epic: 0, legendary: 0 } },
  2: { slots: 3, traits: 1, extraTraitChance: 0.5, weights: { common: 55, rare: 35, epic: 10, legendary: 0 } },
  3: { slots: 4, traits: 2, extraTraitChance: 0.3, weights: { common: 35, rare: 40, epic: 20, legendary: 5 } },
};

/** Kandidaten pro Tag in der Taverne. */
export const RECRUITS_PER_DAY = 3;
/** Neue Begleiter starten so viele Level unter dem Helden (mindestens Level 1). */
export const RECRUIT_LEVEL_GAP = 5;
/** Grundpreis auf Level 1 – steigt wie die Gerichte mit dem Level. */
export const RECRUIT_BASE_PRICE = 50;

const FIRST_NAMES = [
  "Alrik", "Brunhild", "Odo", "Ilsa", "Gero", "Hedda", "Wendelin", "Frieda", "Ansgar", "Merle",
  "Ulf", "Runa", "Bertram", "Gisela", "Egon", "Thea", "Leif", "Sigrun", "Konrad", "Ida",
  "Rupert", "Mechthild", "Falk", "Wiebke", "Arno", "Edda", "Hagen", "Linnea", "Quirin", "Rosalind",
  "Torben", "Ute", "Volker", "Yrsa", "Ewald", "Kunigunde", "Lorenz", "Swantje", "Gunnar", "Elfriede",
];

const EPITHETS = [
  "Eisenfaust", "Rotbart", "Sturmauge", "Flinkfuss", "Steinherz", "Graumantel", "Silberzunge", "Schattenschritt",
  "Krähenfeder", "Bärenpranke", "Langbogen", "Hammerhand", "Feuerhaar", "Nebelwanderer", "Wolfsbann", "Dornkrone",
  "Eichenschild", "Funkenschlag", "Frostbart", "Glücksklee", "Knochenbrecher", "Mondschein", "Rabenschwinge", "Donnerruf",
  "Kupferkessel", "Weitblick", "Sumpfläufer", "Sternenstaub", "Ackerfurche", "Pfeilspitze",
  "vom Moor", "vom Pass", "von der Klippe", "aus dem Tal", "vom Seeufer", "von Hohenfels", "aus Nebelheim",
  "vom Grauen Turm", "aus dem Düsterwald", "von den Frostgipfeln",
];

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

/** Zufälliger Name wie „Brunhild Eisenfaust“ – schon vergebene Namen werden neu gewürfelt. */
export function randomName(taken: readonly string[], rng: () => number = Math.random): string {
  let name = "";
  for (let attempt = 0; attempt < 50; attempt++) {
    name = `${pick(FIRST_NAMES, rng)} ${pick(EPITHETS, rng)}`;
    if (!taken.includes(name)) return name;
  }
  return name;
}

/** Würfelt die Traits eines Kandidaten – jeder Trait höchstens einmal. */
export function rollTraits(tier: BuildingTier, rng: () => number = Math.random): CompanionTrait[] {
  const rules = TAVERN_RULES[tier];
  const count = rules.traits + (rng() < rules.extraTraitChance ? 1 : 0);
  const pool = [...TRAITS];
  const traits: CompanionTrait[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const [def] = pool.splice(Math.floor(rng() * pool.length), 1);
    traits.push({ id: def.id, rarity: rollRarity(rules.weights, rng) });
  }
  return traits;
}

export function rollRecruit(
  tier: BuildingTier,
  heroLevel: number,
  takenNames: readonly string[],
  id: string,
  rng: () => number = Math.random,
): Companion {
  return {
    id,
    name: randomName(takenNames, rng),
    totalXp: totalXpForLevel(Math.max(1, heroLevel - RECRUIT_LEVEL_GAP)),
    traits: rollTraits(tier, rng),
    equipment: EMPTY_EQUIPMENT,
  };
}

/** Kandidaten des Tages – `date` gehört nicht zu heute: veraltet. */
export interface RecruitPool {
  date: string;
  recruits: Companion[];
  /** Heute schon gegen Gold neu gewürfelt? */
  rerolled: boolean;
}

export const EMPTY_RECRUIT_POOL: RecruitPool = { date: "", recruits: [], rerolled: false };

export function rollRecruitPool(
  date: string,
  tier: BuildingTier,
  heroLevel: number,
  takenNames: readonly string[],
  newId: () => string,
  rng: () => number = Math.random,
): RecruitPool {
  const recruits: Companion[] = [];
  for (let i = 0; i < RECRUITS_PER_DAY; i++) {
    recruits.push(rollRecruit(tier, heroLevel, [...takenNames, ...recruits.map((r) => r.name)], newId(), rng));
  }
  return { date, recruits, rerolled: false };
}

const levelPrice = (level: number) => RECRUIT_BASE_PRICE * (1 + (level - 1) / 10);

/** Preis: Grundpreis × Level-Faktor × Preisfaktor des seltensten Traits (1 / 2 / 4 / 8). */
export function recruitPrice(companion: Companion): number {
  const factor = Math.max(1, ...companion.traits.map((t) => getRarity(t.rarity).priceMultiplier));
  return Math.round(levelPrice(companionLevel(companion)) * factor);
}

/** Neu würfeln kostet so viel wie ein Kandidat auf Heldenlevel ohne seltene Traits. */
export function rerollRecruitsPrice(heroLevel: number): number {
  return Math.round(levelPrice(heroLevel));
}

export function recruit(
  pool: RecruitPool,
  companions: readonly Companion[],
  gold: number,
  id: string,
  tier: BuildingTier,
): { pool: RecruitPool; companions: Companion[]; gold: number } {
  if (tier === 0) throw new Error("Baue zuerst eine Taverne.");
  const candidate = pool.recruits.find((r) => r.id === id);
  if (!candidate) throw new Error("Dieser Kandidat ist nicht mehr da.");
  if (companions.length >= TAVERN_RULES[tier].slots) throw new Error("Alle Plätze in der Taverne sind belegt.");
  const price = recruitPrice(candidate);
  if (gold < price) throw new Error("Nicht genug Gold.");
  return {
    pool: { ...pool, recruits: pool.recruits.filter((r) => r.id !== id) },
    companions: [...companions, candidate],
    gold: gold - price,
  };
}

export function rerollRecruits(
  pool: RecruitPool,
  gold: number,
  today: string,
  tier: BuildingTier,
  heroLevel: number,
  takenNames: readonly string[],
  newId: () => string,
  rng: () => number = Math.random,
): { pool: RecruitPool; gold: number } {
  if (tier === 0) throw new Error("Baue zuerst eine Taverne.");
  if (pool.date === today && pool.rerolled) throw new Error("Heute wurde schon neu gewürfelt.");
  const price = rerollRecruitsPrice(heroLevel);
  if (gold < price) throw new Error("Nicht genug Gold.");
  return {
    pool: { ...rollRecruitPool(today, tier, heroLevel, takenNames, newId, rng), rerolled: true },
    gold: gold - price,
  };
}

/** Entlässt einen Begleiter – seine Items kommen zurück ins Inventar. */
export function dismissCompanion(
  companions: readonly Companion[],
  inventory: readonly OwnedItem[],
  id: string,
  active: readonly ActiveMission[],
): { companions: Companion[]; inventory: OwnedItem[] } {
  const companion = companions.find((c) => c.id === id);
  if (!companion) throw new Error("Diesen Begleiter gibt es nicht.");
  if (isBusy(active, id)) throw new Error(`${companion.name} ist auf einer Mission.`);
  const items = Object.values(companion.equipment).filter((o): o is OwnedItem => o !== null);
  return { companions: companions.filter((c) => c.id !== id), inventory: [...inventory, ...items] };
}

/* ───────────── Ausrüstung ───────────── */

/** Legt ein Item aus dem Inventar des Helden an – unabhängig von Level und Rüstungsklasse. */
export function equipCompanion(
  companion: Companion,
  inventory: readonly OwnedItem[],
  uid: string,
  slot?: EquipSlot,
): { companion: Companion; inventory: OwnedItem[] } {
  const gear = equipItem({ inventory: [...inventory], equipment: companion.equipment }, uid, Infinity, slot);
  return { companion: { ...companion, equipment: gear.equipment }, inventory: gear.inventory };
}

export function unequipCompanion(
  companion: Companion,
  inventory: readonly OwnedItem[],
  slot: EquipSlot,
): { companion: Companion; inventory: OwnedItem[] } {
  const gear = unequipItem({ inventory: [...inventory], equipment: companion.equipment }, slot);
  return { companion: { ...companion, equipment: gear.equipment }, inventory: gear.inventory };
}

/**
 * „Bestes anlegen“: für jeden Platz das Item mit dem höchsten Item-Score aus Inventar
 * und bisheriger Ausrüstung. Bei den Waffen gewinnt eine Zweihandwaffe (zählt doppelt)
 * oder die zwei besten Einhandwaffen – mit höchstens einem Schild.
 */
export function equipBest(companion: Companion, inventory: readonly OwnedItem[]): { companion: Companion; inventory: OwnedItem[] } {
  const pool = [...inventory, ...Object.values(companion.equipment).filter((o): o is OwnedItem => o !== null)];
  const usable = pool.sort((a, b) => itemScore(b) - itemScore(a));
  const equipment: Equipment = { ...EMPTY_EQUIPMENT };
  for (const slot of ARMOR_SLOTS) {
    equipment[slot] = usable.find((o) => getItem(o.itemId).type === slot) ?? null;
  }
  const weapons = usable.filter((o) => getItem(o.itemId).kind === "weapon");
  const twoHanded = weapons.find((o) => getItem(o.itemId).twoHanded);
  const first = weapons.find((o) => !getItem(o.itemId).twoHanded);
  const isShield = (o: OwnedItem) => getItem(o.itemId).type === "shield";
  const second = first && weapons.find((o) => o !== first && !getItem(o.itemId).twoHanded && !(isShield(o) && isShield(first)));
  const oneHandedScore = (first ? itemScore(first) : 0) + (second ? itemScore(second) : 0);
  if (twoHanded && itemScore(twoHanded) * 2 > oneHandedScore) {
    equipment.weapon1 = twoHanded;
  } else {
    equipment.weapon1 = first ?? null;
    equipment.weapon2 = second ?? null;
  }
  const worn = new Set(Object.values(equipment).filter((o) => o !== null));
  return { companion: { ...companion, equipment }, inventory: pool.filter((o) => !worn.has(o)) };
}

/* ───────────── Missionen ───────────── */

export type MissionDuration = "short" | "medium" | "long";

export interface DurationInfo {
  label: string;
  minutes: number;
  /** Beute pro Begleiter: so viel wie diese Anzahl normaler Siege auf Missionslevel */
  wins: number;
  /** Chance auf ein Item pro Mission */
  itemChance: number;
}

export const MISSION_DURATIONS: Readonly<Record<MissionDuration, DurationInfo>> = {
  short: { label: "30 Min.", minutes: 30, wins: 3, itemChance: 0.1 },
  medium: { label: "2 Std.", minutes: 120, wins: 8, itemChance: 0.25 },
  long: { label: "8 Std.", minutes: 480, wins: 20, itemChance: 0.6 },
};

export type MissionDifficulty = "normal" | "hard" | "heroic";

export interface DifficultyInfo {
  label: string;
  /** Geforderter Gearscore = Missionslevel × Faktor (wie der Seltenheitsfaktor der Items) */
  gearFactor: number;
  /** Mehr Beute und EP */
  rewardFactor: number;
  /** Seltenheit des Items */
  weights: Record<Rarity, number>;
  /** Chance, dass eine Mission diese Schwierigkeit hat */
  share: number;
}

export const MISSION_DIFFICULTIES: Readonly<Record<MissionDifficulty, DifficultyInfo>> = {
  // Normal: Seltenheiten wie ein normaler Drop (getCreatureLoot)
  normal: { label: "Normal", gearFactor: 1, rewardFactor: 1, weights: { common: 65, rare: 30, epic: 4.5, legendary: 0.5 }, share: 0.5 },
  hard: { label: "Schwer", gearFactor: 1.2, rewardFactor: 1.25, weights: KILL_WEIGHTS, share: 0.35 },
  heroic: { label: "Heroisch", gearFactor: 1.45, rewardFactor: 1.5, weights: BOSS_WEIGHTS, share: 0.15 },
};

/** Missionen auf der Tafel – ihr Level liegt so weit vom Heldenlevel entfernt. */
export const MISSION_LEVEL_OFFSETS = [-8, -4, 0, 2] as const;
/** Begleiter leveln nur über Missionen – deshalb schneller als der Held pro Sieg. */
export const COMPANION_XP_FACTOR = 3;
/** Bei Misserfolg gibt es diesen Anteil der EP, sonst nichts. */
export const FAILED_XP_SHARE = 0.25;
/** Material und Essenz pro Sieg-Äquivalent */
const MATERIAL_PER_WIN = 0.5;
const ESSENCE_PER_WIN = 0.2;

export interface MissionDef {
  id: string;
  title: string;
  areaId: string;
  level: number;
  duration: MissionDuration;
  /** Genau so viele Begleiter müssen los */
  size: number;
  difficulty: MissionDifficulty;
}

/** Missionstafel des Tages – `taken`: schon angenommene Missionen (erst morgen ersetzt). */
export interface MissionBoard {
  date: string;
  missions: MissionDef[];
  taken: string[];
}

export const EMPTY_MISSION_BOARD: MissionBoard = { date: "", missions: [], taken: [] };

export interface MissionOutcome {
  success: boolean;
  gold: number;
  essence: number;
  materials: MaterialStock;
  item: OwnedItem | null;
  /** EP pro Begleiter (Id → EP) */
  xp: Record<string, number>;
}

export interface ActiveMission {
  mission: MissionDef;
  companionIds: string[];
  /** ms seit 1970 */
  start: number;
  end: number;
  /** Erfolgschance beim Losschicken – für die Anzeige */
  chance: number;
  /** Schon beim Losschicken ausgewürfelt */
  outcome: MissionOutcome;
}

const TITLES: readonly ((area: string, creature: string) => string)[] = [
  (_, creature) => `Jagd: ${creature}`,
  (_, creature) => `Plage: ${creature}`,
  (area) => `Spähtrupp – ${area}`,
  (area) => `Geleitschutz – ${area}`,
  (area) => `Verschollene Karawane – ${area}`,
  (area) => `Schatzsuche – ${area}`,
];

function rollMission(id: string, level: number, maxSize: number, rng: () => number): MissionDef {
  const area = AREAS.find((a) => level <= a.maxLevel) ?? AREAS[AREAS.length - 1];
  const creatures = area.creatures.filter((c) => !c.boss);
  const title = pick(TITLES, rng)(area.name, pick(creatures, rng).name);
  const duration = pick(Object.keys(MISSION_DURATIONS) as MissionDuration[], rng);
  const size = 1 + Math.floor(rng() * Math.min(3, maxSize));
  let roll = rng();
  let difficulty: MissionDifficulty = "normal";
  for (const [key, info] of Object.entries(MISSION_DIFFICULTIES) as [MissionDifficulty, DifficultyInfo][]) {
    roll -= info.share;
    if (roll < 0) {
      difficulty = key;
      break;
    }
  }
  return { id, title, areaId: area.id, level, duration, size, difficulty };
}

/** Neue Tafel: eine Mission pro Abstand in MISSION_LEVEL_OFFSETS, Truppstärke höchstens so gross wie die Plätze. */
export function rollMissionBoard(date: string, heroLevel: number, tier: BuildingTier, rng: () => number = Math.random): MissionBoard {
  const maxSize = Math.max(1, TAVERN_RULES[tier].slots);
  const missions = MISSION_LEVEL_OFFSETS.map((offset, i) =>
    rollMission(`${date}-${i}`, Math.min(MAX_LEVEL, Math.max(1, heroLevel + offset)), maxSize, rng),
  );
  return { date, missions, taken: [] };
}

export function requiredGearScore(mission: MissionDef): number {
  return Math.round(mission.level * MISSION_DIFFICULTIES[mission.difficulty].gearFactor);
}

/** Untere und obere Grenze der Erfolgschance */
export const MIN_CHANCE = 0.05;
export const MAX_CHANCE = 0.95;

/**
 * Erfolgschance: 50 % bei gleichem Gearscore, +1,2 Prozentpunkte pro Prozent darüber,
 * dazu Glückspilz – zwischen 5 % und 95 %. Ohne Begleiter 0.
 */
export function missionChance(mission: MissionDef, companions: readonly Companion[]): number {
  if (companions.length === 0) return 0;
  const groupScore = companions.reduce((sum, c) => sum + companionGearScore(c), 0) / companions.length;
  const ratio = groupScore / requiredGearScore(mission);
  const chance = 0.5 + 1.2 * (ratio - 1) + traitSum(companions, "lucky");
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, chance));
}

/** Dauer in ms – Flink wirkt nur, wenn alle flink sind (dann der kleinste Wert). */
export function missionDurationMs(mission: MissionDef, companions: readonly Companion[]): number {
  const swift = companions.length > 0 ? Math.min(...companions.map((c) => traitValue(c, "swift"))) : 0;
  return Math.round(MISSION_DURATIONS[mission.duration].minutes * 60_000 * (1 - swift));
}

/** Sieg-Äquivalente pro Begleiter (mit Schwierigkeit) */
function missionWins(mission: MissionDef): number {
  return MISSION_DURATIONS[mission.duration].wins * MISSION_DIFFICULTIES[mission.difficulty].rewardFactor;
}

/** EP pro Begleiter bei Erfolg: Sieg-Äquivalente × EP eines Siegs × COMPANION_XP_FACTOR, mit Lernbegierig und Lehrmeister. */
export function missionXp(mission: MissionDef, companion: Companion, group: readonly Companion[]): number {
  const base = missionWins(mission) * xpRewardBase(mission.level) * 0.08 * COMPANION_XP_FACTOR;
  const mentor = traitSum(group.filter((c) => c.id !== companion.id), "mentor");
  return Math.round(base * (1 + traitValue(companion, "eager") + mentor));
}

/**
 * Beute bei Erfolg – Gold, Material und Essenz, ohne das Item. Gerechnet mit der Truppstärke,
 * die Traits kommen von `companions` (für die Vorschau auch weniger als die volle Gruppe).
 */
export function missionLoot(mission: MissionDef, companions: readonly Companion[]): { gold: number; essence: number; materials: MaterialStock; itemChance: number } {
  const wins = missionWins(mission) * mission.size;
  const level = mission.level;
  return {
    // Ein normaler Sieg gibt mit 40 % Gold, im Schnitt 3 + Level (getCreatureGoldDrop)
    gold: Math.round(wins * 0.4 * (3 + level) * (1 + traitSum(companions, "treasure"))),
    essence: Math.round(wins * ESSENCE_PER_WIN * (1 + level / 10) * (1 + traitSum(companions, "essence"))),
    materials: { [materialForLevel(level)]: Math.round(wins * MATERIAL_PER_WIN * (1 + traitSum(companions, "gatherer"))) },
    itemChance: Math.min(1, MISSION_DURATIONS[mission.duration].itemChance * (1 + traitSum(companions, "plunder"))),
  };
}

export function rollMissionOutcome(
  mission: MissionDef,
  companions: readonly Companion[],
  uid: string,
  rng: () => number = Math.random,
): MissionOutcome {
  const success = rng() < missionChance(mission, companions);
  const xpShare = success ? 1 : FAILED_XP_SHARE;
  const xp = Object.fromEntries(companions.map((c) => [c.id, Math.round(missionXp(mission, c, companions) * xpShare)]));
  if (!success) return { success, gold: 0, essence: 0, materials: {}, item: null, xp };
  const { gold, essence, materials, itemChance } = missionLoot(mission, companions);
  const item = rollDrop(itemChance, MISSION_DIFFICULTIES[mission.difficulty].weights, mission.level, uid, rng);
  return { success, gold, essence, materials, item, xp };
}

export function isBusy(active: readonly ActiveMission[], companionId: string): boolean {
  return active.some((a) => a.companionIds.includes(companionId));
}

/** Schickt Begleiter los – das Ergebnis wird sofort ausgewürfelt. */
export function startMission(
  board: MissionBoard,
  active: readonly ActiveMission[],
  companions: readonly Companion[],
  missionId: string,
  companionIds: readonly string[],
  today: string,
  now: number,
  uid: string,
  rng: () => number = Math.random,
): { board: MissionBoard; active: ActiveMission[] } {
  if (board.date !== today) throw new Error("Die Missionstafel ist von gestern.");
  const mission = board.missions.find((m) => m.id === missionId);
  if (!mission) throw new Error("Diese Mission gibt es nicht.");
  if (board.taken.includes(missionId)) throw new Error("Diese Mission wurde heute schon angenommen.");
  const ids = [...new Set(companionIds)];
  if (ids.length !== mission.size) throw new Error(`Für diese Mission braucht es genau ${mission.size} Begleiter.`);
  const group = ids.map((id) => {
    const companion = companions.find((c) => c.id === id);
    if (!companion) throw new Error("Diesen Begleiter gibt es nicht.");
    if (isBusy(active, id)) throw new Error(`${companion.name} ist schon unterwegs.`);
    return companion;
  });
  const started: ActiveMission = {
    mission,
    companionIds: ids,
    start: now,
    end: now + missionDurationMs(mission, group),
    chance: missionChance(mission, group),
    outcome: rollMissionOutcome(mission, group, uid, rng),
  };
  return { board: { ...board, taken: [...board.taken, missionId] }, active: [...active, started] };
}

export function isMissionDone(mission: ActiveMission, now: number = Date.now()): boolean {
  return now >= mission.end;
}

/** Schreibt den Begleitern die EP einer abgeholten Mission gut. */
export function applyMissionXp(companions: readonly Companion[], outcome: MissionOutcome, heroLevel: number): Companion[] {
  return companions.map((c) => (outcome.xp[c.id] ? addCompanionXp(c, outcome.xp[c.id], heroLevel) : c));
}
