// Koop-Lobby und -Kampf (Etappe 1 aus docs/koop-kampf.md: Host-Modell).
// Wer die Lobby erstellt, ist Host: Er sammelt die Aktionen aller Spieler,
// löst die Runde auf (sobald alle gewählt haben oder die Zeit um ist) und
// schickt den neuen Stand an alle. Die anderen zeigen nur an und wählen.
// Jeder Spieler bezahlt seine Kampfpunkte und würfelt seine Beute selbst.
//
// Wird nicht gespeichert: Ein Neuladen verlässt die Lobby. Kommt ein Spieler
// während des Kampfs zurück (gleiche Id), bekommt er den laufenden Stand.

import { create } from "zustand";
import { useCloudStore } from "../cloud/cloudStore";
import { getHeroCombatProfile } from "../domain/combat";
import {
  COOP_COST,
  COOP_MAX_PLAYERS,
  COOP_MIN_PLAYERS,
  resolveRound,
  rollCoopReward,
  startCoopBattle,
  type CoopAction,
  type CoopBattleState,
  type CoopEvent,
} from "../domain/coopCombat";
import { getLevel } from "../domain/leveling";
import { EventBus } from "../game/EventBus";
import { useGameStore, type ClaimedChest } from "../store/gameStore";
import {
  availableTransport,
  newLobbyCode,
  openTransport,
  type CoopMember,
  type CoopMessage,
  type CoopTransport,
} from "./transport";

/** Alle so oft ein Lebenszeichen … */
const PING_MS = 3000;
/** … wer so lange still ist, gilt als getrennt (sein Held greift automatisch an). */
const OFFLINE_MS = 10_000;
/** Ist der Host so lange still, wird der Kampf abgebrochen. */
const HOST_LOST_MS = 15_000;
/** So lange wartet ein Beitretender auf eine Antwort des Hosts. */
const JOIN_TIMEOUT_MS = 8000;

type Phase = "idle" | "joining" | "lobby" | "battle";

export interface CoopResult {
  won: boolean;
  /** Eigene Beute (nur bei einem Sieg) */
  chest: ClaimedChest | null;
}

interface CoopState {
  phase: Phase;
  transport: CoopTransport["kind"] | null;
  code: string | null;
  bossId: string | null;
  hostId: string | null;
  myId: string;
  members: CoopMember[];
  /** Ids der Spieler mit aktuellem Lebenszeichen (inkl. einem selbst) */
  online: string[];
  battle: CoopBattleState | null;
  /** Lokale Uhrzeit, zu der die Spielerphase endet */
  deadline: number;
  /** Wer in dieser Runde schon gewählt hat */
  chosen: string[];
  myAction: CoopAction | null;
  result: CoopResult | null;
  error: string | null;

