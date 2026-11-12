import { describe, expect, it } from "vitest";
import { getAbility, type AbilityId } from "./abilities";
import { attackRound, drinkPotion, getHeroCombatProfile, startBattle, type BattleState } from "./combat";
import { resolveRound, startCoopBattle } from "./coopCombat";
import { getCreature } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import {
  classAbility,
  CLERIC_GROUP_HEAL,
  CLERIC_POTION_FACTOR,
  CLERIC_REGEN,
  ASSASSIN_CRIT_MULTIPLIER,
  detectHeroClass,
  HERO_CLASSES,
  PALADIN_SHIELD_BASH,
  PLUNDERER_LIFESTEAL,
} from "./heroClasses";
import { createItem, ITEM_TYPES } from "./items";
import { getPotion } from "./potions";
import type { ArmorClass, Character, Equipment } from "./types";
import { attributeDamage, DAMAGE_PER_POINT, weaponStat } from "./weaponScaling";

const hero: Character = {
  name: "Held",
  totalXp: 50_000,
  gold: 0,
  essence: 0,
  stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 },
  spentPoints: 0,
  skills: {},
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

  it("Duellant nur mit zwei Schwertern, Paladin nur mit Schild und Streitkolben oder Schwert", () => {
    expect(detectHeroClass(gear("medium", "sword-90"))).toBeNull();
    expect(detectHeroClass(gear("heavy", "mace-90"))).toBeNull();
    // Paladin mit Schwert und Schild (Klassen-Kern), ohne Schild bleibt schwer + Schwert klassenlos
    expect(detectHeroClass(gear("heavy", "sword-90", "shield-90"))).toBe("paladin");
    expect(detectHeroClass(gear("heavy", "shield-90", "sword-90"))).toBe("paladin");
    expect(detectHeroClass(gear("heavy", "sword-90", "mace-90"))).toBeNull();
    expect(detectHeroClass(gear("heavy", "sword-90", "sword-91"))).toBeNull();
    // Mittel + Schwert + Schild ist weder Duellant noch Paladin, mittel + Streitkolben + Schild bleibt Kleriker
    expect(detectHeroClass(gear("medium", "sword-90", "shield-90"))).toBeNull();
    expect(detectHeroClass(gear("medium", "mace-90", "shield-90"))).toBe("cleric");
  });

  it("Geweihte Klinge: Beim Paladin skaliert das Schwert mit Ausdauer, sonst mit Stärke", () => {
    const tough: Character = { ...hero, stats: { strength: 1, intellect: 1, endurance: 60, charisma: 1 } };
    const paladin = getHeroCombatProfile(tough, gear("heavy", "sword-90", "shield-90"));
    const plain = getHeroCombatProfile(tough, gear("heavy", "sword-90", "shield-90", 2));
    expect(paladin.heroClass).toBe("paladin");
    expect(plain.heroClass).toBeNull();
    // Als Paladin zählen Schwert und Schild beide mit Ausdauer (0,15 pro Punkt), ohne Klasse das Schwert mit Stärke
    const equipment = gear("heavy", "sword-90", "shield-90");
    expect(attributeDamage(tough.stats, equipment, "paladin")).toBeCloseTo(60 * DAMAGE_PER_POINT.endurance);
    expect(attributeDamage(tough.stats, equipment)).toBeLessThan(60 * DAMAGE_PER_POINT.endurance * 0.6);
    expect(paladin.damage).toBeGreaterThan(plain.damage * 1.1);
    expect(weaponStat("sword", "paladin")).toBe("endurance");
    expect(weaponStat("sword", "duelist")).toBe("strength");
    expect(weaponStat("sword")).toBe("strength");
  });

  it("passen mehrere, gilt die zuerst gelistete", () => {
    // Mittlere Rüstung mit Axt und Streitkolben: Plünderer steht vor Kleriker
    expect(detectHeroClass(gear("medium", "axe-90", "mace-90"))).toBe("plunderer");
  });
});

