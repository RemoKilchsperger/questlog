import { beforeEach, describe, expect, it } from "vitest";
import { getAreaMimic } from "../domain/areaChests";
import { useGameStore } from "./gameStore";

const store = () => useGameStore.getState();

/** Der laufende Kampf ist mit dem nächsten Schlag gewonnen. */
const winCurrent = () => {
  const { battle } = store();
  useGameStore.setState({ battle: { ...battle!, enemy: { ...battle!.enemy, hp: 1 }, adds: [] } });
  store().battleAttack();
  expect(store().battle?.status).toBe("won");
};

/** Nach dem Sieg über den Grauwolf steht eine Truhe da – echt oder Mimic. */
const chestAfterWin = (mimic: boolean) => {
  store().startBattle("grey-wolf");
  winCurrent();
  useGameStore.setState({ areaChest: { creatureId: "grey-wolf", mimic, outcome: null } });
};

describe("Truhen nach normalen Kämpfen im Spielstand", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState((s) => ({ character: { ...s.character, totalXp: 1e9 } }));
  });

  it("liegen lassen: nichts passiert", () => {
    chestAfterWin(false);
    const { character, inventory } = store();
    store().openAreaChest("leave");
    expect(store().areaChest!.outcome).toEqual({ choice: "leave", reward: null });
    expect(store().character).toEqual(character);
    expect(store().inventory).toEqual(inventory);
    // Ein zweites Mal geht nicht
    store().openAreaChest("open");
    expect(store().areaChest!.outcome!.choice).toBe("leave");
  });

  it("echte Truhe: Beute sofort gutgeschrieben, ohne Erfahrung", () => {
    chestAfterWin(false);
    const xp = store().character.totalXp;
    const gold = store().character.gold;
    const items = store().inventory.length;
    store().openAreaChest("open");
    const reward = store().areaChest!.outcome!.reward!;
    expect(reward.xp).toBe(0);
    expect(store().character.totalXp).toBe(xp);
    expect(store().character.gold).toBe(gold + reward.gold);
    expect(store().inventory.length).toBe(items + (reward.loot ? 1 : 0));
    expect(store().battle!.status).toBe("won");
  });

  it("Mimic: Kampf mit den übrigen LP, danach Elite-Beute und keine zweite Truhe", () => {
    chestAfterWin(true);
    useGameStore.setState((s) => ({ battle: { ...s.battle!, hero: { ...s.battle!.hero, hp: 7 } } }));
    store().openAreaChest("open");
    const mimic = getAreaMimic("grey-wolf");
    expect(store().battle!.status).toBe("active");
    expect(store().battle!.creatureId).toBe(mimic.id);
    expect(store().battle!.hero.hp).toBe(7);
    expect(store().battle!.elite ?? []).toEqual([]);
    const items = store().inventory.length;
    winCurrent();
    expect(store().battleReward!.loot).not.toBeNull();
    expect(store().inventory.length).toBe(items + 1);
    // Die Truhe bleibt geöffnet stehen – „Nochmal kämpfen“ geht gegen den Grauwolf
    expect(store().areaChest).toMatchObject({ creatureId: "grey-wolf", outcome: { choice: "open" } });
  });

  it("Mimics kann man nicht direkt herausfordern, neue Kämpfe räumen die Truhe weg", () => {
    chestAfterWin(false);
    store().startBattle(getAreaMimic("grey-wolf").id);
    expect(store().battle!.creatureId).toBe("grey-wolf");
    store().startBattle("giant-rat");
    expect(store().areaChest).toBeNull();
    store().leaveBattle();
    expect(store().areaChest).toBeNull();
  });
});
