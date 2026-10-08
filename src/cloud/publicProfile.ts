// Reine Hilfsfunktionen für die Online-Funktionen – ohne Netzwerk, gut testbar.
//
// Öffentlich wird nur, was zum Spiel gehört (Level, Ausrüstung, Attribute,
// Sammlung, Anzahl Quests). Gold, Inventar und der Rest des Spielstands bleiben
// privat in der Tabelle "saves".

import { totalTiers, type AchievementTiers, type Records } from "../domain/achievements";
import { EMPTY_COOP_STATS, type CoopStats } from "../domain/coopCombat";
import { getEffectiveStats } from "../domain/equipment";
import { getLevel } from "../domain/leveling";
import type { QuestLog } from "../domain/quests";
import type { Character, Equipment, Stats, WeaponType } from "../domain/types";

/** Was ein öffentliches Profil zeigt. */
export interface ProfileSnapshot {
  /** Früherer Level-Titel – wird nicht mehr geschrieben und nicht mehr angezeigt */
  title?: string;
  /** Attribute inkl. Ausrüstungs- und Set-Boni */
  stats: Stats;
  equipment: Equipment;
  bossCollection: string[];
  skills: Partial<Record<WeaponType, number>>;
  /** Koop-Erfolge – fehlt bei Profilen von vor Etappe 3 */
  coop?: CoopStats;
  /** Gewählter Titel (Id des Erfolgs) und Avatar-Rahmen – fehlen bei älteren Profilen */
  achievementTitle?: string | null;
  frame?: string;
  /** Freigeschaltete Erfolgsstufen */
  achievementTiers?: number;
}

/** Eine Zeile der Tabelle public_profiles (ohne user_id/username). */
export interface PublicProfileRow {
  hero_name: string;
  level: number;
  total_xp: number;
  quests_done: number;
  boss_items: number;
  snapshot: ProfileSnapshot;
}

/** Profil, wie es aus der Datenbank kommt (Rangliste, Profilseite). */
export interface PublicProfile extends PublicProfileRow {
  username: string;
  updated_at: string;
}

interface GameData {
  character: Character;
  equipment: Equipment;
  records?: Pick<Records, "questsCompleted">;
  questLog?: QuestLog;
  bossCollection: string[];
  coopStats?: CoopStats;
  achievements?: AchievementTiers;
  cosmetics?: { title: string | null; frame: string };
}

export function buildPublicProfile({ character, equipment, records, bossCollection, coopStats, achievements, cosmetics }: GameData): PublicProfileRow {
  const level = getLevel(character.totalXp);
  return {
    hero_name: character.name,
    level,
    total_xp: character.totalXp,
    quests_done: records?.questsCompleted ?? 0,
    boss_items: bossCollection.length,
    snapshot: {
      stats: getEffectiveStats(character.stats, equipment),
      equipment,
      bossCollection,
      skills: character.skills,
      coop: coopStats ?? EMPTY_COOP_STATS,
      achievementTitle: cosmetics?.title ?? null,
      frame: cosmetics?.frame ?? "none",
      achievementTiers: totalTiers(achievements ?? {}),
    },
  };
}

/** Gespeicherter Spielstand, wie zustand/persist ihn in localStorage ablegt. */
export interface PersistedSave {
  state: Partial<GameData> & Record<string, unknown>;
  version: number;
}

export interface SaveSummary {
  heroName: string;
  level: number;
  totalXp: number;
  questsDone: number;
  bossItems: number;
}

/** To-dos aus Spielständen vor v14 – Cloud-Stände sind beim Herunterladen noch nicht migriert. */
function legacyQuests(state: PersistedSave["state"]): { status?: string }[] {
  return Array.isArray(state.quests) ? state.quests : [];
}

/** Abgegebene Quests – bei alten Spielständen die erledigten To-dos. */
function questsDone(state: PersistedSave["state"]): number {
  return state.records?.questsCompleted ?? legacyQuests(state).filter((q) => q.status === "done").length;
}

/** Kurzfassung eines Spielstands – für die Frage „Welchen Stand behalten?“. */
export function summarizeSave(save: PersistedSave): SaveSummary {
  const { character, bossCollection = [] } = save.state;
  const totalXp = character?.totalXp ?? 0;
  return {
    heroName: character?.name ?? "Held",
    level: getLevel(totalXp),
    totalXp,
    questsDone: questsDone(save.state),
    bossItems: bossCollection.length,
  };
}

/** Noch nichts gespielt? Dann kann ein Cloud-Stand ohne Rückfrage übernommen werden. */
export function isFreshSave(save: PersistedSave | null): boolean {
  if (!save) return true;
  const { character, questLog } = save.state;
  const started = Object.keys(questLog?.active ?? {}).length > 0 || legacyQuests(save.state).length > 0;
  return (character?.totalXp ?? 0) === 0 && questsDone(save.state) === 0 && !started;
}

/** Benutzername für die Profil-Adresse: 3–20 Zeichen, a–z, 0–9, _ und -. */
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;

/** Macht aus einer Eingabe einen gültigen Benutzernamen-Vorschlag. */
export function normalizeUsername(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 20);
}
