// Erfolge: Stufen (Bronze, Silber, Gold) für Meilensteine in Quests, Serien,
// Charakter, Kampf, Sammeln und Koop. Belohnt wird kosmetisch: Jede Gold-Stufe
// (bzw. jeder einstufige Erfolg) schaltet einen Titel frei, dazu gibt es
// Avatar-Rahmen für die Gesamtzahl der Stufen und für besondere Erfolge.
//
// Was sich aus dem Spielstand ablesen lässt (Quests, Level, Serien …), zählt
// rückwirkend. Kämpfe, besiegte Bosse und Dungeons werden erst ab Einführung
// der Erfolge in `records` mitgezählt.

import { BOSS_SETS } from "./bossSets";
import { BOSS_ITEMS } from "./items";
import { AREAS, DUNGEONS } from "./creatures";
import { COOP_BOSSES, type CoopStats } from "./coopCombat";
import { currentStreak } from "./recurrence";
import { getLevel } from "./leveling";
import type { HeroClassId } from "./heroClasses";
import type { Category, Character, Quest } from "./types";

/** Zähler, die das Spiel ab jetzt mitführt (im Spielstand). */
export interface Records {
  battlesWon: number;
  /** Ids besiegter Bosse (Gebiete, Dungeons) */
  bossesDefeated: string[];
  /** Ids abgeschlossener Dungeons */
  dungeonsCleared: string[];
  /** Tage, an denen alle Bonusquests erledigt wurden */
  perfectBonusDays: number;
  /** Ein Kampf mit unter 5 % LP gewonnen */
  closeCall: boolean;
  /** Klassen, die schon einmal aktiv waren */
  classesWorn: HeroClassId[];
  /** Uids aller legendären Items, die man je besessen hat */
  legendarySeen: string[];
  /** Uids aller Items, die je auf höchster Schmied-Stufe waren */
  maxedSeen: string[];
  /** Höchster Goldbestand */
  maxGold: number;
  /** Höchster Gear Score der angelegten Ausrüstung */
  maxGearScore: number;
}

export const EMPTY_RECORDS: Records = {
  battlesWon: 0,
  bossesDefeated: [],
  dungeonsCleared: [],
  perfectBonusDays: 0,
  closeCall: false,
  classesWorn: [],
  legendarySeen: [],
  maxedSeen: [],
  maxGold: 0,
  maxGearScore: 0,
};

/** Alles, woraus sich der Fortschritt berechnet. */
export interface AchievementInput {
  character: Character;
  quests: Quest[];
  bossCollection: string[];
  coopStats: CoopStats;
  records: Records;
  /** Datum "yyyy-mm-dd" (für laufende Serien) */
  today: string;
}

export type AchievementCategory = "quests" | "streaks" | "character" | "combat" | "collection" | "sets" | "coop";

export const ACHIEVEMENT_CATEGORIES: readonly { key: AchievementCategory; label: string; icon: string }[] = [
  { key: "quests", label: "Quests", icon: "📜" },
  { key: "streaks", label: "Serien", icon: "🔥" },
  { key: "character", label: "Charakter", icon: "🧙" },
  { key: "combat", label: "Kampf", icon: "⚔️" },
  { key: "collection", label: "Sammeln", icon: "💎" },
  { key: "sets", label: "Boss-Sets", icon: "👑" },
  { key: "coop", label: "Koop", icon: "🤝" },
];

export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  category: AchievementCategory;
  /** Was gezählt wird – mit {n} für die Zielzahl */
  description: string;
  /** Zielwerte der Stufen (1 Wert = einstufig, zählt als Gold) */
  tiers: readonly number[];
  /** Titel für die höchste Stufe */
  title: string;
  progress: (input: AchievementInput) => number;
}

const BOSS_ITEM_BOSS = new Map(BOSS_ITEMS.map((i) => [i.id, i.bossId]));
const done = (quests: Quest[]) => quests.filter((q) => q.status === "done");
const areaBossIds = AREAS.map((a) => a.creatures.find((c) => c.boss)!.id);
const dungeonBossToDungeon = new Map(DUNGEONS.map((d) => [d.creatures.find((c) => c.boss)!.id, d.id]));

