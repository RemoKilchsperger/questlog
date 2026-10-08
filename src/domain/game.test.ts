import { describe, expect, it } from "vitest";
import {
  allocatePoint,
  convertLinearCurveXp,
  getLevel,
  getLevelProgress,
  MAX_LEVEL,
  POINTS_PER_LEVEL,
  totalXpForLevel,
  unspentPoints,
  xpForNextLevel,
  xpRewardBase,
} from "./leveling";
import type { Character } from "./types";
import { getCreature, getCreatureXp, xpLevelFactor } from "./creatures";

describe("Kampf-Erfahrung", () => {
  it("Siege geben Erfahrung – Bosse und höhere Level mehr", () => {
    const rat = getCreature("giant-rat").creature;
    const wolf = getCreature("grey-wolf").creature;
    const chief = getCreature("goblin-chief").creature;
    expect(getCreatureXp(rat)).toBe(8);
    expect(getCreatureXp(wolf)).toBeGreaterThan(getCreatureXp(rat));
    expect(getCreatureXp(chief)).toBe(Math.round(xpRewardBase(10) * 0.08 * 1.25));
  });

  it("zu leichte Gegner geben weniger – bis 3 Level darunter voll, nie unter 10 %", () => {
    expect(xpLevelFactor(10, 13)).toBe(1);
    expect(xpLevelFactor(10, 14)).toBeCloseTo(0.85);
    expect(xpLevelFactor(10, 18)).toBeCloseTo(0.25);
    expect(xpLevelFactor(1, 60)).toBe(0.1);
    expect(xpLevelFactor(30, 10)).toBe(1); // stärkere Gegner: kein Abzug
    const rat = getCreature("giant-rat").creature;
    expect(getCreatureXp(rat, 10)).toBe(1); // 8 XP × 10 % – mindestens 1
  });

  it("spätere Level brauchen deutlich mehr Siege als frühe", () => {
    const winsFor = (level: number) => xpForNextLevel(level) / (xpRewardBase(level) * 0.08);
    expect(winsFor(1)).toBeCloseTo(12.5);
    expect(winsFor(30)).toBeGreaterThan(30);
    expect(winsFor(59)).toBeGreaterThan(50);
  });
});

describe("Leveling", () => {
  it("startet auf Level 1", () => {
    expect(getLevelProgress(0)).toEqual({ level: 1, xpInLevel: 0, xpNeeded: 100, ratio: 0 });
  });

  it("steigt genau an der Schwelle auf", () => {
    expect(getLevelProgress(99).level).toBe(1);
    expect(getLevelProgress(100).level).toBe(2);
    const toLevel3 = xpForNextLevel(1) + xpForNextLevel(2);
    expect(getLevelProgress(toLevel3).level).toBe(3);
    expect(getLevelProgress(toLevel3 - 1).level).toBe(2);
  });

  it("kann mehrere Level auf einmal überspringen", () => {
    expect(getLevelProgress(10_000).level).toBeGreaterThan(5);
  });

  it("Level 60 ist mit rund 148’800 XP erreichbar", () => {
    const total = totalXpForLevel(MAX_LEVEL);
    expect(total).toBe(148_783);
    expect(getLevelProgress(total).level).toBe(MAX_LEVEL);
    expect(getLevelProgress(total - 1).level).toBe(MAX_LEVEL - 1);
  });

  it("endet bei Level 60", () => {
    expect(getLevelProgress(Number.MAX_SAFE_INTEGER)).toEqual({
      level: MAX_LEVEL,
      xpInLevel: 0,
      xpNeeded: 0,
      ratio: 1,
    });
  });

  it("gibt pro Level-up 2 frei verteilbare Attributpunkte", () => {
    const hero: Character = {
      name: "Held",
      totalXp: xpForNextLevel(1) + xpForNextLevel(2), // Level 3
      gold: 0,
      essence: 0,
      stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
      spentPoints: 0,
      skills: {},
      abilities: [],
    };
    expect(POINTS_PER_LEVEL).toBe(2);
    expect(unspentPoints(hero)).toBe(4);

    let next = hero;
    for (let i = 0; i < 4; i++) next = allocatePoint(next, i < 3 ? "strength" : "charisma");
    expect(next.stats).toEqual({ strength: 4, intellect: 1, endurance: 1, charisma: 2 });
    expect(unspentPoints(next)).toBe(0);
    expect(() => allocatePoint(next, "intellect")).toThrow(/Keine Attributpunkte/);
    expect(unspentPoints({ ...hero, totalXp: 0 })).toBe(0);
  });

  it("bereits mehr verteilt als verdient (alte Spielstände) → einfach 0 offen", () => {
    const hero: Character = {
      name: "Held",
      totalXp: xpForNextLevel(1), // Level 2 → 2 Punkte verdient
      gold: 0,
      essence: 0,
      stats: { strength: 4, intellect: 1, endurance: 1, charisma: 1 },
      spentPoints: 3,
      skills: {},
      abilities: [],
    };
    expect(unspentPoints(hero)).toBe(0);
  });

});

describe("Umrechnung der alten Level-Kurve", () => {
  const oldTotal = (level: number) => {
    let total = 0;
    for (let l = 1; l < level; l++) total += xpRewardBase(l);
    return total;
  };

  it("das Level bleibt gleich, der Fortschritt im Level auch", () => {
    for (const level of [1, 2, 10, 30, 59]) {
      expect(getLevel(convertLinearCurveXp(oldTotal(level)))).toBe(level);
      expect(convertLinearCurveXp(oldTotal(level))).toBe(totalXpForLevel(level));
    }
    // Halb durch Level 10
    const half = convertLinearCurveXp(oldTotal(10) + xpRewardBase(10) / 2);
    expect(getLevelProgress(half).level).toBe(10);
    expect(getLevelProgress(half).ratio).toBeCloseTo(0.5, 2);
    // Maximallevel bleibt Maximallevel
    expect(getLevel(convertLinearCurveXp(48_675))).toBe(MAX_LEVEL);
    expect(convertLinearCurveXp(0)).toBe(0);
  });
});
