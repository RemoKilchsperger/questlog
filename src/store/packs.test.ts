import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PACK_CHANCE, PACK_SIZE } from "../domain/packs";
import { RARE_CHANCE } from "../domain/rares";
import { useGameStore } from "./gameStore";

const store = () => useGameStore.getState();

/** Zufall zwischen der Chance auf einen seltenen Gegner und der auf ein Rudel. */
const packRoll = (RARE_CHANCE + PACK_CHANCE) / 2;

describe("Rudel-Kämpfe im Spielstand", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState((s) => ({ character: { ...s.character, totalXp: 1e9 } }));
  });
  afterEach(() => vi.restoreAllMocks());

  it("ein Rudel ist nie Elite – gewonnen, wenn das letzte Tier fällt", () => {
    vi.spyOn(Math, "random").mockReturnValue(packRoll);
    store().startBattle("grey-wolf");
    const { battle } = store();
    expect(battle!.pack).toBe(true);
    expect(battle!.elite).toBeUndefined();
    expect(battle!.adds).toHaveLength(PACK_SIZE - 1);
    vi.restoreAllMocks();

    // Alle Tiere bis auf einen Schlag besiegt
    useGameStore.setState({
      battle: {
        ...battle!,
        enemy: { ...battle!.enemy, hp: 1 },
        adds: battle!.adds!.map((a) => ({ ...a, combatant: { ...a.combatant, hp: 0 } })),
      },
    });
    store().battleAttack();
    expect(store().battle!.status).toBe("won");
    expect(store().battleReward!.xp).toBeGreaterThan(0);
  });

  it("Bosse kommen nie im Rudel", () => {
    vi.spyOn(Math, "random").mockReturnValue(packRoll);
    store().startBattle("goblin-chief");
    expect(store().battle!.pack).toBeUndefined();
  });
});
