// Tempo und Trefferwucht der Kampfszenen (Solo und Koop).
//
// Das Tempo läuft über die Zeitfaktoren von Phaser: `time.timeScale` beschleunigt alle
// delayedCalls (also auch den Ablauf in `play`), `tweens.timeScale` alle Bewegungen.
// Die Musik läuft über eigene Browser-Timer und bleibt davon unberührt.
//
// Der Hit-Stop friert die Szene beim Aufprall kurz ein – das gibt Treffern Gewicht.
// Er misst in echter Zeit (setTimeout), weil die Szenen-Uhr ja gerade steht.

import type Phaser from "phaser";
import { SPEED_FACTOR, useBattleSpeedStore } from "../store/battleSpeedStore";

/** So lange steht die Szene bei einem Treffer (ms, echte Zeit) */
export const HIT_STOP_MS = 60;
export const HIT_STOP_CRIT_MS = 110;
/** Fast stehend statt 0 – so bleibt die Uhr robust */
const FROZEN = 0.02;

export interface BattleTempo {
  /** Szene kurz einfrieren – bei „Sofort“ entfällt das. */
  hitStop: (crit: boolean) => void;
  /** Läuft die Szene im Sofort-Tempo? Dann entfallen Kamerawackler. */
  instant: () => boolean;
}

/** Tempo an die Szene binden: übernimmt die Einstellung und folgt jeder Änderung. */
export function attachTempo(scene: Phaser.Scene): BattleTempo {
  let frozenUntil = 0;
  let thaw: ReturnType<typeof setTimeout> | undefined;
  let alive = true;

  const factor = () => SPEED_FACTOR[useBattleSpeedStore.getState().speed];
  const apply = (scale: number) => {
    scene.time.timeScale = scale;
    scene.tweens.timeScale = scale;
  };

  apply(factor());
  const unsubscribe = useBattleSpeedStore.subscribe(() => {
    if (alive && performance.now() >= frozenUntil) apply(factor());
  });
  const detach = () => {
    alive = false;
    unsubscribe();
    clearTimeout(thaw);
  };
  scene.events.once("shutdown", detach);
  scene.events.once("destroy", detach);

  return {
    instant: () => useBattleSpeedStore.getState().speed === "instant",
    hitStop(crit) {
      if (!alive || useBattleSpeedStore.getState().speed === "instant") return;
      const ms = crit ? HIT_STOP_CRIT_MS : HIT_STOP_MS;
      // Mehrere Treffer kurz nacheinander verlängern den Stopp nicht über den längsten hinaus
      const until = performance.now() + ms;
      if (until <= frozenUntil) return;
      frozenUntil = until;
      apply(FROZEN);
      clearTimeout(thaw);
      thaw = setTimeout(() => {
        if (alive) apply(factor());
      }, ms);
    },
  };
}

/**
 * Schriftgrösse einer Schadenszahl: kleine Treffer klein, grosse gross.
 * Voll ausgeschöpft ist die Spanne ab einem Viertel der maximalen Lebenspunkte.
 */
export function damageFontSize(damage: number, maxHp: number, min: number, span: number) {
  const ratio = maxHp > 0 ? Math.min(1, damage / (maxHp * 0.25)) : 0;
  return Math.round(min + span * ratio);
}
