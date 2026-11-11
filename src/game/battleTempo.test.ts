import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { useBattleSpeedStore } from "../store/battleSpeedStore";
import { attachTempo, damageFontSize, HIT_STOP_CRIT_MS, HIT_STOP_MS } from "./battleTempo";

/** Nur das, was attachTempo von einer Szene braucht. */
function fakeScene() {
  const handlers: Record<string, () => void> = {};
  const scene = {
    time: { timeScale: 1 },
    tweens: { timeScale: 1 },
    events: { once: (name: string, fn: () => void) => (handlers[name] = fn) },
  };
  return { scene: scene as unknown as Phaser.Scene, raw: scene, shutdown: () => handlers.shutdown?.() };
}

describe("Kampftempo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useBattleSpeedStore.setState({ speed: "1x" });
  });
  afterEach(() => vi.useRealTimers());

  it("wechselt reihum 1× → 2× → Sofort → 1×", () => {
    const { cycleSpeed } = useBattleSpeedStore.getState();
    cycleSpeed();
    expect(useBattleSpeedStore.getState().speed).toBe("2x");
    cycleSpeed();
    expect(useBattleSpeedStore.getState().speed).toBe("instant");
    cycleSpeed();
    expect(useBattleSpeedStore.getState().speed).toBe("1x");
  });

  it("übernimmt das Tempo beim Start und folgt jeder Änderung", () => {
    useBattleSpeedStore.setState({ speed: "2x" });
    const { scene, raw } = fakeScene();
    attachTempo(scene);
    expect(raw.time.timeScale).toBe(2);
    expect(raw.tweens.timeScale).toBe(2);
    useBattleSpeedStore.setState({ speed: "instant" });
    expect(raw.time.timeScale).toBeGreaterThan(2);
  });

  it("friert beim Treffer kurz ein und läuft danach im eingestellten Tempo weiter", () => {
    useBattleSpeedStore.setState({ speed: "2x" });
    const { scene, raw } = fakeScene();
    const tempo = attachTempo(scene);
    tempo.hitStop(false);
    expect(raw.time.timeScale).toBeLessThan(0.1);
    expect(raw.tweens.timeScale).toBeLessThan(0.1);
    vi.advanceTimersByTime(HIT_STOP_MS);
    expect(raw.time.timeScale).toBe(2);
  });

  it("ein Krit friert länger ein als ein normaler Treffer", () => {
    const { scene, raw } = fakeScene();
    const tempo = attachTempo(scene);
    tempo.hitStop(true);
    vi.advanceTimersByTime(HIT_STOP_MS);
    expect(raw.time.timeScale).toBeLessThan(0.1);
    vi.advanceTimersByTime(HIT_STOP_CRIT_MS - HIT_STOP_MS);
    expect(raw.time.timeScale).toBe(1);
  });

  it("kein Hit-Stop bei Sofort", () => {
    useBattleSpeedStore.setState({ speed: "instant" });
    const { scene, raw } = fakeScene();
    const tempo = attachTempo(scene);
    const before = raw.time.timeScale;
    tempo.hitStop(true);
    expect(raw.time.timeScale).toBe(before);
  });

  it("hört nach dem Ende der Szene nicht mehr auf die Einstellung", () => {
    const { scene, raw, shutdown } = fakeScene();
    attachTempo(scene);
    shutdown();
    useBattleSpeedStore.setState({ speed: "2x" });
    expect(raw.time.timeScale).toBe(1);
  });
});

describe("Schadenszahlen", () => {
  it("wachsen mit dem Schaden und sind ab einem Viertel der LP voll gross", () => {
    expect(damageFontSize(0, 400, 20, 16)).toBe(20);
    expect(damageFontSize(50, 400, 20, 16)).toBe(28);
    expect(damageFontSize(100, 400, 20, 16)).toBe(36);
    expect(damageFontSize(999, 400, 20, 16)).toBe(36);
  });
});