/** Besiegte Bosse: mitgezählte und – rückwirkend – die, deren Boss-Items man besitzt. */
function bossesDefeated(input: AchievementInput): Set<string> {
  // Unbekannte Ids (z. B. aus alten Spielständen) einfach überspringen
  const fromItems = input.bossCollection.map((id) => BOSS_ITEM_BOSS.get(id)).filter((b): b is string => !!b);
  return new Set([...input.records.bossesDefeated, ...fromItems]);
}

function dungeonsCleared(input: AchievementInput): Set<string> {
  const viaBoss = [...bossesDefeated(input)].map((b) => dungeonBossToDungeon.get(b)).filter((d): d is string => !!d);
  return new Set([...input.records.dungeonsCleared, ...viaBoss]);
}

/** Boss-Sets: wer alle Teile eines Bosses gesammelt hat, bekommt einen Titel passend zum Boss. */
const SET_REWARDS: Record<string, { icon: string; title: string }> = {
  "goblin-chief": { icon: "👺", title: "Goblinschreck" },
  "ancient-lizard": { icon: "🦎", title: "Echsenbändiger" },
  "cave-eye": { icon: "👁️", title: "Der Allsehende" },
  "primal-mammoth": { icon: "🦣", title: "Mammutjäger" },
  "lich-king": { icon: "💀", title: "Bezwinger der Untoten" },
  ignaroth: { icon: "🐉", title: "Drachenfürst" },
  "ore-king": { icon: "⛏️", title: "Erzbaron" },
  "high-priestess": { icon: "☀️", title: "Hüter des Tempels" },
  "storm-lord": { icon: "⚡", title: "Sturmbrecher" },
  "void-lord": { icon: "🌌", title: "Leerenwandler" },
  "swamp-hydra": { icon: "🐍", title: "Hydrabezwinger" },
  "frost-giant": { icon: "❄️", title: "Riesentöter" },
  "world-eater": { icon: "🌀", title: "Weltenretter" },
};

