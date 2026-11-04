import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_CHEST, startBattle, type HeroCombatProfile } from "../domain/combat";
import { getCreature } from "../domain/creatures";
import { getItem } from "../domain/items";
import { effectOf } from "../domain/itemEffects";
import { totalXpForLevel } from "../domain/leveling";
import { EMPTY_VISITORS, type VisitorState } from "../domain/visitors";
import { migrateSave, repairSave, useGameStore } from "./gameStore";

const store = useGameStore.getState;

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

const win = (creatureId: string) => {
  const base = startBattle("b", "Held", hero, getCreature(creatureId).creature, hero.maxHp);
  useGameStore.setState({ battle: { ...base, enemy: { ...base.enemy, hp: 1 } }, battleReward: null, dungeon: null });
  store().battleAttack();
  expect(store().battle?.status).toBe("won");
};

const atLevel = (level: number, visitors: VisitorState = EMPTY_VISITORS) =>
  useGameStore.setState((s) => ({ character: { ...s.character, totalXp: totalXpForLevel(level) }, visitors }));

describe("Besucher im Spielstand", () => {
  beforeEach(() => store().resetGame());

  it("alte Spielstände bekommen leere Besucher", () => {
    const merged = repairSave({ character: store().character });
    expect(merged.visitors).toEqual(EMPTY_VISITORS);
  });

  it("v20: Portionen im Vorrat werden zum Rezept", () => {
    const saved = { character: store().character, pantry: { hunterRoast: 2, honeyCake: 1 }, visitors: { ...EMPTY_VISITORS, recipes: ["lilyStew"] } };
    const migrated = migrateSave(saved, 20) as ReturnType<typeof migrateSave> & { pantry?: unknown };
    expect(migrated.pantry).toBeUndefined();
    expect(migrated.visitors.recipes).toEqual(["lilyStew", "hunterRoast", "honeyCake"]);
  });

  it("die Siegmeldung nennt den gefundenen Quest-Gegenstand", () => {
    atLevel(20, { ...EMPTY_VISITORS, story: { id: "bram", chapter: 2, accepted: true, progress: 0 } });
    win("goblin-chief");
    expect(store().battleReward?.questItems).toEqual([{ item: "Banner der Grauen Lanzen", icon: "🏳️", progress: 1, count: 1 }]);
    win("goblin-chief");
    expect(store().battleReward?.questItems).toEqual([]);
  });

  it("auch im Koop steht der Quest-Gegenstand beim Ergebnis", () => {
    atLevel(20, { ...EMPTY_VISITORS, story: { id: "bram", chapter: 2, accepted: true, progress: 0 } });
    const reward = { xp: 10, gold: 5, loot: null, bossLoot: null, potions: null, buffPotion: null };
    expect(store().grantCoopReward(reward, "goblin-chief").questItems).toEqual([
      { item: "Banner der Grauen Lanzen", icon: "🏳️", progress: 1, count: 1 },
    ]);
    expect(store().grantCoopDungeon(EMPTY_CHEST, "abandoned-mine", false).questItems).toEqual([]);
  });

  it("Bram kommt, Siege zählen nach dem Annehmen, beim Abgeben gibt es EP und Gold", () => {
    atLevel(3);
    store().refreshVisitors();
    expect(store().visitors.story?.id).toBe("bram");
    store().acceptVisitor("story");
    for (let i = 0; i < 4; i++) win("grey-wolf");
    expect(store().visitors.story?.progress).toBe(4);
    const gold = store().character.gold;
    const outcome = store().turnInVisitor("story");
    expect(outcome?.finished).toBe(false);
    expect(outcome!.xp).toBeGreaterThan(0);
    expect(store().character.gold).toBe(gold + outcome!.gold);
    expect(store().lastReward?.source).toBe("visitor");
    expect(store().visitors.story?.chapter).toBe(1);
  });

  it("Bram wird Begleiter und belegt keinen Platz", () => {
    atLevel(12, { ...EMPTY_VISITORS, story: { id: "bram", chapter: 2, accepted: true, progress: 1 } });
    store().turnInVisitor("story");
    const [bram] = store().companions;
    expect(bram).toMatchObject({ name: "Bram", visitorId: "bram" });
    expect(bram.traits.map((t) => t.id)).toEqual(["veteran", "lucky"]);
  });

  it("Unikate kommen legendär und mit festem Effekt ins Inventar", () => {
    atLevel(30, { ...EMPTY_VISITORS, story: { id: "torbin", chapter: 2, accepted: true, progress: 1 } });
    const outcome = store().turnInVisitor("story");
    const item = store().inventory.find((i) => i.itemId === "unique-torbin-axe")!;
    expect(outcome?.item?.uid).toBe(item.uid);
    expect(item.rarity).toBe("legendary");
    expect(effectOf(item, getItem(item.itemId))).toBe("runeblade");
  });

  it("Rezepte: erst mit dem Rezept kochen lassen", () => {
    atLevel(20, { ...EMPTY_VISITORS, story: { id: "mirla", chapter: 2, accepted: true, progress: 1 } });
    useGameStore.setState((s) => ({ village: { ...s.village, tavern: 1 }, character: { ...s.character, gold: 10_000 } }));
    store().eat("lilyStew");
    expect(store().meal).toBeNull(); // ohne Rezept geht es nicht
    store().turnInVisitor("story");
    store().eat("lilyStew");
    expect(store().meal).toBe("lilyStew");

    useGameStore.setState({ meal: null, visitors: { ...EMPTY_VISITORS, story: { id: "yrla", chapter: 2, accepted: true, progress: 1 } } });
    const outcome = store().turnInVisitor("story");
    expect(outcome?.recipeKnown).toBe(false);
    store().eat("hunterRoast");
    expect(store().meal).toBe("hunterRoast");
  });

  it("Durchreisende: Quest-Gegenstand bringen, Geschenk bekommen, weiterziehen", () => {
    atLevel(10);
    store().refreshVisitors();
    const wanderer = store().visitors.wanderer!;
    expect(wanderer).toBeTruthy();
    store().acceptVisitor("wanderer");
    useGameStore.setState((s) => ({
      visitors: { ...s.visitors, wanderer: { ...s.visitors.wanderer!, progress: 99 } },
    }));
    const outcome = store().turnInVisitor("wanderer");
    expect(outcome?.gift).toEqual(wanderer.gift);
    expect(store().visitors.wanderer).toBeNull();
  });
});
