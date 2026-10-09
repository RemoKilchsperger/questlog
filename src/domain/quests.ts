// Quests: Aufträge aus dem Questbuch („Töte 6 Grauwölfe“, „Besiege den Boss“,
// „Schliesse den Dungeon ab“), dazu Tages- und Wochenaufträge (Jagd, Händler und
// Schmied). Questbuch-Quests werden angenommen, Aufträge laufen von selbst. Siege
// und Handel zählen den Fortschritt hoch, beim Abgeben gibt es XP, Gold und eine
// Chance auf ein Item. Reine Logik ohne UI – wie der Rest von
// src/domain auch später serverseitig nutzbar.

import { xpRewardBase } from "./leveling";
import { rollDrop } from "./loot";
import { AREAS, DUNGEONS, getCreature, isAreaUnlocked, type AreaDef, type CreatureDef } from "./creatures";
import type { Loot, Rarity } from "./types";

/** Händler und Schmied: Ausrüstung verkaufen, zerlegen oder verbessern. */
export type TradeAction = "sell" | "salvage" | "upgrade";

export type QuestGoal =
  | { kind: "kill"; creatureId: string; count: number }
  | { kind: "dungeon"; dungeonId: string }
  /** Beliebige Kreaturen töten – mit `boss` nur Bosse */
  | { kind: "killAny"; count: number; boss?: boolean }
  /** Beliebige Dungeons abschliessen */
  | { kind: "dungeons"; count: number }
  /** Ausrüstung (Waffen und Rüstung) verkaufen, zerlegen oder verbessern */
  | { kind: "trade"; action: TradeAction; count: number };

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
  /** Gebiet bzw. Dungeon, in dem die Quest spielt – fehlt bei allgemeinen Aufträgen */
  areaId?: string;
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
export type QuestEvent =
  | { kind: "kill"; creatureId: string; boss: boolean }
  | { kind: "dungeon"; dungeonId: string }
  /** Ein Ausrüstungsteil wurde verkauft, zerlegt oder verbessert */
  | { kind: "trade"; action: TradeAction };

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

/** Ziel als Zahl: Anzahl Siege, Dungeons oder Ausrüstungsteile – beim bestimmten Dungeon 1. */
export function questTarget(def: QuestDef): number {
  return def.goal.kind === "dungeon" ? 1 : def.goal.count;
}

const TRADE_GOAL_TEXT: Record<TradeAction, string> = {
  sell: "Verkaufe {n} Ausrüstungsteile beim Händler",
  salvage: "Zerlege {n} Ausrüstungsteile beim Schmied",
  upgrade: "Verbessere {n}-mal ein Ausrüstungsteil beim Schmied",
};

/** „Töte 6× Grauwolf“, „Schliesse den Dungeon … ab“, „Verkaufe 3 Ausrüstungsteile beim Händler“ … */
export function questGoalText(def: QuestDef): string {
  const { goal } = def;
  switch (goal.kind) {
    case "dungeon":
      return `Schliesse den Dungeon ${questArea(def).name} ab`;
    case "kill": {
      const { creature } = getCreature(goal.creatureId);
      return creature.boss ? `Besiege ${creature.name}` : `Töte ${goal.count}× ${creature.name}`;
    }
    case "killAny":
      return goal.boss ? `Besiege ${goal.count} Bosse (Gebiet, Dungeon oder Koop)` : `Besiege ${goal.count} Kreaturen`;
    case "dungeons":
      return `Schliesse ${goal.count} Dungeons ab (solo oder Koop)`;
    case "trade":
      return TRADE_GOAL_TEXT[goal.action].replace("{n}", String(goal.count));
  }
}

/** Quests eines Gebiets sind ab dessen Mindest-Level verfügbar. */
export function isQuestUnlocked(def: QuestDef, heroLevel: number): boolean {
  return isAreaUnlocked(questArea(def), heroLevel);
}

export function isQuestComplete(def: QuestDef, progress: number): boolean {
  return progress >= questTarget(def);
}

/** Zählt dieses Ereignis für das Ziel? */
function matchesGoal(goal: QuestGoal, event: QuestEvent): boolean {
  switch (goal.kind) {
    case "kill":
      return event.kind === "kill" && event.creatureId === goal.creatureId;
    case "dungeon":
      return event.kind === "dungeon" && event.dungeonId === goal.dungeonId;
    case "killAny":
      return event.kind === "kill" && (!goal.boss || event.boss);
    case "dungeons":
      return event.kind === "dungeon";
    case "trade":
      return event.kind === "trade" && event.action === goal.action;
  }
}

