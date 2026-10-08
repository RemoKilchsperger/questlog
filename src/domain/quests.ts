// Quests: Aufträge aus dem Questbuch („Töte 6 Grauwölfe“, „Besiege den Boss“,
// „Schliesse den Dungeon ab“) und tägliche Jagdaufträge. Quests werden
// angenommen, Siege zählen den Fortschritt hoch, und beim Abgeben gibt es XP,
// Gold und eine Chance auf ein Item. Reine Logik ohne UI – wie der Rest von
// src/domain auch später serverseitig nutzbar.

import { xpRewardBase } from "./leveling";
import { rollDrop } from "./loot";
import { AREAS, DUNGEONS, getCreature, isAreaUnlocked, type AreaDef, type CreatureDef } from "./creatures";
import type { Loot, Rarity } from "./types";

export type QuestGoal =
  | { kind: "kill"; creatureId: string; count: number }
  | { kind: "dungeon"; dungeonId: string };

export interface QuestReward {
  xp: number;
  gold: number;
  /** Wahrscheinlichkeit (0..1) auf ein Item beim Abgeben */
  dropChance: number;
  /** Gewichte der Seltenheitsstufen des Items */
  weights: Record<Rarity, number>;
}

export interface QuestDef {
  id: string;
  title: string;
  /** Kurzer Auftragstext */
  description: string;
  /** Gebiet bzw. Dungeon, in dem die Quest spielt */
  areaId: string;
  goal: QuestGoal;
  reward: QuestReward;
}

/** Fortschritt im Questbuch – wird gespeichert. */
export interface QuestLog {
  /** Angenommene Quests: Id → Fortschritt (Siege bzw. 1 für einen abgeschlossenen Dungeon) */
  active: Record<string, number>;
  /** Abgegebene Quests (jede Quest aus dem Questbuch gibt es nur einmal) */
  completed: string[];
}

export const EMPTY_QUEST_LOG: QuestLog = { active: {}, completed: [] };

/** Was im Spiel passiert und Quests voranbringt. */
export type QuestEvent = { kind: "kill"; creatureId: string } | { kind: "dungeon"; dungeonId: string };

/* ───────────── Belohnungen ───────────── */

/** Pro „Einheit“ einer Quest: Anteil des Belohnungs-Grundwerts (`xpRewardBase`) … */
const XP_PER_UNIT = 0.06;
/** … und Gold als Vielfaches des Kreatur-Grundwerts `3 + Level`. */
const GOLD_PER_UNIT = 0.6;

/** Einheiten: ein Sieg zählt 1, ein Boss 8, ein ganzer Dungeon 12. */
const BOSS_UNITS = 8;
const DUNGEON_UNITS = 12;

const KILL_WEIGHTS: Record<Rarity, number> = { common: 50, rare: 40, epic: 9, legendary: 1 };
const BOSS_WEIGHTS: Record<Rarity, number> = { common: 20, rare: 50, epic: 25, legendary: 5 };
const DUNGEON_WEIGHTS: Record<Rarity, number> = { common: 0, rare: 45, epic: 45, legendary: 10 };

/** Jagdquests geben mit 50 % ein Item, Boss- und Dungeon-Quests immer. */
export const KILL_QUEST_DROP_CHANCE = 0.5;
/** Tagesaufträge sind kleiner – 35 % auf ein Item. */
export const DAILY_DROP_CHANCE = 0.35;

function questReward(level: number, units: number, dropChance: number, weights: Record<Rarity, number>): QuestReward {
  return {
    xp: Math.round(xpRewardBase(level) * XP_PER_UNIT * units),
    gold: Math.round((3 + level) * GOLD_PER_UNIT * units),
    dropChance,
    weights,
  };
}

/* ───────────── Questbuch ───────────── */

/** Wie viele Siege die Jagdquests eines Gebiets verlangen – in der Reihenfolge der Kreaturen. */
const KILL_COUNTS = [5, 6, 6, 8] as const;

