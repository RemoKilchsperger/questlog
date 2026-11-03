// Verbindung zum Tausch-Server. Zwei Varianten mit derselben Schnittstelle (wie beim Koop):
// - "cloud": Befehle an die Edge Function "trade", Änderungen live über
//   Supabase Realtime (nur die zwei Beteiligten sehen ihren Tausch – RLS).
// - "local": nur im Dev-Server ohne Login. Dieselbe Server-Logik läuft im
//   Browser, der Tausch liegt im localStorage, Tabs erfahren Änderungen über
//   BroadcastChannel. Beide Tabs teilen sich den Spielstand – zum Ausprobieren
//   des Ablaufs, nicht des Besitzerwechsels.

import { supabase } from "../cloud/supabase";
import { newLobbyCode } from "../coop/protocol";
import { useGameStore } from "../store/gameStore";
import type { TradeCommand, TradeResponse, TradeRow } from "./protocol";
import { applyTradeCommand, TRADE_ROW_TTL_HOURS, TradeError, traderFromSave } from "./server";

export interface TradeBackend {
  kind: "cloud" | "local";
  /** Befehl an den Server – `id` ist der Tausch (ausser bei create/join). Wirft mit lesbarer Meldung. */
  send(command: TradeCommand, id: string | undefined, userId: string): Promise<TradeResponse>;
  /** Änderungen an einem Tausch abonnieren – gibt eine Abmelde-Funktion zurück. */
  subscribe(id: string, onRow: (row: TradeRow) => void): () => void;
  /** Offener Tausch dieses Spielers (zum Wiederverbinden). */
  findOpen(userId: string): Promise<TradeRow | null>;
  /** Abgeschlossene Tausche dieses Spielers – zum Ausführen am Spielstand (Etappe 4). */
  findDone(userId: string): Promise<TradeRow[]>;
}

/** Welche Verbindung gerade möglich ist – null = keine (kein Login, kein Dev-Server). */
export function availableTradeBackend(loggedIn: boolean): TradeBackend["kind"] | null {
  if (supabase && loggedIn) return "cloud";
  if (import.meta.env.DEV) return "local";
  return null;
}

export function getTradeBackend(kind: TradeBackend["kind"]): TradeBackend {
  return kind === "cloud" ? cloudBackend : localBackend;
}

/* ───────────── Cloud: Edge Function + Realtime ───────────── */

const cloudBackend: TradeBackend = {
  kind: "cloud",

  async send(command, id) {
    if (!supabase) throw new Error("Keine Cloud-Verbindung eingerichtet.");
    const { data, error } = await supabase.functions.invoke<TradeResponse>("trade", { body: { command, id } });
    if (error) {
      // Lesbare Meldung des Servers (z. B. „Erst müssen beide bereit sein.“) aus der Antwort holen
      let message = "Der Tausch-Server ist gerade nicht erreichbar.";
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
      .channel(`trade-row-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trades", filter: `id=eq.${id}` }, (payload) =>
        onRow(payload.new as TradeRow),
      )
      .subscribe();
    return () => void client.removeChannel(channel);
  },

  async findOpen(userId) {
    if (!supabase) return null;
    const { data } = await supabase
      .from("trades")
      .select("*")
      .contains("player_ids", [userId])
      .eq("status", "open")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as TradeRow | null) ?? null;
  },

  async findDone(userId) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .contains("player_ids", [userId])
      .eq("status", "done")
      .order("completed_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as TradeRow[] | null) ?? [];
  },
};

/* ───────────── Lokal: Testmodus im Dev-Server ───────────── */

const LOCAL_DB = "questlog-tausch-db";
const localChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LOCAL_DB) : null;

function readLocal(): Record<string, TradeRow> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DB) ?? "{}") as Record<string, TradeRow>;
  } catch {
    return {};
  }
}

const DAY_MS = 24 * 3600_000;

const localBackend: TradeBackend = {
  kind: "local",

  async send(command, id, userId) {
    const rows = readLocal();
    const now = Date.now();
    if (command.type === "create") {
      for (const [key, r] of Object.entries(rows)) {
        if (r.status !== "done" && now - Date.parse(r.updated_at) > TRADE_ROW_TTL_HOURS * 3600_000) delete rows[key];
      }
    }
    const row =
      command.type === "create"
        ? null
        : command.type === "join"
          ? (Object.values(rows).find((r) => r.code === command.code && r.status === "open") ?? null)
          : (rows[id ?? ""] ?? null);
    const mine = Object.values(rows).filter((r) => r.player_ids.includes(userId));
    // Wie der Server: Level und Inventar aus dem Spielstand – hier dem eigenen im Browser
    const { character, inventory } = useGameStore.getState();
    try {
      const next = applyTradeCommand(row, command, {
        userId,
        now,
        newId: () => crypto.randomUUID(),
        newCode: () => newLobbyCode(),
        traders: { [userId]: traderFromSave(userId, { state: { character, inventory } }) },
        tradesToday: { [userId]: mine.filter((r) => r.status === "done" && now - Date.parse(r.completed_at ?? "") < DAY_MS).length },
        openTrades: mine.filter((r) => r.status === "open" && r.id !== row?.id).length,
      });
      if (next !== row) {
        rows[next.id] = next;
        localStorage.setItem(LOCAL_DB, JSON.stringify(rows));
        localChannel?.postMessage(next);
      }
      return { row: next };
    } catch (error) {
      throw new Error(error instanceof TradeError ? error.message : String(error));
    }
  },

  subscribe(id, onRow) {
    const listener = (e: MessageEvent<TradeRow>) => {
      if (e.data.id === id) onRow(e.data);
    };
    localChannel?.addEventListener("message", listener);
    return () => localChannel?.removeEventListener("message", listener);
  },

  async findOpen(userId) {
    const rows = Object.values(readLocal()).filter((r) => r.player_ids.includes(userId) && r.status === "open");
    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  },

  async findDone(userId) {
    return Object.values(readLocal())
      .filter((r) => r.player_ids.includes(userId) && r.status === "done")
      .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));
  },
};
