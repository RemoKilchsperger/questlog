import { beforeEach, describe, expect, it } from "vitest";
import { getDungeon } from "../domain/creatures";
import { treasureStep } from "../domain/treasureMaps";
import { EMPTY_VISITORS } from "../domain/visitors";
import { repairSave, useGameStore } from "./gameStore";

const store = () => useGameStore.getState();

/** Der laufende Kampf ist mit dem nächsten Schlag gewonnen. */
const winCurrent = () => {
  const { battle } = store();
  useGameStore.setState({ battle: { ...battle!, enemy: { ...battle!.enemy, hp: 1 }, adds: [] } });
  store().battleAttack();
  expect(store().battle?.status).toBe("won");
};

/** Dungeon starten und bis hinter den Zwischenboss springen – dort steht die Gabelung mit der Geschichtstür. */
const toStoryFork = (dungeonId: string) => {
  const dungeon = getDungeon(dungeonId);
  store().startDungeon(dungeonId);
  winCurrent();
  useGameStore.setState((s) => ({ dungeon: { ...s.dungeon!, stage: treasureStep(dungeon) - 2, doors: null, room: null } }));
  store().nextDungeonFight();
  winCurrent();
  return store().dungeon!.doors!;
};

/** Zum Endboss springen und ihn besiegen. */
const beatBoss = (dungeonId: string) => {
  const dungeon = getDungeon(dungeonId);
  useGameStore.setState((s) => ({ dungeon: { ...s.dungeon!, stage: dungeon.creatures.length - 2, doors: null, room: null } }));
  store().nextDungeonFight();
  expect(store().battle!.creatureId).toBe(dungeon.creatures.at(-1)!.id);
  winCurrent();
  expect(store().dungeon!.claimed?.completed).toBe(true);
};

const lastChapter = (id: string, accepted = true) =>
  useGameStore.setState({ visitors: { ...EMPTY_VISITORS, dungeonStory: { id, chapter: 2, accepted, progress: 0 } } });

describe("Dungeon-Besucher im Spielstand", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState((s) => ({ character: { ...s.character, totalXp: 1e9 } }));
  });

  it("ältere Spielstände bekommen einen leeren Platz für Dungeon-Besucher", () => {
    // So sah der Besucher-Zustand vor den Dungeon-Besuchern aus
    const old = { story: null, done: ["bram"], choices: {}, recipes: [], wanderer: null, nextWanderer: 0 };
    const repaired = repairSave({ character: store().character, visitors: old } as unknown as Parameters<typeof repairSave>[0]);
    expect(repaired.visitors?.dungeonStory).toBeNull();
    expect(repaired.visitors?.done).toEqual(["bram"]);
  });

  it("ohne angenommenes letztes Kapitel keine Geschichtstür", () => {
    lastChapter("gerold", false);
    expect(toStoryFork("abandoned-mine").some((d) => d.kind === "story")).toBe(false);
  });

  it("Gerold: Probe in der Szene, nach dem Endboss erfüllt – Pip wird Begleiter", () => {
    lastChapter("gerold");
    const doors = toStoryFork("abandoned-mine");
    const index = doors.findIndex((d) => d.kind === "story");
    expect(index).toBeGreaterThanOrEqual(0);
    store().chooseDungeonDoor(index);
    expect(store().dungeon!.room).toEqual({ kind: "story", visitorId: "gerold", outcome: null });

    const hp = store().battle!.hero.hp;
    store().dungeonStoryChoice("charge");
    const room = store().dungeon!.room;
    if (room?.kind !== "story" || !room.outcome) throw new Error("keine Szene");
    expect(room.outcome.optionId).toBe("charge");
    expect(store().battle!.hero.hp).toBe(hp - (room.outcome.damage ?? 0));
    // Danach geht es normal weiter – die Tür kommt in diesem Lauf nicht noch einmal
    expect(store().dungeon!.doors!.some((d) => d.kind === "story")).toBe(false);
    // Vor dem Endboss ist das Kapitel noch offen
    expect(store().visitors.dungeonStory?.progress).toBe(0);

    beatBoss("abandoned-mine");
    expect(store().visitors.dungeonStory).toMatchObject({ progress: 1, scene: "charge" });
    const outcome = store().turnInVisitor("dungeonStory");
    expect(outcome?.finished).toBe(true);
    expect(store().companions.some((c) => c.name === "Pip" && c.visitorId === "gerold")).toBe(true);
    expect(store().visitors.dungeonStory).toBeNull();
    store().refreshVisitors();
    expect(store().visitors.dungeonStory?.id).toBe("samira");
  });

  it("Vessa: den Sturm freilassen ist ein Elite-Kampf und schwächt Kaelthar", () => {
    lastChapter("vessa");
    const dungeon = getDungeon("storm-tower");
    const doors = toStoryFork(dungeon.id);
    store().chooseDungeonDoor(doors.findIndex((d) => d.kind === "story"));
    store().dungeonStoryChoice("free");
    const battle = store().battle!;
    expect(battle.status).toBe("active");
    expect(battle.creatureId).toBe("thunder-elemental");
    expect(battle.elite?.length).toBe(2);
    expect(store().dungeon!.storyChoice).toBe("free");
    winCurrent();
    expect(store().dungeon!.doors!.some((d) => d.kind === "story")).toBe(false);

    useGameStore.setState((s) => ({ dungeon: { ...s.dungeon!, stage: dungeon.creatures.length - 2, doors: null, room: null } }));
    store().nextDungeonFight();
    const weakened = store().battle!.enemy.maxHp;
    // Zum Vergleich derselbe Boss ohne Schwächung
    useGameStore.setState((s) => ({
      battle: { ...s.battle!, status: "won" },
      dungeon: { ...s.dungeon!, bossWeaken: undefined, stage: dungeon.creatures.length - 2, doors: null },
    }));
    store().nextDungeonFight();
    expect(weakened).toBeLessThan(store().battle!.enemy.maxHp);
  });

  it("Samira: das Amulett zurücklegen segnet den Lauf und bringt das Rezept", () => {
    lastChapter("samira");
    const doors = toStoryFork("sunken-temple");
    store().chooseDungeonDoor(doors.findIndex((d) => d.kind === "story"));
    store().dungeonStoryChoice("return");
    expect(store().dungeon!.blessings).toContain("vitality");
    beatBoss("sunken-temple");
    store().turnInVisitor("dungeonStory");
    expect(store().visitors.recipes).toContain("dateBread");
    expect(store().visitors.choices.samira).toBe("return");
  });

  it("wer vor dem Endboss aussteigt, sieht die Tür im nächsten Lauf wieder", () => {
    lastChapter("gerold");
    let doors = toStoryFork("abandoned-mine");
    store().chooseDungeonDoor(doors.findIndex((d) => d.kind === "story"));
    store().dungeonStoryChoice("charge");
    store().leaveDungeonWithChest();
    expect(store().visitors.dungeonStory?.progress).toBe(0);
    store().leaveBattle();
    doors = toStoryFork("abandoned-mine");
    expect(doors.some((d) => d.kind === "story")).toBe(true);
  });
});
