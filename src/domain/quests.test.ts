import { describe, expect, it } from "vitest";
import { AREAS, DUNGEONS } from "./creatures";
import {
  abandonQuest,
  acceptQuest,
  advanceQuest,
  applyBoardEvent,
  applyQuestEvent,
  DAILY_HUNT_COUNT,
  DAILY_TRADE_COUNTS,
  dailyCandidates,
  EMPTY_BOARD,
  EMPTY_QUEST_LOG,
  getQuest,
  isQuestComplete,
  QUESTS,
  questGoalText,
  questsForCreature,
  rollDailyQuests,
  rollQuestLoot,
  rollWeeklyQuests,
  tradeActionFor,
  trackedQuests,
  turnInBoardQuest,
  turnInQuest,
  WEEKLY_DUNGEON_LEVEL,
  WEEKLY_KILLS,
  WEEKLY_TRADE_COUNTS,
  type QuestBoard,
  type QuestDef,
} from "./quests";

const sequence = (value: number) => () => value;

describe("Questbuch", () => {
  it("pro Gebiet eine Jagd pro Kreatur und der Boss, dazu jeder Dungeon – mit eindeutigen Ids", () => {
    expect(QUESTS).toHaveLength(AREAS.reduce((n, a) => n + a.creatures.length, 0) + DUNGEONS.length);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expect(q.title, q.id).not.toBe(q.id); // jede Quest hat einen eigenen Titel
      expect(q.reward.xp, q.id).toBeGreaterThan(0);
      expect(q.reward.gold, q.id).toBeGreaterThan(0);
    }
  });

  it("Ziele und Texte", () => {
    expect(getQuest("hunt-grey-wolf").goal).toEqual({ kind: "kill", creatureId: "grey-wolf", count: 6 });
    expect(questGoalText(getQuest("hunt-grey-wolf"))).toBe("Töte 6× Grauwolf");
    expect(questGoalText(getQuest("boss-goblin-chief"))).toBe("Besiege Goblinhäuptling Krummzahn");
    expect(questGoalText(getQuest("dungeon-abandoned-mine"))).toBe("Schliesse den Dungeon Verlassene Mine ab");
  });

  it("schwierigere Quests geben mehr", () => {
    const rat = getQuest("hunt-giant-rat").reward;
    const chief = getQuest("boss-goblin-chief").reward;
    const dragon = getQuest("boss-ignaroth").reward;
    expect(chief.xp).toBeGreaterThan(rat.xp);
    expect(dragon.xp).toBeGreaterThan(chief.xp);
    expect(dragon.gold).toBeGreaterThan(chief.gold);
    expect(chief.dropChance).toBe(1);
  });

  it("annehmen nur in offenen Gebieten und nur einmal", () => {
    const log = acceptQuest(EMPTY_QUEST_LOG, "hunt-giant-rat", 1);
    expect(log.active).toEqual({ "hunt-giant-rat": 0 });
    expect(() => acceptQuest(log, "hunt-giant-rat", 1)).toThrow(/schon angenommen/);
    expect(() => acceptQuest(EMPTY_QUEST_LOG, "hunt-marsh-toad", 10)).toThrow(/ab Level 11/);
    expect(() => acceptQuest(EMPTY_QUEST_LOG, "dungeon-abandoned-mine", 9)).toThrow(/ab Level 10/);
    expect(() => acceptQuest({ active: {}, completed: ["hunt-giant-rat"] }, "hunt-giant-rat", 1)).toThrow(/abgeschlossen/);
  });

  it("Siege zählen nur für passende Quests, höchstens bis zum Ziel", () => {
    let log = acceptQuest(acceptQuest(EMPTY_QUEST_LOG, "hunt-giant-rat", 1), "hunt-grey-wolf", 1);
    // Fremde Kreatur: nichts ändert sich, dasselbe Objekt
    expect(applyQuestEvent(log, { kind: "kill", creatureId: "forest-spider", boss: false })).toBe(log);
    for (let i = 0; i < 7; i++) log = applyQuestEvent(log, { kind: "kill", creatureId: "giant-rat", boss: false });
    expect(log.active).toEqual({ "hunt-giant-rat": 5, "hunt-grey-wolf": 0 });
    expect(isQuestComplete(getQuest("hunt-giant-rat"), 5)).toBe(true);
  });

  it("Dungeon-Quests zählen nur den Abschluss", () => {
    let log = acceptQuest(EMPTY_QUEST_LOG, "dungeon-abandoned-mine", 10);
    log = applyQuestEvent(log, { kind: "kill", creatureId: "ore-king", boss: false });
    expect(log.active["dungeon-abandoned-mine"]).toBe(0);
    log = applyQuestEvent(log, { kind: "dungeon", dungeonId: "abandoned-mine" });
    expect(log.active["dungeon-abandoned-mine"]).toBe(1);
  });

  it("abgeben erst, wenn erfüllt – danach ist die Quest erledigt", () => {
    let log = acceptQuest(EMPTY_QUEST_LOG, "boss-goblin-chief", 10);
    expect(() => turnInQuest(log, "boss-goblin-chief")).toThrow(/nicht erfüllt/);
    expect(() => turnInQuest(log, "hunt-giant-rat")).toThrow(/nicht angenommen/);
    log = applyQuestEvent(log, { kind: "kill", creatureId: "goblin-chief", boss: false });
    log = turnInQuest(log, "boss-goblin-chief");
    expect(log).toEqual({ active: {}, completed: ["boss-goblin-chief"] });
  });

  it("abbrechen verwirft den Fortschritt", () => {
    let log = acceptQuest(EMPTY_QUEST_LOG, "hunt-giant-rat", 1);
    log = applyQuestEvent(log, { kind: "kill", creatureId: "giant-rat", boss: false });
    log = abandonQuest(log, "hunt-giant-rat");
    expect(log.active).toEqual({});
    expect(acceptQuest(log, "hunt-giant-rat", 1).active["hunt-giant-rat"]).toBe(0);
  });

  it("Item beim Abgeben je nach Chance, auf dem Level des Helden", () => {
    const hunt = getQuest("hunt-giant-rat").reward;
    expect(rollQuestLoot(hunt, 1, "x", sequence(0.6))).toBeNull();
    expect(rollQuestLoot(hunt, 1, "x", sequence(0.4))).not.toBeNull();
    expect(rollQuestLoot(getQuest("boss-goblin-chief").reward, 12, "x", sequence(0.99))).not.toBeNull();
  });
});

