// Online-Konto und Cloud-Spielstand (Stufe A: der Browser rechnet, die
// Datenbank speichert). Der Spielstand selbst bleibt im gameStore; dieser
// Store spiegelt ihn nur:
//
// 1. Login per E-Mail-Link (kein Passwort).
// 2. Beim Anmelden: Cloud-Stand und lokaler Stand werden abgeglichen.
//    - Cloud leer → der lokale Stand wird hochgeladen.
//    - Lokal noch nichts gespielt → der Cloud-Stand wird übernommen.
//    - Beide verschieden → der Spieler entscheidet, welcher bleibt.
// 3. Danach wird jede Änderung nach kurzer Pause hochgeladen – samt
//    öffentlichem Profil für Rangliste und Profilseite.

import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { SAVE_KEY, useGameStore } from "../store/gameStore";
import {
  buildPublicProfile,
  isFreshSave,
  normalizeUsername,
  USERNAME_PATTERN,
  type PersistedSave,
} from "./publicProfile";
import { supabase } from "./supabase";

type SyncStatus = "offline" | "loading" | "saving" | "saved" | "error";

interface CloudState {
  session: Session | null;
  /** Öffentlicher Name; null = muss nach dem ersten Login noch gewählt werden */
  username: string | null;
  needsUsername: boolean;
  status: SyncStatus;
  error: string | null;
  /** Lokaler und Cloud-Stand unterscheiden sich – der Spieler muss wählen */
  conflict: PersistedSave | null;
  /** Erst nach dem Abgleich wird automatisch hochgeladen */
  ready: boolean;

  sendLoginLink: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  chooseUsername: (input: string) => Promise<void>;
  resolveConflict: (keep: "local" | "cloud") => Promise<void>;
  uploadNow: () => Promise<void>;
}

const UPLOAD_DELAY_MS = 2500;

const readLocalSave = (): PersistedSave | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as PersistedSave) : null;
  } catch {
    return null;
  }
};

/** Cloud-Stand übernehmen: in den localStorage schreiben und neu laden (inkl. Migration/Reparatur). */
async function applyCloudSave(save: PersistedSave) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  await useGameStore.persist.rehydrate();
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Zuletzt hochgeladener Stand – gleiche Daten werden nicht erneut gesendet. */
let lastUploaded = "";
let uploadTimer: number | undefined;
/** Für welches Konto der Abgleich schon läuft – verhindert doppelten Abgleich beim Login. */
let reconciledFor: string | null = null;

export const useCloudStore = create<CloudState>()((set, get) => {
  /** Lädt Spielstand und öffentliches Profil hoch. */
  async function upload() {
    const session = get().session;
    const save = localStorage.getItem(SAVE_KEY);
    if (!supabase || !session || !save || !get().ready) return;
    if (save === lastUploaded) return;
    set({ status: "saving" });
    const userId = session.user.id;
    const now = new Date().toISOString();
    const { error } = await supabase.from("saves").upsert({ user_id: userId, data: JSON.parse(save), updated_at: now });
    if (error) return set({ status: "error", error: error.message });
    const username = get().username;
    if (username) {
      const profile = buildPublicProfile(useGameStore.getState());
      const res = await supabase
        .from("public_profiles")
        .upsert({ user_id: userId, username, ...profile, updated_at: now });
      if (res.error) return set({ status: "error", error: res.error.message });
    }
    lastUploaded = save;
    set({ status: "saved", error: null });
  }

  function scheduleUpload() {
    window.clearTimeout(uploadTimer);
    uploadTimer = window.setTimeout(() => void upload(), UPLOAD_DELAY_MS);
  }

  /** Nach dem Login: Profil laden und Spielstände abgleichen. */
  async function reconcile(session: Session) {
    if (!supabase || reconciledFor === session.user.id) return;
    reconciledFor = session.user.id;
    set({ status: "loading", error: null, ready: false });
    const userId = session.user.id;
    const [profile, cloud] = await Promise.all([
      supabase.from("public_profiles").select("username").eq("user_id", userId).maybeSingle(),
      supabase.from("saves").select("data").eq("user_id", userId).maybeSingle(),
    ]);
    if (profile.error || cloud.error) {
      return set({ status: "error", error: (profile.error ?? cloud.error)!.message });
    }
    const username = (profile.data?.username as string | undefined) ?? null;
    set({ username, needsUsername: username === null });

    const cloudSave = (cloud.data?.data as PersistedSave | undefined) ?? null;
    const localSave = readLocalSave();
    if (!cloudSave) {
      // Erster Login: der lokale Stand wird zum Cloud-Stand
      set({ ready: true });
      return upload();
    }
    if (JSON.stringify(cloudSave.state) === JSON.stringify(localSave?.state)) {
      lastUploaded = localStorage.getItem(SAVE_KEY) ?? "";
      return set({ ready: true, status: "saved" });
    }
    if (isFreshSave(localSave)) {
      await applyCloudSave(cloudSave);
      lastUploaded = localStorage.getItem(SAVE_KEY) ?? "";
      return set({ ready: true, status: "saved" });
    }
    set({ conflict: cloudSave, status: "saved" });
  }

  // Start: bestehende Sitzung übernehmen (auch nach Klick auf den Login-Link)
  if (supabase) {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        set({ session: data.session });
        void reconcile(data.session);
      }
    });
    supabase.auth.onAuthStateChange((event, session) => {
      set({ session });
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) void reconcile(session);
      if (event === "SIGNED_OUT") {
        reconciledFor = null;
        lastUploaded = "";
        set({ username: null, needsUsername: false, ready: false, conflict: null, status: "offline" });
      }
    });
    // Jede Änderung am Spielstand hochladen – nach kurzer Pause, gebündelt
    useGameStore.subscribe(() => {
      if (get().ready && get().session) scheduleUpload();
    });
    // Beim Schliessen/Wechseln des Tabs nicht auf die Pause warten
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void upload();
    });
  }

  return {
    session: null,
    username: null,
    needsUsername: false,
    status: "offline",
    error: null,
    conflict: null,
    ready: false,

    sendLoginLink: async (email) => {
      if (!supabase) return false;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      set({ error: error ? error.message : null });
      return !error;
    },

    signOut: async () => {
      await upload();
      await supabase?.auth.signOut();
    },

    chooseUsername: async (input) => {
      const session = get().session;
      const username = normalizeUsername(input);
      if (!supabase || !session) return;
      if (!USERNAME_PATTERN.test(username)) {
        return set({ error: "3–20 Zeichen: Kleinbuchstaben, Ziffern, _ und -." });
      }
      const profile = buildPublicProfile(useGameStore.getState());
      const { error } = await supabase
        .from("public_profiles")
        .insert({ user_id: session.user.id, username, ...profile, updated_at: new Date().toISOString() });
      if (error) {
        return set({ error: error.code === "23505" ? `„${username}“ ist schon vergeben.` : errorText(error.message) });
      }
      set({ username, needsUsername: false, error: null });
    },

    resolveConflict: async (keep) => {
      const conflict = get().conflict;
      if (!conflict) return;
      if (keep === "cloud") await applyCloudSave(conflict);
      lastUploaded = "";
      set({ conflict: null, ready: true });
      await upload();
    },

    uploadNow: upload,
  };
});
