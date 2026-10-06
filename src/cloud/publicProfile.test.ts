import { describe, expect, it } from "vitest";
import { EMPTY_EQUIPMENT } from "../domain/equipment";
import { createItem } from "../domain/items";
import { xpForNextLevel } from "../domain/leveling";
import type { Character, Quest } from "../domain/types";
import {
  buildPublicProfile,
  isFreshSave,
  normalizeUsername,
  summarizeSave,
  USERNAME_PATTERN,
  type PersistedSave,
} from "./publicProfile";

const character: Character = {
  name: "Remo",
  totalXp: xpForNextLevel(1) + xpForNextLevel(2), // Level 3
  gold: 50,
  essence: 0,
  stats: { strength: 4, intellect: 2, endurance: 3, charisma: 1 },
  spentPoints: 0,
  battlePoints: 5,
  battlePointSlot: 0,
  skills: { sword: 2 },
  abilities: [],
};

const quest = (title: string, status: Quest["status"]): Quest => ({
  id: title,
  title,
  description: "Geheime Notiz",
  effort: "short",
  category: "daily",
  status,
  createdAt: "2026-10-01T10:00:00.000Z",
});

const quests = [quest("Steuererklärung abgeben", "done"), quest("Arzttermin", "open"), quest("Joggen", "done")];

describe("Öffentliches Profil", () => {
  const equipment = { ...EMPTY_EQUIPMENT, weapon1: createItem("sword-0", "rare", "w", () => 0.5) };
  const profile = buildPublicProfile({ character, equipment, quests, bossCollection: ["boss-goblin-chief-axe"] });

  it("enthält die Spielwerte", () => {
    expect(profile).toMatchObject({ hero_name: "Remo", level: 3, total_xp: character.totalXp, quests_done: 2, boss_items: 1 });
    expect(profile.snapshot.title).toBe("Abenteurer");
    expect(profile.snapshot.equipment.weapon1?.itemId).toBe("sword-0");
    expect(profile.snapshot.skills).toEqual({ sword: 2 });
    // Attribute inkl. Ausrüstungsbonus
    expect(Object.values(profile.snapshot.stats).reduce((a, b) => a + b, 0)).toBeGreaterThan(10);
  });

  it("verrät nichts über die Quests ausser ihrer Anzahl", () => {
    const json = JSON.stringify(profile);
    for (const q of quests) expect(json).not.toContain(q.title);
    expect(json).not.toContain("Geheime Notiz");
    expect(json).not.toContain("gold");
  });
});

describe("Spielstand-Abgleich", () => {
  const save = (state: PersistedSave["state"]): PersistedSave => ({ state, version: 12 });

  it("fasst einen Spielstand für die Auswahl zusammen", () => {
    expect(summarizeSave(save({ character, quests, bossCollection: ["a", "b"] }))).toEqual({
      heroName: "Remo",
      level: 3,
      totalXp: character.totalXp,
      questsDone: 2,
      bossItems: 2,
    });
  });

  it("erkennt einen noch unbespielten Stand", () => {
    expect(isFreshSave(null)).toBe(true);
    expect(isFreshSave(save({ character: { ...character, totalXp: 0 }, quests: [] }))).toBe(true);
    expect(isFreshSave(save({ character, quests: [] }))).toBe(false);
    expect(isFreshSave(save({ character: { ...character, totalXp: 0 }, quests: [quest("x", "open")] }))).toBe(false);
  });
});

describe("Benutzername", () => {
  it("macht aus Eingaben gültige Namen", () => {
    expect(normalizeUsername("  Remo K. ")).toBe("remo-k");
    expect(normalizeUsername("Jürg Müller")).toBe("juerg-mueller");
    expect(USERNAME_PATTERN.test(normalizeUsername("Jürg Müller"))).toBe(true);
    expect(USERNAME_PATTERN.test(normalizeUsername("ab"))).toBe(false);
    expect(normalizeUsername("x".repeat(40))).toHaveLength(20);
  });
});
