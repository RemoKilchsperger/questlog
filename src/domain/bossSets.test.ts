import { describe, expect, it } from "vitest";
import {
  BOSS_SETS,
  getActiveSets,
  getSetGearMultiplier,
  getSetHpMultiplier,
  SET_GEAR_BONUS,
  setStatBonus,
} from "./bossSets";
import { EMPTY_EQUIPMENT, getCombatStats, getStatBonuses } from "./equipment";
import { AREAS, DUNGEONS } from "./creatures";
import { createItem, getItemStats } from "./items";
import type { Equipment } from "./types";

const own = (itemId: string) => createItem(itemId, "common", itemId);
const goblin = (...types: string[]) => types.map((t) => own(`boss-goblin-chief-${t}`));

describe("Boss-Sets", () => {
  it("jeder Gebiets- und Dungeon-Boss hat ein Set", () => {
    const bosses = [...AREAS, ...DUNGEONS].map((a) => a.creatures.find((c) => c.boss)!.id);
    expect(BOSS_SETS.map((s) => s.bossId)).toEqual(bosses);
    expect(setStatBonus("goblin-chief")).toBe(5);
    expect(setStatBonus("ignaroth")).toBe(30);
  });

  it("Dungeon-Sets: 2 Teile Attribut, 4 Teile Angriff & Rüstung, 6 Teile Lebenspunkte", () => {
    const set = (...types: string[]) =>
      Object.fromEntries(types.map((t) => [t === "dagger" ? "weapon1" : t, own(`boss-ore-king-${t}`)]));
    const two: Equipment = { ...EMPTY_EQUIPMENT, ...set("head", "chest") };
    expect(getActiveSets(two)[0]).toMatchObject({ statBonus: true, gearBonus: false, hpBonus: false });
    const four: Equipment = { ...EMPTY_EQUIPMENT, ...set("head", "chest", "arms", "legs") };
    expect(getActiveSets(four)[0]).toMatchObject({ gearBonus: true, hpBonus: false });
    const six: Equipment = { ...EMPTY_EQUIPMENT, ...set("head", "chest", "arms", "legs", "feet", "dagger") };
    expect(getActiveSets(six)[0]).toMatchObject({ pieces: 6, total: 7, hpBonus: true });
    expect(getSetHpMultiplier(six)).toBeCloseTo(1.15);
    expect(getSetHpMultiplier(four)).toBe(1);
  });

  it("1 Teil: kein Bonus", () => {
    const equipment: Equipment = { ...EMPTY_EQUIPMENT, head: goblin("head")[0] };
    expect(getActiveSets(equipment)[0]).toMatchObject({ pieces: 1, statBonus: false, gearBonus: false });
    expect(getStatBonuses(equipment).strength).toBe(0);
    expect(getSetGearMultiplier(equipment)).toBe(1);
  });

  it("2 Teile: Attributbonus passend zum Boss", () => {
    const [head, chest] = goblin("head", "chest");
    const equipment: Equipment = { ...EMPTY_EQUIPMENT, head, chest };
    expect(getStatBonuses(equipment).strength).toBe(setStatBonus("goblin-chief"));
    expect(getSetGearMultiplier(equipment)).toBe(1);
  });

  it("3 Teile: zusätzlich mehr Angriff und Rüstung", () => {
    const [head, chest, axe] = goblin("head", "chest", "axe");
    const equipment: Equipment = { ...EMPTY_EQUIPMENT, head, chest, weapon1: axe };
    const raw = [head, chest, axe].map(getItemStats);
    const sum = (key: "attack" | "armor") => raw.reduce((s, i) => s + i[key], 0);
    expect(getCombatStats(equipment)).toEqual({
      attack: Math.round(sum("attack") * (1 + SET_GEAR_BONUS)),
      armor: Math.round(sum("armor") * (1 + SET_GEAR_BONUS)),
    });
    expect(getActiveSets(equipment)[0]).toMatchObject({ pieces: 3, total: 4, statBonus: true, gearBonus: true });
  });

  it("Teile verschiedener Bosse zählen nicht zusammen", () => {
    const equipment: Equipment = {
      ...EMPTY_EQUIPMENT,
      head: own("boss-goblin-chief-head"),
      chest: own("boss-lich-king-chest"),
    };
    expect(getActiveSets(equipment).every((a) => a.pieces === 1)).toBe(true);
    expect(getStatBonuses(equipment)).toEqual({ strength: 0, intellect: 0, endurance: 0, charisma: 0 });
  });
});
