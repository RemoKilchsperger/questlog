import { beforeEach, describe, expect, it } from "vitest";
import { addToChest, EMPTY_CHEST, startBattle, type BattleState, type HeroCombatProfile } from "../domain/combat";
import { AREA_BOSS_RESPAWN_MS, formatRespawn, getCreature, getDungeon, hasRespawn, respawnLeft, startRespawn } from "../domain/creatures";
import { dateKey, weekKey } from "../domain/calendar";
import { createItem } from "../domain/items";
import { getQuest, rollDailyQuests, rollWeeklyQuests, type TradeAction } from "../domain/quests";
import { convertLinearCurveXp } from "../domain/leveling";
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

/** Verkauft, zerlegt oder verbessert eine neue seltene Waffe. */
const trade = (action: TradeAction) => {
  const store = useGameStore.getState;
  const uid = crypto.randomUUID();
  useGameStore.setState({
    inventory: [...store().inventory, createItem("sword-5", "rare", uid)],
    character: { ...store().character, essence: 10_000 },
  });
  if (action === "sell") store().sell(uid);
  if (action === "salvage") store().salvage(uid);
  if (action === "upgrade") store().upgrade(uid);
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
    expect(store().lastReward).toMatchObject({ questTitle: "Rattenplage", source: "story", xp: reward.xp });
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

  it("alle Tagesaufträge abgegeben – auch der Händler-Auftrag – zählt als perfekter Tag", () => {
    const store = useGameStore.getState;
    store().refreshQuestBoards();
    for (const q of store().dailyQuests.quests) {
      const { goal } = q.def;
      if (goal.kind === "kill") for (let i = 0; i < goal.count; i++) win(goal.creatureId);
      if (goal.kind === "trade") for (let i = 0; i < goal.count; i++) trade(goal.action);
    }
    for (const q of store().dailyQuests.quests) store().turnInQuest(q.def.id);
    expect(store().records.dailyQuestsCompleted).toBe(4);
    expect(store().records.perfectBonusDays).toBe(1);
  });

  it("Händler und Schmied zählen jedes Ausrüstungsteil – Waffen und Rüstung", () => {
    const store = useGameStore.getState;
    const daily = rollDailyQuests(dateKey(), 1);
    const goal = daily.quests.at(-1)!.def.goal;
    if (goal.kind !== "trade") throw new Error("Kein Händler-Auftrag");
    useGameStore.setState({ dailyQuests: daily, weeklyQuests: rollWeeklyQuests(weekKey(), 1) });
    // Rüstung zählt …
    const helmet = createItem("head-5", "rare", "helm");
    useGameStore.setState({ inventory: [...store().inventory, helmet], character: { ...store().character, essence: 10_000 } });
    if (goal.action === "sell") store().sell("helm");
    if (goal.action === "salvage") store().salvage("helm");
    if (goal.action === "upgrade") store().upgrade("helm");
    expect(store().dailyQuests.quests.at(-1)!.progress).toBe(1);
    // … eine Waffe auch – und beides zählt für den Wochenauftrag
    trade(goal.action);
    expect(store().dailyQuests.quests.at(-1)!.progress).toBe(2);
    const weeklyTrade = store().weeklyQuests.quests.at(-1)!;
    expect(weeklyTrade.progress).toBe(weeklyTrade.def.goal.kind === "trade" && weeklyTrade.def.goal.action === goal.action ? 2 : 0);
  });

  it("Wochenaufträge: jeder Sieg und jeder Boss zählt – auch ein Koop-Boss", () => {
    const store = useGameStore.getState;
    useGameStore.setState({ character: { ...store().character, totalXp: 100_000 } });
    store().refreshQuestBoards();
    win("giant-rat");
    win("goblin-chief");
    store().grantCoopReward({ xp: 0, gold: 0, loot: null, bossLoot: null, potions: null, buffPotion: null }, "swamp-hydra");
    const [kills, bosses] = store().weeklyQuests.quests;
    expect(kills.progress).toBe(3); // auch Bosse sind Kreaturen
    expect(bosses.progress).toBe(2);
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
    expect(state.character.totalXp).toBe(convertLinearCurveXp(500));
    expect(state.records).toMatchObject({ battlesWon: 4, questsCompleted: 2, dailyQuestsCompleted: 1 });
    expect(state.questLog).toEqual({ active: {}, completed: [] });
  });
});

describe("Respawn der Gebietsbosse", () => {
  beforeEach(() => useGameStore.getState().resetGame());

  it("nach einem Sieg 5 Minuten gesperrt, danach wieder bereit", () => {
    const store = useGameStore.getState;
    useGameStore.setState({ character: { ...store().character, totalXp: 100_000 } });
    win("goblin-chief");
    const left = respawnLeft(store().bossRespawns, "goblin-chief");
    expect(left).toBeGreaterThan(AREA_BOSS_RESPAWN_MS - 5_000);
    expect(left).toBeLessThanOrEqual(AREA_BOSS_RESPAWN_MS);

    store().leaveBattle();
    store().startBattle("goblin-chief");
    expect(store().battle).toBeNull();
    // Normale Kreaturen sind nicht betroffen
    store().startBattle("giant-rat");
    expect(store().battle?.creatureId).toBe("giant-rat");

    // Zeit abgelaufen
    store().leaveBattle();
    useGameStore.setState({ bossRespawns: { "goblin-chief": Date.now() - 1 } });
    store().startBattle("goblin-chief");
    expect(store().battle?.creatureId).toBe("goblin-chief");
  });

  it("nur Gebietsbosse – normale Kreaturen und Dungeon-Bosse nicht", () => {
    expect(hasRespawn("goblin-chief")).toBe(true);
    expect(hasRespawn("giant-rat")).toBe(false);
    expect(hasRespawn("ore-king")).toBe(false);
    expect(startRespawn({}, "giant-rat", 0)).toEqual({});
    expect(startRespawn({}, "goblin-chief", 0)).toEqual({ "goblin-chief": AREA_BOSS_RESPAWN_MS });
    expect(formatRespawn(AREA_BOSS_RESPAWN_MS)).toBe("5:00");
    expect(formatRespawn(65_500)).toBe("1:06");
  });
});