/** Titel und Auftragstext pro Kreatur bzw. Dungeon. */
const STORY: Record<string, readonly [title: string, description: string]> = {
  // Düsterwald
  "giant-rat": ["Rattenplage", "Der Müller klagt: Riesenratten fressen ihm das Korn weg."],
  "grey-wolf": ["Heulen in der Nacht", "Grauwölfe reissen die Schafe der Bauern am Waldrand."],
  "forest-spider": ["Netze im Unterholz", "Waldspinnen haben den Pfad nach Osten zugesponnen."],
  "goblin-raider": ["Überfall am Waldweg", "Goblin-Plünderer lauern den Händlern auf."],
  "goblin-chief": ["Krummzahn", "Ohne ihren Häuptling zerstreuen sich die Goblins."],
  // Nebelsümpfe
  "marsh-toad": ["Quakende Plage", "Die Sumpfkröten vergiften die Brunnen am Moor."],
  "bog-serpent": ["Giftige Ufer", "Moorschlangen machen den Fährleuten das Leben schwer."],
  "bog-corpse": ["Die Toten im Moor", "Im Nebel steigen Moorleichen aus dem Schlamm."],
  "blood-swarm": ["Blutmücken", "Die Torfstecher trauen sich nicht mehr hinaus."],
  "ancient-lizard": ["Die uralte Echse", "Tief im Sumpf liegt etwas Altes und Hungriges."],
  // Kristallhöhlen
  "cave-bat": ["Flattern im Dunkeln", "Fledermausschwärme löschen den Bergleuten die Lampen."],
  "stone-golem": ["Lebendiger Fels", "Steingolems versperren die Stollen zu den Kristalladern."],
  "crystal-scorpion": ["Funkelnde Stacheln", "Kristallskorpione nisten in der grossen Halle."],
  "rock-worm": ["Beben im Stollen", "Felswürmer bringen die Gänge zum Einstürzen."],
  "cave-eye": ["Das Auge in der Tiefe", "Etwas beobachtet die Höhlen – und es schläft nie."],
  // Frostgipfel
  "ice-bear": ["Bärenjagd", "Eisbären bedrohen die Jäger auf dem Pass."],
  "frost-elemental": ["Eisiger Hauch", "Frostelementare lassen die Hütten zufrieren."],
  "snow-wolf": ["Weisse Wölfe", "Ein Rudel Schneewölfe folgt jeder Karawane."],
  "frost-troll": ["Trollbrücke", "Frosttrolle verlangen Zoll an der einzigen Brücke."],
  "primal-mammoth": ["Graufrost", "Das Urmammut zertrampelt alles, was sich ihm nähert."],
  // Schattenruinen
  "skeleton-warrior": ["Klappernde Knochen", "Skelettkrieger bewachen noch immer die alten Mauern."],
  "wailing-ghost": ["Klagen in den Ruinen", "Das Klagen der Geister treibt die Leute in den Wahnsinn."],
  bloodsucker: ["Blutdurst", "Blutsauger schleichen nachts in die Dörfer."],
  "dark-sorcerer": ["Dunkle Rituale", "Hexer rufen in den Ruinen etwas herbei."],
  "lich-king": ["Der Lichkönig", "Solange er herrscht, ruhen die Toten nicht."],
  // Drachenhort
  "fire-salamander": ["Glühende Echsen", "Feuersalamander setzen die Vorräte in Brand."],
  "flame-elemental": ["Lebende Flammen", "Flammenelementare schmelzen den Weg zum Hort."],
  "young-dragon": ["Drachenbrut", "Die Jungdrachen werden jeden Tag grösser."],
  "demon-guard": ["Höllenwacht", "Dämonenwächter stehen vor den Toren des Horts."],
  ignaroth: ["Ignaroth", "Der uralte Drache muss fallen."],
  // Dungeons
  "abandoned-mine": ["Die verlassene Mine", "Bring heraus, was die Bergleute vertrieben hat."],
  "sunken-temple": ["Der versunkene Tempel", "Beende die Herrschaft der Hohepriesterin."],
  "storm-tower": ["Im Auge des Sturms", "Steig auf den Gewitterturm und stelle den Sturmfürsten."],
  "void-abyss": ["Am Rand der Leere", "Stell dich dem, was die Welt verschlingen will."],
};

function story(id: string): readonly [string, string] {
  return STORY[id] ?? [id, ""];
}

function areaQuests(area: AreaDef): QuestDef[] {
  let normal = 0;
  return area.creatures.map((creature) => {
    const [title, description] = story(creature.id);
    if (creature.boss) {
      return {
        id: `boss-${creature.id}`,
        title,
        description,
        areaId: area.id,
        goal: { kind: "kill", creatureId: creature.id, count: 1 },
        reward: questReward(creature.level, BOSS_UNITS, 1, BOSS_WEIGHTS),
      };
    }
    const count = KILL_COUNTS[Math.min(normal++, KILL_COUNTS.length - 1)];
    return {
      id: `hunt-${creature.id}`,
      title,
      description,
      areaId: area.id,
      goal: { kind: "kill", creatureId: creature.id, count },
      reward: questReward(creature.level, count, KILL_QUEST_DROP_CHANCE, KILL_WEIGHTS),
    };
  });
}

function dungeonQuest(dungeon: AreaDef): QuestDef {
  const [title, description] = story(dungeon.id);
  return {
    id: `dungeon-${dungeon.id}`,
    title,
    description,
    areaId: dungeon.id,
    goal: { kind: "dungeon", dungeonId: dungeon.id },
    reward: questReward(dungeon.maxLevel, DUNGEON_UNITS, 1, DUNGEON_WEIGHTS),
  };
}