describe("Tagesaufträge", () => {
  const hunts = (board: QuestBoard) => board.quests.filter((q) => q.def.goal.kind === "kill");

  it("drei Jagden auf verschiedene Kreaturen mit 3–6 Siegen, passend zum Level", () => {
    for (const level of [1, 5, 15, 33, 60]) {
      const daily = rollDailyQuests("2026-10-08", level, Math.random);
      expect(hunts(daily)).toHaveLength(DAILY_HUNT_COUNT);
      const ids = hunts(daily).map((q) => (q.def.goal.kind === "kill" ? q.def.goal.creatureId : ""));
      expect(new Set(ids).size).toBe(ids.length);
      for (const q of hunts(daily)) {
        if (q.def.goal.kind !== "kill") continue;
        expect(q.def.goal.count).toBeGreaterThanOrEqual(3);
        expect(q.def.goal.count).toBeLessThanOrEqual(6);
        expect(dailyCandidates(level).map((c) => c.id)).toContain(q.def.goal.creatureId);
      }
    }
  });

  it("nie Bosse, nie Dungeon-Gegner und nichts aus verschlossenen Gebieten", () => {
    const candidates = dailyCandidates(12);
    expect(candidates.every((c) => !c.boss && c.level <= 14)).toBe(true);
    expect(candidates.length).toBeGreaterThanOrEqual(DAILY_HUNT_COUNT);
    // Ganz am Anfang die schwächsten drei
    expect(dailyCandidates(1).map((c) => c.id)).toEqual(["giant-rat", "grey-wolf", "forest-spider"]);
  });

  it("dazu jeden Tag ein Händler-Auftrag – verkaufen, zerlegen, verbessern im Wechsel", () => {
    const tradeOf = (date: string) => {
      const trade = rollDailyQuests(date, 10, Math.random).quests.find((q) => q.def.goal.kind === "trade");
      return trade?.def.goal.kind === "trade" ? trade.def.goal : null;
    };
    const days = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"].map(tradeOf);
    // Drei Tage hintereinander: jede Handlung einmal, am vierten Tag geht es von vorne los
    expect(new Set(days.slice(0, 3).map((g) => g?.action)).size).toBe(3);
    expect(days[3]?.action).toBe(days[0]?.action);
    expect([0, 1, 2, 3].map(tradeActionFor)).toEqual(["sell", "salvage", "upgrade", "sell"]);
    for (const goal of days) expect(goal!.count).toBe(DAILY_TRADE_COUNTS[goal!.action]);
  });

  it("Fortschritt, Abgabe und laufende Übersicht", () => {
    let daily = rollDailyQuests("2026-10-08", 1, sequence(0));
    const [first] = daily.quests;
    const creatureId = first.def.goal.kind === "kill" ? first.def.goal.creatureId : "";
    expect(() => turnInBoardQuest(daily, first.def.id)).toThrow(/nicht erfüllt/);
    for (let i = 0; i < 10; i++) daily = applyBoardEvent(daily, { kind: "kill", creatureId, boss: false });
    expect(daily.quests[0].progress).toBe(3);
    daily = turnInBoardQuest(daily, first.def.id);
    expect(daily.quests[0].turnedIn).toBe(true);
    expect(() => turnInBoardQuest(daily, first.def.id)).toThrow();

    // Abgegebene und gestrige Aufträge laufen nicht mehr
    const tracked = trackedQuests(EMPTY_QUEST_LOG, daily, EMPTY_BOARD, "2026-10-08", "");
    expect(tracked).toHaveLength(daily.quests.length - 1);
    expect(trackedQuests(EMPTY_QUEST_LOG, daily, EMPTY_BOARD, "2026-10-09", "")).toHaveLength(0);
    expect(questsForCreature(tracked, creatureId)).toHaveLength(0);
  });
});

