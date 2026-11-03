// Item-Tausch im Browser (docs/item-tausch.md). Der Server (Edge Function bzw.
// lokaler Testmodus) prüft und entscheidet; der Browser schickt nur Befehle und
// übernimmt den Stand, den er zurückbekommt – als Antwort oder live über
// Realtime. Hier passiert nur, was zum eigenen Spielstand gehört: Items im
// eigenen Angebot sperren und einen abgeschlossenen Tausch ausführen.

import { create } from "zustand";
import { useCloudStore } from "../cloud/cloudStore";
import type { OwnedItem } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { availableTradeBackend, getTradeBackend, type TradeBackend } from "./backend";
import type { TradeCommand, TradeRow } from "./protocol";
import { tradeSides } from "./server";

/** Ausgeführter Tausch – für die Anzeige „Erhalten“. */
export interface TradeResult {
  id: string;
  partner: string;
  received: OwnedItem[];
  given: OwnedItem[];
}

interface TradeState {
  backend: TradeBackend["kind"] | null;
  /** Der Tausch, wie ihn der Server zuletzt geschickt hat */
  row: TradeRow | null;
  myId: string;
  /** Zuletzt ausgeführter Tausch */
  result: TradeResult | null;
  busy: boolean;
  error: string | null;

  createTrade: () => Promise<void>;
  joinTrade: (code: string) => Promise<void>;
  /** Item ins eigene Angebot legen bzw. herausnehmen */
  toggleItem: (uid: string) => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Abgeschlossenen oder abgebrochenen Tausch schliessen */
  close: () => void;
  /** Offenen Tausch wieder aufnehmen und abgeschlossene, noch nicht ausgeführte Tausche ausführen */
  resume: () => Promise<void>;
  clearError: () => void;
}

/** Spieler-Id: das Cloud-Konto – im lokalen Testmodus eine Id pro Tab. */
function currentPlayerId(): string {
  const session = useCloudStore.getState().session;
  if (session) return session.user.id;
  let id = sessionStorage.getItem("questlog-tausch-id");
  if (!id) {
    id = `tab-${crypto.randomUUID().slice(0, 8)}`;
    sessionStorage.setItem("questlog-tausch-id", id);
  }
  return id;
}

let unsubscribe: (() => void) | null = null;

export const useTradeStore = create<TradeState>()((set, get) => {
  function lock(row: TradeRow | null) {
    const uids = row?.status === "open" ? (row.offers[get().myId] ?? []).map((i) => i.uid) : [];
    useGameStore.getState().setTradeLocked(uids);
  }

  /** Abgeschlossenen Tausch am eigenen Spielstand ausführen – jeden nur einmal. */
  function execute(row: TradeRow): TradeResult | null {
    const myId = get().myId;
    const { give, receive } = tradeSides(row, myId);
    if (!useGameStore.getState().applyCompletedTrade(row.id, give, receive)) return null;
    // Sofort hochladen: der alte Stand mit den abgegebenen Items wird ohnehin abgelehnt
    if (get().backend === "cloud") void useCloudStore.getState().uploadNow();
    const partner = row.player_ids.find((id) => id !== myId);
    return { id: row.id, partner: (partner && row.names[partner]) || "Tauschpartner", received: receive, given: give };
  }

  /** Neuen Stand übernehmen – ältere Versionen (verspätete Nachrichten) werden ignoriert. */
  function applyRow(next: TradeRow) {
    const prev = get().row;
    if (prev && prev.id === next.id && next.version <= prev.version) return;
    if (!next.player_ids.includes(get().myId)) return;
    const result = next.status === "done" ? (execute(next) ?? get().result) : get().result;
    set({ row: next, result });
    lock(next);
    if (next.status !== "open") {
      unsubscribe?.();
      unsubscribe = null;
    } else if (!unsubscribe || prev?.id !== next.id) {
      unsubscribe?.();
      unsubscribe = getTradeBackend(get().backend!).subscribe(next.id, applyRow);
    }
  }

  function ensureBackend(): TradeBackend["kind"] | null {
    const kind = availableTradeBackend(!!useCloudStore.getState().session);
    set({ backend: kind, myId: currentPlayerId() });
    if (!kind) set({ error: "Zum Tauschen brauchst du ein Online-Konto." });
    return kind;
  }

  async function send(command: TradeCommand): Promise<boolean> {
    const kind = get().backend ?? ensureBackend();
    if (!kind) return false;
    set({ busy: true });
    try {
      // Der Server prüft gegen den Cloud-Spielstand – vorher den aktuellen hochladen
      if (kind === "cloud" && command.type !== "ready" && command.type !== "cancel") {
        await useCloudStore.getState().uploadNow();
      }
      const response = await getTradeBackend(kind).send(command, get().row?.id, get().myId);
      set({ busy: false, error: null });
      applyRow(response.row);
      return true;
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  return {
    backend: null,
    row: null,
    myId: "",
    result: null,
    busy: false,
    error: null,

    createTrade: async () => {
      if (!ensureBackend()) return;
      set({ row: null, result: null });
      await send({ type: "create" });
    },

    joinTrade: async (code) => {
      if (!ensureBackend()) return;
      set({ row: null, result: null });
      await send({ type: "join", code: code.trim().toUpperCase() });
    },

    toggleItem: async (uid) => {
      const { row, myId } = get();
      if (!row || row.status !== "open") return;
      const mine = row.offers[myId] ?? [];
      const inOffer = mine.some((i) => i.uid === uid);
      const item = useGameStore.getState().inventory.find((i) => i.uid === uid);
      const items = inOffer ? mine.filter((i) => i.uid !== uid) : item ? [...mine, item] : mine;
      await send({ type: "offer", items });
    },

    setReady: async (ready) => {
      await send({ type: "ready", ready });
    },

    confirm: async () => {
      await send({ type: "confirm" });
    },

    cancel: async () => {
      await send({ type: "cancel" });
    },

    close: () => {
      unsubscribe?.();
      unsubscribe = null;
      set({ row: null, result: null, error: null });
      lock(null);
    },

    resume: async () => {
      const kind = availableTradeBackend(!!useCloudStore.getState().session);
      if (!kind) return;
      set({ backend: kind, myId: currentPlayerId() });
      const backend = getTradeBackend(kind);
      try {
        // Abgeschlossene Tausche, die dieser Spielstand noch nicht kennt (z. B. offline gegangen)
        for (const row of await backend.findDone(get().myId)) {
          const result = execute(row);
          if (result) set({ result });
        }
        if (!get().row) {
          const open = await backend.findOpen(get().myId);
          if (open) applyRow(open);
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    clearError: () => set({ error: null }),
  };
});
