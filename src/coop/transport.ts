// Verbindung einer Koop-Lobby: alle Teilnehmer schicken sich Nachrichten
// über einen gemeinsamen Kanal. Zwei Varianten mit derselben Schnittstelle:
// - Supabase Realtime (Broadcast) – das echte Spiel, braucht ein Cloud-Konto.
// - BroadcastChannel – nur im Dev-Server: mehrere Tabs desselben Browsers
//   spielen miteinander, ganz ohne Login (zum Testen).
// In beiden Fällen bekommt der Absender seine eigene Nachricht nicht zurück.

import type { Equipment } from "../domain/types";
import type { CoopAction, CoopBattleState, CoopEvent } from "../domain/coopCombat";
import type { HeroCombatProfile } from "../domain/combat";
import { supabase } from "../cloud/supabase";

export interface CoopMember {
  id: string;
  /** Heldenname */
  name: string;
  /** Öffentlicher Benutzername (nur mit Cloud-Konto) */
  username: string | null;
  level: number;
  equipment: Equipment;
  profile: HeroCombatProfile;
  ready: boolean;
}

export type CoopMessage =
  /** Spieler → alle: ich bin da (beim Beitreten und nach einem Verbindungsabbruch) */
  | { type: "hello"; member: CoopMember }
  /** Spieler → alle: bereit ja/nein – mit aktuellen Werten (Ausrüstung kann sich geändert haben) */
  | { type: "ready"; member: CoopMember }
  | { type: "leave"; id: string }
  /** Host → alle: aktueller Stand der Lobby */
  | { type: "lobby"; hostId: string; bossId: string; members: CoopMember[] }
  /** Host → einen Spieler: Beitritt abgelehnt (voll, Kampf läuft …) */
  | { type: "rejected"; id: string; reason: string }
  /** Host → alle: Kampfstart bzw. neuer Stand. `remaining` = ms bis zum Ende der Spielerphase */
  | { type: "start"; state: CoopBattleState; remaining: number }
  | { type: "round"; state: CoopBattleState; events: CoopEvent[]; remaining: number }
  /** Host → einen Spieler, der wieder da ist: der laufende Kampf */
  | { type: "sync"; to: string; hostId: string; bossId: string; members: CoopMember[]; state: CoopBattleState; chosen: string[]; remaining: number }
  /** Spieler → Host: gewählte Aktion der Runde */
  | { type: "action"; id: string; round: number; action: CoopAction }
  /** Host → alle: wer in dieser Runde schon gewählt hat */
  | { type: "chosen"; round: number; ids: string[] }
  /** Host → alle: Lobby bzw. Kampf aufgelöst */
  | { type: "abort"; reason: string }
  /** Lebenszeichen, damit Verbindungsabbrüche auffallen */
  | { type: "ping"; id: string };

export interface CoopTransport {
  /** "cloud" = Supabase Realtime, "local" = Tabs im selben Browser (nur Dev) */
  kind: "cloud" | "local";
  send(message: CoopMessage): void;
  onMessage(handler: (message: CoopMessage) => void): void;
  close(): void;
}

/** Welche Verbindung gerade möglich ist – null = keine (kein Login, kein Dev-Server). */
export function availableTransport(loggedIn: boolean): CoopTransport["kind"] | null {
  if (supabase && loggedIn) return "cloud";
  if (import.meta.env.DEV) return "local";
  return null;
}

export function openTransport(kind: CoopTransport["kind"], code: string): CoopTransport {
  return kind === "cloud" ? cloudTransport(code) : localTransport(code);
}

function cloudTransport(code: string): CoopTransport {
  if (!supabase) throw new Error("Keine Cloud-Verbindung eingerichtet.");
  const client = supabase;
  const handlers: ((message: CoopMessage) => void)[] = [];
  const queue: CoopMessage[] = [];
  let joined = false;
  const channel = client.channel(`koop-${code}`, { config: { broadcast: { self: false, ack: false } } });
  channel.on("broadcast", { event: "msg" }, ({ payload }) => handlers.forEach((h) => h(payload as CoopMessage)));
  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    joined = true;
    // Nachrichten, die vor dem Verbinden gesendet wurden, nachholen
    for (const message of queue.splice(0)) void channel.send({ type: "broadcast", event: "msg", payload: message });
  });
  return {
    kind: "cloud",
    send: (message) => {
      if (!joined) queue.push(message);
      else void channel.send({ type: "broadcast", event: "msg", payload: message });
    },
    onMessage: (handler) => void handlers.push(handler),
    close: () => void client.removeChannel(channel),
  };
}

function localTransport(code: string): CoopTransport {
  const channel = new BroadcastChannel(`questlog-koop-${code}`);
  return {
    kind: "local",
    send: (message) => channel.postMessage(message),
    onMessage: (handler) => channel.addEventListener("message", (e: MessageEvent<CoopMessage>) => handler(e.data)),
    close: () => channel.close(),
  };
}

/** Kurzer Lobby-Code ohne leicht verwechselbare Zeichen (0/O, 1/I/L). */
export function newLobbyCode(rng: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(rng() * alphabet.length)]).join("");
}

export function isLobbyCode(value: string): boolean {
  return /^[A-HJ-KM-NP-Z2-9]{6}$/.test(value);
}
