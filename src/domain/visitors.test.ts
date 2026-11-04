import { describe, expect, it } from "vitest";
import { getCreature } from "./creatures";
import { FOODS, getFood } from "./food";
import { getItem } from "./items";
import { questGoalText } from "./quests";
import {
  acceptVisitor,
  applyVisitorEvent,
  chapterQuest,
  COOK_RECIPES,
  dismissWanderer,
  EMPTY_VISITORS,
  FIXED_VISITORS,
  foundQuestItems,
  getFixedVisitor,
  RECIPE_KNOWN_XP_FACTOR,
  refreshVisitors,
  rollWanderer,
  storyChapterComplete,
  trackedVisitorQuests,
  turnInStory,
  turnInWanderer,
  visitorNeedsAttention,
  WANDERER_MIN_LEVEL,
  WANDERER_STAY_MS,
  type VisitorState,
} from "./visitors";

const HOUR = 3_600_000;
const never = () => 0.99;
const always = () => 0;

/** Erfüllt das aktuelle Kapitel des festen Besuchers mit genug Siegen. */
function finishChapter(state: VisitorState): VisitorState {
  const quest = chapterQuest(getFixedVisitor(state.story!.id), state.story!.chapter);
  const goal = quest.goal;
  if (goal.kind === "dungeon") return applyVisitorEvent(state, { kind: "dungeon", dungeonId: goal.dungeonId });
  if (goal.kind !== "kill" && goal.kind !== "fetch") throw new Error(goal.kind);
  const { creature } = getCreature(goal.creatureId);
  let next = state;
  for (let i = 0; i < goal.count; i++) next = applyVisitorEvent(next, { kind: "kill", creatureId: goal.creatureId, boss: creature.boss }, always);
  return next;
}

