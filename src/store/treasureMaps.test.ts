import { beforeEach, describe, expect, it } from "vitest";
import { getDungeon } from "../domain/creatures";
import { treasureStep } from "../domain/treasureMaps";
import { repairSave, useGameStore } from "./gameStore";

const store = () => useGameStore.getState();
const dungeon = getDungeon("abandoned-mine");
const step = treasureStep(dungeon);

/** Der laufende Kampf ist mit dem nächsten Schlag gewonnen. */
const winCurrent = () => {
  const { battle } = store();
  useGameStore.setState({ battle: { ...battle!, enemy: { ...battle!.enemy, hp: 1 }, adds: [] } });
  store().battleAttack();
  expect(store().battle?.status).toBe("won");
};

/** Bis vor den Zwischenboss springen und ihn besiegen – danach kommt die Gabelung mit dem Schatzraum. */
const beatMidBoss = () => {
  useGameStore.setState((s) => ({ dungeon: { ...s.dungeon!, stage: step - 2, doors: null, room: null } }));
  store().nextDungeonFight();
  expect(store().battle!.creatureId).toBe(dungeon.creatures[step - 1].id);
  winCurrent();
};

describe("Schatzkarten im Spielstand", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState((s) => ({
      character: { ...s.character, totalXp: 1e9 },
      treasureMaps: [{ id: "karte", dungeonId: dungeon.id, found: 0 }],
    }));
  });

  it("ohne Karte gibt es keinen Schatzraum", () => {
    useGameStore.setState({ treasureMaps: [] });
    store().startDungeon(dungeon.id);
    winCurrent();
    beatMidBoss();
    expect(store().dungeon!.doors!.some((d) => d.kind === "treasure")).toBe(false);
  });

  it("mit Karte: hinter dem Zwischenboss eine Tür zum Schatzraum – der Fund gehört sofort dir", () => {
    store().startDungeon(dungeon.id);
    expect(store().dungeon!.treasureMap).toBe("karte");
    winCurrent();
    // Vor dem Zwischenboss noch keine Schatztür
    expect(store().dungeon!.doors!.some((d) => d.kind === "treasure")).toBe(false);
    beatMidBoss();
    const doors = store().dungeon!.doors!;
    const index = doors.findIndex((d) => d.kind === "treasure");
    expect(index).toBeGreaterThanOrEqual(0);

    const inventory = store().inventory.length;
    const recipes = store().visitors.recipes.length;
    store().chooseDungeonDoor(index);
    const room = store().dungeon!.room!;
    if (room.kind !== "treasure") throw new Error("kein Schatzraum");
    if (room.find.kind === "item") {
      expect(store().inventory.length).toBe(inventory + 1);
      expect(room.find.item.rarity).toBe("legendary");
    } else {
      expect(store().visitors.recipes.length).toBe(recipes + 1);
    }
    // Die Karte ist eingelöst, der Weg geht normal weiter – der Schatzraum zählt nicht als Raum ohne Kampf
    expect(store().treasureMaps).toEqual([]);
    expect(store().dungeon!.treasureMap).toBeUndefined();
    expect(store().dungeon!.calm).toEqual([false, false]);
    expect(store().dungeon!.doors!.some((d) => d.kind === "treasure")).toBe(false);
  });

  it("wer vor dem Schatzraum aussteigt, behält die Karte", () => {
    store().startDungeon(dungeon.id);
    winCurrent();
    store().leaveDungeonWithChest();
    expect(store().treasureMaps).toHaveLength(1);
  });

  it("ältere Spielstände beginnen ohne Karten, gespeicherte bleiben", () => {
    expect(repairSave({}).treasureMaps).toEqual([]);
    expect(repairSave({ treasureMaps: store().treasureMaps }).treasureMaps).toHaveLength(1);
  });
});
