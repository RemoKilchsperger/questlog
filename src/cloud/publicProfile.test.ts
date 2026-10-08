import { describe, expect, it } from "vitest";
import { EMPTY_EQUIPMENT } from "../domain/equipment";
import { createItem } from "../domain/items";
import { xpForNextLevel } from "../domain/leveling";
import { EMPTY_RECORDS } from "../domain/achievements";
import type { Character } from "../domain/types";
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
  skills: { sword: 2 },
  abilities: [],
};

const records = { ...EMPTY_RECORDS, questsCompleted: 2 };

/** To-do aus einem Spielstand vor v14 */
const legacyQuest = (title: string, status: "open" | "done") => ({ id: title, title, status });

describe("Öffentliches Profil", () => {
  const equipment = { ...EMPTY_EQUIPMENT, weapon1: createItem("sword-0", "rare", "w", () => 0.5) };
  const profile = buildPublicProfile({ character, equipment, records, bossCollection: ["boss-goblin-chief-axe"] });

  it("enthält die Spielwerte", () => {
    expect(profile).toMatchObject({ hero_name: "Remo", level: 3, total_xp: character.totalXp, quests_done: 2, boss_items: 1 });
    expect(profile.snapshot.title).toBeUndefined();
    expect(profile.snapshot.equipment.weapon1?.itemId).toBe("sword-0");
    expect(profile.snapshot.skills).toEqual({ sword: 2 });
    // Attribute inkl. Ausrüstungsbonus
    expect(Object.values(profile.snapshot.stats).reduce((a, b) => a + b, 0)).toBeGreaterThan(10);
  });

  it("zeigt Koop-Erfolge – auch ohne bisherige Siege", () => {
    expect(profile.snapshot.coop).toEqual({ wins: 0, bosses: [] });
    const raider = buildPublicProfile({
      character,
      equipment,
      records,
      bossCollection: [],
      coopStats: { wins: 3, bosses: ["swamp-hydra"] },
    });
    expect(raider.snapshot.coop).toEqual({ wins: 3, bosses: ["swamp-hydra"] });
  });

  it("verrät weder Gold noch Inventar", () => {
    const json = JSON.stringify(profile);
    expect(json).not.toContain("gold");
    expect(json).not.toContain("inventory");
  });
});

describe("Spielstand-Abgleich", () => {
  const save = (state: PersistedSave["state"]): PersistedSave => ({ state, version: 12 });

  it("fasst einen Spielstand für die Auswahl zusammen", () => {
    expect(summarizeSave(save({ character, records, bossCollection: ["a", "b"] }))).toEqual({
      heroName: "Remo",
      level: 3,
      totalXp: character.totalXp,
      questsDone: 2,
      bossItems: 2,
    });
  });

  it("zählt bei alten Spielständen die erledigten To-dos", () => {
    const quests = [legacyQuest("a", "done"), legacyQuest("b", "open"), legacyQuest("c", "done")];
    expect(summarizeSave(save({ character, quests })).questsDone).toBe(2);
  });

  it("erkennt einen noch unbespielten Stand", () => {
    const fresh = { ...character, totalXp: 0 };
    expect(isFreshSave(null)).toBe(true);
    expect(isFreshSave(save({ character: fresh }))).toBe(true);
    expect(isFreshSave(save({ character }))).toBe(false);
    expect(isFreshSave(save({ character: fresh, questLog: { active: { "hunt-giant-rat": 0 }, completed: [] } }))).toBe(false);
    expect(isFreshSave(save({ character: fresh, quests: [legacyQuest("x", "open")] }))).toBe(false);
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
