import { beforeEach, describe, expect, it } from "vitest";
import { addToChest, chestCount, EMPTY_CHEST, startBattle, type BattleReward, type BattleState, type HeroCombatProfile } from "../domain/combat";
import { getDungeon } from "../domain/creatures";
import { createItem } from "../domain/items";
import { useGameStore } from "./gameStore";

const reward = (overrides: Partial<BattleReward> = {}): BattleReward => ({
  xp: 10,
  gold: 5,
  loot: null,
  bossLoot: null,
  potions: null,
  buffPotion: null,
  ...overrides,
});

describe("Dungeon-Truhe (Domain)", () => {
  it("sammelt XP, Gold, Tränke und Items – Boss-Items zuerst", () => {
    const sword = createItem("sword-10", "rare", "s");
    const boss = createItem("boss-ore-king-dagger", "legendary", "b");
    let chest = addToChest(EMPTY_CHEST, reward({ loot: sword, potions: { potionId: "small", count: 2 } }));
    chest = addToChest(chest, reward({ bossLoot: boss, buffPotion: "attack" }));
    expect(chest.xp).toBe(20);
    expect(chest.gold).toBe(10);
    expect(chest.items.map((i) => i.uid)).toEqual(["b", "s"]);
    expect(chest.potions).toEqual({ "small": 2, attack: 1 });
    expect(chestCount(chest)).toBe(5);
  });
});

describe("Dungeon-Truhe (Store)", () => {
  const dungeon = getDungeon("abandoned-mine");

  /** Held mitten im Dungeon auf Stufe `stage`; `win` = Gegner fällt beim nächsten Schlag. */
  const enterStage = (stage: number, win: boolean) => {
    const hero: HeroCombatProfile = {
      level: 30,
      maxHp: 500,
      damage: 50,
      armor: 0,
      critChance: 0,
      goldBonus: 0,
      maxMana: 40,
      abilities: [],
    };
    const base = startBattle("b", "Held", hero, dungeon.creatures[stage]);
    const battle: BattleState = win
      ? { ...base, enemy: { ...base.enemy, hp: 1 } }
      : { ...base, hero: { ...base.hero, hp: 1 }, enemy: { ...base.enemy, hp: 99_999, maxHp: 99_999 } };
    useGameStore.setState({
      battle,
      battleReward: null,
      dungeon: { dungeonId: dungeon.id, stage, chest: addToChest(EMPTY_CHEST, reward({ xp: 100, gold: 50 })), claimed: null },
    });
  };
  const xp = () => useGameStore.getState().character.totalXp;
  const gold = () => useGameStore.getState().character.gold;

  beforeEach(() => useGameStore.getState().resetGame());

  it("Siege mitten im Dungeon füllen die Truhe, schreiben aber nichts gut", () => {
    enterStage(0, true);
    const [xpBefore, goldBefore] = [xp(), gold()];
    useGameStore.getState().battleAttack();
    const { dungeon: run, battle } = useGameStore.getState();
    expect(battle?.status).toBe("won");
    expect(run?.chest.xp).toBeGreaterThan(100);
    expect(run?.claimed).toBeNull();
    expect([xp(), gold()]).toEqual([xpBefore, goldBefore]);
  });

  it("nach dem Endboss wird die ganze Truhe gutgeschrieben", () => {
    enterStage(dungeon.creatures.length - 1, true);
    const xpBefore = xp();
    useGameStore.getState().battleAttack();
    const { claimed } = useGameStore.getState().dungeon!;
    expect(claimed?.completed).toBe(true);
    expect(xp()).toBe(xpBefore + claimed!.xp);
    expect(claimed!.xp).toBeGreaterThan(100);
  });

  it("freiwillig verlassen gibt die bisherige Truhe", () => {
    enterStage(0, true);
    useGameStore.getState().battleAttack();
    const chest = useGameStore.getState().dungeon!.chest;
    const goldBefore = gold();
    useGameStore.getState().leaveDungeonWithChest();
    const { claimed } = useGameStore.getState().dungeon!;
    expect(claimed?.completed).toBe(false);
    expect(gold()).toBe(goldBefore + chest.gold);
  });

  it("bei einer Niederlage ist die Truhe verloren", () => {
    enterStage(1, false);
    const [xpBefore, goldBefore] = [xp(), gold()];
    useGameStore.getState().battleAttack();
    expect(useGameStore.getState().battle?.status).toBe("lost");
    expect(useGameStore.getState().dungeon?.claimed).toBeNull();
    expect([xp(), gold()]).toEqual([xpBefore, goldBefore]);
  });

  it("Flucht gilt als Verlassen: die Truhe bleibt", () => {
    enterStage(1, false);
    useGameStore.getState().battleFlee();
    expect(useGameStore.getState().dungeon?.claimed?.xp).toBe(100);
  });
});
