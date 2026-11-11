import { create } from "zustand";
import { persist } from "zustand/middleware";

// Abspieltempo der Kampfszenen – gehört wie der Ton zum Gerät, nicht zum Spielstand.

export type BattleSpeed = "1x" | "2x" | "instant";

export const BATTLE_SPEEDS: BattleSpeed[] = ["1x", "2x", "instant"];

/** Zeitfaktor für Phaser: Uhr und Tweens laufen so viel schneller. */
export const SPEED_FACTOR: Record<BattleSpeed, number> = { "1x": 1, "2x": 2, instant: 6 };

export const SPEED_LABEL: Record<BattleSpeed, string> = { "1x": "1×", "2x": "2×", instant: "Sofort" };

interface BattleSpeedState {
  speed: BattleSpeed;
  setSpeed: (speed: BattleSpeed) => void;
  /** 1× → 2× → Sofort → 1× */
  cycleSpeed: () => void;
}

export const useBattleSpeedStore = create<BattleSpeedState>()(
  persist(
    (set) => ({
      speed: "1x",
      setSpeed: (speed) => set({ speed }),
      cycleSpeed: () =>
        set((s) => ({ speed: BATTLE_SPEEDS[(BATTLE_SPEEDS.indexOf(s.speed) + 1) % BATTLE_SPEEDS.length] })),
    }),
    { name: "questlog-battle-speed", partialize: (s) => ({ speed: s.speed }) },
  ),
);