/** Alle Quests des Questbuchs: pro Gebiet eine Jagd pro Kreatur und der Boss, dazu jeder Dungeon. */
export const QUESTS: readonly QuestDef[] = [...AREAS.flatMap(areaQuests), ...DUNGEONS.map(dungeonQuest)];

export function getQuest(id: string): QuestDef {
  const def = QUESTS.find((q) => q.id === id);
  if (!def) throw new Error(`Unbekannte Quest: ${id}`);
  return def;
}

/** Gebiet bzw. Dungeon einer Quest. */
export function questArea(def: QuestDef): AreaDef {
  const area = [...AREAS, ...DUNGEONS].find((a) => a.id === def.areaId);
  if (!area) throw new Error(`Unbekanntes Gebiet: ${def.areaId}`);
  return area;
}

/** Ziel als Zahl: Anzahl Siege, beim Dungeon 1. */
export function questTarget(def: QuestDef): number {
  return def.goal.kind === "kill" ? def.goal.count : 1;
}

/** „Töte 6× Grauwolf“ bzw. „Schliesse Verlassene Mine ab“. */
export function questGoalText(def: QuestDef): string {
  if (def.goal.kind === "dungeon") return `Schliesse den Dungeon ${questArea(def).name} ab`;
  const { creature } = getCreature(def.goal.creatureId);
  return creature.boss ? `Besiege ${creature.name}` : `Töte ${def.goal.count}× ${creature.name}`;
}

/** Quests eines Gebiets sind ab dessen Mindest-Level verfügbar. */
export function isQuestUnlocked(def: QuestDef, heroLevel: number): boolean {
  return isAreaUnlocked(questArea(def), heroLevel);
}

export function isQuestComplete(def: QuestDef, progress: number): boolean {
  return progress >= questTarget(def);
}

/** Bringt eine Quest durch ein Ereignis weiter – gibt den neuen Fortschritt zurück (höchstens das Ziel). */
export function advanceQuest(def: QuestDef, progress: number, event: QuestEvent): number {
  const matches =
    (def.goal.kind === "kill" && event.kind === "kill" && def.goal.creatureId === event.creatureId) ||
    (def.goal.kind === "dungeon" && event.kind === "dungeon" && def.goal.dungeonId === event.dungeonId);
  return matches ? Math.min(questTarget(def), progress + 1) : progress;
}

export function acceptQuest(log: QuestLog, id: string, heroLevel: number): QuestLog {
  const def = getQuest(id);
  if (log.completed.includes(id)) throw new Error("Diese Quest hast du schon abgeschlossen.");
  if (id in log.active) throw new Error("Diese Quest hast du schon angenommen.");
  if (!isQuestUnlocked(def, heroLevel)) throw new Error(`${questArea(def).name} ist erst ab Level ${questArea(def).minLevel} zugänglich.`);
  return { ...log, active: { ...log.active, [id]: 0 } };
}

/** Quest abbrechen – der Fortschritt geht verloren, sie kann neu angenommen werden. */
export function abandonQuest(log: QuestLog, id: string): QuestLog {
  if (!(id in log.active)) return log;
  const { [id]: _, ...active } = log.active;
  return { ...log, active };
}

/** Wendet ein Ereignis auf alle angenommenen Quests an. Ohne Änderung kommt dasselbe Objekt zurück. */
export function applyQuestEvent(log: QuestLog, event: QuestEvent): QuestLog {
  let changed = false;
  const active = Object.fromEntries(
    Object.entries(log.active).map(([id, progress]) => {
      const next = advanceQuest(getQuest(id), progress, event);
      if (next !== progress) changed = true;
      return [id, next];
    }),
  );
  return changed ? { ...log, active } : log;
}

/** Gibt eine erfüllte Quest ab. Die Belohnung schreibt der Aufrufer gut. */
export function turnInQuest(log: QuestLog, id: string): QuestLog {
  const progress = log.active[id];
  if (progress === undefined) throw new Error("Diese Quest hast du nicht angenommen.");
  if (!isQuestComplete(getQuest(id), progress)) throw new Error("Die Quest ist noch nicht erfüllt.");
  const { [id]: _, ...active } = log.active;
  return { active, completed: [...log.completed, id] };
}

/** Würfelt das Item einer Quest aus – auf dem Level des Helden. */
export function rollQuestLoot(reward: QuestReward, heroLevel: number, uid: string, rng: () => number = Math.random): Loot {
  return rollDrop(reward.dropChance, reward.weights, heroLevel, uid, rng);
}

