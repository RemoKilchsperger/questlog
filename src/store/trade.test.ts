import { beforeEach, describe, expect, it } from "vitest";
import { createItem } from "../domain/items";
import { EMPTY_VILLAGE } from "../domain/village";
import { repairSave, useGameStore } from "./gameStore";

const store = useGameStore.getState;

const sword = createItem("sword-5", "rare", "sword");
const bow = createItem("bow-5", "epic", "bow");
const junk = createItem("dagger-0", "common", "junk");

describe("Item-Tausch im Spielstand", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState({
      inventory: [sword, junk],
      village: { ...EMPTY_VILLAGE, smith: 2 },
      character: { ...store().character, essence: 10_000 },
    });
  });

  it("ältere Spielstände kennen noch keine Tausche", () => {
    expect(repairSave({ character: store().character }).appliedTrades).toEqual([]);
  });

  it("führt einen abgeschlossenen Tausch genau einmal aus", () => {
    expect(store().applyCompletedTrade("t1", [sword], [bow])).toBe(true);
    expect(store().inventory.map((i) => i.uid)).toEqual(["junk", "bow"]);
    expect(store().appliedTrades).toEqual(["t1"]);
    expect(store().applyCompletedTrade("t1", [sword], [bow])).toBe(false);
    expect(store().inventory.map((i) => i.uid)).toEqual(["junk", "bow"]);
  });

  it("fehlt ein abgegebenes Item schon, kommt das erhaltene trotzdem an", () => {
    useGameStore.setState({ inventory: [junk] });
    expect(store().applyCompletedTrade("t2", [sword], [bow])).toBe(true);
    expect(store().inventory.map((i) => i.uid)).toEqual(["junk", "bow"]);
  });

  it("Items im Angebot lassen sich nicht verkaufen, zerlegen, verbessern oder anlegen", () => {
    store().setTradeLocked(["sword", "junk"]);
    const gold = store().character.gold;
    store().sell("sword");
    store().salvage("sword");
    store().upgrade("sword");
    store().equip("sword");
    store().sellCommon();
    expect(store().inventory).toEqual([sword, junk]);
    expect(store().character.gold).toBe(gold);
  });

  it("ohne Sperre geht wieder alles", () => {
    store().setTradeLocked(["sword"]);
    store().sellCommon();
    expect(store().inventory.map((i) => i.uid)).toEqual(["sword"]);
    store().setTradeLocked([]);
    store().sell("sword");
    expect(store().inventory).toEqual([]);
  });

  it("ein ausgeführter Tausch hebt die Sperre auf", () => {
    store().setTradeLocked(["sword"]);
    store().applyCompletedTrade("t3", [sword], []);
    expect(store().tradeLocked).toEqual([]);
  });
});
