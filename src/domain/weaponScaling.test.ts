import { describe, expect, it } from "vitest";
import { CRIT_PER_CHARISMA, getHeroCombatProfile } from "./combat";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem, getItemStats } from "./items";
import { allocatePoint, attributeResetCost, resetAttributes, resettablePoints, unspentPoints, xpForNextLevel } from "./leveling";
import type { Character, Equipment, Stats } from "./types";
import { attributeDamage, DAMAGE_PER_POINT, shieldArmorBonus, WEAPON_STAT } from "./weaponScaling";

const stats = (s: Partial<Stats> = {}): Stats => ({ strength: 1, intellect: 1, endurance: 1, charisma: 1, ...s });
const weapons = (...ids: string[]): Equipment => ({
  ...EMPTY_EQUIPMENT,
  weapon1: ids[0] ? createItem(ids[0], "common", "w1") : null,
  weapon2: ids[1] ? createItem(ids[1], "common", "w2") : null,
});

const xpFor = (level: number) => {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += xpForNextLevel(l);
  return xp;
};
const hero = (overrides: Partial<Character> = {}): Character => ({
  name: "Held",
  totalXp: xpFor(20),
  gold: 10_000,
  essence: 0,
  stats: stats(),
  spentPoints: 0,
  skills: {},
  abilities: [],
  ...overrides,
});

describe("Waffen skalieren mit Attributen", () => {
  it("Zuordnung wie entschieden", () => {
    expect(["sword", "greatsword", "axe", "greataxe", "greathammer"].map((t) => WEAPON_STAT[t as keyof typeof WEAPON_STAT])).toEqual(Array(5).fill("strength"));
    expect([WEAPON_STAT.staff, WEAPON_STAT.scepter]).toEqual(["intellect", "intellect"]);
    expect([WEAPON_STAT.mace, WEAPON_STAT.shield]).toEqual(["endurance", "endurance"]);
    expect([WEAPON_STAT.dagger, WEAPON_STAT.bow]).toEqual(["charisma", "charisma"]);
  });

  it("jede Waffe bekommt Schaden nur aus ihrem Attribut", () => {
    const strong = stats({ strength: 41 });
    expect(attributeDamage(strong, weapons("greathammer-50"))).toBeCloseTo(41 * DAMAGE_PER_POINT.strength);
    expect(attributeDamage(strong, weapons("staff-50"))).toBeCloseTo(1 * DAMAGE_PER_POINT.intellect);
    expect(attributeDamage(stats({ charisma: 41 }), weapons("bow-50"))).toBeCloseTo(41 * DAMAGE_PER_POINT.charisma);
  });

  it("zwei Waffen zählen nach ihrem Anteil am Angriff – mit lauter Stärke-Waffen wie bisher 0,25 · Stärke", () => {
    expect(attributeDamage(stats({ strength: 21 }), weapons("sword-50", "axe-50"))).toBeCloseTo(21 * 0.25);
    const mixed = weapons("sword-50", "dagger-50");
    const sword = getItemStats(mixed.weapon1!).attack;
    const dagger = getItemStats(mixed.weapon2!).attack;
    const s = stats({ strength: 21, charisma: 41 });
    expect(attributeDamage(s, mixed)).toBeCloseTo((sword * 21 * 0.25 + dagger * 41 * 0.25) / (sword + dagger));
  });

  it("ohne Waffe zählt Stärke", () => {
    expect(attributeDamage(stats({ strength: 9 }), EMPTY_EQUIPMENT)).toBeCloseTo(9 * 0.25);
  });

  it("der Schild bekommt auch Rüstung aus Ausdauer", () => {
    expect(shieldArmorBonus(stats({ endurance: 101 }), weapons("mace-50", "shield-50"))).toBeGreaterThan(0);
    expect(shieldArmorBonus(stats({ endurance: 101 }), weapons("mace-50"))).toBe(0);
  });

  it("kritische Treffer kommen aus Charisma statt Intelligenz", () => {
    const base = getHeroCombatProfile(hero(), weapons("sword-0")).critChance;
    expect(getHeroCombatProfile(hero({ stats: stats({ intellect: 51 }) }), weapons("sword-0")).critChance).toBeCloseTo(base);
    expect(getHeroCombatProfile(hero({ stats: stats({ charisma: 51 }) }), weapons("sword-0")).critChance).toBeCloseTo(base + 50 * CRIT_PER_CHARISMA);
  });
});

describe("Attributpunkte zurücksetzen", () => {
  it("das erste Mal kostenlos, danach teuer", () => {
    expect(attributeResetCost(hero())).toBe(0);
    expect(attributeResetCost(hero({ attributeResets: 1 }))).toBe(Math.round(25 * 20 * 3));
  });

  it("alle Attribute fallen auf 1, alle Punkte darüber sind wieder frei – auch die aus Quests", () => {
    // 19 Level-ups = 38 Punkte, davon 10 verteilt; dazu 3 Punkte aus epischen Quests
    let h = hero({ stats: stats({ strength: 8, endurance: 7 }), spentPoints: 10 });
    expect(unspentPoints(h)).toBe(28);
    expect(resettablePoints(h)).toBe(13);
    h = resetAttributes(h);
    expect(h.stats).toEqual(stats());
    expect(unspentPoints(h)).toBe(28 + 13);
    expect(h.attributeResets).toBe(1);
    expect(h.gold).toBe(10_000);
    // Neu verteilen funktioniert wie gewohnt
    h = allocatePoint(h, "charisma");
    expect(h.stats.charisma).toBe(2);
    expect(unspentPoints(h)).toBe(28 + 13 - 1);
  });

  it("das zweite Mal kostet Gold – ohne genug Gold oder ohne verteilte Punkte geht es nicht", () => {
    const once = resetAttributes(hero({ stats: stats({ strength: 5 }), spentPoints: 4 }));
    const again = resetAttributes(allocatePoint(once, "strength"));
    expect(again.gold).toBe(10_000 - attributeResetCost(once));
    expect(() => resetAttributes(hero())).toThrow();
    expect(() => resetAttributes({ ...allocatePoint(once, "strength"), gold: 0 })).toThrow(/Gold/);
  });
});