describe("Feste Besucher", () => {
  it("haben drei Kapitel mit gültigen Zielen, Geschenk oder Entscheidung", () => {
    for (const def of FIXED_VISITORS) {
      expect(def.chapters).toHaveLength(3);
      def.chapters.forEach((_, i) => expect(questGoalText(chapterQuest(def, i))).toBeTruthy());
      expect(!!def.gift !== !!def.choice).toBe(true);
      const gifts = def.choice ? def.choice.options.map((o) => o.gift) : [def.gift!];
      for (const gift of gifts) {
        if (gift.kind === "unique") expect(getItem(gift.itemId).visitorId).toBe(def.id);
        if (gift.kind === "recipe") expect(getFood(gift.foodId).recipe).toBe(true);
      }
    }
  });

  it("kommen der Reihe nach, sobald das Level reicht", () => {
    expect(refreshVisitors(EMPTY_VISITORS, 1, 0).story).toBeNull();
    const state = refreshVisitors(EMPTY_VISITORS, 3, 0);
    expect(state.story).toEqual({ id: "bram", chapter: 0, accepted: false, progress: 0 });
    // Solange Bram da ist, kommt kein zweiter – auch mit hohem Level
    expect(refreshVisitors({ ...state }, 60, 0).story!.id).toBe("bram");
    expect(refreshVisitors({ ...EMPTY_VISITORS, done: ["bram"] }, 60, 0).story!.id).toBe("mirla");
  });

  it("zählt erst nach dem Annehmen und gibt Kapitel für Kapitel ab", () => {
    let state = refreshVisitors(EMPTY_VISITORS, 3, 0);
    expect(visitorNeedsAttention(state)).toBe(true);
    expect(applyVisitorEvent(state, { kind: "kill", creatureId: "grey-wolf", boss: false })).toBe(state);
    state = acceptVisitor(state, "story");
    expect(visitorNeedsAttention(state)).toBe(false);
    expect(trackedVisitorQuests(state)).toHaveLength(1);
    expect(() => turnInStory(state)).toThrow(/nicht erfüllt/);
    state = finishChapter(state);
    expect(storyChapterComplete(state)).toBe(true);
    const first = turnInStory(state);
    expect(first.finished).toBe(false);
    expect(first.gift).toBeNull();
    expect(first.reward.xp).toBeGreaterThan(0);
    expect(first.state.story).toEqual({ id: "bram", chapter: 1, accepted: false, progress: 0 });

    state = finishChapter(acceptVisitor(first.state, "story"));
    state = finishChapter(acceptVisitor(turnInStory(state).state, "story"));
    const last = turnInStory(state);
    expect(last.finished).toBe(true);
    expect(last.gift).toMatchObject({ kind: "companion", name: "Bram" });
    expect(last.state.story).toBeNull();
    expect(last.state.done).toEqual(["bram"]);
  });

  it("Quest-Gegenstände fallen mit einer Chance, bei Bossen und Elite immer", () => {
    const def = getFixedVisitor("mirla");
    let state: VisitorState = { ...EMPTY_VISITORS, story: { id: "mirla", chapter: 0, accepted: true, progress: 0 } };
    const kill = { kind: "kill", creatureId: "marsh-toad", boss: false } as const;
    expect(applyVisitorEvent(state, kill, never)).toBe(state);
    state = applyVisitorEvent(state, kill, always);
    expect(state.story!.progress).toBe(1);
    state = applyVisitorEvent(state, { ...kill, elite: true }, never);
    expect(state.story!.progress).toBe(2);
    // Falsche Kreatur zählt nie
    expect(applyVisitorEvent(state, { kind: "kill", creatureId: "bog-serpent", boss: false }, always)).toBe(state);
    expect(chapterQuest(def, 0).goal.kind).toBe("fetch");
  });

  it("schaltet das Rezept frei", () => {
    const state: VisitorState = { ...EMPTY_VISITORS, story: { id: "mirla", chapter: 2, accepted: true, progress: 1 } };
    const result = turnInStory(state);
    expect(result.state.recipes).toEqual(["lilyStew"]);
    expect(FOODS.some((f) => f.id === "lilyStew")).toBe(true);
  });

  it("gibt für ein bekanntes Rezept mehr EP statt nochmal dasselbe Rezept", () => {
    const state: VisitorState = { ...EMPTY_VISITORS, story: { id: "yrla", chapter: 2, accepted: true, progress: 1 } };
    const fresh = turnInStory(state);
    expect(fresh.gift).toEqual({ kind: "recipe", foodId: "hunterRoast" });
    expect(fresh.state.recipes).toEqual(["hunterRoast"]);
    expect(fresh.recipeKnown).toBe(false);
    const known = turnInStory({ ...state, recipes: ["hunterRoast"] });
    expect(known.state.recipes).toEqual(["hunterRoast"]);
    expect(known.recipeKnown).toBe(true);
    expect(known.reward.xp).toBe(Math.round(fresh.reward.xp * RECIPE_KNOWN_XP_FACTOR));
    expect(known.reward.gold).toBe(fresh.reward.gold);
  });

  it("meldet gefallene Quest-Gegenstände", () => {
    const before: VisitorState = { ...EMPTY_VISITORS, story: { id: "mirla", chapter: 0, accepted: true, progress: 1 } };
    const event = { kind: "kill" as const, creatureId: "marsh-toad", boss: false };
    expect(foundQuestItems(before, applyVisitorEvent(before, event, never))).toEqual([]);
    expect(foundQuestItems(before, applyVisitorEvent(before, event, always))).toEqual([
      { item: "Moorlilie", icon: "🌱", progress: 2, count: 4 },
    ]);
    // Reine Kill-Ziele bringen keinen Gegenstand
    const bram: VisitorState = { ...EMPTY_VISITORS, story: { id: "bram", chapter: 0, accepted: true, progress: 0 } };
    expect(foundQuestItems(bram, applyVisitorEvent(bram, { kind: "kill", creatureId: "grey-wolf", boss: false }))).toEqual([]);
  });

  it("verlangt im letzten Kapitel eine Entscheidung und merkt sie sich", () => {
    const state: VisitorState = { ...EMPTY_VISITORS, story: { id: "stranger", chapter: 2, accepted: true, progress: 1 } };
    expect(() => turnInStory(state)).toThrow(/Entscheidung/);
    const give = turnInStory(state, "give");
    expect(give.gift).toEqual({ kind: "unique", itemId: "unique-stranger-scepter" });
    expect(give.state.choices).toEqual({ stranger: "give" });
    const refuse = turnInStory(state, "refuse");
    expect(refuse.gift!.kind).toBe("loot");
    expect(refuse.reward.gold).toBeGreaterThan(give.reward.gold * 1.9);
  });
});

