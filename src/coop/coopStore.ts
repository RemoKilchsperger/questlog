// Koop-Lobby und -Kampf im Browser (Etappe 2 aus docs/koop-kampf.md).
// Der Server (Edge Function bzw. lokaler Testmodus) rechnet alles; der
// Browser schickt nur Befehle und übernimmt den Stand, den er zurückbekommt –
// als Antwort oder live über Realtime. Hier passiert nur, was zum eigenen
// Spielstand gehört: Tränke abziehen, eigene Beute würfeln.

import { create } from "zustand";
import { useCloudStore } from "../cloud/cloudStore";
import {
  dungeonCompleted,
  rollCoopDungeonChest,
  rollCoopReward,
  type CoopAction,
  type CoopBattleState,
} from "../domain/coopCombat";
import { EventBus } from "../game/EventBus";
import { useGameStore, type ClaimedChest } from "../store/gameStore";
import { availableBackend, getBackend, type CoopBackend } from "./backend";
import type { CoopCommand, CoopRow } from "./protocol";

type Phase = "idle" | "joining" | "lobby" | "battle";

export interface CoopResult {
  won: boolean;
  /** Eigene Beute (nur bei einem Sieg) */
  chest: ClaimedChest | null;
}

interface CoopState {
  phase: Phase;
  backend: CoopBackend["kind"] | null;
  /** Der Kampf, wie ihn der Server zuletzt geschickt hat */
  row: CoopRow | null;
  myId: string;
  /** Serveruhr minus eigene Uhr – für einen genauen Countdown */
  clockOffset: number;
  /** Eben gewählte Aktion – bis der Server sie bestätigt */
  pendingAction: CoopAction | null;
  result: CoopResult | null;
  /** Laufende Lobby bzw. laufender Kampf, zu dem man zurückkehren kann */
  rejoin: CoopRow | null;
  busy: boolean;
  error: string | null;
  /** Fehler beim Beitreten (Code, Link, Zurückkehren) – erscheint am Eingabefeld für den Code */
  joinError: string | null;

  createLobby: (bossId: string) => Promise<void>;
  joinLobby: (code: string) => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  /** Nur der Host: Kampf starten */
  startBattle: () => Promise<void>;
  chooseAction: (action: CoopAction) => Promise<void>;
  /** Dungeon nach einem Sieg (nur der Host): nächster Kampf bzw. mit der Truhe aussteigen */
  continueDungeon: () => Promise<void>;
  exitDungeon: () => Promise<void>;
  /** Lobby verlassen bzw. Kampf verlassen (der Held greift dann automatisch an) */
  leave: () => void;
  /** Nachsehen, ob ein laufender Koop-Kampf auf einen wartet */
  checkRejoin: () => Promise<void>;
  clearError: () => void;
}

/** Spieler-Id: das Cloud-Konto – im lokalen Testmodus eine Id pro Tab. */
function currentPlayerId(): string {
  const session = useCloudStore.getState().session;
  if (session) return session.user.id;
  let id = sessionStorage.getItem("questlog-koop-id");
  if (!id) {
    id = `tab-${crypto.randomUUID().slice(0, 8)}`;
    sessionStorage.setItem("questlog-koop-id", id);
  }
  return id;
}

/** Ende der Spielerphase in eigener Uhrzeit. */
export function localDeadline(state: CoopBattleState, clockOffset: number): number {
  return state.deadline - clockOffset;
}

/** Schreibt die eigene Beute gut: Raid-Boss wie bisher, im Dungeon die ganze Truhe. */
function claimReward(row: CoopRow, state: CoopBattleState, myId: string): ClaimedChest | null {
  const me = row.members.find((m) => m.id === myId);
  if (!me) return null;
  const game = useGameStore.getState();
  if (state.dungeon) {
    return game.grantCoopDungeon(rollCoopDungeonChest(state, me.profile, myId), state.dungeon.id, dungeonCompleted(state));
  }
  return game.grantCoopReward(rollCoopReward(row.boss_id, me.profile, crypto.randomUUID()), row.boss_id);
}

// Ausserhalb von React: Abo der Änderungen, Timer für den Zeitablauf
let unsubscribe: (() => void) | null = null;
let tickTimer: number | undefined;
/** Kämpfe, für die schon Beute gewürfelt wurde (nie doppelt) */
const rewarded = new Set<string>();

