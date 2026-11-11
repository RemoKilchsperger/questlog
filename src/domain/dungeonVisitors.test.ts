import { describe, expect, it } from "vitest";
import { getCreature, getDungeon, DUNGEONS } from "./creatures";
import { DUNGEON_VISITORS } from "./dungeonVisitors";
import { getFood } from "./food";
import { getItem } from "./items";
import { VISITOR_EFFECTS } from "./itemEffects";
import { sceneTestOutcome } from "./dungeonPaths";
import {
  completeStoryScene,
  leftLetter,
  COOK_RECIPES,
  EMPTY_VISITORS,
  refreshVisitors,
  storySceneFor,
  turnInStory,
  type VisitorState,
} from "./visitors";

const lastChapter = (id: string, accepted = true): VisitorState => ({
  ...EMPTY_VISITORS,
  dungeonStory: { id, chapter: 2, accepted, progress: 0 },
});

describe("Dungeon-Besucher", () => {
  it("einer pro Dungeon, er kommt zum Level des Dungeons", () => {
    expect(DUNGEON_VISITORS.map((v) => v.dungeonId)).toEqual(DUNGEONS.map((d) => d.id));
    for (const v of DUNGEON_VISITORS) expect(v.level).toBe(getDungeon(v.dungeonId!).minLevel);
  });

  it("Kapitel 1 und 2 spielen im eigenen Dungeon, Kapitel 2 beim Zwischenboss, Kapitel 3 ist die Szene", () => {
    for (const v of DUNGEON_VISITORS) {
      const dungeon = getDungeon(v.dungeonId!);
      const [first, second, third] = v.chapters.map((c) => c.goal);
      for (const goal of [first, second]) {
        if (goal.kind !== "kill" && goal.kind !== "fetch") throw new Error(`${v.id}: unerwartetes Ziel`);
        expect(getCreature(goal.creatureId).area.id).toBe(dungeon.id);
      }
      if (second.kind !== "fetch") throw new Error(`${v.id}: Kapitel 2 ist kein Quest-Gegenstand`);
      expect(getCreature(second.creatureId).creature.midBoss).toBe(true);
      expect(third).toEqual({ kind: "dungeonStory", dungeonId: dungeon.id });
    }
  });

  it("Szenen: Zusatzkämpfe gegen Gegner des Dungeons, Entscheidungen passen zu den Wahlen der Szene", () => {
    for (const v of DUNGEON_VISITORS) {
      const scene = v.scene!;
      expect(scene.options.length).toBe(2);
      for (const o of scene.options) if (o.fight) expect(getCreature(o.fight).area.id).toBe(v.dungeonId);
      if (v.choice) expect(v.choice.options.map((o) => o.id)).toEqual(scene.options.map((o) => o.id));
      else expect(v.gift).toBeDefined();
    }
  });

  it("Unikate und Rezept gibt es, mit festem Effekt – und das Rezept kocht der fahrende Koch nicht", () => {
    const gifts = DUNGEON_VISITORS.flatMap((v) => [v.gift, ...(v.choice?.options.map((o) => o.gift) ?? [])]);
    for (const gift of gifts) {
      if (gift?.kind === "unique") {
        expect(getItem(gift.itemId).visitorId).toBeDefined();
        expect(VISITOR_EFFECTS[gift.itemId]).toBeDefined();
      }
      if (gift?.kind === "recipe") {
        expect(getFood(gift.foodId).recipe).toBe(true);
        expect(COOK_RECIPES).not.toContain(gift.foodId);
      }
    }
  });

  it("eigener Platz: kommt neben dem Gebiets-Besucher, der nächste erst nach dem vorigen", () => {
    const state = refreshVisitors(EMPTY_VISITORS, 25, 0, () => 0);
    expect(state.story?.id).toBe("bram");
    expect(state.dungeonStory?.id).toBe("gerold");
    expect(refreshVisitors({ ...EMPTY_VISITORS, done: ["gerold"] }, 25, 0, () => 0).dungeonStory?.id).toBe("samira");
    expect(refreshVisitors(EMPTY_VISITORS, 9, 0, () => 0).dungeonStory).toBeNull();
  });

  it("die Szene wartet nur im eigenen Dungeon und nur im angenommenen letzten Kapitel", () => {
    expect(storySceneFor(lastChapter("gerold"), "abandoned-mine")?.visitor.id).toBe("gerold");
    expect(storySceneFor(lastChapter("gerold"), "sunken-temple")).toBeNull();
    expect(storySceneFor(lastChapter("gerold", false), "abandoned-mine")).toBeNull();
    expect(storySceneFor({ ...EMPTY_VISITORS, dungeonStory: { id: "gerold", chapter: 1, accepted: true, progress: 0 } }, "abandoned-mine")).toBeNull();
  });

  it("Endboss nach der Szene: Kapitel erfüllt, die Wahl der Szene bestimmt das Geschenk", () => {
    const done = completeStoryScene(lastChapter("vessa"), "storm-tower", "bind");
    expect(done.dungeonStory).toMatchObject({ progress: 1, scene: "bind" });
    expect(storySceneFor(done, "storm-tower")).toBeNull();
    const result = turnInStory(done, undefined, "dungeonStory");
    expect(result.gift).toEqual({ kind: "unique", itemId: "unique-vessa-staff" });
    expect(result.state.dungeonStory).toBeNull();
    expect(result.state.done).toContain("vessa");
    expect(result.state.choices.vessa).toBe("bind");
    // Andere Dungeons ändern nichts
    expect(completeStoryScene(lastChapter("vessa"), "void-abyss", "bind")).toEqual(lastChapter("vessa"));
  });

  it("Probe: leichte Rüstung entkommt eher, schwere steckt besser ein – 1 LP bleibt", () => {
    expect(sceneTestOutcome("light", 100, 100, () => 0.6)).toEqual({ dodged: true, damage: 0 });
    expect(sceneTestOutcome("heavy", 100, 100, () => 0.6)).toEqual({ dodged: false, damage: 10 });
    expect(sceneTestOutcome("medium", 100, 100, () => 0.9)).toEqual({ dodged: false, damage: 18 });
    expect(sceneTestOutcome("light", 100, 5, () => 0.9).damage).toBe(4);
  });
});

describe("Brief statt Besucher", () => {
  it("bleibt Orun im Siegel, liegt im Dorf nur sein Brief – beim Echo kommt er selbst", () => {
    const visit = { id: "orun", chapter: 2, accepted: true, progress: 1 };
    expect(leftLetter({ ...visit, scene: "seal" })).toBe(true);
    expect(leftLetter({ ...visit, scene: "echo" })).toBe(false);
    expect(leftLetter({ ...visit, progress: 0 })).toBe(false);
    expect(leftLetter({ id: "bram", chapter: 2, accepted: true, progress: 1 })).toBe(false);
  });
});
