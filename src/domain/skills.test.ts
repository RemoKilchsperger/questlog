import { describe, expect, it } from "vitest";
import { pathOrder, withSkills } from "../test/skills";
import { getHeroCombatProfile } from "./combat";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem } from "./items";
import { MAX_LEVEL, xpForNextLevel } from "./leveling";
import {
  earnedSkillPoints,
  learnSkill,
  resetSkills,
  sanitizeSkills,
  SKILL,
  SKILL_PATHS,
  SKILL_TREE,
  skillBlocker,
  skillPointsNote,
  skillRank,
  skillResetBlocker,
  skillResetCost,
  spentSkillPoints,
  TIER_POINTS,
  unspentSkillPoints,
  type SkillId,
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

const learnTimes = (character: Character, id: SkillId, times: number) => {
  let next = character;
  for (let i = 0; i < times; i++) next = learnSkill(next, id);
  return next;
};

describe("Skilltree: Aufbau", () => {
  it("vier Pfade mit je vier Stufen, einer Gabelung und einer Meisterschaft", () => {
    for (const path of SKILL_PATHS) {
      const nodes = SKILL_TREE.filter((n) => n.path === path.id);
      expect(new Set(nodes.map((n) => n.tier)), path.id).toEqual(new Set([1, 2, 3, 4, 5]));
      expect(nodes.filter((n) => n.fork).length, path.id).toBe(2);
      expect(nodes.filter((n) => n.tier === 5).length, path.id).toBe(1);
      // Bis zur Meisterschaft muss es genug Ränge geben – mit einem Weg der Gabelung
      const before = nodes.filter((n) => n.tier < 5 && n !== nodes.filter((f) => f.fork)[1]).reduce((s, n) => s + n.maxRank, 0);
      expect(before, path.id).toBeGreaterThanOrEqual(TIER_POINTS[5]);
    }
  });

  it("Voraussetzungen liegen im selben Pfad, eine Stufe höher", () => {
    for (const node of SKILL_TREE) {
      for (const id of node.requires ?? []) {
        const parent = SKILL_TREE.find((n) => n.id === id)!;
        expect(parent.path, node.id).toBe(node.path);
        expect(parent.tier, node.id).toBe(node.tier - 1);
      }
      if (node.tier > 1) expect(node.requires?.length, node.id).toBeGreaterThan(0);
    }
  });

  it("jede Wirkung hat einen Text für jeden Rang", () => {
    for (const node of SKILL_TREE) {
      for (let r = 1; r <= node.maxRank; r++) expect(node.text(r), node.id).toMatch(/\S/);
    }
  });
});

describe("Skillpunkte", () => {
  it("alle 2 Level einen – 30 auf Level 60", () => {
    expect(unspentSkillPoints(heroAt(1))).toBe(0);
    expect(unspentSkillPoints(heroAt(2))).toBe(1);
    expect(unspentSkillPoints(heroAt(9))).toBe(4);
    expect(earnedSkillPoints(MAX_LEVEL)).toBe(30);
    expect(unspentSkillPoints(learnTimes(heroAt(9), "keenEdge", 3))).toBe(1);
  });

  it("der Level-up-Hinweis nennt sie nur, wenn es welche gibt", () => {
    expect(skillPointsNote(2, 3)).toBe("");
    expect(skillPointsNote(3, 4)).toBe(" und +1 Skillpunkt");
    expect(skillPointsNote(3, 8)).toBe(" und +3 Skillpunkte");
  });

  it("alte Waffen-Ränge fallen weg, zu hohe werden gekappt – die Punkte sind wieder frei", () => {
    expect(sanitizeSkills({ sword: 5, shield: 3, keenEdge: 9, rock: 0 })).toEqual({ keenEdge: 3 });
    expect(sanitizeSkills(undefined)).toEqual({});
  });
});

describe("Lernen", () => {
  it("ohne Punkte oder über dem höchsten Rang geht nichts", () => {
    expect(skillBlocker(heroAt(1), "keenEdge")).toMatch(/Skillpunkte/);
    const sharp = learnTimes(heroAt(20), "keenEdge", 3);
    expect(skillRank(sharp, "keenEdge")).toBe(3);
    expect(skillBlocker(sharp, "keenEdge")).toMatch(/Höchster Rang/);
    expect(() => learnSkill(sharp, "keenEdge")).toThrow();
  });

  it("eine Stufe öffnet sich erst mit genug Punkten im selben Pfad", () => {
    const hero = heroAt(40);
    expect(skillBlocker(hero, "adrenaline")).toMatch(/3 Punkte im Pfad Klinge/);
    // Punkte in einem anderen Pfad zählen nicht
    expect(skillBlocker(learnTimes(hero, "ironSkin", 3), "adrenaline")).toMatch(/Klinge/);
    expect(skillBlocker(learnTimes(hero, "keenEdge", 3), "adrenaline")).toBeNull();
  });

  it("ein Knoten braucht einen seiner Vorgänger", () => {
    // Genug Punkte in Klinge, aber nur über Gezahnte Klingen – Adrenalin hängt an Scharfe Klingen
    const hero = learnTimes(heroAt(40), "serratedEdge", 3);
    expect(skillBlocker(hero, "adrenaline")).toMatch(/Scharfe Klingen/);
    expect(skillBlocker(hero, "bloodScent")).toBeNull();
  });

  it("bei der Gabelung geht nur einer der beiden Wege", () => {
    const hero = withSkills(heroAt(40), [...pathOrder("blade").slice(0, 12), "reaper"]);
    expect(skillRank(hero, "reaper")).toBe(1);
    expect(skillBlocker(hero, "piercing")).toMatch(/Schnitter/);
    // Was danach kommt, geht über jeden der beiden Wege
    expect(skillBlocker(hero, "openWound")).toBeNull();
  });

  it("nur eine Meisterschaft im ganzen Baum", () => {
    const blade = withSkills(heroAt(60), pathOrder("blade"));
    expect(skillRank(blade, "bloodburst")).toBe(1);
    expect(spentSkillPoints(blade, "blade")).toBe(18);
    // Wehr bis vor die Meisterschaft – mehr Punkte, als es gibt, nur um die Sperre zu prüfen
    const guard = withSkills(heroAt(60), pathOrder("guard")).skills;
    const both = { ...blade, skills: { ...guard, wrath: 0, ...blade.skills } };
    expect(spentSkillPoints(both, "guard")).toBeGreaterThanOrEqual(TIER_POINTS[5]);
    expect(skillBlocker(both, "wrath")).toMatch(/nur eine/);
  });
});

describe("Grundwerte aus dem Skilltree", () => {
  const sword = createItem("sword-30", "common", "s");
  const equipment: Equipment = { ...EMPTY_EQUIPMENT, weapon1: sword, weapon2: createItem("shield-30", "common", "sh") };

  it("Krit, Rüstung, Lebenspunkte und Mana", () => {
    const plain = getHeroCombatProfile(heroAt(30), equipment);
    const trained = getHeroCombatProfile(
      { ...heroAt(30), skills: { keenEdge: 3, ironSkin: 3, toughness: 3, deepWell: 2 } },
      equipment,
    );
    expect(trained.critChance).toBeCloseTo(plain.critChance + 3 * SKILL.keenEdge);
    expect(trained.armor).toBe(Math.round(plain.armor * (1 + 3 * SKILL.ironSkin)));
    expect(trained.maxHp).toBeCloseTo(plain.maxHp * (1 + 3 * SKILL.toughness), -0.5);
    expect(trained.maxMana).toBe(plain.maxMana + 2 * SKILL.deepWell);
    expect(trained.damage).toBeCloseTo(plain.damage);
    expect(trained.skills).toEqual({ keenEdge: 3, ironSkin: 3, toughness: 3, deepWell: 2 });
    expect(plain.skills).toBeUndefined();
  });
});

describe("Skills zurücksetzen", () => {
  const rich = (character: Character, gold: number): Character => ({ ...character, gold });

  it("kostet Gold, mehr auf höherem Level", () => {
    expect(skillResetCost(20)).toBe(750);
    expect(skillResetCost(40)).toBeGreaterThan(skillResetCost(20));
  });

  it("gibt alle Ränge als freie Skillpunkte zurück", () => {
    const trained = learnTimes(learnTimes(heroAt(20), "keenEdge", 3), "toughness", 2);
    expect(unspentSkillPoints(trained)).toBe(10 - 5);

    const reset = resetSkills(rich(trained, 5000), 1);
    expect(reset.skills).toEqual({});
    expect(unspentSkillPoints(reset)).toBe(10);
    expect(reset.gold).toBe(5000 - skillResetCost(20));
  });

  it("nicht ohne genug Gold oder ohne vergebene Punkte", () => {
    const trained = learnTimes(heroAt(20), "keenEdge", 1);
    expect(skillResetBlocker(rich(trained, skillResetCost(20) - 1), 1)).toMatch(/Gold/);
    expect(() => resetSkills(rich(trained, 0), 1)).toThrow();
    expect(skillResetBlocker(rich(heroAt(20), 99_999), 1)).toMatch(/noch keine/);
  });

  it("braucht den Trainingsplatz – ausgebaut wird es günstiger bis gratis", () => {
    const trained = learnTimes(heroAt(20), "keenEdge", 1);
    expect(skillResetBlocker(rich(trained, 99_999), 0)).toMatch(/Trainingsplatz/);
    expect(skillResetCost(20, 2)).toBe(375);
    expect(skillResetCost(20, 3)).toBe(0);
    expect(resetSkills(rich(trained, 0), 3).skills).toEqual({});
  });
});