describe("Klassen: Werte und Fähigkeiten", () => {
  const profile = (equipment: Equipment) => getHeroCombatProfile(hero, equipment);

  it("Champion: +8 % Schaden, +10 % LP; Wächter: mehr Rüstung, keine LP; Paladin: mehr Rüstung", () => {
    const plain = profile(gear("heavy", "greatsword-90", null, 2));
    const champion = profile(gear("heavy", "greatsword-90"));
    expect(champion.heroClass).toBe("champion");
    // Ein Rüstungsteil mehr verändert LP nicht – der Unterschied ist der Klassenbonus
    expect(Math.abs(champion.maxHp - plain.maxHp * 1.1)).toBeLessThanOrEqual(1);
    expect(champion.damage).toBeCloseTo(plain.damage * 1.08);
    // Wächter „Bergwacht“ (Klassen-Kern): +10 % Rüstung, kein LP-Bonus mehr – die Sicherheit kommt vom Bergbrecher
    const warden = profile(gear("heavy", "greathammer-90"));
    expect(warden.maxHp).toBe(profile(gear("heavy", "greathammer-90", null, 2)).maxHp);
    expect(warden.armor).toBeGreaterThan(profile(gear("heavy", "greathammer-90", null, 2)).armor);
    const paladin = profile(gear("heavy", "mace-90", "shield-90"));
    expect(paladin.heroClass).toBe("paladin");
    expect(paladin.armor).toBeGreaterThan(profile(gear("heavy", "mace-90", "shield-90", 2)).armor);
    expect(paladin.damage).toBeCloseTo(profile(gear("heavy", "mace-90", "shield-90", 2)).damage * 1.1);
  });

  it("Waldläufer: +8 % Schaden; Berserker: +10 % immer; Plünderer: +15 %", () => {
    const ranger = profile(gear("medium", "bow-90"));
    expect(ranger.heroClass).toBe("ranger");
    expect(ranger.damage).toBeCloseTo(profile(gear("medium", "bow-90", null, 2)).damage * 1.08);
    expect(profile(gear("heavy", "greataxe-90")).damage).toBeCloseTo(profile(gear("heavy", "greataxe-90", null, 2)).damage * 1.1);
    expect(profile(gear("medium", "axe-90")).damage).toBeCloseTo(profile(gear("medium", "axe-90", null, 2)).damage * 1.15);
  });

  it("Assassine: +10 % Krit, Krits 2-fach; Plünderer: +25 % Gold", () => {
    const assassin = profile(gear("light", "dagger-90"));
    const plain = profile(gear("light", "dagger-90", null, 2));
    expect(assassin.critMultiplier).toBe(ASSASSIN_CRIT_MULTIPLIER);
    expect(assassin.critMultiplier).toBe(2);
    expect(assassin.critChance).toBeGreaterThan(plain.critChance + 0.09);
    expect(assassin.critChance).toBeLessThan(plain.critChance + 0.11);
    expect(profile(gear("medium", "axe-90")).goldBonus).toBeCloseTo(profile(gear("medium", "axe-90", null, 2)).goldBonus + 0.25);
  });

  it("Fähigkeiten: Magier günstiger, Waldläufer 5 Pfeile, Paladin halbes Bollwerk, Wächter längere Schwächung", () => {
    expect(classAbility("staff", "mage").manaCost).toBe(Math.round(getAbility("staff").manaCost * 0.8));
    expect(classAbility("staff", "mage").multiplier).toBe(getAbility("staff").multiplier);
    expect(classAbility("bow", "ranger").hits).toBe(5);
    expect(classAbility("shield", "paladin").manaCost).toBe(10);
    expect(classAbility("greathammer", "warden").stun).toBeUndefined();
    expect(classAbility("greathammer-2", "warden").weaken).toEqual({ percent: 0.3, rounds: 3 });
    expect(classAbility("greathammer-2", null).weaken).toEqual({ percent: 0.3, rounds: 2 });
    // Der Hexer verstärkt seine DoTs beim Legen (layDot), nicht über die Fähigkeit
    expect(classAbility("scepter", "warlock")).toEqual(getAbility("scepter"));
    expect(classAbility("staff", null)).toEqual(getAbility("staff"));
  });
});

