import { beforeEach, describe, expect, it } from "vitest";
import { getDungeon } from "../domain/creatures";
import { createItem } from "../domain/items";
import { dateKey } from "../domain/calendar";
import { upgradeCost, upgradeGoldCost } from "../domain/forge";
import { totalXpForLevel } from "../domain/leveling";
import { getPotion, potionPrice } from "../domain/potions";
import { rollDailyQuests } from "../domain/quests";
import { EMPTY_VILLAGE } from "../domain/village";
import { heroStatusChips } from "../components/BattleStatus";
import { migrateSave, repairSave, useGameStore } from "./gameStore";

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
    expect(store().materials.darkwood).toBe(elite ? 3 : 1);
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
    useGameStore.setState((s) => ({ character: { ...s.character, gold: 1000 }, materials: { darkwood: 20 } }));
    store().refreshShop();
    expect(store().shop.offers).toHaveLength(4);
    store().build("merchant");
    expect(store().village.merchant).toBe(1);
    expect(store().character.gold).toBe(900);
    expect(store().materials.darkwood).toBe(5);
    expect(store().shop.offers).toHaveLength(6);
    // Zu wenig für die nächste Stufe: nichts passiert
    store().build("merchant");
    expect(store().village.merchant).toBe(1);
  });

  it("Verbessern kostet Essenz und Gold – ohne genug Gold passiert nichts", () => {
    const sword = createItem("sword-5", "rare", "s");
    const goldCost = upgradeGoldCost(sword);
    useGameStore.setState((s) => ({
      inventory: [...s.inventory, sword],
      village: { ...EMPTY_VILLAGE, smith: 1 },
      character: { ...s.character, essence: 1000, gold: goldCost - 1 },
    }));
    store().upgrade("s");
    expect(store().inventory.find((i) => i.uid === "s")?.upgrade ?? 0).toBe(0);
    expect(store().character.essence).toBe(1000);
    useGameStore.setState((s) => ({ character: { ...s.character, gold: goldCost + 5 } }));
    store().upgrade("s");
    expect(store().inventory.find((i) => i.uid === "s")?.upgrade).toBe(1);
    expect(store().character.gold).toBe(5);
    expect(store().character.essence).toBe(1000 - upgradeCost(sword));
  });

  it("Tränke kosten je nach Level mehr", () => {
    useGameStore.setState((s) => ({
      character: { ...s.character, gold: 1000, totalXp: totalXpForLevel(30) },
      village: { ...EMPTY_VILLAGE, alchemist: 1 },
    }));
    store().buyPotion("medium");
    expect(store().character.gold).toBe(1000 - potionPrice(getPotion("medium"), 30));
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
    useGameStore.setState({ dailyQuests: daily, village: { ...EMPTY_VILLAGE, board: 1 } });
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

describe("Spielstand v16 → v17", () => {
  it("bucht die alten Baumaterialien auf die neuen um", () => {
    const old = { ...store(), materials: { wolfPelt: 12, crystalShard: 4, dragonScale: 2 } };
    const state = migrateSave(old, 16);
    expect(state.materials).toEqual({ darkwood: 12, crystalShard: 4, dragonOre: 2 });
  });
});

describe("Spielstand v17 → v18", () => {
  it("setzt die Anschlagtafel auf Stufe 1 und gibt die Kosten der Stufen 2 und 3 zurück", () => {
    const base = store();
    const old = {
      ...base,
      character: { ...base.character, gold: 50 },
      materials: { darkwood: 2 },
      village: { ...EMPTY_VILLAGE, board: 3, smith: 2 },
    };
    const state = migrateSave(old, 17);
    expect(state.village).toEqual({ ...EMPTY_VILLAGE, board: 1, smith: 2 });
    expect(state.character.gold).toBe(50 + 1500 + 6000);
    expect(state.materials).toEqual({ darkwood: 12, crystalShard: 40, obsidian: 30 });
  });

  it("lässt eine Tafel auf Stufe 0 oder 1 unverändert", () => {
    const old = { ...store(), village: { ...EMPTY_VILLAGE, board: 1 } };
    // Die Tafel bleibt – spätere Schritte (v24: Skillpunkte zurück) ändern nur den Charakter
    const migrated = migrateSave(old, 17);
    expect(migrated.village).toBe(old.village);
    expect(migrated.materials).toBe(old.materials);
    expect(migrated.character.gold).toBe(old.character.gold);
  });
});

describe("Händler: alle gewöhnlichen verkaufen", () => {
  it("verkauft gewöhnliche Items und schreibt das Gold gut", () => {
    const rare = createItem("dagger-0", "rare", "r");
    useGameStore.setState((s) => ({
      character: { ...s.character, gold: 0 },
      inventory: [createItem("dagger-0", "common", "a"), rare, createItem("dagger-0", "common", "b")],
    }));
    store().sellCommon();
    expect(store().inventory).toEqual([rare]);
    expect(store().character.gold).toBeGreaterThan(0);
  });
});

describe("Taverne: Buff-Food", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState((s) => ({
      character: { ...s.character, gold: 1000, totalXp: 1e9 },
      village: { ...s.village, tavern: 3 },
    }));
  });

  it("ohne Taverne gibt es nichts zu essen", () => {
    useGameStore.setState((s) => ({ village: { ...s.village, tavern: 0 } }));
    store().eat("stew");
    expect(store().meal).toBeNull();
  });

  it("ein Gericht wirkt genau einen Kampf im Gebiet", () => {
    store().startBattle("grey-wolf");
    const hungry = store().battle!.hero.maxHp;
    store().eat("stew");
    expect(store().meal).toBe("stew");
    // Satt: ein zweites Gericht geht nicht
    store().eat("sausage");
    expect(store().meal).toBe("stew");
    store().startBattle("grey-wolf");
    expect(store().battle!.hero.maxHp).toBe(Math.round(hungry * 1.1));
    expect(store().meal).toBeNull();
    store().startBattle("grey-wolf");
    expect(store().battle!.hero.maxHp).toBe(hungry);
  });

  it("im Dungeon wirkt es in allen Kämpfen", () => {
    store().eat("roast");
    store().startDungeon("abandoned-mine");
    const first = store().battle!.hero.damage;
    expect(store().meal).toBeNull();
    const firstId = store().battle!.id;
    winCurrent();
    // An der Gabelung durch eine Kampf-Tür – jede Gabelung hat mindestens eine
    store().chooseDungeonDoor(store().dungeon!.doors!.findIndex((d) => d.kind === "fight" || d.kind === "elite"));
    expect(store().battle!.id).not.toBe(firstId);
    expect(store().battle!.hero.damage).toBeCloseTo(first);
    expect(store().mealInUse).toBe("roast");
  });

  it("im Turm wirkt es den ganzen Lauf", () => {
    store().eat("soup");
    store().startTower();
    const maxHp = store().battle!.hero.maxHp;
    expect(store().meal).toBeNull();
    winCurrent();
    if (store().tower!.offer) store().chooseBlessing(store().tower!.offer![0]);
    store().nextTowerFloor();
    expect(store().battle!.hero.maxHp).toBeGreaterThanOrEqual(maxHp);
    expect(store().mealInUse).toBe("soup");
  });

  it("im Koop ist das Gericht beim Kampfbeginn aufgegessen und wird im Kampf angezeigt", () => {
    store().eat("stew");
    store().finishMealInCoop();
    expect(store().meal).toBeNull();
    expect(store().coopMeal).toBe("stew");
    expect(heroStatusChips({}, {}, store().coopMeal).map((c) => c.key)).toEqual(["meal"]);
    // Der nächste Koop-Kampf ohne Gericht zeigt nichts mehr
    store().finishMealInCoop();
    expect(store().coopMeal).toBeNull();
    expect(heroStatusChips({}, {}, store().coopMeal)).toEqual([]);
  });

  it("das Gericht bleibt im Spielstand", () => {
    store().eat("stew");
    expect(repairSave({ character: store().character, meal: store().meal }).meal).toBe("stew");
    expect(repairSave({ character: store().character }).meal).toBeNull();
  });
});

