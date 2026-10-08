import { describe, expect, it } from "vitest";
import {
  allocatePoint,
  getLevelProgress,
  MAX_LEVEL,
  POINTS_PER_LEVEL,
  unspentPoints,
  xpForNextLevel,
} from "./leveling";
import type { Character } from "./types";
import { getCreature, getCreatureXp } from "./creatures";

describe("Kampf-Erfahrung", () => {
  it("Siege geben Erfahrung – Bosse und höhere Level mehr", () => {
    const rat = getCreature("giant-rat").creature;
    const wolf = getCreature("grey-wolf").creature;
    const chief = getCreature("goblin-chief").creature;
    expect(getCreatureXp(rat)).toBe(8);
    expect(getCreatureXp(wolf)).toBeGreaterThan(getCreatureXp(rat));
    expect(getCreatureXp(chief)).toBe(3 * Math.round(xpForNextLevel(10) * 0.08));
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

  it("flache Kurve: Level 60 ist mit rund 48’700 XP erreichbar", () => {
    let total = 0;
    for (let level = 1; level < MAX_LEVEL; level++) total += xpForNextLevel(level);
    expect(total).toBe(48_675);
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
