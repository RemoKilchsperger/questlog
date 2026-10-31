import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, EMPTY_RECORDS } from "./achievements";
import { addToChest, drinkPotion, EMPTY_CHEST, rollBattleReward, startBattle, type HeroCombatProfile } from "./combat";
import { AREAS, getCreature } from "./creatures";
import { upgradeItem } from "./forge";
import { createItem } from "./items";
import { buyPotion, getPotion, potionsForSale } from "./potions";
import {
  applyBoardEvent,
  boardQuestTier,
  openBounty,
  questGoalText,
  rollDailyQuests,
  rollWeeklyQuests,
  visibleBoard,
} from "./quests";
import { rerollShop, rollShopStock } from "./shop";
import {
  build,
  BUILDINGS,
  canBuild,
  creatureMaterials,
  EMPTY_VILLAGE,
  MATERIALS,
  materialForLevel,
  MERCHANT_RULES,
  missingForBuild,
  nextBuildCost,
  potionPower,
  SMITH_RULES,
  type Village,
} from "./village";

const hero: HeroCombatProfile = {
  level: 10,
  maxHp: 1000,
  damage: 20,
  armor: 0,
  critChance: 0,
  goldBonus: 0,
  maxMana: 40,
  abilities: [],
  heroClass: null,
  critMultiplier: 1.5,
};

let uidCounter = 0;
const newUid = () => `u${uidCounter++}`;

describe("Material", () => {
  it("ein Material pro Gebiet – Gegner geben das Material ihres Level-Bereichs", () => {
    expect(MATERIALS.map((m) => m.areaId)).toEqual(AREAS.map((a) => a.id));
    expect(materialForLevel(1)).toBe("wolfPelt");
    expect(materialForLevel(10)).toBe("wolfPelt");
    expect(materialForLevel(11)).toBe("lizardScale");
    expect(materialForLevel(45)).toBe("boneDust");
    expect(materialForLevel(60)).toBe("dragonScale");
    // Koop-Bosse über Level 60 geben das letzte Material
    expect(materialForLevel(70)).toBe("dragonScale");
  });

  it("fällt sicher: 1 pro Sieg, 3 bei Elite, 5 beim Boss", () => {
    const wolf = getCreature("grey-wolf").creature;
    const chief = getCreature("goblin-chief").creature;
    expect(creatureMaterials(wolf)).toEqual({ wolfPelt: 1 });
    expect(creatureMaterials(wolf, true)).toEqual({ wolfPelt: 3 });
    expect(creatureMaterials(chief)).toEqual({ wolfPelt: 5 });
    expect(rollBattleReward(wolf, hero, "x", () => 0.99).materials).toEqual({ wolfPelt: 1 });
    expect(rollBattleReward(wolf, hero, "x", () => 0.99, [], true).materials).toEqual({ wolfPelt: 3 });
  });

  it("sammelt sich in der Truhe", () => {
    const wolf = getCreature("grey-wolf").creature;
    const toad = getCreature("marsh-toad").creature;
    let chest = addToChest(EMPTY_CHEST, rollBattleReward(wolf, hero, "a", () => 0.99));
    chest = addToChest(chest, rollBattleReward(wolf, hero, "b", () => 0.99));
    chest = addToChest(chest, rollBattleReward(toad, hero, "c", () => 0.99));
    expect(chest.materials).toEqual({ wolfPelt: 2, lizardScale: 1 });
  });
});

describe("Bauen", () => {
  it("jedes Gebäude hat Stufen 0–3, jede Stufe ab 1 kostet Gold und Material", () => {
    for (const b of BUILDINGS) {
      expect(b.tiers).toHaveLength(4);
      expect(b.tiers[0].cost).toBeUndefined();
      for (const t of b.tiers.slice(1)) {
        expect(t.cost!.gold).toBeGreaterThan(0);
        expect(Object.keys(t.cost!.materials).length).toBeGreaterThan(0);
      }
    }
  });

  it("kostet Gold und Material, wird sofort fertig", () => {
    const cost = nextBuildCost(EMPTY_VILLAGE, "merchant")!;
    expect(cost).toEqual({ gold: 300, materials: { wolfPelt: 15 } });
    const result = build(EMPTY_VILLAGE, "merchant", 500, { wolfPelt: 20, lizardScale: 3 });
    expect(result.village.merchant).toBe(1);
    expect(result.gold).toBe(200);
    expect(result.materials).toEqual({ wolfPelt: 5, lizardScale: 3 });
  });

  it("ohne genug Gold oder Material geht es nicht – und zeigt, was fehlt", () => {
    expect(() => build(EMPTY_VILLAGE, "merchant", 299, { wolfPelt: 15 })).toThrow(/Gold/);
    expect(() => build(EMPTY_VILLAGE, "merchant", 300, { wolfPelt: 14 })).toThrow(/Material/);
    expect(canBuild(EMPTY_VILLAGE, "merchant", 300, { wolfPelt: 15 })).toBe(true);
    expect(missingForBuild(nextBuildCost(EMPTY_VILLAGE, "merchant")!, 100, { wolfPelt: 12 })).toEqual({
      gold: 200,
      materials: { wolfPelt: 3 },
    });
  });

  it("höher als Stufe 3 geht nicht", () => {
    const full: Village = { merchant: 3, smith: 3, board: 3, alchemist: 3 };
    expect(nextBuildCost(full, "smith")).toBeNull();
    expect(canBuild(full, "smith", 1e9, { dragonScale: 999 })).toBe(false);
    expect(() => build(full, "smith", 1e9, {})).toThrow(/ausgebaut/);
  });

  it("höhere Stufen brauchen Material aus späteren Gebieten", () => {
    const order = MATERIALS.map((m) => m.id);
    const latest = (tier: number) =>
      Math.max(...BUILDINGS.flatMap((b) => Object.keys(b.tiers[tier].cost!.materials).map((id) => order.indexOf(id as never))));
    expect(latest(1)).toBeLessThan(latest(2));
    expect(latest(2)).toBeLessThan(latest(3));
  });
});

