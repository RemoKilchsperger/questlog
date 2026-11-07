import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repairSave, useGameStore } from "./gameStore";

const store = () => useGameStore.getState();

/** Der laufende Kampf ist mit dem nächsten Schlag gewonnen. */
const winCurrent = () => {
  const { battle } = store();
  useGameStore.setState({ battle: { ...battle!, enemy: { ...battle!.enemy, hp: 1 }, adds: [] } });
  store().battleAttack();
  expect(store().battle?.status).toBe("won");
};

/** Startet einen Kampf gegen den Grauwolf, in dem sicher Silberpelz erscheint. */
const startRare = () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  store().startBattle("grey-wolf");
  random.mockRestore();
};

describe("Seltene Gegner im Spielstand", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState((s) => ({ character: { ...s.character, totalXp: 1e9 } }));
  });
  afterEach(() => vi.restoreAllMocks());

  it("erscheint statt der Kreatur, mit Namen und festen Modifikatoren", () => {
    startRare();
    const { battle } = store();
    expect(battle!.rare).toBe("rare-grey-wolf");
    expect(battle!.creatureId).toBe("grey-wolf");
    expect(battle!.enemy.name).toBe("Silberpelz, der Leitwolf");
    expect(battle!.elite).toEqual(["packLeader"]);
  });

  it("Sieg: sichere gute Beute, Eintrag in der Sammlung – nur beim ersten Mal neu", () => {
    startRare();
    const items = store().inventory.length;
    winCurrent();
    expect(store().battleReward!.rare).toEqual({ id: "rare-grey-wolf", first: true });
    expect(["epic", "legendary"]).toContain(store().battleReward!.loot?.rarity);
    expect(store().inventory.length).toBeGreaterThan(items);
    expect(store().records.raresDefeated).toEqual(["rare-grey-wolf"]);

    startRare();
    winCurrent();
    expect(store().battleReward!.rare).toEqual({ id: "rare-grey-wolf", first: false });
    expect(store().records.raresDefeated).toEqual(["rare-grey-wolf"]);
  });

  it("gewöhnliche Kämpfe bleiben gewöhnlich", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    store().startBattle("grey-wolf");
    random.mockRestore();
    expect(store().battle!.rare).toBeUndefined();
    expect(store().battle!.enemy.name).toBe("Grauwolf");
  });

  it("ältere Spielstände beginnen mit leerer Sammlung", () => {
    const { raresDefeated: _, ...old } = store().records;
    expect(repairSave({ character: store().character, records: old as never }).records!.raresDefeated).toEqual([]);
  });
});