describe("Heroische Bosse im Spielstand", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState((s) => ({ character: { ...s.character, totalXp: 1e9 } }));
  });

  it("erst nach dem ersten Sieg – dann mit mehr Lebenspunkten und Zusatzmechanik", () => {
    store().startBattle("goblin-chief", true);
    expect(store().battle).toBeNull();
    store().startBattle("goblin-chief");
    const normalHp = store().battle!.enemy.maxHp;
    winCurrent();
    useGameStore.setState({ bossRespawns: {}, battle: null });
    store().startBattle("goblin-chief", true);
    const battle = store().battle!;
    expect(battle.heroic).toBe(true);
    expect(battle.elite).toEqual(["swift"]);
    expect(battle.enemy.maxHp).toBe(Math.round(normalHp * 1.5));
    winCurrent();
    expect(store().records.heroicDefeated).toEqual(["goblin-chief"]);
  });

  it("heroischer Dungeon: nur der Endboss ist heroisch", () => {
    const dungeon = getDungeon("abandoned-mine");
    store().startDungeon(dungeon.id, true);
    expect(store().battle).toBeNull();
    useGameStore.setState((s) => ({ records: { ...s.records, bossesDefeated: ["ore-king"] } }));
    store().startDungeon(dungeon.id, true);
    expect(store().battle!.heroic).toBeUndefined();
    expect(store().dungeon!.heroic).toBe(true);
    // Bis kurz vor den Endboss springen
    useGameStore.setState((s) => ({ dungeon: { ...s.dungeon!, stage: dungeon.creatures.length - 2 } }));
    winCurrent();
    store().nextDungeonFight();
    expect(store().battle!.creatureId).toBe("ore-king");
    expect(store().battle!.heroic).toBe(true);
    expect(store().battle!.elite).toEqual(["explosive"]);
  });
});
