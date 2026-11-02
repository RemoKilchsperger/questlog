import { beforeEach, describe, expect, it } from "vitest";
import { recruitPrice, type ActiveMission } from "../domain/companions";
import { totalXpForLevel } from "../domain/leveling";
import { repairSave, useGameStore } from "./gameStore";

const store = useGameStore.getState;

/** Held auf Level 20 mit Taverne, Gold und den Kandidaten des Tages */
const setup = (tavern: 1 | 2 | 3 = 1) => {
  useGameStore.setState((s) => ({
    character: { ...s.character, totalXp: totalXpForLevel(20), gold: 100_000 },
    village: { ...s.village, tavern },
  }));
  store().refreshTavern();
};

/** Lässt eine laufende Mission sofort enden. */
const finish = (missionId: string) =>
  useGameStore.setState((s) => ({
    activeMissions: s.activeMissions.map((a): ActiveMission => (a.mission.id === missionId ? { ...a, end: 0 } : a)),
  }));

describe("Begleiter im Spielstand", () => {
  beforeEach(() => store().resetGame());

  it("alte Spielstände bekommen leere Listen", () => {
    const merged = repairSave({ character: store().character });
    expect(merged.companions).toEqual([]);
    expect(merged.activeMissions).toEqual([]);
    expect(merged.recruitPool?.recruits).toEqual([]);
  });

  it("ohne Taverne gibt es weder Kandidaten noch Missionen", () => {
    store().refreshTavern();
    expect(store().recruitPool.recruits).toEqual([]);
    expect(store().missionBoard.missions).toEqual([]);
  });

  it("anwerben, ausrüsten, losschicken, abholen", () => {
    setup();
    const { recruitPool, character } = store();
    expect(recruitPool.recruits).toHaveLength(3);
    expect(store().missionBoard.missions).toHaveLength(4);
    const candidate = recruitPool.recruits[0];
    store().recruitCompanion(candidate.id);
    expect(store().companions).toHaveLength(1);
    expect(store().character.gold).toBe(character.gold - recruitPrice(candidate));

    // Startausrüstung des Helden (Level 1) anlegen
    const inventoryBefore = store().inventory.length;
    store().companionEquipBest(candidate.id);
    const worn = Object.values(store().companions[0].equipment).filter((o) => o !== null);
    expect(worn.length).toBeGreaterThan(0);
    expect(store().inventory.length).toBe(inventoryBefore - worn.length);

    // Truppstärke 1–2 bei Stufe 1: der zweite Platz wird bei Bedarf auch besetzt
    const mission = store().missionBoard.missions[2];
    if (mission.size === 2) store().recruitCompanion(store().recruitPool.recruits[0].id);
    const group = store().companions.slice(0, mission.size).map((c) => c.id);
    store().startMission(mission.id, group);
    expect(store().activeMissions).toHaveLength(1);

    // Unterwegs: Ausrüstung gesperrt, Entlassen nicht möglich, Abholen noch nicht
    store().companionUnequip(candidate.id, "chest");
    expect(Object.values(store().companions[0].equipment).filter((o) => o !== null)).toHaveLength(worn.length);
    const count = store().companions.length;
    store().dismissCompanion(candidate.id);
    expect(store().companions).toHaveLength(count);
    expect(store().claimMission(mission.id)).toBeNull();

    finish(mission.id);
    const { outcome } = store().activeMissions[0];
    const before = store();
    expect(store().claimMission(mission.id)).toEqual(outcome);
    expect(store().activeMissions).toHaveLength(0);
    expect(store().character.gold).toBe(before.character.gold + outcome.gold);
    expect(store().character.essence).toBe(before.character.essence + outcome.essence);
    expect(store().companions[0].totalXp).toBeGreaterThan(candidate.totalXp);
    if (outcome.item) expect(store().inventory).toContainEqual(outcome.item);
  });

  it("Entlassen gibt die Items zurück", () => {
    setup();
    const [candidate] = store().recruitPool.recruits;
    store().recruitCompanion(candidate.id);
    const inventoryBefore = store().inventory.length;
    store().companionEquipBest(candidate.id);
    store().dismissCompanion(candidate.id);
    expect(store().companions).toHaveLength(0);
    expect(store().inventory).toHaveLength(inventoryBefore);
  });

  it("Abbrechen gibt keine Beute, die Mission bleibt für heute vergeben", () => {
    setup(3);
    const ids = store().recruitPool.recruits.map((r) => r.id);
    for (const id of ids) store().recruitCompanion(id);
    const mission = store().missionBoard.missions[0];
    store().startMission(mission.id, ids.slice(0, mission.size));
    const gold = store().character.gold;
    store().cancelMission(mission.id);
    expect(store().activeMissions).toHaveLength(0);
    expect(store().character.gold).toBe(gold);
    expect(store().missionBoard.taken).toContain(mission.id);
  });
});
