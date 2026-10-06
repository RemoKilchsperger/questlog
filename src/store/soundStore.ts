import { create } from "zustand";
import { persist } from "zustand/middleware";

// Klang-Einstellungen gehören zum Gerät, nicht zum Spielstand –
// deshalb ein eigener kleiner Store, der nicht in die Cloud synchronisiert wird.

interface SoundState {
  muted: boolean;
  /** 0 … 1 */
  volume: number;
  /** Hintergrundmusik im Kampf */
  music: boolean;
  toggleMuted: () => void;
  setVolume: (volume: number) => void;
  toggleMusic: () => void;
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      muted: false,
      volume: 0.6,
      music: true,
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
      toggleMusic: () => set((s) => ({ music: !s.music })),
    }),
    { name: "questlog-sound", partialize: (s) => ({ muted: s.muted, volume: s.volume, music: s.music }) },
  ),
);