  createLobby: (bossId: string) => void;
  joinLobby: (code: string) => void;
  setReady: (ready: boolean) => void;
  /** Nur der Host: Kampf starten */
  startBattle: () => void;
  chooseAction: (action: CoopAction) => void;
  /** Lobby bzw. Kampf verlassen (der Host löst damit alles auf) */
  leave: () => void;
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

/** Der eigene Held, wie ihn die Mitspieler sehen. */
function myMember(ready: boolean): CoopMember {
  const { character, equipment } = useGameStore.getState();
  return {
    id: currentPlayerId(),
    name: character.name,
    username: useCloudStore.getState().username,
    level: getLevel(character.totalXp),
    equipment,
    profile: getHeroCombatProfile(character, equipment),
    ready,
  };
}

/** Warum man nicht bereit sein kann – oder null. */
export function coopReadyBlocker(): string | null {
  const points = useGameStore.getState().character.battlePoints;
  return points < COOP_COST ? `Du brauchst ${COOP_COST} Kampfpunkte (du hast ${points}).` : null;
}

// Verbindungszustand ausserhalb von React (Timer, Kanal, Aktionen beim Host)
let link: CoopTransport | null = null;
let pingTimer: number | undefined;
let roundTimer: number | undefined;
let joinTimer: number | undefined;
const lastSeen = new Map<string, number>();
/** Beim Host: gewählte Aktionen der laufenden Runde */
let hostActions: Record<string, CoopAction> = {};
/** Kampfpunkte für den laufenden Kampf bezahlt (für die Erstattung bei Abbruch) */
let paid = false;

export const useCoopStore = create<CoopState>()((set, get) => {
  const isHost = () => get().hostId !== null && get().hostId === get().myId;
  const send = (message: CoopMessage) => link?.send(message);
  const remaining = (state: CoopBattleState) => Math.max(0, state.deadline - Date.now());

  function broadcastLobby() {
    const { hostId, bossId, members } = get();
    if (hostId && bossId) send({ type: "lobby", hostId, bossId, members });
  }

  /** Alles schliessen und auf Anfang – optional mit Fehlermeldung. */
  function reset(error: string | null = null) {
    link?.close();
    link = null;
    window.clearInterval(pingTimer);
    window.clearTimeout(roundTimer);
    window.clearTimeout(joinTimer);
    lastSeen.clear();
    hostActions = {};
    paid = false;
    set({
      phase: "idle",
      transport: null,
      code: null,
      bossId: null,
      hostId: null,
      members: [],
      online: [],
      battle: null,
      chosen: [],
      myAction: null,
      result: null,
      error,
    });
  }

  function connect(kind: CoopTransport["kind"], code: string) {
    link = openTransport(kind, code);
    link.onMessage(handle);
    pingTimer = window.setInterval(heartbeat, PING_MS);
  }

  /** Lebenszeichen senden, Verbindungsabbrüche erkennen. */
  function heartbeat() {
    const { myId, members, online, phase, battle } = get();
    send({ type: "ping", id: myId });
    const now = Date.now();
    const next = members.map((m) => m.id).filter((id) => id === myId || now - (lastSeen.get(id) ?? 0) < OFFLINE_MS);
    if (next.join() !== online.join()) {
      set({ online: next });
      if (isHost() && battle?.status === "active") maybeResolve();
    }
    const hostId = get().hostId;
    const battleRunning = phase === "battle" && battle?.status === "active";
    if (!isHost() && hostId && (phase === "lobby" || battleRunning) && now - (lastSeen.get(hostId) ?? now) > HOST_LOST_MS) {
      abort("Die Verbindung zum Host ist abgebrochen.");
    }
  }

  /** Verbindung schliessen, aber den Stand (z. B. die Beute-Truhe) stehen lassen. */
  function disconnect() {
    link?.close();
    link = null;
    window.clearInterval(pingTimer);
    window.clearTimeout(roundTimer);
  }

  /**
   * Kampf bzw. Lobby wurde aufgelöst – Kampfpunkte zurück, falls der Kampf noch
   * lief. Ist er schon vorbei, bleibt das Ergebnis samt Truhe stehen.
   */
  function abort(reason: string) {
    if (get().result) return disconnect();
    if (paid && get().battle?.status === "active") useGameStore.getState().refundCoop(COOP_COST);
    reset(reason);
  }

  function onStart(state: CoopBattleState, ms: number) {
    useGameStore.getState().payCoop(COOP_COST);
    paid = true;
    set({ phase: "battle", battle: state, deadline: Date.now() + ms, chosen: [], myAction: null, result: null });
  }

  function onRound(state: CoopBattleState, events: CoopEvent[], ms: number) {
    const { myId } = get();
    // Getrunkene oder verabreichte Tränke verlassen den eigenen Vorrat
    for (const e of events) if (e.type === "potion" && e.heroId === myId) useGameStore.getState().consumePotion(e.potionId);
    set({ battle: state, deadline: Date.now() + ms, chosen: [], myAction: null });
    EventBus.emit("coop:events", { state, events });
    if (state.status !== "active") finish(state);
  }

  /** Kampf vorbei: jeder würfelt seine eigene Beute. */
  function finish(state: CoopBattleState) {
    window.clearTimeout(roundTimer);
    if (state.status !== "won") return set({ result: { won: false, chest: null } });
    const me = get().members.find((m) => m.id === get().myId);
    const profile = me?.profile ?? myMember(true).profile;
    const reward = rollCoopReward(state.bossId, profile, crypto.randomUUID());
    set({ result: { won: true, chest: useGameStore.getState().grantCoopReward(reward) } });
  }

  /* ───────────── Host ───────────── */

  function scheduleRound(state: CoopBattleState) {
    window.clearTimeout(roundTimer);
    if (state.status === "active") roundTimer = window.setTimeout(resolveNow, remaining(state) + 250);
  }

  function shareChosen() {
    const { battle } = get();
    if (!battle) return;
    const ids = Object.keys(hostActions);
    set({ chosen: ids });
    send({ type: "chosen", round: battle.round, ids });
  }

  /** Auflösen, sobald alle verbundenen, lebenden Spieler gewählt haben. */
  function maybeResolve() {
    const { battle, online } = get();
    if (!battle || battle.status !== "active") return;
    const waiting = battle.heroes.filter((h) => !h.down && online.includes(h.id) && !(h.id in hostActions));
    if (waiting.length === 0) resolveNow();
  }

  function resolveNow() {
    const { battle } = get();
    if (!isHost() || !battle || battle.status !== "active") return;
    const result = resolveRound(battle, hostActions, Math.random, Date.now());
    hostActions = {};
    const ms = remaining(result.state);
    send({ type: "round", state: result.state, events: result.events, remaining: ms });
    onRound(result.state, result.events, ms);
    scheduleRound(result.state);
  }

  /* ───────────── Nachrichten ───────────── */

  function handle(message: CoopMessage) {
    const { phase, battle, myId } = get();
    const sender =
      message.type === "ping" || message.type === "leave"
        ? message.id
        : message.type === "hello" || message.type === "ready"
          ? message.member.id
          : message.type === "action"
            ? message.id
            : message.type === "lobby" || message.type === "sync"
              ? message.hostId
              : get().hostId;
    if (sender) lastSeen.set(sender, Date.now());

    switch (message.type) {
      case "hello": {
        if (!isHost()) return;
        const { member } = message;
        if (phase === "lobby") {
          const known = get().members.some((m) => m.id === member.id);
          if (!known && get().members.length >= COOP_MAX_PLAYERS) {
            return send({ type: "rejected", id: member.id, reason: "Die Lobby ist voll." });
          }
          set({ members: known ? get().members.map((m) => (m.id === member.id ? member : m)) : [...get().members, member] });
          broadcastLobby();
        } else if (phase === "battle" && battle) {
          const { hostId, bossId, members, chosen } = get();
          if (!battle.heroes.some((h) => h.id === member.id) || !hostId || !bossId) {
            return send({ type: "rejected", id: member.id, reason: "Der Kampf läuft bereits." });
          }
          send({ type: "sync", to: member.id, hostId, bossId, members, state: battle, chosen, remaining: remaining(battle) });
        }
        return;
      }
      case "ready": {
        if (!isHost() || phase !== "lobby") return;
        set({ members: get().members.map((m) => (m.id === message.member.id ? message.member : m)) });
        return broadcastLobby();
      }
      case "leave": {
        lastSeen.delete(message.id);
        if (isHost() && phase === "lobby") {
          set({ members: get().members.filter((m) => m.id !== message.id) });
          broadcastLobby();
        }
        return;
      }
      case "lobby": {
        if (isHost() || (phase !== "joining" && phase !== "lobby")) return;
        window.clearTimeout(joinTimer);
        for (const m of message.members) if (!lastSeen.has(m.id)) lastSeen.set(m.id, Date.now());
        return set({ phase: "lobby", hostId: message.hostId, bossId: message.bossId, members: message.members });
      }
      case "rejected": {
        if (message.id === myId) reset(message.reason);
        return;
      }
      case "start": {
        if (isHost() || phase !== "lobby") return;
        return onStart(message.state, message.remaining);
      }
      case "round": {
        if (isHost() || phase !== "battle") return;
        return onRound(message.state, message.events, message.remaining);
      }
      case "sync": {
        if (message.to !== myId || (phase !== "joining" && phase !== "lobby")) return;
        window.clearTimeout(joinTimer);
        paid = true; // bezahlt wurde schon beim ersten Start
        set({
          phase: "battle",
          hostId: message.hostId,
          bossId: message.bossId,
          members: message.members,
          battle: message.state,
          chosen: message.chosen,
          deadline: Date.now() + message.remaining,
          myAction: null,
        });
        return;
      }
      case "action": {
        if (!isHost() || !battle || battle.status !== "active" || message.round !== battle.round) return;
        hostActions[message.id] = message.action;
        shareChosen();
        return maybeResolve();
      }
      case "chosen": {
        if (!isHost() && battle && message.round === battle.round) set({ chosen: message.ids });
        return;
      }
      case "abort": {
        if (!isHost()) abort(message.reason);
        return;
      }
      case "ping":
        return;
    }
  }

  // Tab schliessen = Lobby verlassen
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      if (get().phase !== "idle") get().leave();
    });
  }

  return {
    phase: "idle",
    transport: null,
    code: null,
    bossId: null,
    hostId: null,
    myId: "",
    members: [],
    online: [],
    battle: null,
    deadline: 0,
    chosen: [],
    myAction: null,
    result: null,
    error: null,

    createLobby: (bossId) => {
      const kind = availableTransport(useCloudStore.getState().session !== null);
      if (!kind) return set({ error: "Für Koop-Kämpfe musst du angemeldet sein." });
      if (get().phase !== "idle") reset();
      const code = newLobbyCode();
      const me = myMember(true);
      set({ phase: "lobby", transport: kind, code, bossId, hostId: me.id, myId: me.id, members: [me], online: [me.id], error: null });
      connect(kind, code);
    },

    joinLobby: (code) => {
      const kind = availableTransport(useCloudStore.getState().session !== null);
      if (!kind) return set({ error: "Für Koop-Kämpfe musst du angemeldet sein." });
      if (get().phase !== "idle") reset();
      const me = myMember(false);
      set({ phase: "joining", transport: kind, code, myId: me.id, members: [], error: null });
      connect(kind, code);
      send({ type: "hello", member: me });
      joinTimer = window.setTimeout(() => {
        if (get().phase === "joining") reset(`Keine Lobby mit dem Code ${code} gefunden.`);
      }, JOIN_TIMEOUT_MS);
    },

    setReady: (ready) => {
      if (get().phase !== "lobby") return;
      if (ready && coopReadyBlocker()) return set({ error: coopReadyBlocker() });
      const me = myMember(ready);
      set({ members: get().members.map((m) => (m.id === me.id ? me : m)), error: null });
      send({ type: "ready", member: me });
    },

    startBattle: () => {
      const { phase, members, bossId } = get();
      if (!isHost() || phase !== "lobby" || !bossId) return;
      const blocker = coopReadyBlocker();
      if (blocker) return set({ error: blocker });
      if (members.length < COOP_MIN_PLAYERS) return set({ error: `Es braucht mindestens ${COOP_MIN_PLAYERS} Spieler.` });
      if (members.some((m) => m.id !== get().myId && !m.ready)) return set({ error: "Noch nicht alle sind bereit." });
      // Eigene Werte frisch übernehmen (Ausrüstung könnte sich geändert haben)
      const me = myMember(true);
      const team = members.map((m) => (m.id === me.id ? me : m));
      const state = startCoopBattle(crypto.randomUUID(), bossId, team.map((m) => ({ id: m.id, name: m.name, profile: m.profile })), Date.now());
      hostActions = {};
      set({ members: team, online: team.map((m) => m.id) });
      for (const m of team) lastSeen.set(m.id, Date.now());
      send({ type: "start", state, remaining: remaining(state) });
      broadcastLobby();
      onStart(state, remaining(state));
      scheduleRound(state);
    },

    chooseAction: (action) => {
      const { battle, myId, myAction } = get();
      if (!battle || battle.status !== "active" || myAction) return;
      set({ myAction: action, chosen: [...new Set([...get().chosen, myId])] });
      if (isHost()) {
        hostActions[myId] = action;
        shareChosen();
        maybeResolve();
      } else {
        send({ type: "action", id: myId, round: battle.round, action });
      }
    },

    leave: () => {
      const { phase, myId } = get();
      if (phase === "idle") return;
      // Wer selbst geht, bekommt keine Kampfpunkte zurück. Geht der Host, löst sich alles auf.
      if (isHost()) send({ type: "abort", reason: "Der Host hat die Lobby aufgelöst." });
      else send({ type: "leave", id: myId });
      reset();
    },

    clearError: () => set({ error: null }),
  };
});
