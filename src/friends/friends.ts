// Freundesliste (docs/freunde.md): Anfragen und Freundschaften in der Tabelle
// `friendships`. Der Browser schreibt direkt, RLS regelt, wer was darf.

import { supabase } from "../cloud/supabase";
import type { HeroLooks } from "../domain/looks";
import type { Equipment } from "../domain/types";

export type FriendStatus = "accepted" | "incoming" | "outgoing";

export interface Friend {
  id: string;
  status: FriendStatus;
  username: string;
  heroName: string;
  level: number;
  /** Letzter Cloud-Sync des Profils – „zuletzt aktiv“ */
  updatedAt: string;
  equipment: Equipment;
  frame?: string;
  looks?: HeroLooks;
}

interface FriendshipRow {
  user_a: string;
  user_b: string;
  requested_by: string;
  status: "pending" | "accepted";
}

interface FriendProfileRow {
  user_id: string;
  username: string;
  hero_name: string;
  level: number;
  updated_at: string;
  equipment: Equipment;
  frame: string | null;
  looks: HeroLooks | null;
}

/** Ein Paar steht genau einmal in der Tabelle: die kleinere Id vorne. */
export function friendPair(me: string, other: string): { user_a: string; user_b: string } {
  return me < other ? { user_a: me, user_b: other } : { user_a: other, user_b: me };
}

export function friendStatus(row: FriendshipRow, me: string): FriendStatus {
  if (row.status === "accepted") return "accepted";
  return row.requested_by === me ? "outgoing" : "incoming";
}

/** „vor 5 Min.“, „vor 3 Std.“, „vor 2 Tagen“ – „zuletzt aktiv“ bei Freunden ohne offene Lobby. */
export function lastSeenText(updatedAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 60_000));
  if (minutes < 2) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "gestern" : `vor ${days} Tagen`;
}

function client() {
  if (!supabase) throw new Error("Keine Cloud-Verbindung eingerichtet.");
  return supabase;
}

/** Alle Freunde und offenen Anfragen – mit den nötigen Profildaten (ohne den grossen Snapshot). */
export async function fetchFriends(me: string): Promise<Friend[]> {
  const db = client();
  const { data, error } = await db.from("friendships").select("user_a, user_b, requested_by, status");
  if (error) throw new Error(error.message);
  const rows = data as FriendshipRow[];
  if (rows.length === 0) return [];
  const otherId = (r: FriendshipRow) => (r.user_a === me ? r.user_b : r.user_a);
  const profiles = await db
    .from("public_profiles")
    .select("user_id, username, hero_name, level, updated_at, equipment:snapshot->equipment, frame:snapshot->>frame, looks:snapshot->looks")
    .in("user_id", rows.map(otherId));
  if (profiles.error) throw new Error(profiles.error.message);
  const byId = new Map((profiles.data as unknown as FriendProfileRow[]).map((p) => [p.user_id, p]));
  return rows.flatMap((r) => {
    const p = byId.get(otherId(r));
    if (!p) return [];
    return [
      {
        id: p.user_id,
        status: friendStatus(r, me),
        username: p.username,
        heroName: p.hero_name,
        level: p.level,
        updatedAt: p.updated_at,
        equipment: p.equipment,
        frame: p.frame ?? undefined,
        looks: p.looks ?? undefined,
      },
    ];
  });
}

/**
 * Anfrage an einen Benutzernamen. Hat der andere schon gefragt, wird daraus gleich eine
 * Freundschaft. Wirft mit lesbarer Meldung.
 */
export async function sendFriendRequest(me: string, username: string): Promise<void> {
  const db = client();
  const { data: profile, error } = await db.from("public_profiles").select("user_id").eq("username", username).maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error(`Es gibt keinen Helden namens „${username}“.`);
  const other = profile.user_id as string;
  if (other === me) throw new Error("Dich selbst kannst du nicht hinzufügen.");
  const pair = friendPair(me, other);
  const insert = await db.from("friendships").insert({ ...pair, requested_by: me });
  if (!insert.error) return;
  if (insert.error.code !== "23505") {
    // Die Regel lässt höchstens 50 offene Anfragen zu
    throw new Error(insert.error.code === "42501" ? "Du hast zu viele offene Anfragen." : insert.error.message);
  }
  // Das Paar gibt es schon
  const existing = await db.from("friendships").select("user_a, user_b, requested_by, status").match(pair).single();
  if (existing.error) throw new Error(existing.error.message);
  const status = friendStatus(existing.data as FriendshipRow, me);
  if (status === "accepted") throw new Error("Ihr seid schon befreundet.");
  if (status === "outgoing") throw new Error("Deine Anfrage ist schon unterwegs.");
  await acceptFriend(me, other);
}

export async function acceptFriend(me: string, other: string): Promise<void> {
  const { error } = await client().from("friendships").update({ status: "accepted" }).match(friendPair(me, other));
  if (error) throw new Error(error.message);
}

/** Ablehnen, zurückziehen oder entfreunden. */
export async function removeFriend(me: string, other: string): Promise<void> {
  const { error } = await client().from("friendships").delete().match(friendPair(me, other));
  if (error) throw new Error(error.message);
}