describe("Klassen: Kampfmechanik", () => {
  const battle = (equipment: Equipment): BattleState => {
    const b = startBattle("b", "Held", getHeroCombatProfile(hero, equipment), getCreature("grey-wolf").creature);
    return { ...b, enemy: { ...b.enemy, hp: 99_999, maxHp: 99_999 } };
  };
  const rng = (value: number) => () => value;

  it("Paladin: Bollwerk und Vergeltung schlagen mit halbem Schaden zu, ohne Klasse nicht", () => {
    const paladin = { ...battle(gear("heavy", "mace-90", "shield-90")), abilities: ["shield", "shield-2"] as AbilityId[] };
    expect(paladin.heroClass).toBe("paladin");
    const plain = { ...battle(gear("heavy", "mace-90", "shield-90", 2)), abilities: ["shield", "shield-2"] as AbilityId[] };
    for (const id of ["shield", "shield-2"] as const) {
      const bash = attackRound(paladin, rng(0.5), id).events.find((e) => e.type === "hit" && e.attacker === "hero");
      const full = attackRound(paladin, rng(0.5)).events.find((e) => e.type === "hit" && e.attacker === "hero");
      expect(bash && full && bash.type === "hit" && full.type === "hit" && bash.damage / full.damage).toBeCloseTo(PALADIN_SHIELD_BASH, 1);
      expect(attackRound(plain, rng(0.5), id).events.some((e) => e.type === "hit" && e.attacker === "hero")).toBe(false);
    }
  });

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

  it("Plünderer heilt sich um 8 % des verursachten Schadens", () => {
    const state = battle(gear("medium", "axe-90"));
    const hurt = { ...state, hero: { ...state.hero, hp: 10 } };
    const { events } = attackRound(hurt, rng(0.5));
    const dealt = events.filter((e) => e.type === "hit" && e.attacker === "hero").reduce((sum, e) => sum + (e as { damage: number }).damage, 0);
    expect(events).toContainEqual({ type: "selfHeal", heal: Math.round(dealt * PLUNDERER_LIFESTEAL) });
    // Ohne Klasse kein Lebensraub
    const plain = battle(gear("medium", "axe-90", null, 2));
    expect(attackRound({ ...plain, hero: { ...plain.hero, hp: 10 } }, rng(0.5)).events.some((e) => e.type === "selfHeal")).toBe(false);
  });

  it("Kleriker regeneriert jede Runde und heilt mit Tränken stärker", () => {
    const hurt = (s: BattleState): BattleState => ({ ...s, hero: { ...s.hero, hp: Math.round(s.hero.maxHp / 2) } });
    const cleric = hurt(battle(gear("medium", "mace-90")));
    expect(attackRound(cleric, rng(0.5)).events).toContainEqual({ type: "regen", heal: Math.round(cleric.hero.maxHp * CLERIC_REGEN) });
    const plain = hurt(battle(gear("medium", "mace-90", null, 2)));
    const potion = getPotion("small");
    const healed = (s: BattleState) => drinkPotion(s, potion).state.hero.hp - s.hero.hp;
    expect(healed(cleric) / healed(plain)).toBeCloseTo(CLERIC_POTION_FACTOR, 1);
  });

  it("Berserker wird unter 50 % LP stärker", () => {
    const fresh = battle(gear("heavy", "greataxe-90"));
    const low = { ...fresh, hero: { ...fresh.hero, hp: 10 } };
    const damage = (s: BattleState) => attackRound(s, rng(0.5)).events.find((e) => e.type === "hit" && e.attacker === "hero");
    expect((damage(low) as { damage: number }).damage).toBeGreaterThan((damage(fresh) as { damage: number }).damage);
  });

  it("Schild: 2,2 Basisangriff – der Paladin macht damit spürbar mehr Schaden (Review Nr. 3)", () => {
    expect(ITEM_TYPES.find((t) => t.type === "shield")!.baseAttack).toBe(2.2);
    const paladin = getHeroCombatProfile(hero, gear("heavy", "mace-90", "shield-90"));
    const maceOnly = getHeroCombatProfile(hero, gear("heavy", "mace-90"));
    // Streitkolben 3,1 + Schild 2,2: Der Schild trägt rund 40 % des Waffenangriffs bei
    expect(paladin.damage).toBeGreaterThan(maceOnly.damage * 1.3);
  });

  it("Kleriker: Heiliges Licht und Läuterung heilen im Koop die Mitspieler halb so stark mit – solo ändert sich nichts", () => {
    expect(classAbility("mace-2", "cleric").groupHeal).toBe(CLERIC_GROUP_HEAL);
    expect(classAbility("mace-3", "cleric").groupHeal).toBe(CLERIC_GROUP_HEAL);
    expect(classAbility("mace", "cleric").groupHeal).toBeUndefined();
    expect(classAbility("mace-2", "paladin").groupHeal).toBeUndefined();
    const cleric = { ...getHeroCombatProfile(hero, gear("medium", "mace-90")), abilities: ["mace-2", "mace-3"] as AbilityId[] };
    expect(cleric.heroClass).toBe("cleric");
    const coop = (healer: typeof cleric) => {
      const battle = startCoopBattle("k", "swamp-hydra", [
        { id: "c", name: "C", profile: healer },
        { id: "x", name: "X", profile: { ...healer, heroClass: null } },
      ], 0);
      return {
        ...battle,
        heroes: battle.heroes.map((h) => ({ ...h, mana: 999, combatant: { ...h.combatant, hp: 10, maxHp: 10_000 } })),
        boss: { ...battle.boss, hp: 999_999, maxHp: 999_999, damage: 1 },
        adds: [],
      };
    };
    const { events } = resolveRound(coop(cleric), { c: { ability: "mace-2" } }, rng(0.5), 0);
    expect(events).toContainEqual({ type: "selfHeal", heroId: "c", heal: 2_500 });
    expect(events).toContainEqual({ type: "selfHeal", heroId: "x", heal: 1_250, by: "c" });
    // Ohne Klasse heilt Heiliges Licht nur den Anwender
    const plain = resolveRound(coop({ ...cleric, heroClass: null }), { c: { ability: "mace-2" } }, rng(0.5), 0).events;
    expect(plain.some((e) => e.type === "selfHeal" && e.heroId === "x")).toBe(false);
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