describe("Händler", () => {
  it("der Strassenhändler hat 4 Stücke, nur gewöhnlich oder selten, und kann nicht neu würfeln", () => {
    const stock = rollShopStock("s", 20, newUid, Math.random, MERCHANT_RULES[0]);
    expect(stock.offers).toHaveLength(4);
    expect(stock.offers.every((o) => o.rarity === "common" || o.rarity === "rare")).toBe(true);
    expect(() => rerollShop(10_000, 20, "", 0, newUid, new Date(), Math.random, MERCHANT_RULES[0])).toThrow(/Strassenhändler/);
  });

  it("mehr Ware mit jeder Stufe, der Grosshandel zahlt beim Verkauf mehr", () => {
    expect([0, 1, 2, 3].map((t) => MERCHANT_RULES[t as 0].size)).toEqual([4, 6, 8, 10]);
    expect(MERCHANT_RULES[3].sellBonus).toBe(0.1);
    // Ab dem Krämerladen darf neu gewürfelt werden
    const first = rerollShop(10_000, 20, "", 0, newUid, new Date(2026, 9, 5, 9), Math.random, MERCHANT_RULES[1]);
    const second = rerollShop(first.gold, 20, first.lastReroll, first.count, newUid, new Date(2026, 9, 5, 10), Math.random, MERCHANT_RULES[1]);
    expect(() =>
      rerollShop(second.gold, 20, second.lastReroll, second.count, newUid, new Date(2026, 9, 5, 11), Math.random, MERCHANT_RULES[1]),
    ).toThrow(/schon/);
  });
});

describe("Schmiede", () => {
  const gearWith = (upgrade: number) => ({
    inventory: [{ ...createItem("sword-20", "rare", "s"), upgrade }],
    equipment: { head: null, chest: null, arms: null, legs: null, feet: null, weapon1: null, weapon2: null },
  });

  it("die Esse verbessert nur bis +2", () => {
    expect(SMITH_RULES[0].open).toBe(false);
    expect(upgradeItem(gearWith(1), 10_000, "s", SMITH_RULES[1]).gear.inventory[0].upgrade).toBe(2);
    expect(() => upgradeItem(gearWith(2), 10_000, "s", SMITH_RULES[1])).toThrow(/bis \+2/);
    expect(upgradeItem(gearWith(2), 10_000, "s", SMITH_RULES[2]).gear.inventory[0].upgrade).toBe(3);
  });

  it("die Meisterschmiede verlangt 20 % weniger Essenz", () => {
    const normal = 10_000 - upgradeItem(gearWith(0), 10_000, "s", SMITH_RULES[2]).essence;
    const master = 10_000 - upgradeItem(gearWith(0), 10_000, "s", SMITH_RULES[3]).essence;
    expect(master).toBe(Math.round(normal * 0.8));
    expect(SMITH_RULES[3].refund).toBe(0.75);
  });
});