const SET_ACHIEVEMENTS: AchievementDef[] = BOSS_SETS.map((set) => {
  const items = BOSS_ITEMS.filter((i) => i.bossId === set.bossId).map((i) => i.id);
  const reward = SET_REWARDS[set.bossId] ?? { icon: "👑", title: set.name };
  return {
    id: `set-${set.bossId}`,
    name: set.name,
    icon: reward.icon,
    category: "sets",
    description: "Alle {n} Teile gesammelt",
    tiers: [items.length],
    title: reward.title,
    progress: (i: AchievementInput) => items.filter((id) => i.bossCollection.includes(id)).length,
  };
});

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // Quests
  { id: "quest-master", name: "Questmeister", icon: "📜", category: "quests", description: "{n} Quests erledigt", tiers: [10, 100, 500], title: "Questmeister", progress: (i) => done(i.quests).length },
  { id: "epic-quests", name: "Mammutaufgabe", icon: "🏔️", category: "quests", description: "{n} epische Quests erledigt", tiers: [1, 10, 50], title: "Titan", progress: (i) => done(i.quests).filter((q) => q.effort === "epic").length },
  {
    id: "all-rounder", name: "Allrounder", icon: "🧭", category: "quests", description: "Je {n} Quests in allen vier Bereichen", tiers: [5, 25, 100], title: "Allrounder",
    progress: (i) => Math.min(...(["body", "mind", "daily", "social"] as Category[]).map((c) => done(i.quests).filter((q) => q.category === c).length)),
  },
  { id: "bonus-hunter", name: "Bonusjäger", icon: "⭐", category: "quests", description: "{n} Bonusquests erledigt", tiers: [5, 50, 100], title: "Bonusjäger", progress: (i) => done(i.quests).filter((q) => q.bonus).length },
  { id: "perfect-day", name: "Perfekter Tag", icon: "🌟", category: "quests", description: "{n}-mal alle Bonusquests eines Tages erledigt", tiers: [1, 10, 30], title: "Perfektionist", progress: (i) => i.records.perfectBonusDays },
  // Serien
  { id: "tireless", name: "Unermüdlich", icon: "🔥", category: "streaks", description: "Eine Serie von {n} Terminen", tiers: [7, 30, 100], title: "Unermüdlich", progress: (i) => Math.max(0, ...i.quests.map((q) => q.bestStreak ?? 0)) },
  {
    id: "habits", name: "Gewohnheitstier", icon: "🔁", category: "streaks", description: "{n} laufende Serien ab 7 gleichzeitig", tiers: [2, 4, 6], title: "Gewohnheitstier",
    progress: (i) => i.quests.filter((q) => q.recurrence && q.status === "open" && currentStreak(q, i.today) >= 7).length,
  },
  // Charakter
  { id: "climber", name: "Aufsteiger", icon: "⬆️", category: "character", description: "Level {n} erreicht", tiers: [10, 30, 60], title: "Legende", progress: (i) => getLevel(i.character.totalXp) },
  { id: "scholar", name: "Gelehrter", icon: "📖", category: "character", description: "{n} Fähigkeiten freigeschaltet", tiers: [1, 8, 22], title: "Gelehrter", progress: (i) => i.character.abilities.length },
  { id: "gear-score", name: "Gut gerüstet", icon: "🛡️", category: "character", description: "Gear Score {n} erreicht", tiers: [15, 50, 100], title: "Unbezwingbar", progress: (i) => i.records.maxGearScore },
  { id: "classes", name: "Wandelbar", icon: "🎭", category: "character", description: "{n} verschiedene Klassen gespielt", tiers: [1, 4, 11], title: "Wandelbar", progress: (i) => i.records.classesWorn.length },
  // Kampf
  { id: "fighter", name: "Kämpfer", icon: "⚔️", category: "combat", description: "{n} Kämpfe gewonnen", tiers: [25, 250, 500], title: "Kriegsveteran", progress: (i) => i.records.battlesWon },
  { id: "boss-slayer", name: "Bossbezwinger", icon: "💀", category: "combat", description: "{n} verschiedene Gebietsbosse besiegt", tiers: [1, 3, 6], title: "Bossbezwinger", progress: (i) => areaBossIds.filter((b) => bossesDefeated(i).has(b)).length },
  { id: "dungeon-runner", name: "Dungeonläufer", icon: "🗝️", category: "combat", description: "{n} verschiedene Dungeons abgeschlossen", tiers: [1, 2, 4], title: "Dungeonmeister", progress: (i) => dungeonsCleared(i).size },
  { id: "dragon-slayer", name: "Drachentöter", icon: "🐉", category: "combat", description: "Den Uralten Drachen Ignaroth besiegt", tiers: [1], title: "Drachentöter", progress: (i) => (bossesDefeated(i).has("ignaroth") ? 1 : 0) },
  { id: "close-call", name: "Haaresbreite", icon: "😅", category: "combat", description: "Einen Kampf mit unter 5 % Lebenspunkten gewonnen", tiers: [1], title: "Überlebenskünstler", progress: (i) => (i.records.closeCall ? 1 : 0) },
  // Sammeln
  { id: "treasure-hunter", name: "Schatzjäger", icon: "💎", category: "collection", description: "{n} legendäre Items gefunden", tiers: [1, 10, 30], title: "Schatzjäger", progress: (i) => i.records.legendarySeen.length },
  { id: "boss-collector", name: "Boss-Sammler", icon: "👑", category: "collection", description: "{n} Boss-Items gesammelt", tiers: [5, 20, BOSS_ITEMS.length], title: "Sammler", progress: (i) => i.bossCollection.length },
  { id: "master-smith", name: "Meisterschmied", icon: "⚒️", category: "collection", description: "{n} Items auf die höchste Stufe verbessert", tiers: [1, 5, 15], title: "Meisterschmied", progress: (i) => i.records.maxedSeen.length },
  { id: "rich", name: "Wohlstand", icon: "🪙", category: "collection", description: "{n} Gold auf einmal besessen", tiers: [1000, 10000, 100000], title: "Goldbaron", progress: (i) => Math.max(i.records.maxGold, i.character.gold) },
  // Koop
  { id: "together", name: "Gemeinsam stark", icon: "🤝", category: "coop", description: "{n} Koop-Siege", tiers: [1, 10, 50], title: "Gefährte", progress: (i) => i.coopStats.wins },
  { id: "raid-slayer", name: "Raidbezwinger", icon: "🐲", category: "coop", description: "{n} verschiedene Koop-Bosse besiegt", tiers: [1, 2, COOP_BOSSES.length], title: "Raidbezwinger", progress: (i) => i.coopStats.bosses.length },
  // Boss-Sets
  ...SET_ACHIEVEMENTS,
];

export function getAchievement(id: string): AchievementDef {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) throw new Error(`Unbekannter Erfolg: ${id}`);
  return def;
}

/** Erreichte Stufe (0 = keine) für einen Fortschrittswert. */
export function tierFor(def: AchievementDef, value: number): number {
  return def.tiers.filter((t) => value >= t).length;
}