describe("Händler-Aufträge", () => {
  const sellQuest = (count: number): QuestDef => ({
    id: "t",
    title: "t",
    description: "",
    goal: { kind: "trade", action: "sell", count },
    reward: getQuest("hunt-giant-rat").reward,
  });

  it("zählen nur die passende Handlung, höchstens bis zum Ziel", () => {
    const def = sellQuest(3);
    expect(advanceQuest(def, 0, { kind: "trade", action: "sell" })).toBe(1);
    expect(advanceQuest(def, 0, { kind: "trade", action: "salvage" })).toBe(0);
    expect(advanceQuest(def, 3, { kind: "trade", action: "sell" })).toBe(3);
    expect(questGoalText(def)).toBe("Verkaufe 3 Ausrüstungsteile beim Händler");
  });
});

describe("Wochenaufträge", () => {
  it("Kreaturen, Bosse, Dungeons und ein Händler-Auftrag – Dungeons erst ab dem ersten offenen Dungeon", () => {
    const kinds = (level: number) => rollWeeklyQuests("2026-10-05", level).quests.map((q) => q.def.goal.kind);
    expect(kinds(WEEKLY_DUNGEON_LEVEL)).toEqual(["killAny", "killAny", "dungeons", "trade"]);
    expect(kinds(WEEKLY_DUNGEON_LEVEL - 1)).toEqual(["killAny", "killAny", "trade"]);
    for (const q of rollWeeklyQuests("2026-10-05", 30).quests) expect(q.def.reward.dropChance).toBe(1);
  });

  it("allgemeine Ziele: jede Kreatur, nur Bosse, jeder Dungeon", () => {
    let board = rollWeeklyQuests("2026-10-05", 20);
    board = applyBoardEvent(board, { kind: "kill", creatureId: "giant-rat", boss: false });
    board = applyBoardEvent(board, { kind: "kill", creatureId: "swamp-hydra", boss: true });
    board = applyBoardEvent(board, { kind: "dungeon", dungeonId: "abandoned-mine" });
    expect(board.quests.map((q) => q.progress)).toEqual([2, 1, 1, 0]);
    expect(board.quests.map((q) => questGoalText(q.def))).toContain(`Besiege ${WEEKLY_KILLS} Kreaturen`);
  });

  it("der Händler-Auftrag wechselt jede Woche und ist grösser als der tägliche", () => {
    const tradeOf = (week: string) => {
      const goal = rollWeeklyQuests(week, 20).quests.at(-1)!.def.goal;
      return goal.kind === "trade" ? goal : null;
    };
    const weeks = ["2026-10-05", "2026-10-12", "2026-10-19"].map(tradeOf);
    expect(new Set(weeks.map((g) => g?.action)).size).toBe(3);
    for (const goal of weeks) expect(goal!.count).toBeGreaterThan(DAILY_TRADE_COUNTS[goal!.action]);
    expect(weeks.map((g) => g!.count).sort()).toEqual(Object.values(WEEKLY_TRADE_COUNTS).sort());
  });
});
