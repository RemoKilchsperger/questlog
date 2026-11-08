// Wer gerade eine Koop-Lobby offen hat (docs/freunde.md): Supabase Realtime Presence
// auf einem gemeinsamen Kanal. Verbunden ist nur, wer in einer Lobby sitzt (dort
// läuft Realtime ohnehin schon) oder gerade die Freundesliste offen hat – alle
// anderen brauchen keine Verbindung und sehen „zuletzt aktiv“.
//
// Die Meldung enthält keinen Lobby-Code: Beitreten geht nur über den Befehl
// `joinFriend`, und der Server prüft dabei die Freundschaft.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../cloud/supabase";

export interface LobbyPresence {
  userId: string;
  /** Inhalt der Lobby (Raid-Boss oder Dungeon, siehe `coopContent`) */
  bossId: string;
  members: number;
}

const TOPIC = "coop-lobbies";

let channel: RealtimeChannel | null = null;
let subscribed = false;
/** Die eigene Lobby – null, solange man in keiner sitzt */
let mine: LobbyPresence | null = null;
let lobbies = new Map<string, LobbyPresence>();
const listeners = new Set<(lobbies: ReadonlyMap<string, LobbyPresence>) => void>();

function open(userId: string) {
  if (channel || !supabase) return;
  const ch = supabase.channel(TOPIC, { config: { presence: { key: userId } } });
  channel = ch;
  ch.on("presence", { event: "sync" }, () => {
    const next = new Map<string, LobbyPresence>();
    for (const metas of Object.values(ch.presenceState<LobbyPresence>())) {
      // Mehrere Tabs desselben Spielers: die zuletzt gemeldete Lobby zählt
      const last = metas[metas.length - 1];
      if (last) next.set(last.userId, { userId: last.userId, bossId: last.bossId, members: last.members });
    }
    lobbies = next;
    for (const listener of listeners) listener(lobbies);
  }).subscribe((status) => {
    subscribed = status === "SUBSCRIBED";
    if (subscribed && mine) void ch.track(mine);
  });
}

/** Niemand braucht den Kanal mehr – Verbindung freigeben. */
function closeIfUnused() {
  if (!channel || mine || listeners.size > 0) return;
  void supabase?.removeChannel(channel);
  channel = null;
  subscribed = false;
  lobbies = new Map();
}

/** Eigene Lobby melden (null = keine Lobby mehr offen). Wird vom Koop-Store bei jeder Änderung aufgerufen. */
export function announceLobby(next: LobbyPresence | null) {
  if (next && mine && next.bossId === mine.bossId && next.members === mine.members) return;
  const had = mine !== null;
  mine = next;
  if (next) {
    open(next.userId);
    if (subscribed) void channel?.track(next);
  } else if (had) {
    if (subscribed) void channel?.untrack();
    closeIfUnused();
  }
}

/** Offene Lobbys beobachten, solange die Freundesliste offen ist – gibt eine Abmelde-Funktion zurück. */
export function watchLobbies(userId: string, onChange: (lobbies: ReadonlyMap<string, LobbyPresence>) => void): () => void {
  listeners.add(onChange);
  open(userId);
  onChange(lobbies);
  return () => {
    listeners.delete(onChange);
    closeIfUnused();
  };
}