/** Ist die erreichte Stufe die höchste? (einstufige Erfolge sind dann sofort Gold) */
export const isMaxTier = (def: AchievementDef, tier: number) => tier >= def.tiers.length;

/** Name einer Stufe: Bronze, Silber, Gold – einstufige Erfolge heissen „Gold“. */
export function tierName(def: AchievementDef, tier: number): string {
  if (isMaxTier(def, tier)) return "Gold";
  return ["", "Bronze", "Silber", "Gold"][tier] ?? "";
}

export function tierIcon(def: AchievementDef, tier: number): string {
  if (tier <= 0) return "▫️";
  if (isMaxTier(def, tier)) return "🥇";
  return tier === 1 ? "🥉" : "🥈";
}

export function describe(def: AchievementDef, tier: number): string {
  const target = def.tiers[Math.min(tier, def.tiers.length - 1)];
  return def.description.replace("{n}", target.toLocaleString("de-CH"));
}

/** Freigeschaltete Stufen (Id → Stufe). */
export type AchievementTiers = Partial<Record<string, number>>;

/**
 * Neuer Stand: Stufen fallen nie zurück (eine gerissene Serie nimmt nichts weg).
 * Liefert auch, was in diesem Schritt neu dazukam.
 */
export function evaluateAchievements(
  input: AchievementInput,
  previous: AchievementTiers,
): { tiers: AchievementTiers; unlocked: { id: string; tier: number }[] } {
  const tiers: AchievementTiers = { ...previous };
  const unlocked: { id: string; tier: number }[] = [];
  for (const def of ACHIEVEMENTS) {
    const tier = tierFor(def, def.progress(input));
    const before = previous[def.id] ?? 0;
    if (tier > before) {
      tiers[def.id] = tier;
      for (let t = before + 1; t <= tier; t++) unlocked.push({ id: def.id, tier: t });
    }
  }
  return { tiers, unlocked };
}

export function totalTiers(tiers: AchievementTiers): number {
  return Object.values(tiers).reduce<number>((sum, t) => sum + (t ?? 0), 0);
}

export const MAX_TIERS = ACHIEVEMENTS.reduce((sum, a) => sum + a.tiers.length, 0);

/* ───────────── Kosmetik ───────────── */

/** Titel, die die Gold-Stufen freischalten. */
export function unlockedTitles(tiers: AchievementTiers): { id: string; title: string }[] {
  return ACHIEVEMENTS.filter((a) => isMaxTier(a, tiers[a.id] ?? 0)).map((a) => ({ id: a.id, title: a.title }));
}

export interface FrameDef {
  id: string;
  name: string;
  /** Wie man ihn freischaltet */
  condition: string;
  unlocked: (tiers: AchievementTiers) => boolean;
}

const gold = (id: string) => (tiers: AchievementTiers) => isMaxTier(getAchievement(id), tiers[id] ?? 0);

export const FRAMES: readonly FrameDef[] = [
  { id: "none", name: "Ohne Rahmen", condition: "Immer verfügbar", unlocked: () => true },
  { id: "bronze", name: "Bronze", condition: "5 Erfolgsstufen", unlocked: (t) => totalTiers(t) >= 5 },
  { id: "silver", name: "Silber", condition: "15 Erfolgsstufen", unlocked: (t) => totalTiers(t) >= 15 },
  { id: "gold", name: "Gold", condition: "30 Erfolgsstufen", unlocked: (t) => totalTiers(t) >= 30 },
  { id: "royal", name: "Königlich", condition: "Questmeister in Gold", unlocked: gold("quest-master") },
  { id: "flame", name: "Flammen", condition: "Unermüdlich in Gold", unlocked: gold("tireless") },
  { id: "crystal", name: "Kristall", condition: "Schatzjäger in Gold", unlocked: gold("treasure-hunter") },
  { id: "dragon", name: "Drachen", condition: "Drachentöter", unlocked: gold("dragon-slayer") },
  { id: "forged", name: "Meisterschmiede", condition: "Gut gerüstet in Gold (Gear Score 100)", unlocked: gold("gear-score") },
  { id: "void", name: "Leere", condition: "Raidbezwinger in Gold", unlocked: gold("raid-slayer") },
];

export function getFrame(id: string | undefined): FrameDef {
  return FRAMES.find((f) => f.id === id) ?? FRAMES[0];
}