export const useCoopStore = create<CoopState>()((set, get) => {
  function reset(error: string | null = null) {
    unsubscribe?.();
    unsubscribe = null;
    window.clearTimeout(tickTimer);
    set({ phase: "idle", backend: null, row: null, pendingAction: null, result: null, busy: false, error });
  }

  function backend(): CoopBackend {
    return getBackend(get().backend!);
  }

  /** Neuen Stand übernehmen – ältere Versionen (verspätete Nachrichten) werden ignoriert. */
  function applyRow(next: CoopRow | null) {
    if (!next) return reset();
    const prev = get().row;
    if (prev && prev.id === next.id && next.version <= prev.version) return;
    const myId = get().myId;
    if (!next.player_ids.includes(myId)) return reset("Du bist nicht mehr Teil dieser Lobby.");

    // Neue Runde: eigene Tränke abziehen, Szene animieren. Verglichen wird innerhalb desselben
    // Kampfs – im Dungeon beginnt jeder Kampf mit eigener Id und leerem Protokoll.
    const prevLog = prev?.id === next.id && prev.state?.id === next.state?.id ? (prev.state?.log.length ?? 0) : null;
    if (next.state && prevLog !== null && next.state.log.length > prevLog) {
      for (const e of next.last_events) {
        if (e.type === "potion" && e.heroId === myId) useGameStore.getState().consumePotion(e.potionId);
      }
      EventBus.emit("coop:events", { state: next.state, events: next.last_events });
    }

    // Ende erlebt (Sieg, Niederlage oder Ausstieg aus dem Dungeon): eigene Beute – nur einmal
    let result = get().result;
    const runId = next.state?.dungeon?.runId ?? next.state?.id;
    if (prev?.phase === "battle" && next.phase === "finished" && next.state && runId && !rewarded.has(runId)) {
      rewarded.add(runId);
      result = next.state.status === "won" ? { won: true, chest: claimReward(next, next.state, myId) } : { won: false, chest: null };
    }

    const roundChanged = next.state?.round !== prev?.state?.round || next.phase !== prev?.phase;
    set({
      row: next,
      phase: next.phase === "lobby" ? "lobby" : "battle",
      result,
      pendingAction: roundChanged ? null : get().pendingAction,
    });
    if (!unsubscribe || prev?.id !== next.id) {
      unsubscribe?.();
      unsubscribe = backend().subscribe(next.id, applyRow);
    }
    scheduleTick(next);
  }

  /** Zur Deadline nachfragen: ist die Zeit um, löst der Server die Runde auf. */
  function scheduleTick(row: CoopRow) {
    window.clearTimeout(tickTimer);
    if (row.phase !== "battle" || !row.state || row.state.status !== "active") return;
    const wait = Math.max(0, localDeadline(row.state, get().clockOffset) - Date.now()) + 600;
    tickTimer = window.setTimeout(() => void send({ type: "tick" }), wait);
  }

  async function send(command: CoopCommand): Promise<boolean> {
    const kind = get().backend;
    if (!kind) return false;
    set({ busy: true });
    try {
      // Der Server liest die Kampfwerte aus dem Cloud-Spielstand – vorher den aktuellen hochladen.
      if (kind === "cloud" && (command.type === "create" || command.type === "join" || command.type === "ready" || command.type === "start")) {
        await useCloudStore.getState().uploadNow();
      }
      const response = await getBackend(kind).send(command, get().row?.id, get().myId);
      set({ clockOffset: response.serverNow - Date.now(), busy: false, error: null });
      applyRow(response.row);
      return true;
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /** Verbindung für eine neue Lobby vorbereiten. */
  function begin(): boolean {
    const kind = availableBackend(useCloudStore.getState().session !== null);
    if (!kind) {
      set({ error: "Für Koop-Kämpfe musst du angemeldet sein." });
      return false;
    }
    if (get().phase !== "idle") reset();
    set({ backend: kind, myId: currentPlayerId(), error: null, rejoin: null });
    return true;
  }

  return {
    phase: "idle",
    backend: null,
    row: null,
    myId: "",
    clockOffset: 0,
    pendingAction: null,
    result: null,
    rejoin: null,
    busy: false,
    error: null,
    joinError: null,

    createLobby: async (bossId) => {
      if (!begin()) return;
      if (!(await send({ type: "create", bossId }))) reset(get().error);
    },

    joinLobby: async (code) => {
      // Fehler beim Beitreten gehören ans Eingabefeld, nicht zu den Listen
      const fail = () => {
        const message = get().error;
        reset();
        set({ joinError: message });
      };
      set({ joinError: null });
      if (!begin()) return fail();
      set({ phase: "joining" });
      if (!(await send({ type: "join", code }))) fail();
    },

    setReady: async (ready) => {
      await send({ type: "ready", ready });
    },

    startBattle: async () => {
      await send({ type: "start" });
    },

    chooseAction: async (action) => {
      const state = get().row?.state;
      if (!state || state.status !== "active" || get().pendingAction) return;
      set({ pendingAction: action });
      if (!(await send({ type: "act", round: state.round, action }))) set({ pendingAction: null });
    },

    continueDungeon: async () => {
      await send({ type: "next" });
    },

    exitDungeon: async () => {
      await send({ type: "exit" });
    },

    leave: () => {
      const { row, backend: kind, myId, result } = get();
      // Nach Kampfende gibt es nichts mehr abzumelden
      if (row && kind && !result) void getBackend(kind).send({ type: "leave" }, row.id, myId).catch(() => {});
      reset();
    },

    checkRejoin: async () => {
      const kind = availableBackend(useCloudStore.getState().session !== null);
      if (!kind || get().phase !== "idle") return;
      const row = await getBackend(kind).findActive(currentPlayerId()).catch(() => null);
      set({ rejoin: row });
    },

    clearError: () => set({ error: null, joinError: null }),
  };
});
