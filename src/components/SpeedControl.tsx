import { SPEED_LABEL, useBattleSpeedStore } from "../store/battleSpeedStore";
import { Hint } from "./HoverCard";

/** Abspieltempo der Kampfszene: 1× → 2× → Sofort (pro Gerät gespeichert, Taste S). */
export function SpeedControl() {
  const speed = useBattleSpeedStore((s) => s.speed);
  const cycle = useBattleSpeedStore((s) => s.cycleSpeed);
  return (
    <Hint
      heading="⏩ Kampftempo"
      text="1× zeigt alles in Ruhe, 2× spielt doppelt so schnell, Sofort fast ohne Wartezeit. Taste S wechselt."
    >
      <button
        type="button"
        onClick={cycle}
        className="num min-w-14 rounded-md border-2 border-night-600 px-2 py-0.5 text-sm text-parchment hover:border-muted"
        aria-label={`Kampftempo: ${SPEED_LABEL[speed]} – klicken zum Wechseln`}
      >
        ⏩ {SPEED_LABEL[speed]}
      </button>
    </Hint>
  );
}
