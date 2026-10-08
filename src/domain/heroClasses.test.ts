import { describe, expect, it } from "vitest";
import { getAbility } from "./abilities";
import { attackRound, drinkPotion, getHeroCombatProfile, startBattle, type BattleState } from "./combat";
import { resolveRound, startCoopBattle } from "./coopCombat";
import { getCreature } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { classAbility, detectHeroClass, HERO_CLASSES } from "./heroClasses";
import { createItem } from "./items";
import { getPotion } from "./potions";
import type { ArmorClass, Character, Equipment } from "./types";

const hero: Character = {
  name: "Held",
  totalXp: 50_000,
  gold: 0,
  essence: 0,
  stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 },
  spentPoints: 0,
  skills: {},
  abilities: ["staff", "bow", "shield", "greathammer", "scepter", "mace"],
};

const own = (id: string) => createItem(id, "common", id);
/** `pieces` Rüstungsteile der Klasse, der Rest schwer bzw. leer. */
const armor = (cls: ArmorClass, pieces = 3): Partial<Equipment> => {
  const slots = ["head", "chest", "arms", "legs", "feet"] as const;
  const id = (slot: string, c: ArmorClass) => (c === "heavy" ? `${slot}-90` : `${slot}-${c}-90`);
  return Object.fromEntries(slots.map((slot, i) => [slot, i < pieces ? own(id(slot, cls)) : null]));
};
const gear = (cls: ArmorClass, w1: string | null, w2: string | null = null, pieces = 3): Equipment => ({
  ...EMPTY_EQUIPMENT,
  ...armor(cls, pieces),
  weapon1: w1 ? own(w1) : null,
  weapon2: w2 ? own(w2) : null,
});

describe("Klassen: Erkennung", () => {
  it("3 von 5 Rüstungsteilen und die passende Waffe – 2 Teile reichen nicht", () => {
    expect(detectHeroClass(gear("light", "staff-90"))).toBe("mage");
    expect(detectHeroClass(gear("light", "staff-90", null, 2))).toBeNull();
    expect(detectHeroClass(gear("heavy", "staff-90"))).toBeNull();
  });

  it("jede Klasse ist mit ihrer Ausrüstung erreichbar", () => {
    const cases: [string, Equipment][] = [
      ["mage", gear("light", "staff-90")],
      ["warlock", gear("light", "scepter-90")],
      ["assassin", gear("light", "dagger-90")],
      ["ranger", gear("medium", "bow-90")],
      ["duelist", gear("medium", "sword-90", "sword-91")],
      ["plunderer", gear("medium", "axe-90")],
      ["cleric", gear("medium", "mace-90")],
      ["paladin", gear("heavy", "mace-90", "shield-90")],
      ["berserker", gear("heavy", "greataxe-90")],
      ["champion", gear("heavy", "greatsword-90")],
      ["warden", gear("heavy", "greathammer-90")],
    ];
    for (const [id, equipment] of cases) expect(detectHeroClass(equipment), id).toBe(id);
    expect(new Set(cases.map(([id]) => id)).size).toBe(HERO_CLASSES.length);
  });

  it("Duellant nur mit zwei Schwertern, Paladin nur mit Streitkolben und Schild", () => {
    expect(detectHeroClass(gear("medium", "sword-90"))).toBeNull();
    expect(detectHeroClass(gear("heavy", "mace-90"))).toBeNull();
    expect(detectHeroClass(gear("heavy", "sword-90", "shield-90"))).toBeNull();
  });

  it("passen mehrere, gilt die zuerst gelistete", () => {
    // Mittlere Rüstung mit Axt und Streitkolben: Plünderer steht vor Kleriker
    expect(detectHeroClass(gear("medium", "axe-90", "mace-90"))).toBe("plunderer");
  });
});

