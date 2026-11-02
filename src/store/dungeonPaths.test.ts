import { beforeEach, describe, expect, it } from "vitest";
import { getDungeon } from "../domain/creatures";
import { getRiddle, type Door, type RoomKind } from "../domain/dungeonPaths";
import { useGameStore } from "./gameStore";

const store = () => useGameStore.getState();
const dungeon = getDungeon("abandoned-mine");

/** Der laufende Kampf ist mit dem nächsten Schlag gewonnen. */
const winCurrent = () => {
  const { battle } = store();
  useGameStore.setState({ battle: { ...battle!, enemy: { ...battle!.enemy, hp: 1 }, adds: [] } });
  store().battleAttack();
  expect(store().battle?.status).toBe("won");
};

/** Stellt eine Tür dieser Art bereit und geht hindurch. */
const enter = (kind: RoomKind) => {
  const doors: Door[] = [{ kind, hidden: false }];
  useGameStore.setState((s) => ({ dungeon: { ...s.dungeon!, doors } }));
  store().chooseDungeonDoor(0);
};

describe("Dungeon-Wege im Spielstand", () => {
  beforeEach(() => {
    store().resetGame();
    useGameStore.setState((s) => ({ character: { ...s.character, totalXp: 1e9, gold: 10_000 } }));
    store().startDungeon(dungeon.id);
    winCurrent();
  });

  it("nach dem Eingangskampf wartet eine Gabelung, vor dem Zwischenboss keine", () => {
    expect(store().dungeon!.doors!.length).toBeGreaterThanOrEqual(2);
    enter("fight");
    expect(store().battle!.status).toBe("active");
    expect(store().dungeon!.path).toEqual(["fight", "fight"]);
    winCurrent();
    enter("fight");
    winCurrent();
    // Schritt 3: der Zwischenboss steht fest
    expect(store().dungeon!.doors).toBeNull();
    store().nextDungeonFight();
    expect(store().battle!.creatureId).toBe(dungeon.creatures[3].id);
    expect(store().battle!.elite).toHaveLength(2);
  });

  it("Elite-Raum: ein sicherer Elite-Gegner", () => {
    enter("elite");
    expect(store().battle!.elite).toHaveLength(1);
  });

  it("Schrein: der Segen wirkt in den folgenden Kämpfen, danach kein zweiter Raum ohne Kampf im Abschnitt", () => {
    enter("shrine");
    const room = store().dungeon!.room!;
    expect(room.kind).toBe("shrine");
    if (room.kind !== "shrine") return;
    // Vor der Wahl geht es nicht weiter
    store().chooseDungeonDoor(0);
    expect(store().dungeon!.room).toBe(room);
    store().dungeonBlessing(room.offer[0]);
    expect(store().dungeon!.blessings).toEqual([room.offer[0]]);
    expect(store().dungeon!.calm).toEqual([true, false]);
    expect(store().dungeon!.doors!.every((d) => d.kind === "fight" || d.kind === "elite")).toBe(true);
    store().chooseDungeonDoor(0);
    expect(store().battle!.blessings).toEqual([room.offer[0]]);
  });

  it("Händler: kauft mit eigenem Gold, jedes Angebot nur einmal", () => {
    enter("merchant");
    const room = store().dungeon!.room!;
    if (room.kind !== "merchant") throw new Error("kein Händler");
    const potion = room.offers[0];
    if (potion.kind !== "potion") throw new Error("kein Trank");
    const [gold, stock] = [store().character.gold, store().potions[potion.potionId] ?? 0];
    store().dungeonBuy(0);
    store().dungeonBuy(0);
    expect(store().character.gold).toBe(gold - potion.price);
    expect(store().potions[potion.potionId]).toBe(stock + 1);
    // Wundversorgung heilt
    useGameStore.setState((s) => ({ battle: { ...s.battle!, hero: { ...s.battle!.hero, hp: 1 } } }));
    store().dungeonBuy(2);
    expect(store().battle!.hero.hp).toBeGreaterThan(1);
    // Ohne Gold nichts
    useGameStore.setState((s) => ({ character: { ...s.character, gold: 0 } }));
    store().dungeonBuy(3);
    expect(store().dungeon!.blessings).toEqual([]);
  });

  it("Falle: kostet Lebenspunkte (nie alle), dahinter liegt Beute für die Truhe", () => {
    const chestBefore = store().dungeon!.chest;
    enter("trap");
    store().dungeonTrap("endure");
    const room = store().dungeon!.room!;
    if (room.kind !== "trap" || !room.outcome) throw new Error("Falle nicht ausgelöst");
    expect(room.outcome.damage).toBeGreaterThan(0);
    expect(store().battle!.hero.hp).toBeGreaterThanOrEqual(1);
    expect(store().dungeon!.chest.gold).toBeGreaterThanOrEqual(chestBefore.gold);
    expect(store().dungeon!.chest.xp).toBe(chestBefore.xp);
  });

  it("Rätsel richtig: Elite-Beute; falsch: Schaden oder ein Wächter", () => {
    enter("riddle");
    let room = store().dungeon!.room!;
    if (room.kind !== "riddle") throw new Error("kein Rätsel");
    const goldBefore = store().dungeon!.chest.gold;
    store().dungeonRiddle(getRiddle(room.riddleId).answer);
    room = store().dungeon!.room!;
    if (room.kind !== "riddle") throw new Error("kein Rätsel");
    expect(room.outcome?.correct).toBe(true);
    expect(store().dungeon!.chest.gold).toBeGreaterThan(goldBefore);

    // Im zweiten Abschnitt ein falsches Rätsel
    useGameStore.setState((s) => ({ dungeon: { ...s.dungeon!, stage: 4, room: null } }));
    enter("riddle");
    room = store().dungeon!.room!;
    if (room.kind !== "riddle") throw new Error("kein Rätsel");
    const riddle = getRiddle(room.riddleId);
    const hp = store().battle!.hero.hp;
    store().dungeonRiddle(riddle.wrong[0]);
    if (riddle.failure === "guardian") {
      expect(store().battle!.status).toBe("active");
      expect(store().dungeon!.room).toBeNull();
    } else {
      expect(store().battle!.hero.hp).toBeLessThan(hp);
    }
  });

  it("aus einem Raum heraus mit der Truhe gehen", () => {
    enter("merchant");
    store().leaveDungeonWithChest();
    expect(store().dungeon!.claimed?.completed).toBe(false);
  });
});
