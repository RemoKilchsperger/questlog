// Reine Hilfsfunktionen für die Online-Funktionen – ohne Netzwerk, gut testbar.
//
// Öffentlich wird nur, was zum Spiel gehört (Level, Ausrüstung, Attribute,
// Sammlung). Quest-Titel und -Beschreibungen sind echte Aufgaben aus dem Leben
// und bleiben privat: Sie stehen nur im privaten Spielstand (Tabelle "saves").

import { getEffectiveStats } from "../domain/equipment";
import { getLevel, getTitle } from "../domain/leveling";
import type { Character, Equipment, Quest, Stats, WeaponType } from "../domain/types";

/** Was ein öffentliches Profil zeigt – ohne Quest-Inhalte. */
export interface ProfileSnapshot {
  title: string;
  /** Attribute inkl. Ausrüstungs- und Set-Boni */
  stats: Stats;
  equipment: Equipment;
  bossCollection: string[];
  skills: Partial<Record<WeaponType, number>>;
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
  quests: Quest[];
  bossCollection: string[];
}

export function buildPublicProfile({ character, equipment, quests, bossCollection }: GameData): PublicProfileRow {
  const level = getLevel(character.totalXp);
  return {
    hero_name: character.name,
    level,
    total_xp: character.totalXp,
    quests_done: quests.filter((q) => q.status === "done").length,
    boss_items: bossCollection.length,
    snapshot: {
      title: getTitle(level),
      stats: getEffectiveStats(character.stats, equipment),
      equipment,
      bossCollection,
      skills: character.skills,
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

/** Kurzfassung eines Spielstands – für die Frage „Welchen Stand behalten?“. */
export function summarizeSave(save: PersistedSave): SaveSummary {
  const { character, quests = [], bossCollection = [] } = save.state;
  const totalXp = character?.totalXp ?? 0;
  return {
    heroName: character?.name ?? "Held",
    level: getLevel(totalXp),
    totalXp,
    questsDone: quests.filter((q) => q.status === "done").length,
    bossItems: bossCollection.length,
  };
}

/** Noch nichts gespielt? Dann kann ein Cloud-Stand ohne Rückfrage übernommen werden. */
export function isFreshSave(save: PersistedSave | null): boolean {
  if (!save) return true;
  const { character, quests = [] } = save.state;
  return (character?.totalXp ?? 0) === 0 && quests.length === 0;
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