describe("Alchemist", () => {
  it("ohne Alchemist nur kleine Heiltränke, mit jeder Stufe mehr", () => {
    expect(potionsForSale(0).map((p) => p.id)).toEqual(["small"]);
    expect(potionsForSale(1).map((p) => p.id)).toEqual(["small", "medium"]);
    expect(potionsForSale(2).map((p) => p.id).sort()).toEqual(["armor", "attack", "medium", "small"]);
    expect(potionsForSale(3)).toHaveLength(5);
    expect(() => buyPotion({}, 99_999, "medium", 0)).toThrow(/Alchemisten/);
    expect(buyPotion({}, 99_999, "attack", 2).stock.attack).toBe(1);
  });

  it("beim Meisteralchemisten wirken alle Tränke 25 % stärker", () => {
    expect(potionPower(2)).toBe(1);
    const creature = getCreature("grey-wolf").creature;
    const hurt = (power: number) => {
      const battle = startBattle("b", "Held", { ...hero, potionPower: power }, creature, 100);
      return drinkPotion(battle, getPotion("small")).state;
    };
    expect(hurt(1).hero.hp - 100).toBe(200);
    expect(hurt(potionPower(3)).hero.hp - 100).toBe(250);
    const attack = drinkPotion(startBattle("b", "Held", { ...hero, potionPower: potionPower(3) }, creature), getPotion("attack")).state;
    expect(attack.buffs.attack?.percent).toBeCloseTo(0.375);
  });
});

describe("Anschlagtafel", () => {
  const daily = rollDailyQuests("2026-10-08", 30);
  const weekly = rollWeeklyQuests("2026-10-05", 30);

  it("Stufe 1: nur Tages-Jagden, Stufe 2: alles ausser Steckbriefen, Stufe 3: dazu zwei Steckbriefe", () => {
    expect(visibleBoard(daily, 0).quests).toHaveLength(0);
    expect(visibleBoard(daily, 1).quests.every((q) => q.def.goal.kind === "kill")).toBe(true);
    expect(visibleBoard(daily, 1).quests).toHaveLength(3);
    expect(visibleBoard(weekly, 1).quests).toHaveLength(0);
    expect(visibleBoard(weekly, 2).quests).toHaveLength(weekly.quests.length);
    expect(visibleBoard(daily, 2).quests.some((q) => q.def.goal.kind === "bounty")).toBe(false);
    expect(visibleBoard(daily, 3).quests.filter((q) => q.def.goal.kind === "bounty")).toHaveLength(2);
  });

  it("unsichtbare Aufträge kommen nicht voran", () => {
    const hunt = daily.quests[0];
    const creatureId = hunt.def.goal.kind === "kill" ? hunt.def.goal.creatureId : "";
    expect(applyBoardEvent(daily, { kind: "kill", creatureId, boss: false }, 0)).toBe(daily);
    expect(applyBoardEvent(daily, { kind: "kill", creatureId, boss: false }, 1).quests[0].progress).toBe(1);
  });

  it("Steckbrief: zählt nur einen Elite-Sieg über die gesuchte Kreatur", () => {
    const bounty = daily.quests.find((q) => q.def.goal.kind === "bounty")!;
    const goal = bounty.def.goal;
    if (goal.kind !== "bounty") throw new Error("kein Steckbrief");
    expect(boardQuestTier(bounty.def)).toBe(3);
    expect(goal.affixes).toHaveLength(2);
    expect(questGoalText(bounty.def)).toContain(getCreature(goal.creatureId).creature.name);
    const index = daily.quests.indexOf(bounty);
    expect(applyBoardEvent(daily, { kind: "kill", creatureId: goal.creatureId, boss: false }).quests[index].progress).toBe(0);
    expect(applyBoardEvent(daily, { kind: "kill", creatureId: goal.creatureId, boss: false, elite: true }).quests[index].progress).toBe(1);
  });

  it("offener Steckbrief: die Kreatur erscheint als genau dieser Elite-Gegner – nur mit Kopfgeld-Tafel", () => {
    const bounty = daily.quests.find((q) => q.def.goal.kind === "bounty")!;
    const goal = bounty.def.goal;
    if (goal.kind !== "bounty") throw new Error("kein Steckbrief");
    expect(openBounty(daily, goal.creatureId, 3)).toEqual(goal.affixes);
    expect(openBounty(daily, goal.creatureId, 2)).toBeNull();
    const done = applyBoardEvent(daily, { kind: "kill", creatureId: goal.creatureId, boss: false, elite: true });
    expect(openBounty(done, goal.creatureId, 3)).toBeNull();
  });
});

describe("Erfolge im Dorf", () => {
  const progress = (id: string, village: Village) =>
    ACHIEVEMENTS.find((a) => a.id === id)!.progress({
      character: { totalXp: 0, gold: 0 },
      questLog: { active: {}, completed: [] },
      bossCollection: [],
      coopStats: { wins: 0, bosses: [] },
      records: EMPTY_RECORDS,
      village,
    } as never);

  it("Grundstein, Dorfgründer und Baumeister", () => {
    expect(progress("foundation", EMPTY_VILLAGE)).toBe(0);
    expect(progress("foundation", { ...EMPTY_VILLAGE, board: 1 })).toBe(1);
    expect(progress("village-founder", { merchant: 1, smith: 1, board: 1, alchemist: 0 })).toBe(3);
    expect(progress("master-builder", { merchant: 3, smith: 3, board: 3, alchemist: 2 })).toBe(3);
  });
});