/** Bringt eine Quest durch ein Ereignis weiter – gibt den neuen Fortschritt zurück (höchstens das Ziel). */
export function advanceQuest(def: QuestDef, progress: number, event: QuestEvent): number {
  return matchesGoal(def.goal, event) ? Math.min(questTarget(def), progress + 1) : progress;
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

/* ───────────── Aufträge: täglich und wöchentlich ───────────── */

export interface BoardQuest {
  def: QuestDef;
  progress: number;
  turnedIn: boolean;
}

/**
 * Tages- oder Wochenaufträge. `date` ist der Tag bzw. der Montag der Woche
 * ("yyyy-mm-dd") – passt er nicht mehr, werden neue ausgewürfelt. Aufträge
 * laufen ohne Annehmen.
 */
export interface QuestBoard {
  date: string;
  quests: BoardQuest[];
}

export const EMPTY_BOARD: QuestBoard = { date: "", quests: [] };

/** Jagdaufträge pro Tag – dazu kommt immer ein Händler-Auftrag. */
export const DAILY_HUNT_COUNT = 3;
const DAILY_MIN_KILLS = 3;
const DAILY_MAX_KILLS = 6;

/** Händler-Aufträge wechseln reihum: an einem Tag verkaufen, am nächsten zerlegen, dann verbessern. */
const TRADE_ROTATION: readonly TradeAction[] = ["sell", "salvage", "upgrade"];
export const DAILY_TRADE_COUNTS: Readonly<Record<TradeAction, number>> = { sell: 3, salvage: 2, upgrade: 2 };
export const WEEKLY_TRADE_COUNTS: Readonly<Record<TradeAction, number>> = { sell: 15, salvage: 10, upgrade: 8 };
/** Einheiten (siehe questReward): täglicher Händler-Auftrag 4, wöchentlicher 20. */
const DAILY_TRADE_UNITS = 4;
const WEEKLY_TRADE_UNITS = 20;

const TRADE_TITLES: Record<TradeAction, { title: string; description: string }> = {
  sell: { title: "Ware für den Händler", description: "Der Händler sucht Waffen und Rüstungen für seine Kundschaft." },
  salvage: { title: "Rohstoffe für die Schmiede", description: "Der Schmied braucht Essenz – zerlege ein paar Ausrüstungsteile für ihn." },
  upgrade: { title: "Feuer in der Esse", description: "Der Schmied will sehen, was du kannst: Verbessere deine Ausrüstung." },
};

/** Händler-Auftrag für Tag bzw. Woche Nummer `index` – reihum. */
export function tradeActionFor(index: number): TradeAction {
  const n = TRADE_ROTATION.length;
  return TRADE_ROTATION[((index % n) + n) % n];
}

/** Tage seit 1970 für einen Schlüssel "yyyy-mm-dd". */
function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function tradeQuest(id: string, action: TradeAction, count: number, reward: QuestReward): QuestDef {
  return { id, ...TRADE_TITLES[action], goal: { kind: "trade", action, count }, reward };
}

/** Kreaturen, die für Tagesaufträge in Frage kommen: aus offenen Gebieten, kein Boss, nicht zu leicht oder zu schwer. */
export function dailyCandidates(heroLevel: number): CreatureDef[] {
  const open = AREAS.filter((a) => isAreaUnlocked(a, heroLevel))
    .flatMap((a) => a.creatures)
    .filter((c) => !c.boss);
  const fitting = open.filter((c) => c.level <= heroLevel + 2 && c.level >= heroLevel - 6);
  // Zu wenige (ganz am Anfang): die schwächsten Kreaturen
  return fitting.length >= DAILY_HUNT_COUNT ? fitting : [...open].sort((a, b) => a.level - b.level).slice(0, DAILY_HUNT_COUNT);
}

/** Neue Tagesaufträge: drei Jagden auf verschiedene Kreaturen (je 3–6 Siege) und ein Händler-Auftrag. */
export function rollDailyQuests(date: string, heroLevel: number, rng: () => number = Math.random): QuestBoard {
  const pool = [...dailyCandidates(heroLevel)];
  const quests: BoardQuest[] = [];
  while (quests.length < DAILY_HUNT_COUNT && pool.length > 0) {
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
  const action = tradeActionFor(dayNumber(date));
  const reward = questReward(heroLevel, DAILY_TRADE_UNITS, DAILY_DROP_CHANCE, KILL_WEIGHTS);
  quests.push({ def: tradeQuest(`daily-${date}-trade`, action, DAILY_TRADE_COUNTS[action], reward), progress: 0, turnedIn: false });
  return { date, quests };
}

/** Wochenaufträge: so viele Siege, Bosse und Dungeons. */
export const WEEKLY_KILLS = 75;
export const WEEKLY_BOSSES = 5;
export const WEEKLY_DUNGEONS = 3;
/** Den Dungeon-Auftrag gibt es erst, wenn der erste Dungeon offen ist. */
export const WEEKLY_DUNGEON_LEVEL = Math.min(...DUNGEONS.map((d) => d.minLevel));
/** Wochenaufträge geben immer ein Item, eher selten oder besser. */
export const WEEKLY_DROP_CHANCE = 1;

/** Neue Wochenaufträge – `week` ist der Montag der Woche. Belohnung nach dem Level des Helden. */
export function rollWeeklyQuests(week: string, heroLevel: number): QuestBoard {
  const reward = (units: number) => questReward(heroLevel, units, WEEKLY_DROP_CHANCE, BOSS_WEIGHTS);
  const defs: QuestDef[] = [
    {
      id: `weekly-${week}-kills`,
      title: "Grosse Jagd",
      description: "Die Wildnis wird zu gefährlich – dünne sie aus, egal wo.",
      goal: { kind: "killAny", count: WEEKLY_KILLS },
      reward: reward(30),
    },
    {
      id: `weekly-${week}-bosses`,
      title: "Bossjäger",
      description: "Die Gilde zahlt für jeden gefallenen Anführer.",
      goal: { kind: "killAny", count: WEEKLY_BOSSES, boss: true },
      reward: reward(30),
    },
  ];
  if (heroLevel >= WEEKLY_DUNGEON_LEVEL) {
    defs.push({
      id: `weekly-${week}-dungeons`,
      title: "Tiefer hinab",
      description: "Erkunde die Dungeons und bring zurück, was du findest.",
      goal: { kind: "dungeons", count: WEEKLY_DUNGEONS },
      reward: reward(36),
    });
  }
  const action = tradeActionFor(Math.floor(dayNumber(week) / 7));
  defs.push(tradeQuest(`weekly-${week}-trade`, action, WEEKLY_TRADE_COUNTS[action], reward(WEEKLY_TRADE_UNITS)));
  return { date: week, quests: defs.map((def) => ({ def, progress: 0, turnedIn: false })) };
}

/** Wendet ein Ereignis auf die offenen Aufträge an. Ohne Änderung kommt dasselbe Objekt zurück. */
export function applyBoardEvent(board: QuestBoard, event: QuestEvent): QuestBoard {
  let changed = false;
  const quests = board.quests.map((q) => {
    if (q.turnedIn) return q;
    const progress = advanceQuest(q.def, q.progress, event);
    if (progress === q.progress) return q;
    changed = true;
    return { ...q, progress };
  });
  return changed ? { ...board, quests } : board;
}

/** Gibt einen erfüllten Auftrag ab. */
export function turnInBoardQuest(board: QuestBoard, id: string): QuestBoard {
  const quest = board.quests.find((q) => q.def.id === id);
  if (!quest || quest.turnedIn) throw new Error("Diesen Auftrag gibt es nicht (mehr).");
  if (!isQuestComplete(quest.def, quest.progress)) throw new Error("Der Auftrag ist noch nicht erfüllt.");
  return { ...board, quests: board.quests.map((q) => (q.def.id === id ? { ...q, turnedIn: true } : q)) };
}

/* ───────────── Übersicht ───────────── */

export type QuestSource = "story" | "daily" | "weekly";

export interface TrackedQuest {
  def: QuestDef;
  progress: number;
  source: QuestSource;
}

/**
 * Alles, was gerade läuft und noch nicht abgegeben ist: Tagesaufträge von heute,
 * Wochenaufträge dieser Woche und angenommene Quests aus dem Questbuch.
 */
export function trackedQuests(
  log: QuestLog,
  daily: QuestBoard,
  weekly: QuestBoard,
  today: string,
  week: string,
): TrackedQuest[] {
  const open = (board: QuestBoard, date: string, source: QuestSource): TrackedQuest[] =>
    board.date === date ? board.quests.filter((q) => !q.turnedIn).map((q) => ({ def: q.def, progress: q.progress, source })) : [];
  const story = Object.entries(log.active).map(([id, progress]) => ({ def: getQuest(id), progress, source: "story" as const }));
  return [...open(daily, today, "daily"), ...open(weekly, week, "weekly"), ...story];
}

/** Laufende Quests, die ein Sieg gegen genau diese Kreatur voranbringt (ohne allgemeine Wochenaufträge). */
export function questsForCreature(tracked: readonly TrackedQuest[], creatureId: string): TrackedQuest[] {
  return tracked.filter((q) => q.def.goal.kind === "kill" && q.def.goal.creatureId === creatureId);
}