/* ───────────── Tagesaufträge ───────────── */

export interface DailyQuest {
  def: QuestDef;
  progress: number;
  turnedIn: boolean;
}

/** Die Tagesaufträge – gehört `date` nicht zu heute, werden neue ausgewürfelt. */
export interface DailyQuests {
  date: string;
  quests: DailyQuest[];
}

export const NO_DAILY_QUESTS: DailyQuests = { date: "", quests: [] };

export const DAILY_QUEST_COUNT = 3;
const DAILY_MIN_KILLS = 3;
const DAILY_MAX_KILLS = 6;

/** Kreaturen, die für Tagesaufträge in Frage kommen: aus offenen Gebieten, kein Boss, nicht zu leicht oder zu schwer. */
export function dailyCandidates(heroLevel: number): CreatureDef[] {
  const open = AREAS.filter((a) => isAreaUnlocked(a, heroLevel))
    .flatMap((a) => a.creatures)
    .filter((c) => !c.boss);
  const fitting = open.filter((c) => c.level <= heroLevel + 2 && c.level >= heroLevel - 6);
  // Zu wenige (ganz am Anfang): die schwächsten Kreaturen
  return fitting.length >= DAILY_QUEST_COUNT ? fitting : [...open].sort((a, b) => a.level - b.level).slice(0, DAILY_QUEST_COUNT);
}

/** Neue Tagesaufträge: verschiedene Kreaturen, je 3–6 Siege. */
export function rollDailyQuests(date: string, heroLevel: number, rng: () => number = Math.random): DailyQuests {
  const pool = [...dailyCandidates(heroLevel)];
  const quests: DailyQuest[] = [];
  while (quests.length < DAILY_QUEST_COUNT && pool.length > 0) {
    const [creature] = pool.splice(Math.floor(rng() * pool.length), 1);
    const count = DAILY_MIN_KILLS + Math.floor(rng() * (DAILY_MAX_KILLS - DAILY_MIN_KILLS + 1));
    const { area } = getCreature(creature.id);
    quests.push({
      def: {
        id: `daily-${date}-${quests.length}`,
        title: `Jagdauftrag: ${creature.name}`,
        description: `Am Schwarzen Brett im Dorf hängt ein Kopfgeld aus dem ${area.name}.`,
        areaId: area.id,
        goal: { kind: "kill", creatureId: creature.id, count },
        reward: questReward(creature.level, count, DAILY_DROP_CHANCE, KILL_WEIGHTS),
      },
      progress: 0,
      turnedIn: false,
    });
  }
  return { date, quests };
}

/** Wendet ein Ereignis auf die offenen Tagesaufträge an. Ohne Änderung kommt dasselbe Objekt zurück. */
export function applyDailyEvent(daily: DailyQuests, event: QuestEvent): DailyQuests {
  let changed = false;
  const quests = daily.quests.map((q) => {
    if (q.turnedIn) return q;
    const progress = advanceQuest(q.def, q.progress, event);
    if (progress === q.progress) return q;
    changed = true;
    return { ...q, progress };
  });
  return changed ? { ...daily, quests } : daily;
}

/* ───────────── Übersicht ───────────── */

export interface TrackedQuest {
  def: QuestDef;
  progress: number;
  daily: boolean;
}

/** Alles, was gerade läuft und noch nicht abgegeben ist: angenommene Quests und die heutigen Tagesaufträge. */
export function trackedQuests(log: QuestLog, daily: DailyQuests, today: string): TrackedQuest[] {
  const story = Object.entries(log.active).map(([id, progress]) => ({ def: getQuest(id), progress, daily: false }));
  const dailies = daily.date === today ? daily.quests.filter((q) => !q.turnedIn).map((q) => ({ def: q.def, progress: q.progress, daily: true })) : [];
  return [...dailies, ...story];
}

/** Laufende Quests, die ein Sieg gegen diese Kreatur voranbringt. */
export function questsForCreature(tracked: readonly TrackedQuest[], creatureId: string): TrackedQuest[] {
  return tracked.filter((q) => q.def.goal.kind === "kill" && q.def.goal.creatureId === creatureId);
}

/** Gibt einen erfüllten Tagesauftrag ab. */
export function turnInDaily(daily: DailyQuests, id: string): DailyQuests {
  const quest = daily.quests.find((q) => q.def.id === id);
  if (!quest || quest.turnedIn) throw new Error("Diesen Auftrag gibt es nicht (mehr).");
  if (!isQuestComplete(quest.def, quest.progress)) throw new Error("Der Auftrag ist noch nicht erfüllt.");
  return { ...daily, quests: daily.quests.map((q) => (q.def.id === id ? { ...q, turnedIn: true } : q)) };
}
