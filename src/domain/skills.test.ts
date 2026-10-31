import { describe, expect, it } from "vitest";
import { getHeroCombatProfile } from "./combat";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem, getItemStats } from "./items";
import { xpForNextLevel } from "./leveling";
import {
  learnSkill,
  MAX_SKILL_RANK,
  resetSkills,
  skillResetBlocker,
  skillResetCost,
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
    essence: 0,
    stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
    spentPoints: 0,
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

  it("ohne Punkte oder über dem Maximum geht nichts", () => {
    expect(skillBlocker(heroAt(1), "sword")).toMatch(/Skillpunkte/);
    const master = learnTimes(heroAt(20), "dagger", MAX_SKILL_RANK);
    expect(skillRank(master, "dagger")).toBe(MAX_SKILL_RANK);
    expect(skillBlocker(master, "dagger")).toMatch(/Höchster Rang/);
    expect(() => learnSkill(master, "dagger")).toThrow();
  });

  it("Zweihandwaffen sind unabhängig von ihrer Einhand-Variante", () => {
    for (const weapon of ["greatsword", "greataxe", "greathammer", "staff", "bow"] as const) {
      expect(skillBlocker(heroAt(20), weapon), weapon).toBeNull();
      expect(skillRank(learnTimes(heroAt(20), weapon, MAX_SKILL_RANK), weapon)).toBe(MAX_SKILL_RANK);
    }
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

  it("Fähigkeiten kosten keine Skillpunkte – sie kommen mit der Waffe, auch ohne Rang", () => {
    const sword = createItem("sword-30", "common", "s");
    const equipment: Equipment = { ...EMPTY_EQUIPMENT, weapon1: sword };
    expect(getHeroCombatProfile(heroAt(1), equipment).abilities).toEqual(sword.abilities);
    expect(getHeroCombatProfile(heroAt(20), EMPTY_EQUIPMENT).abilities).toEqual([]);
    // Alle Skillpunkte fliessen in die Ränge: elf Waffentypen à fünf Ränge
    expect(unspentSkillPoints(heroAt(20))).toBe(19);
  });
});

describe("Skills zurücksetzen", () => {
  const rich = (character: Character, gold: number): Character => ({ ...character, gold });

  it("kostet viel Gold, mehr auf höherem Level", () => {
    expect(skillResetCost(20)).toBe(750);
    expect(skillResetCost(40)).toBeGreaterThan(skillResetCost(20));
  });

  it("gibt alle Ränge als freie Skillpunkte zurück", () => {
    const trained = learnTimes(learnTimes(heroAt(20), "sword", MAX_SKILL_RANK), "greataxe", 2);
    expect(unspentSkillPoints(trained)).toBe(19 - MAX_SKILL_RANK - 2);

    const reset = resetSkills(rich(trained, 5000), 1);
    expect(reset.skills).toEqual({});
    expect(unspentSkillPoints(reset)).toBe(19);
    expect(reset.gold).toBe(5000 - skillResetCost(20));
  });

  it("nicht ohne genug Gold oder ohne vergebene Punkte", () => {
    const trained = learnTimes(heroAt(20), "sword", 1);
    expect(skillResetBlocker(rich(trained, skillResetCost(20) - 1), 1)).toMatch(/Gold/);
    expect(() => resetSkills(rich(trained, 0), 1)).toThrow();
    expect(skillResetBlocker(rich(heroAt(20), 99_999), 1)).toMatch(/noch keine/);
  });

  it("braucht den Trainingsplatz – ausgebaut wird es günstiger bis gratis", () => {
    const trained = learnTimes(heroAt(20), "sword", 1);
    expect(skillResetBlocker(rich(trained, 99_999), 0)).toMatch(/Trainingsplatz/);
    expect(skillResetCost(20, 2)).toBe(375);
    expect(skillResetCost(20, 3)).toBe(0);
    expect(resetSkills(rich(trained, 0), 3).skills).toEqual({});
  });
});
