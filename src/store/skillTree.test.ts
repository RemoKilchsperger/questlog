import { beforeEach, describe, expect, it } from "vitest";
import { migrateSave, repairSave, useGameStore } from "./gameStore";

const oldSave = () => ({
  character: {
    name: "Alt",
    totalXp: 400_000,
    gold: 1234,
    essence: 5,
    stats: { strength: 20, intellect: 1, endurance: 10, charisma: 1 },
    spentPoints: 30,
    // Ränge nach den alten Regeln: Offene Wunde, Zähigkeit 3, Meisterschaft bei 15
    skills: { keenEdge: 3, serratedEdge: 3, adrenaline: 3, bloodScent: 3, reaper: 1, openWound: 1, executioner: 3, bloodburst: 1, toughness: 3, venom: 3 },
  },
  inventory: [{ uid: "i1", itemId: "sword-30", rarity: "rare", bonuses: { strength: 3 } }],
  equipment: {},
  records: { battlesWon: 12 },
});

describe("Migration auf v24: Skilltree überarbeitet", () => {
  beforeEach(() => useGameStore.getState().resetGame());

  it("erstattet alle Skillpunkte zurück und setzt den Hinweis – Gold, Items und XP bleiben", () => {
    const old = oldSave();
    const state = migrateSave(old, 23);
    expect(state.character.skills).toEqual({});
    expect(state.character.skillTreeNotice).toBe(true);
    expect(state.character.gold).toBe(1234);
    expect(state.character.totalXp).toBe(400_000);
    expect(state.inventory).toEqual(old.inventory);
    expect(repairSave(state).character?.skillTreeNotice).toBe(true);
  });

  it("v24-Stände bleiben, wie sie sind", () => {
    const current = { ...oldSave(), character: { ...oldSave().character, skills: { keenEdge: 2 } } };
    expect(migrateSave(current, 24).character.skills).toEqual({ keenEdge: 2 });
    expect(migrateSave(current, 24).character.skillTreeNotice).toBeUndefined();
  });

  it("der Hinweis verschwindet, sobald er gesehen ist", () => {
    useGameStore.setState((s) => ({ character: { ...s.character, skillTreeNotice: true } }));
    useGameStore.getState().dismissSkillTreeNotice();
    expect(useGameStore.getState().character.skillTreeNotice).toBeUndefined();
  });
});
