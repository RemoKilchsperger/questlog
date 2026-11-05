import { beforeEach, describe, expect, it } from "vitest";
import { totalXpForLevel } from "../domain/leveling";
import { RAID_WARNING_MS, raidFights } from "../domain/raids";
import { EMPTY_VILLAGE, SMITH_RULES } from "../domain/village";
import { activeVillage, repairSave, useGameStore } from "./gameStore";

const store = useGameStore.getState;

/** Gewinnt den laufenden Kampf mit dem nächsten Schlag. */
const winCurrent = () => {
  const { battle } = store();
  useGameStore.setState({ battle: { ...battle!, enemy: { ...battle!.enemy, hp: 1 }, adds: [] } });
  store().battleAttack();
  expect(store().battle?.status).toBe("won");
};

/** Verliert den laufenden Kampf: Der Held steht mit 1 LP einem unverwundbaren Gegner gegenüber. */
const loseCurrent = () => {
  for (let i = 0; i < 100 && store().battle?.status === "active"; i++) {
    const { battle } = store();
    useGameStore.setState({ battle: { ...battle!, hero: { ...battle!.hero, hp: 1 }, enemy: { ...battle!.enemy, hp: battle!.enemy.maxHp } } });
    store().battleAttack();
  }
  expect(store().battle?.status).toBe("lost");
};

/** Dorf mit drei Gebäuden (Überfälle frei) und einer Schmiede auf Stufe 2, die beschädigt werden kann. */
const setUp = () =>
  useGameStore.setState((s) => ({
    character: { ...s.character, totalXp: totalXpForLevel(14), gold: 1000 },
    village: { ...EMPTY_VILLAGE, merchant: 1, smith: 2, tavern: 1 },
    materials: { clay: 40, hardwood: 40 },
  }));

describe("Überfälle im Spielstand", () => {
  beforeEach(() => {
    store().resetGame();
    setUp();
  });

  it("ältere Spielstände bekommen Überfälle und Wehranlage", () => {
    const merged = repairSave({ village: { merchant: 1, smith: 0, board: 0, alchemist: 0, tavern: 0, training: 0, statue: 0 } as never });
    expect(merged.village?.walls).toBe(0);
    expect(merged.raids).toEqual({ current: null, next: 0, damaged: [], report: null });
  });

  it("ab drei Gebäuden kündigt sich eine Bande an", () => {
    store().refreshRaids();
    const raid = store().raids.current!;
    expect(raid.areaId).toBe("mistmarsh");
    expect(raid.attackAt - raid.announcedAt).toBe(RAID_WARNING_MS);
  });

  it("alle Wellen und den Anführer besiegt: Truhe gutgeschrieben, Dorf sicher", () => {
    store().refreshRaids();
    store().startRaid();
    expect(store().battle?.raidWave).toBe(1);
    const fights = raidFights(0);
    for (let wave = 1; wave <= fights; wave++) {
      winCurrent();
      if (wave < fights) store().nextRaidWave();
    }
    const { raid, raids, records } = store();
    expect(raid?.claimed?.completed).toBe(true);
    expect(raid?.claimed?.items.length).toBeGreaterThan(0);
    expect(raids.current).toBeNull();
    expect(raids.report?.kind).toBe("defended");
    expect(records.raidsDefended).toBe(1);
    expect(store().character.gold).toBeGreaterThan(1000);
    // Den Ausgang hat man im Kampf gesehen
    store().leaveBattle();
    expect(store().raids.report).toBeNull();
  });

  it("verloren: Die Schmiede ist beschädigt und wirkt eine Stufe tiefer, bis sie repariert ist", () => {
    store().refreshRaids();
    store().startRaid();
    loseCurrent();
    expect(store().raids.damaged).toEqual(["smith"]);
    expect(store().raid?.report).toMatchObject({ kind: "lost", building: "smith" });
    expect(activeVillage(store()).smith).toBe(1);
    expect(SMITH_RULES[activeVillage(store()).smith].maxUpgrade).toBe(2);
    store().leaveBattle();
    store().repairBuilding("smith");
    expect(store().raids.damaged).toEqual([]);
    expect(store().character.gold).toBe(750);
  });

  it("Flucht: Die Bande wartet weiter, die Truhe ist weg", () => {
    store().refreshRaids();
    store().startRaid();
    winCurrent();
    store().nextRaidWave();
    store().battleFlee();
    expect(store().raids.current).not.toBeNull();
    expect(store().raids.damaged).toEqual([]);
    store().leaveBattle();
    expect(store().raid).toBeNull();
  });

  it("Frist verpasst: Die Bande greift an, ohne dass man kämpft", () => {
    store().refreshRaids();
    const raid = store().raids.current!;
    useGameStore.setState((s) => ({ raids: { ...s.raids, current: { ...raid, attackAt: Date.now() - 1 } } }));
    store().refreshRaids();
    expect(store().raids.report).toMatchObject({ kind: "missed", building: "smith" });
    expect(store().raids.current).toBeNull();
  });
});
