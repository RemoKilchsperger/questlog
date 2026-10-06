// Datenform eines Koop-Kampfs, wie er in der Tabelle `coop_battles` liegt,
// und die Befehle, die Spieler an den Server schicken (Etappe 2 aus
// docs/koop-kampf.md). Wird von Browser und Edge Function gemeinsam genutzt.

import type { HeroCombatProfile } from "../domain/combat";
import type { CoopAction, CoopBattleState, CoopEvent } from "../domain/coopCombat";
import type { Equipment } from "../domain/types";

export interface CoopMember {
  /** Id des Spielers (Supabase-Konto bzw. Tab im lokalen Testmodus) */
  id: string;
  /** Heldenname */
  name: string;
  /** Öffentlicher Benutzername (nur mit Cloud-Konto) */
  username: string | null;
  level: number;
  equipment: Equipment;
  /** Kampfwerte – vom Server aus dem Cloud-Spielstand berechnet */
  profile: HeroCombatProfile;
  ready: boolean;
  /** Hat den laufenden Kampf verlassen – sein Held greift automatisch an */
  left?: boolean;
}

/** "finished" = Kampf vorbei, das Ergebnis steht in `state.status`. */
export type CoopPhase = "lobby" | "battle" | "finished";

export interface CoopRow {
  id: string;
  code: string;
  host_id: string;
  boss_id: string;
  phase: CoopPhase;
  members: CoopMember[];
  /** Für die Zugriffsregel: nur diese Konten dürfen den Kampf lesen */
  player_ids: string[];
  state: CoopBattleState | null;
  /** Gewählte Aktionen der laufenden Runde, nach Spieler-Id */
  actions: Record<string, CoopAction>;
  /** Ereignisse der zuletzt aufgelösten Runde – für die Animation */
  last_events: CoopEvent[];
  /** Steigt bei jeder Änderung – schützt vor gleichzeitigem Überschreiben */
  version: number;
  updated_at: string;
}

export type CoopCommand =
  | { type: "create"; bossId: string }
  | { type: "join"; code: string }
  | { type: "ready"; ready: boolean }
  | { type: "leave" }
  | { type: "start" }
  | { type: "act"; round: number; action: CoopAction }
  /** Zeit der Spielerphase abgelaufen? Dann löst der Server die Runde auf. */
  | { type: "tick" };

/** Kurzer Lobby-Code ohne leicht verwechselbare Zeichen (0/O, 1/I/L). */
export function newLobbyCode(rng: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(rng() * alphabet.length)]).join("");
}

export function isLobbyCode(value: string): boolean {
  return /^[A-HJ-KM-NP-Z2-9]{6}$/.test(value);
}

/** Antwort des Servers: der neue Stand (null = Lobby aufgelöst) und seine Uhrzeit. */
export interface CoopResponse {
  row: CoopRow | null;
  serverNow: number;
}
