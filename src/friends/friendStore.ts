// Freundesliste im Browser: geladen beim Login und beim Öffnen des Tabs, nach jeder
// Aktion neu. Kein Realtime – nur wer eine Lobby offen hat, ist live (lobbyPresence.ts).

import { create } from "zustand";
import { useCloudStore } from "../cloud/cloudStore";
import { normalizeUsername } from "../cloud/publicProfile";
import { acceptFriend, fetchFriends, removeFriend, sendFriendRequest, type Friend } from "./friends";

interface FriendState {
  friends: Friend[];
  loaded: boolean;
  busy: boolean;
  error: string | null;
  load: () => Promise<void>;
  /** Anfrage per Benutzername – true, wenn sie raus ist */
  request: (username: string) => Promise<boolean>;
  accept: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearError: () => void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useFriendStore = create<FriendState>()((set, get) => {
  const myId = () => useCloudStore.getState().session?.user.id ?? null;

  /** Aktion ausführen, danach die Liste neu laden. */
  async function run(action: (me: string) => Promise<void>): Promise<boolean> {
    const me = myId();
    if (!me) return false;
    set({ busy: true, error: null });
    try {
      await action(me);
      await get().load();
      set({ busy: false });
      return true;
    } catch (e) {
      set({ busy: false, error: errorText(e) });
      return false;
    }
  }

  // Abmelden: die Liste gehört zum Konto
  useCloudStore.subscribe((s, prev) => {
    if (prev.session && !s.session) set({ friends: [], loaded: false, error: null });
  });

  return {
    friends: [],
    loaded: false,
    busy: false,
    error: null,

    load: async () => {
      const me = myId();
      if (!me) return;
      try {
        set({ friends: await fetchFriends(me), loaded: true });
      } catch (e) {
        set({ error: errorText(e), loaded: true });
      }
    },

    request: (username) => run((me) => sendFriendRequest(me, normalizeUsername(username))),
    accept: async (id) => void (await run((me) => acceptFriend(me, id))),
    remove: async (id) => void (await run((me) => removeFriend(me, id))),
    clearError: () => set({ error: null }),
  };
});