describe("Durchreisende", () => {
  it("kommen erst ab ihrem Level und bleiben einen Tag", () => {
    expect(refreshVisitors(EMPTY_VISITORS, WANDERER_MIN_LEVEL - 1, 1000).wanderer).toBeNull();
    const state = refreshVisitors(EMPTY_VISITORS, WANDERER_MIN_LEVEL, 1000);
    expect(state.wanderer!.leaves - state.wanderer!.arrives).toBe(WANDERER_STAY_MS);
    // Er kommt, wenn man nachschaut
    expect(state.wanderer!.arrives).toBe(1000);
    const gone = refreshVisitors(state, WANDERER_MIN_LEVEL, 1000 + WANDERER_STAY_MS);
    expect(gone.wanderer).toBeNull();
    expect(gone.nextWanderer).toBeGreaterThanOrEqual(1000 + WANDERER_STAY_MS + 12 * HOUR);
    expect(gone.nextWanderer).toBeLessThan(1000 + WANDERER_STAY_MS + 36 * HOUR);
    // Ohne neue Zeit passiert nichts
    expect(refreshVisitors(gone, WANDERER_MIN_LEVEL, 1000 + WANDERER_STAY_MS)).toBe(gone);
  });

  it("haben Bitten passend zum Level, auch ganz am Anfang und am Ende", () => {
    for (const level of [WANDERER_MIN_LEVEL, 15, 30, 45, 60]) {
      for (let i = 0; i < 20; i++) {
        const seed = (i + 0.5) / 20;
        const wanderer = rollWanderer(level, 0, () => seed);
        expect(questGoalText(wanderer.quest)).toBeTruthy();
        expect(wanderer.intro).not.toContain("{");
        expect(wanderer.quest.reward.gold).toBeGreaterThan(0);
      }
    }
  });

  it("geben ihr Geschenk und ziehen dann weiter", () => {
    let state: VisitorState = { ...EMPTY_VISITORS, wanderer: rollWanderer(20, 0, () => 0.1) };
    state = acceptVisitor(state, "wanderer");
    const { quest } = state.wanderer!;
    if (quest.goal.kind !== "fetch") throw new Error(quest.goal.kind);
    for (let i = 0; i < quest.goal.count; i++) state = applyVisitorEvent(state, { kind: "kill", creatureId: quest.goal.creatureId, boss: false }, always);
    const result = turnInWanderer(state, 5 * HOUR);
    expect(result.gift).toEqual(state.wanderer!.gift);
    expect(result.state.wanderer).toBeNull();
    expect(result.state.nextWanderer).toBeGreaterThan(5 * HOUR);
    expect(dismissWanderer(state, 0).wanderer).toBeNull();
  });

  it("der Koch verrät ein Rezept, das kein fester Besucher schenkt", () => {
    expect(COOK_RECIPES).toEqual(["kingsBroth", "spicedPie", "honeyCake"]);
    for (let i = 0; i < 20; i++) {
      const seed = (i + 0.5) / 20;
      const wanderer = rollWanderer(20, 0, () => seed);
      if (wanderer.kind !== "cook") continue;
      expect(wanderer.gift.kind).toBe("recipe");
      let state: VisitorState = { ...EMPTY_VISITORS, wanderer: { ...wanderer, accepted: true, progress: 99 } };
      const result = turnInWanderer(state, 0);
      if (wanderer.gift.kind !== "recipe") throw new Error(wanderer.gift.kind);
      expect(result.state.recipes).toEqual([wanderer.gift.foodId]);
      state = { ...state, recipes: [wanderer.gift.foodId] };
      expect(turnInWanderer(state, 0).recipeKnown).toBe(true);
    }
  });
});
