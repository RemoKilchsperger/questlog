import { describe, expect, it } from "vitest";
import { calculateReward, EFFORT_TIERS } from "./rewards";
import {
  allocatePoint,
  getLevelProgress,
  MAX_LEVEL,
  POINTS_PER_LEVEL,
  unspentPoints,
  xpForNextLevel,
} from "./leveling";
import type { Character } from "./types";
import {
  BATTLE_COST,
  MAX_BATTLE_POINTS,
  refillBattlePoints,
  regenerateBattlePoints,
  regenSlot,
  spendBattlePoint,
} from "./battlePoints";
import { getCreature, getCreatureXp } from "./creatures";

describe("Belohnungen", () => {
  it("längere Quests geben mehr XP und Gold", () => {
    for (let i = 1; i < EFFORT_TIERS.length; i++) {
      expect(EFFORT_TIERS[i].xp).toBeGreaterThan(EFFORT_TIERS[i - 1].xp);
      expect(EFFORT_TIERS[i].gold).toBeGreaterThan(EFFORT_TIERS[i - 1].gold);
    }
  });

  it("Kategorie bestimmt das trainierte Attribut", () => {
    expect(calculateReward("medium", "body").stat).toBe("strength");
    expect(calculateReward("medium", "mind").stat).toBe("intellect");
    expect(calculateReward("epic", "social")).toEqual({
      xp: 260,
      gold: 55,
      stat: "charisma",
      statPoints: 1,
      battlePoints: 6,
    });
  });

  it("nur epische Quests geben Attributpunkte – als Bonusquest 2", () => {
    for (const effort of ["quick", "short", "medium", "long"] as const) {
      expect(calculateReward(effort, "mind").statPoints).toBe(0);
      expect(calculateReward(effort, "mind", true).statPoints).toBe(0);
    }
    expect(calculateReward("epic", "mind").statPoints).toBe(1);
    expect(calculateReward("epic", "mind", true).statPoints).toBe(2);
  });
});

describe("Kampfpunkte", () => {
  const hero = (battlePoints: number): Character => ({
    name: "Held",
    totalXp: 0,
    gold: 0,
    essence: 0,
    stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
    spentPoints: 0,
    battlePoints,
    battlePointSlot: regenSlot(new Date(2026, 9, 5, 7, 0)), // Abschnitt 6–12 Uhr
    skills: {},
    abilities: [],
  });

  it("längere Quests füllen mehr Kampfpunkte auf", () => {
    for (let i = 1; i < EFFORT_TIERS.length; i++) {
      expect(EFFORT_TIERS[i].battlePoints).toBeGreaterThan(EFFORT_TIERS[i - 1].battlePoints);
    }
    expect(calculateReward("quick", "body").battlePoints).toBe(1);
    expect(calculateReward("epic", "body", true).battlePoints).toBe(6);
  });

  it("jeder Kampf kostet einen Punkt, ohne Punkte kein Kampf", () => {
    expect(spendBattlePoint(hero(3)).battlePoints).toBe(3 - BATTLE_COST);
    expect(() => spendBattlePoint(hero(0))).toThrow(/Kampfpunkte/);
  });

  it("auffüllen höchstens bis zum Maximum", () => {
    expect(refillBattlePoints(hero(2), 3).battlePoints).toBe(5);
    expect(refillBattlePoints(hero(MAX_BATTLE_POINTS - 1), 6).battlePoints).toBe(MAX_BATTLE_POINTS);
    expect(MAX_BATTLE_POINTS).toBe(20);
  });

  it("alle 6 Stunden gibt es einen Punkt gratis – verpasste werden nachgeholt", () => {
    const start = hero(3);
    // Gleicher Abschnitt: nichts Neues, dasselbe Objekt
    expect(regenerateBattlePoints(start, new Date(2026, 9, 5, 11, 59))).toBe(start);
    // 12 Uhr: ein Punkt
    const noon = regenerateBattlePoints(start, new Date(2026, 9, 5, 12, 0));
    expect(noon.battlePoints).toBe(4);
    expect(regenerateBattlePoints(noon, new Date(2026, 9, 5, 17, 0))).toBe(noon);
    // Am nächsten Morgen um 7: 18 Uhr, 0 Uhr, 6 Uhr → drei weitere
    expect(regenerateBattlePoints(noon, new Date(2026, 9, 6, 7, 0)).battlePoints).toBe(7);
    // Nie über das Maximum
    expect(regenerateBattlePoints(hero(19), new Date(2026, 9, 9, 7, 0)).battlePoints).toBe(MAX_BATTLE_POINTS);
  });

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
      battlePoints: 0,
      battlePointSlot: 0,
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
      battlePoints: 0,
      battlePointSlot: 0,
      skills: {},
      abilities: [],
    };
    expect(unspentPoints(hero)).toBe(0);
  });

});
