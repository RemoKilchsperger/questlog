import { describe, expect, it } from "vitest";
import { getBossAbilities } from "./bossAbilities";
import { getCreature, getCreatureStats, DUNGEONS } from "./creatures";
import { CREATURE_SPRITES } from "../game/creatureSprites";
import {
  chestReward,
  dungeonMobs,
  eliteRoomAffixes,
  forkDoors,
  getMimic,
  isCalm,
  isMimic,
  isMimicChest,
  mainArmorClass,
  merchantHealPotion,
  MERCHANT_MARKUP,
  merchantOffers,
  MIMIC_CHANCE,
  mimicReward,
  pickRiddle,
  pickTrap,
  RIDDLES,
  sectionOf,
  stepCreature,
  stepKind,
  TRAP_DAMAGE,
  trapOutcome,
  TRAPS,
  type RoomKind,
} from "./dungeonPaths";
import { getPotion, potionPrice } from "./potions";

describe("Wege durch die Dungeons", () => {
  it("Eingang, zwei Gabelungen, Zwischenboss, drei Gabelungen, Endboss", () => {
    for (const dungeon of DUNGEONS) {
      const steps = dungeon.creatures.map((_, i) => stepKind(dungeon, i));
      expect(steps, dungeon.name).toEqual(["start", "fork", "fork", "midBoss", "fork", "fork", "fork", "boss"]);
      expect(dungeon.creatures.map((_, i) => sectionOf(dungeon, i))).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    }
  });

  it("Zwischen- und Endboss stehen fest, sonst kämpft ein Gegner des Dungeons", () => {
    const dungeon = DUNGEONS[0];
    const mobs = dungeonMobs(dungeon).map((c) => c.id);
    expect(mobs).toHaveLength(3);
    for (let i = 0; i < 30; i++) {
      expect(mobs).toContain(stepCreature(dungeon, `s${i}`, 1).id);
    }
    expect(stepCreature(dungeon, "s", 3).midBoss).toBe(true);
    expect(stepCreature(dungeon, "s", 7).boss).toBe(true);
    // Gleicher Lauf, gleicher Gegner
    expect(stepCreature(dungeon, "x", 5)).toBe(stepCreature(dungeon, "x", 5));
  });

  it("Gabelungen: 2–3 verschiedene Türen, immer mindestens ein Kampf – ohne Ruheraum, wenn der Abschnitt ihn schon hatte", () => {
    const seen = new Set<RoomKind>();
    let hidden = 0;
    for (let i = 0; i < 400; i++) {
      for (const calmAllowed of [true, false]) {
        const doors = forkDoors(`seed-${i}`, 1 + (i % 6), calmAllowed);
        const kinds = doors.map((d) => d.kind);
        expect(doors.length).toBeGreaterThanOrEqual(2);
        expect(doors.length).toBeLessThanOrEqual(3);
        expect(new Set(kinds).size).toBe(kinds.length);
        expect(kinds.some((k) => !isCalm(k))).toBe(true);
        if (!calmAllowed) expect(kinds.every((k) => !isCalm(k))).toBe(true);
        kinds.forEach((k) => seen.add(k));
        hidden += doors.filter((d) => d.hidden).length;
      }
    }
    expect([...seen].sort()).toEqual(["chest", "elite", "fight", "merchant", "riddle", "shrine", "trap"]);
    expect(hidden).toBeGreaterThan(0);
    expect(forkDoors("a", 2, true)).toEqual(forkDoors("a", 2, true));
  });

  it("Elite-Raum: ein Modifikator vor dem Zwischenboss, zwei danach", () => {
    const dungeon = DUNGEONS[1];
    expect(eliteRoomAffixes(dungeon, "s", 1)).toHaveLength(1);
    const late = eliteRoomAffixes(dungeon, "s", 5);
    expect(late).toHaveLength(2);
    expect(new Set(late).size).toBe(2);
  });

  it("Falle: leichte Rüstung weicht besser aus, schwere steckt besser ein – und sie tötet nie", () => {
    const always = () => 0;
    const never = () => 0.99;
    expect(trapOutcome("dodge", "light", 1000, 1000, always)).toEqual({ dodged: true, damage: 0 });
    expect(trapOutcome("dodge", "heavy", 1000, 1000, never)).toEqual({ dodged: false, damage: 1000 * TRAP_DAMAGE });
    const light = trapOutcome("endure", "light", 1000, 1000, never).damage;
    const heavy = trapOutcome("endure", "heavy", 1000, 1000, never).damage;
    expect(heavy).toBeLessThan(light);
    expect(trapOutcome("endure", "light", 1000, 10, never).damage).toBe(9);
  });

  it("Rüstungsklasse für die Falle: die mit den meisten Teilen", () => {
    expect(mainArmorClass({ light: 0, medium: 0, heavy: 0 })).toBe("light");
    expect(mainArmorClass({ light: 1, medium: 0, heavy: 4 })).toBe("heavy");
    expect(mainArmorClass({ light: 2, medium: 2, heavy: 1 })).toBe("medium");
  });

  it("Händler: Heiltrank nach Level, teurer als im Dorf, alles bezahlbar mit Gold", () => {
    expect(DUNGEONS.map(merchantHealPotion)).toEqual(["small", "medium", "medium", "large"]);
    const offers = merchantOffers(DUNGEONS[0], "s", 2, []);
    expect(offers.map((o) => o.kind)).toEqual(["potion", "potion", "care", "blessing"]);
    expect(offers[0].price).toBeGreaterThan(15);
    expect(offers.every((o) => o.price > 0)).toBe(true);
    // Preis nach dem Mindest-Level des Dungeons, nicht nach dem Helden – im Koop für alle gleich
    expect(offers[0].price).toBe(Math.round(potionPrice(getPotion("small"), DUNGEONS[0].minLevel) * MERCHANT_MARKUP));
  });

  it("Fallen und Rätsel kommen in einem Lauf nicht doppelt vor", () => {
    const seenTraps = TRAPS.slice(0, -1).map((t) => t.id);
    expect(pickTrap("s", 1, seenTraps).id).toBe(TRAPS.at(-1)!.id);
    const seenRiddles = RIDDLES.slice(1).map((r) => r.id);
    const { riddle, options } = pickRiddle("s", 1, seenRiddles);
    expect(riddle.id).toBe(RIDDLES[0].id);
    expect([...options].sort()).toEqual([riddle.answer, ...riddle.wrong].sort());
  });

  it("Truhe: etwa 30 % sind Mimics – fest pro Lauf und Schritt", () => {
    let mimics = 0;
    for (let i = 0; i < 2000; i++) if (isMimicChest(`seed-${i}`, 1 + (i % 6))) mimics++;
    expect(mimics / 2000).toBeGreaterThan(MIMIC_CHANCE - 0.05);
    expect(mimics / 2000).toBeLessThan(MIMIC_CHANCE + 0.05);
    expect(isMimicChest("a", 2)).toBe(isMimicChest("a", 2));
  });

  it("jeder Dungeon hat einen Mimic: kein Schritt des Wegs, zäher als die Gegner, mit Biss und Grafik", () => {
    for (const dungeon of DUNGEONS) {
      const mimic = getMimic(dungeon);
      expect(dungeon.creatures.map((c) => c.id)).not.toContain(mimic.id);
      expect(getCreature(mimic.id).area).toBe(dungeon);
      expect(isMimic(mimic.id)).toBe(true);
      expect(mimic.level).toBe(dungeon.maxLevel);
      expect(mimic.boss).toBe(false);
      const mob = dungeonMobs(dungeon).at(-1)!;
      expect(getCreatureStats(mimic).maxHp).toBeGreaterThan(getCreatureStats(mob).maxHp);
      expect(getBossAbilities(mimic.id)).toHaveLength(1);
      expect(CREATURE_SPRITES).toHaveProperty([mimic.sprite]);
    }
    expect(isMimic(dungeonMobs(DUNGEONS[0])[0].id)).toBe(false);
  });

  it("ein Mimic gibt mehr als die Truhe: sicheres Item, Erfahrung und mehr Gold", () => {
    const dungeon = DUNGEONS[1];
    const hero = { level: 27, goldBonus: 0 } as Parameters<typeof chestReward>[1];
    const chest = chestReward(dungeonMobs(dungeon)[0], hero, "c", () => 0.99);
    expect(chest.xp).toBe(0);
    expect(chest.loot).toBeNull();
    const mimic = mimicReward(getMimic(dungeon), hero, "m", () => 0.5);
    expect(mimic.xp).toBeGreaterThan(0);
    expect(mimic.loot).not.toBeNull();
    expect(mimic.gold).toBeGreaterThan(0);
  });
});
