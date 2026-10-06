// Verbindung zum Koop-Server (Etappe 2). Zwei Varianten mit derselben Schnittstelle:
// - "cloud": Befehle an die Edge Function "coop", Änderungen live über
//   Supabase Realtime (nur Teilnehmer sehen ihren Kampf – RLS).
// - "local": nur im Dev-Server ohne Login. Dieselbe Server-Logik läuft im
//   Browser, der Kampf liegt im localStorage, Tabs erfahren Änderungen über
//   BroadcastChannel – so lässt sich alles mit zwei Tabs ausprobieren.

import { supabase } from "../cloud/supabase";
import { useGameStore } from "../store/gameStore";
import { newLobbyCode, type CoopCommand, type CoopResponse, type CoopRow } from "./protocol";
import { applyCommand, COOP_ROW_TTL_HOURS, CoopError, memberFromSave } from "./server";

export interface CoopBackend {
  kind: "cloud" | "local";
  /** Befehl an den Server – `id` ist der Kampf (ausser bei create/join). Wirft mit lesbarer Meldung. */
  send(command: CoopCommand, id: string | undefined, userId: string): Promise<CoopResponse>;
  /** Änderungen an einem Kampf abonnieren – gibt eine Abmelde-Funktion zurück. */
  subscribe(id: string, onRow: (row: CoopRow) => void): () => void;
  /** Laufende Lobby bzw. laufender Kampf dieses Spielers (zum Wiederverbinden). */
  findActive(userId: string): Promise<CoopRow | null>;
}

/** Welche Verbindung gerade möglich ist – null = keine (kein Login, kein Dev-Server). */
export function availableBackend(loggedIn: boolean): CoopBackend["kind"] | null {
  if (supabase && loggedIn) return "cloud";
  if (import.meta.env.DEV) return "local";
  return null;
}

export function getBackend(kind: CoopBackend["kind"]): CoopBackend {
  return kind === "cloud" ? cloudBackend : localBackend;
}

/* ───────────── Cloud: Edge Function + Realtime ───────────── */

const cloudBackend: CoopBackend = {
  kind: "cloud",

  async send(command, id) {
    if (!supabase) throw new Error("Keine Cloud-Verbindung eingerichtet.");
    const { data, error } = await supabase.functions.invoke<CoopResponse>("coop", { body: { command, id } });
    if (error) {
      // Lesbare Meldung des Servers (z. B. „Die Lobby ist voll.“) aus der Antwort holen
      let message = "Der Koop-Server ist gerade nicht erreichbar.";
      try {
        const body = (await (error as { context?: Response }).context?.json()) as { error?: string } | undefined;
        if (body?.error) message = body.error;
      } catch {
        // keine JSON-Antwort – allgemeine Meldung behalten
      }
      throw new Error(message);
    }
    return data!;
  },

  subscribe(id, onRow) {
    if (!supabase) return () => {};
    const client = supabase;
    const channel = client
      .channel(`coop-row-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "coop_battles", filter: `id=eq.${id}` }, (payload) =>
        onRow(payload.new as CoopRow),
      )
      .subscribe();
    return () => void client.removeChannel(channel);
  },

  async findActive(userId) {
    if (!supabase) return null;
    const { data } = await supabase
      .from("coop_battles")
      .select("*")
      .contains("player_ids", [userId])
      .in("phase", ["lobby", "battle"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as CoopRow | null) ?? null;
  },
};

/* ───────────── Lokal: Testmodus im Dev-Server ───────────── */

const LOCAL_DB = "questlog-koop-db";
const localChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LOCAL_DB) : null;

function readLocal(): Record<string, CoopRow> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DB) ?? "{}") as Record<string, CoopRow>;
  } catch {
    return {};
  }
}

const localBackend: CoopBackend = {
  kind: "local",

  async send(command, id, userId) {
    const rows = readLocal();
    const now = Date.now();
    if (command.type === "create") {
      for (const [key, r] of Object.entries(rows)) {
        if (now - Date.parse(r.updated_at) > COOP_ROW_TTL_HOURS * 3600_000) delete rows[key];
      }
    }
    const row =
      command.type === "create"
        ? null
        : command.type === "join"
          ? (Object.values(rows).find((r) => r.code === command.code) ?? null)
          : (rows[id ?? ""] ?? null);
    // Wie der Server: Kampfwerte aus dem Spielstand – hier dem eigenen im Browser
    const { character, equipment } = useGameStore.getState();
    const member = memberFromSave(userId, { state: { character, equipment } }, null);
    try {
      const next = applyCommand(row, command, {
        userId,
        now,
        rng: Math.random,
        member,
        newId: () => crypto.randomUUID(),
        newCode: () => newLobbyCode(),
      });
      if (next !== row) {
        if (next) rows[next.id] = next;
        else if (row) delete rows[row.id];
        localStorage.setItem(LOCAL_DB, JSON.stringify(rows));
        if (next) localChannel?.postMessage(next);
      }
      return { row: next, serverNow: now };
    } catch (error) {
      throw new Error(error instanceof CoopError ? error.message : String(error));
    }
  },

  subscribe(id, onRow) {
    const listener = (e: MessageEvent<CoopRow>) => {
      if (e.data.id === id) onRow(e.data);
    };
    localChannel?.addEventListener("message", listener);
    return () => localChannel?.removeEventListener("message", listener);
  },

  async findActive(userId) {
    const rows = Object.values(readLocal()).filter(
      (r) => r.player_ids.includes(userId) && (r.phase === "lobby" || r.phase === "battle"),
    );
    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  },
};
