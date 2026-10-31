import { beforeEach, describe, expect, it } from "vitest";
import { getDungeon } from "../domain/creatures";
import { createItem } from "../domain/items";
import { dateKey } from "../domain/calendar";
import { rollDailyQuests } from "../domain/quests";
import { EMPTY_VILLAGE } from "../domain/village";
import { repairSave, useGameStore } from "./gameStore";

const store = useGameStore.getState;

/** Gewinnt den laufenden Kampf mit dem nächsten Schlag. */
const winCurrent = () => {
  const { battle } = store();
  useGameStore.setState({ battle: { ...battle!, enemy: { ...battle!.enemy, hp: 1 }, adds: [] } });
  store().battleAttack();
  expect(store().battle?.status).toBe("won");
};

describe("Dorf im Spielstand", () => {
  beforeEach(() => store().resetGame());

  it("ein neues Spiel beginnt mit leerem Dorf und ohne Material", () => {
    expect(store().village).toEqual(EMPTY_VILLAGE);
    expect(store().materials).toEqual({});
  });

  it("auch bestehende Spielstände beginnen mit leerem Dorf", () => {
    const merged = repairSave({ character: store().character });
    expect(merged.village).toEqual(EMPTY_VILLAGE);
    expect(merged.materials).toEqual({});
  });

  it("jeder Sieg bringt sicher Material", () => {
    store().startBattle("grey-wolf");
    winCurrent();
    const elite = (store().battle?.elite?.length ?? 0) > 0;
    expect(store().materials.wolfPelt).toBe(elite ? 3 : 1);
    expect(store().battleReward?.materials).toEqual(store().materials);
  });

  it("im Dungeon gibt es doppelt so viel Material in die Truhe", () => {
    useGameStore.setState((s) => ({ character: { ...s.character, totalXp: 1e9 } }));
    const dungeon = getDungeon("abandoned-mine");
    store().startDungeon(dungeon.id);
    winCurrent();
    const elite = (store().battle?.elite?.length ?? 0) > 0;
    const material = Object.values(store().dungeon!.chest.materials ?? {});
    expect(material).toEqual([(elite ? 3 : 1) * 2]);
    // Gutgeschrieben wird erst mit der Truhe
    expect(store().materials).toEqual({});
  });

  it("ohne Schmiede kein Zerlegen und kein Verbessern", () => {
    const sword = createItem("sword-5", "rare", "s");
    useGameStore.setState((s) => ({ inventory: [...s.inventory, sword], character: { ...s.character, essence: 1000 } }));
    store().salvage("s");
    store().upgrade("s");
    expect(store().inventory.find((i) => i.uid === "s")?.upgrade ?? 0).toBe(0);
    expect(store().character.essence).toBe(1000);
  });

  it("Bauen zieht Gold und Material ab – der ausgebaute Händler hat sofort mehr Ware", () => {
    useGameStore.setState((s) => ({ character: { ...s.character, gold: 1000 }, materials: { wolfPelt: 20 } }));
    store().refreshShop();
    expect(store().shop.offers).toHaveLength(4);
    store().build("merchant");
    expect(store().village.merchant).toBe(1);
    expect(store().character.gold).toBe(700);
    expect(store().materials.wolfPelt).toBe(5);
    expect(store().shop.offers).toHaveLength(6);
    // Zu wenig für die nächste Stufe: nichts passiert
    store().build("merchant");
    expect(store().village.merchant).toBe(1);
  });

  it("Tränke: ohne Alchemist nur kleine Heiltränke", () => {
    useGameStore.setState((s) => ({ character: { ...s.character, gold: 1000 } }));
    store().buyPotion("medium");
    expect(store().potions.medium ?? 0).toBe(0);
    store().buyPotion("small");
    expect(store().potions.small).toBe(4);
  });

  it("Steckbrief: die gesuchte Kreatur erscheint als Elite mit genau diesen Modifikatoren", () => {
    const daily = rollDailyQuests(dateKey(), 1);
    const bounty = daily.quests.find((q) => q.def.goal.kind === "bounty")!;
    if (bounty.def.goal.kind !== "bounty") throw new Error("kein Steckbrief");
    const { creatureId, affixes } = bounty.def.goal;
    useGameStore.setState({ dailyQuests: daily, village: { ...EMPTY_VILLAGE, board: 3 } });
    store().startBattle(creatureId);
    expect(store().battle?.elite).toEqual(affixes);
    winCurrent();
    const after = store().dailyQuests.quests.find((q) => q.def.id === bounty.def.id)!;
    expect(after.progress).toBe(1);
    // Erledigt: die Kreatur kommt wieder wie gewohnt
    store().turnInQuest(bounty.def.id);
    expect(store().dailyQuests.quests.find((q) => q.def.id === bounty.def.id)!.turnedIn).toBe(true);
  });
});
