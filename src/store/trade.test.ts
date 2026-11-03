import { beforeEach, describe, expect, it } from "vitest";
import { createItem } from "../domain/items";
import { EMPTY_VILLAGE } from "../domain/village";
import { EMPTY_EQUIPMENT } from "../domain/equipment";
import type { TradeRow } from "../trade/protocol";
import { applyDoneTrades, collectUids, isForeignItemError } from "../trade/sync";
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

describe("Item-Tausch: Abgleich nach abgelehntem Upload", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState({ inventory: [sword, junk] });
  });

  const doneRow = (id: string, give: typeof sword[], receive: typeof sword[]): TradeRow => ({
    id,
    code: "ABCDEF",
    player_ids: ["me", "other"],
    names: { me: "Ich", other: "Du" },
    offers: { me: give, other: receive },
    ready: { me: true, other: true },
    confirmed: { me: true, other: true },
    status: "done",
    version: 7,
    updated_at: "2026-11-03T12:00:00.000Z",
    completed_at: "2026-11-03T12:00:00.000Z",
  });

  it("erkennt die Ablehnung der Datenbank", () => {
    expect(isForeignItemError("QL_FOREIGN_ITEM sword")).toBe(true);
    expect(isForeignItemError("duplicate key")).toBe(false);
    expect(isForeignItemError(undefined)).toBe(false);
  });

  it("findet uids überall im Spielstand", () => {
    const save = {
      state: {
        inventory: [{ uid: "a" }],
        equipment: { ...EMPTY_EQUIPMENT, head: { uid: "b" } },
        companions: [{ id: "k", equipment: { chest: { uid: "c" } } }],
      },
    };
    expect(collectUids(save).sort()).toEqual(["a", "b", "c"]);
  });

  it("führt verpasste Tausche aus, bekannte nicht nochmal", () => {
    const rows = [doneRow("t1", [sword], [bow]), doneRow("t2", [], [createItem("axe-5", "rare", "axe")])];
    expect(applyDoneTrades(rows, "me").map((r) => r.id)).toEqual(["t1", "t2"]);
    expect(store().inventory.map((i) => i.uid)).toEqual(["junk", "bow", "axe"]);
    expect(applyDoneTrades(rows, "me")).toEqual([]);
  });

  it("entfernt weggetauschte Items aus Inventar, Ausrüstung und bei Begleitern", () => {
    const helm = createItem("head-5", "rare", "helm");
    const companion = { ...store().companions[0], id: "k", name: "Kara", equipment: { ...EMPTY_EQUIPMENT, chest: bow } };
    useGameStore.setState({
      equipment: { ...EMPTY_EQUIPMENT, head: helm },
      companions: [companion as never],
    });
    expect(store().removeTradedItems(["sword", "helm", "bow", "unbekannt"])).toBe(3);
    expect(store().inventory.map((i) => i.uid)).toEqual(["junk"]);
    expect(store().equipment.head).toBeNull();
    expect(store().companions[0].equipment.chest).toBeNull();
    expect(store().removeTradedItems(["sword"])).toBe(0);
  });
});