describe("Klassen: Werte und Fähigkeiten", () => {
  const profile = (equipment: Equipment) => getHeroCombatProfile(hero, equipment);

  it("Champion: +15 % Schaden, +10 % LP; Wächter: +15 % LP; Paladin: mehr Rüstung", () => {
    const plain = profile(gear("heavy", "greatsword-90", null, 2));
    const champion = profile(gear("heavy", "greatsword-90"));
    expect(champion.heroClass).toBe("champion");
    // Ein Rüstungsteil mehr verändert LP nicht – der Unterschied ist der Klassenbonus
    expect(Math.abs(champion.maxHp - plain.maxHp * 1.1)).toBeLessThanOrEqual(1);
    expect(champion.damage).toBeCloseTo(plain.damage * 1.15);
    const warden = profile(gear("heavy", "greathammer-90")).maxHp;
    expect(Math.abs(warden - profile(gear("heavy", "greathammer-90", null, 2)).maxHp * 1.15)).toBeLessThanOrEqual(1);
    const paladin = profile(gear("heavy", "mace-90", "shield-90"));
    expect(paladin.heroClass).toBe("paladin");
    expect(paladin.armor).toBeGreaterThan(profile(gear("heavy", "mace-90", "shield-90", 2)).armor);
  });

  it("Assassine: +20 % Krit, Krits 2,25-fach; Plünderer: +25 % Gold", () => {
    const assassin = profile(gear("light", "dagger-90"));
    const plain = profile(gear("light", "dagger-90", null, 2));
    expect(assassin.critMultiplier).toBe(2.25);
    expect(assassin.critChance).toBeGreaterThan(plain.critChance + 0.19);
    expect(profile(gear("medium", "axe-90")).goldBonus).toBeCloseTo(profile(gear("medium", "axe-90", null, 2)).goldBonus + 0.25);
  });

  it("Fähigkeiten: Magier günstiger und stärker, Waldläufer 5 Pfeile, Paladin halbes Bollwerk, Hexer länger", () => {
    expect(classAbility("staff", "mage").manaCost).toBe(Math.round(getAbility("staff").manaCost * 0.8));
    expect(classAbility("staff", "mage").multiplier).toBeCloseTo(getAbility("staff").multiplier * 1.05);
    expect(classAbility("bow", "ranger").hits).toBe(5);
    expect(classAbility("shield", "paladin").manaCost).toBe(10);
    expect(classAbility("greathammer", "warden").stun).toBeUndefined();
    expect(classAbility("scepter", "warlock").poison).toEqual({ percent: expect.closeTo(0.6), rounds: 4 });
    expect(classAbility("staff", null)).toEqual(getAbility("staff"));
  });
});

describe("Klassen: Kampfmechanik", () => {
  const battle = (equipment: Equipment): BattleState => {
    const b = startBattle("b", "Held", getHeroCombatProfile(hero, equipment), getCreature("grey-wolf").creature);
    return { ...b, enemy: { ...b.enemy, hp: 99_999, maxHp: 99_999 } };
  };
  const rng = (value: number) => () => value;

  it("Duellant schlägt manchmal zweimal zu", () => {
    const state = battle(gear("medium", "sword-90", "sword-91"));
    const heroHits = (r: number) => attackRound(state, rng(r)).events.filter((e) => e.type === "hit" && e.attacker === "hero").length;
    expect(heroHits(0.1)).toBe(2);
    expect(heroHits(0.5)).toBe(1);
  });

  it("Plünderer: kritische Treffer lassen bluten (wirkt sofort, dann noch eine Runde)", () => {
    const { state, events } = attackRound(battle(gear("medium", "axe-90")), rng(0.01));
    expect(events.some((e) => e.type === "bleed" && e.target === "enemy")).toBe(true);
    expect(state.enemyEffects.bleed?.roundsLeft).toBe(1);
  });

  it("Kleriker regeneriert jede Runde und heilt mit Tränken stärker", () => {
    const hurt = (s: BattleState): BattleState => ({ ...s, hero: { ...s.hero, hp: Math.round(s.hero.maxHp / 2) } });
    const cleric = hurt(battle(gear("medium", "mace-90")));
    expect(attackRound(cleric, rng(0.5)).events).toContainEqual({ type: "regen", heal: Math.round(cleric.hero.maxHp * 0.03) });
    const plain = hurt(battle(gear("medium", "mace-90", null, 2)));
    const potion = getPotion("small");
    const healed = (s: BattleState) => drinkPotion(s, potion).state.hero.hp - s.hero.hp;
    expect(healed(cleric) / healed(plain)).toBeCloseTo(1.3, 1);
  });

  it("Berserker wird unter 50 % LP stärker", () => {
    const fresh = battle(gear("heavy", "greataxe-90"));
    const low = { ...fresh, hero: { ...fresh.hero, hp: 10 } };
    const damage = (s: BattleState) => attackRound(s, rng(0.5)).events.find((e) => e.type === "hit" && e.attacker === "hero");
    expect((damage(low) as { damage: number }).damage).toBeGreaterThan((damage(fresh) as { damage: number }).damage);
  });

  it("Paladin erzeugt im Koop doppelte Bedrohung", () => {
    const paladin = getHeroCombatProfile(hero, gear("heavy", "mace-90", "shield-90"));
    const plain = { ...paladin, heroClass: null };
    const battle = startCoopBattle("k", "swamp-hydra", [
      { id: "p", name: "P", profile: paladin },
      { id: "x", name: "X", profile: plain },
    ], 0);
    const tough = { ...battle, boss: { ...battle.boss, hp: 999_999, maxHp: 999_999 } };
    const { events, state } = resolveRound(tough, {}, rng(0.5), 0);
    const dealt = (id: string) => events.reduce((sum, e) => sum + (e.type === "hit" && e.attacker === id ? e.damage : 0), 0);
    const threat = (id: string) => state.heroes.find((h) => h.id === id)!.threat;
    expect(threat("p")).toBe(Math.round(dealt("p") * 2 * 0.7));
    expect(threat("x")).toBe(Math.round(dealt("x") * 0.7));
  });
});
