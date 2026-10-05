// Öffentliche Daten lesen: Rangliste und Profile. Für alle sichtbar, auch ohne Login.

import type { PublicProfile } from "./publicProfile";
import { supabase } from "./supabase";

const COLUMNS = "username, hero_name, level, total_xp, quests_done, boss_items, snapshot, updated_at";
export const LEADERBOARD_SIZE = 100;

/** Die besten Helden nach Erfahrung. */
export async function fetchLeaderboard(): Promise<PublicProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("public_profiles")
    .select(COLUMNS)
    .order("total_xp", { ascending: false })
    .limit(LEADERBOARD_SIZE);
  if (error) throw new Error(error.message);
  return data as PublicProfile[];
}

/** Ein Profil nach Benutzernamen – null, wenn es keins gibt. */
export async function fetchProfile(username: string): Promise<PublicProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("public_profiles").select(COLUMNS).eq("username", username).maybeSingle();
  if (error) throw new Error(error.message);
  return data as PublicProfile | null;
}

/** Platz in der Rangliste (1 = Erster) anhand der XP. */
export async function fetchRank(totalXp: number): Promise<number | null> {
  if (!supabase) return null;
  const { count, error } = await supabase
    .from("public_profiles")
    .select("user_id", { count: "exact", head: true })
    .gt("total_xp", totalXp);
  if (error) return null;
  return (count ?? 0) + 1;
}
