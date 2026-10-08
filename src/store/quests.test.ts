import { beforeEach, describe, expect, it } from "vitest";
import { addToChest, EMPTY_CHEST, startBattle, type BattleState, type HeroCombatProfile } from "../domain/combat";
import { getCreature, getDungeon } from "../domain/creatures";
import { dateKey } from "../domain/calendar";
import { getQuest } from "../domain/quests";
import { migrateSave, useGameStore } from "./gameStore";

const hero: HeroCombatProfile = {
  level: 30,
  maxHp: 500,
  damage: 50,
  armor: 0,
  critChance: 0,
  goldBonus: 0,
  maxMana: 40,
  abilities: [],
  heroClass: null,
  critMultiplier: 1.5,
};

/** Kampf, den der nächste Schlag gewinnt. */
const winnable = (creatureId: string): BattleState => {
  const base = startBattle("b", "Held", hero, getCreature(creatureId).creature);
  return { ...base, enemy: { ...base.enemy, hp: 1 } };
};

const win = (creatureId: string) => {
  useGameStore.setState({ battle: winnable(creatureId), battleReward: null, dungeon: null });
  useGameStore.getState().battleAttack();
  expect(useGameStore.getState().battle?.status).toBe("won");
};

describe("Quests im Spielstand", () => {
  beforeEach(() => useGameStore.getState().resetGame());

  it("Kämpfe kosten nichts", () => {
    const before = useGameStore.getState().character;
    useGameStore.getState().startBattle("giant-rat");
    expect(useGameStore.getState().battle).not.toBeNull();
    expect(useGameStore.getState().character).toEqual(before);
  });

  it("Siege bringen angenommene Quests voran, abgeben schreibt die Belohnung gut", () => {
    const store = useGameStore.getState;
    store().acceptQuest("hunt-giant-rat");
    for (let i = 0; i < 5; i++) win("giant-rat");
    expect(store().questLog.active["hunt-giant-rat"]).toBe(5);

    const { totalXp, gold } = store().character;
    store().turnInQuest("hunt-giant-rat");
    const reward = getQuest("hunt-giant-rat").reward;
    expect(store().character.totalXp).toBe(totalXp + reward.xp);
    expect(store().character.gold).toBe(gold + reward.gold);
    expect(store().questLog.completed).toEqual(["hunt-giant-rat"]);
    expect(store().records.questsCompleted).toBe(1);
    expect(store().lastReward).toMatchObject({ questTitle: "Rattenplage", daily: false, xp: reward.xp });
  });

  it("nicht angenommene Quests zählen nicht mit", () => {
    win("giant-rat");
    useGameStore.getState().acceptQuest("hunt-giant-rat");
    expect(useGameStore.getState().questLog.active["hunt-giant-rat"]).toBe(0);
  });

  it("Tagesaufträge werden beim ersten Sieg des Tages ausgewürfelt und zählen ohne Annehmen", () => {
    win("giant-rat");
    const { dailyQuests } = useGameStore.getState();
    expect(dailyQuests.date).toBe(dateKey());
    const rat = dailyQuests.quests.find((q) => q.def.goal.kind === "kill" && q.def.goal.creatureId === "giant-rat");
    if (rat) expect(rat.progress).toBe(1);
  });

  it("alle Tagesaufträge abgegeben zählt als perfekter Tag", () => {
    const store = useGameStore.getState;
    store().refreshDailyQuests();
    for (const q of store().dailyQuests.quests) {
      if (q.def.goal.kind !== "kill") continue;
      for (let i = 0; i < q.def.goal.count; i++) win(q.def.goal.creatureId);
    }
    for (const q of store().dailyQuests.quests) store().turnInQuest(q.def.id);
    expect(store().records.dailyQuestsCompleted).toBe(3);
    expect(store().records.perfectBonusDays).toBe(1);
  });

  it("ein abgeschlossener Dungeon erfüllt die Dungeon-Quest", () => {
    useGameStore.setState({ character: { ...useGameStore.getState().character, totalXp: 100_000 } });
    useGameStore.getState().acceptQuest("dungeon-abandoned-mine");
    const dungeon = getDungeon("abandoned-mine");
    const last = dungeon.creatures.length - 1;
    const base = startBattle("b", "Held", hero, dungeon.creatures[last]);
    useGameStore.setState({
      battle: { ...base, enemy: { ...base.enemy, hp: 1 } },
      dungeon: { dungeonId: dungeon.id, stage: last, chest: addToChest(EMPTY_CHEST, { xp: 0, gold: 0, loot: null, bossLoot: null, potions: null, buffPotion: null }), claimed: null },
    });
    useGameStore.getState().battleAttack();
    expect(useGameStore.getState().questLog.active["dungeon-abandoned-mine"]).toBe(1);
  });
});

describe("Migration auf v14", () => {
  it("entfernt To-dos und Kampfpunkte, erledigte To-dos zählen weiter", () => {
    const old = {
      character: { name: "Alt", totalXp: 500, gold: 10, essence: 0, stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 }, spentPoints: 0, battlePoints: 7, battlePointSlot: 123, skills: {}, abilities: [] },
      quests: [
        { id: "a", title: "Einkaufen", status: "done" },
        { id: "b", title: "Joggen", status: "done", bonus: true },
        { id: "c", title: "Steuern", status: "open" },
      ],
      bonusDone: { date: "2026-10-01", ids: [] },
      inventory: [],
      equipment: {},
      records: { battlesWon: 4 },
    };
    const state = migrateSave(old, 13) as unknown as Record<string, unknown> & { character: Record<string, unknown>; records: Record<string, number> };
    expect(state.quests).toBeUndefined();
    expect(state.bonusDone).toBeUndefined();
    expect(state.character.battlePoints).toBeUndefined();
    expect(state.character.battlePointSlot).toBeUndefined();
    expect(state.character.totalXp).toBe(500);
    expect(state.records).toMatchObject({ battlesWon: 4, questsCompleted: 2, dailyQuestsCompleted: 1 });
    expect(state.questLog).toEqual({ active: {}, completed: [] });
  });
});
