import { describe, expect, it } from "vitest";
import { getHeroCombatProfile } from "./combat";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem, getItemStats } from "./items";
import { xpForNextLevel } from "./leveling";
import {
  learnSkill,
  MAX_SKILL_RANK,
  SKILL_BONUS_PER_RANK,
  skillBlocker,
  skillDamageBonus,
  skillRank,
  unspentSkillPoints,
} from "./skills";
import type { Character, Equipment } from "./types";

/** Held auf einem bestimmten Level, ohne vergebene Skills. */
const heroAt = (level: number): Character => {
  let totalXp = 0;
  for (let l = 1; l < level; l++) totalXp += xpForNextLevel(l);
  return {
    name: "Held",
    totalXp,
    gold: 0,
    stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
    spentPoints: 0,
    battlePoints: 0,
    battlePointSlot: 0,
    skills: {},
  };
};

const learnTimes = (character: Character, weapon: Parameters<typeof learnSkill>[1], times: number) => {
  let next = character;
  for (let i = 0; i < times; i++) next = learnSkill(next, weapon);
  return next;
};

describe("Skilltree", () => {
  it("gibt einen Skillpunkt pro Level-up", () => {
    expect(unspentSkillPoints(heroAt(1))).toBe(0);
    expect(unspentSkillPoints(heroAt(8))).toBe(7);
    expect(unspentSkillPoints(learnTimes(heroAt(8), "sword", 3))).toBe(4);
  });

  it("ohne Punkte, über dem Maximum oder ohne Voraussetzung geht nichts", () => {
    expect(skillBlocker(heroAt(1), "sword")).toMatch(/Skillpunkte/);
    expect(skillBlocker(heroAt(20), "greatsword")).toMatch(/Rang 3 in Schwert/);
    const swordsman = learnTimes(heroAt(20), "sword", 3);
    expect(skillBlocker(swordsman, "greatsword")).toBeNull();
    const master = learnTimes(heroAt(20), "dagger", MAX_SKILL_RANK);
    expect(skillRank(master, "dagger")).toBe(MAX_SKILL_RANK);
    expect(skillBlocker(master, "dagger")).toMatch(/Höchster Rang/);
    expect(() => learnSkill(master, "dagger")).toThrow();
  });

  it("erhöht nur den Schaden des passenden Waffentyps", () => {
    const sword = createItem("sword-30", "common", "s");
    const axe = createItem("axe-30", "common", "a");
    const equipment: Equipment = { ...EMPTY_EQUIPMENT, weapon1: sword, weapon2: axe };
    const swordsman = learnTimes(heroAt(20), "sword", 5);
    expect(skillDamageBonus(swordsman, equipment)).toBeCloseTo(getItemStats(sword).attack * 5 * SKILL_BONUS_PER_RANK);
    expect(skillDamageBonus(learnTimes(heroAt(20), "mace", 5), equipment)).toBe(0);

    const plain = getHeroCombatProfile(heroAt(20), equipment).damage;
    expect(getHeroCombatProfile(swordsman, equipment).damage).toBeCloseTo(
      plain + getItemStats(sword).attack * 5 * SKILL_BONUS_PER_RANK,
    );
  });
});
