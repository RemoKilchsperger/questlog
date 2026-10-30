import { describe, expect, it } from "vitest";
import { attackRound, drinkPotion, equippedEffects, getHeroCombatProfile, startBattle, type BattleEvent, type BattleState } from "./combat";
import { resolveRound, startCoopBattle } from "./coopCombat";
import { getCreature } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { BOSS_EFFECTS, EFFECT, effectOf, ITEM_EFFECTS, rollItemEffect, type ItemEffectId } from "./itemEffects";
import { BOSS_ITEMS, createItem, ensureEffect, getItem, getItemStats } from "./items";
import { xpForNextLevel } from "./leveling";
import { getPotion } from "./potions";
import type { Character } from "./types";

const hero = (): Character => {
  let totalXp = 0;
  for (let l = 1; l < 20; l++) totalXp += xpForNextLevel(l);
  return { name: "Held", totalXp, gold: 0, essence: 0, stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 }, spentPoints: 0, skills: {}, abilities: ["sword"] };
};
const profile = (effects: ItemEffectId[] = []) => ({
  ...getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, weapon1: createItem("sword-0", "common", "w1") }),
  itemEffects: effects,
});
const rng = (value: number) => () => value;
/** Sehr zäher Held gegen einen sehr zähen Gegner – Runden laufen vollständig ab. */
const fight = (effects: ItemEffectId[], creatureId = "grey-wolf", overrides: Partial<BattleState> = {}): BattleState => {
  const battle = startBattle("b", "Held", profile(effects), getCreature(creatureId).creature);
  return {
    ...battle,
    hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 },
    enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 },
    ...overrides,
  };
};
const heroHit = (events: BattleEvent[]) =>
  events.find((e) => e.type === "hit" && e.attacker === "hero" && !e.add) as Extract<BattleEvent, { type: "hit" }>;
const enemyHit = (events: BattleEvent[]) =>
  events.find((e) => e.type === "hit" && e.attacker === "enemy" && !e.add) as Extract<BattleEvent, { type: "hit" }> | undefined;

describe("Item-Effekte: Vergabe", () => {
  it("legendäre Items bekommen einen festen Effekt aus der uid – Waffen nie Rüstungs-Effekte, Boss-Items ihren Boss-Effekt", () => {
    const sword = createItem("sword-10", "legendary", "abc");
    expect(sword.effect).toBe(rollItemEffect("abc", "weapon"));
    expect(createItem("sword-10", "legendary", "abc").effect).toBe(sword.effect);
    expect(createItem("sword-10", "epic", "abc").effect).toBeUndefined();
    for (let i = 0; i < 200; i++) {
      const pool = ITEM_EFFECTS.find((e) => e.id === rollItemEffect(`u${i}`, "weapon"))!.pool;
      expect(["weapon", "any"]).toContain(pool);
    }
    for (const def of BOSS_ITEMS) {
      const item = createItem(def.id, "legendary", "b");
      expect(item.effect).toBeUndefined();
      expect(effectOf(item, getItem(def.id))).toBe(BOSS_EFFECTS[def.bossId!]);
    }
  });

  it("ältere legendäre Items bekommen ihren Effekt beim Laden – gleich wie bei einem neuen Drop", () => {
    const old = { uid: "old-1", itemId: "head-20", rarity: "legendary" as const, bonuses: {} };
    expect(ensureEffect(old).effect).toBe(rollItemEffect("old-1", "armor"));
    expect(ensureEffect({ ...old, rarity: "rare" }).effect).toBeUndefined();
    expect(getItemStats(ensureEffect(old)).effect).toBe(ensureEffect(old).effect);
  });

  it("derselbe Effekt zählt nur einmal", () => {
    const helm = { ...createItem("head-20", "legendary", "h"), effect: "thorns" as const };
    const chest = { ...createItem("chest-20", "legendary", "c"), effect: "thorns" as const };
    expect(equippedEffects({ ...EMPTY_EQUIPMENT, head: helm, chest })).toEqual(["thorns"]);
  });
});

describe("Item-Effekte: Wirkung im Kampf", () => {
  it("Bossschlächter und Kriegstrommel machen mehr Schaden – die Trommel nur in den ersten Runden", () => {
    const plain = heroHit(attackRound(fight([], "goblin-chief"), rng(0.5)).events).damage;
    const slayer = heroHit(attackRound(fight(["bossSlayer"], "goblin-chief"), rng(0.5)).events).damage;
    expect(Math.abs(slayer - plain * (1 + EFFECT.bossSlayer))).toBeLessThanOrEqual(1);
    const late = fight(["warDrum"], "goblin-chief", { round: 4 });
    expect(heroHit(attackRound(late, rng(0.5)).events).damage).toBe(heroHit(attackRound({ ...late, itemEffects: [] }, rng(0.5)).events).damage);
  });

  it("Glut: kritische Treffer setzen in Brand – Giftzahn vergiftet mit Chance", () => {
    const { state } = attackRound(fight(["ember"]), rng(0.01));
    expect(state.enemyEffects.burn).toBeDefined();
    expect(attackRound(fight(["venomFang"]), rng(0.01)).state.enemyEffects.poison).toBeDefined();
    expect(attackRound(fight(["venomFang"]), rng(0.99)).state.enemyEffects.poison).toBeUndefined();
  });

  it("Frostbiss friert ein, Manadieb gibt Mana, Seelenraub heilt", () => {
    const frozen = attackRound(fight(["frostBite"]), rng(0.05)).events;
    expect(frozen).toContainEqual({ type: "stunned", freeze: true });
    const thief = fight(["manaThief"], "grey-wolf", { mana: 10 });
    expect(attackRound(thief, rng(0.5)).state.mana).toBeGreaterThan(attackRound({ ...thief, itemEffects: [] }, rng(0.5)).state.mana);
    const hurt = fight(["soulDrain"]);
    expect(attackRound({ ...hurt, hero: { ...hurt.hero, hp: 50_000 } }, rng(0.5)).events.some((e) => e.type === "selfHeal")).toBe(true);
  });

  it("Wachsam blockt den ersten Angriff, Standhaft schwächt Boss-Fähigkeiten, Dornen werfen zurück", () => {
    const vigilant = startBattle("b", "Held", profile(["vigilant"]), getCreature("grey-wolf").creature);
    expect(vigilant.heroEffects.bulwark).toBe(true);
    const special = fight([], "goblin-chief", { round: 3, adds: [] });
    const plain = enemyHit(attackRound(special, rng(0.5)).events)!.damage;
    const steady = enemyHit(attackRound({ ...special, itemEffects: ["steadfast"] }, rng(0.5)).events)!.damage;
    expect(steady).toBeLessThan(plain);
    expect(attackRound(fight(["thorns"]), rng(0.5)).events.some((e) => e.type === "thorns")).toBe(true);
  });

  it("Unbeugsam rettet einmal pro Kampf mit 1 LP, Alchemist verstärkt Heiltränke", () => {
    const base = fight(["unyielding"]);
    const saved = attackRound({ ...base, hero: { ...base.hero, hp: 1, maxHp: 1000 } }, rng(0.5));
    expect(saved.state.status).toBe("active");
    expect(saved.state.hero.hp).toBe(1);
    expect(saved.events).toContainEqual({ type: "endured" });
    expect(attackRound(saved.state, rng(0.5)).state.status).toBe("lost");
    const potion = (effects: ItemEffectId[]) => {
      const s = fight(effects);
      return drinkPotion({ ...s, hero: { ...s.hero, hp: 1, maxHp: 1000 } }, getPotion("small")).state.hero.hp;
    };
    expect(potion(["alchemist"]) - 1).toBe(Math.round((potion([]) - 1) * (1 + EFFECT.alchemist)));
  });

  it("Glücksbringer und Vorbereitet wirken auf das Profil", () => {
    const head = createItem("head-20", "legendary", "x");
    const chest = createItem("chest-20", "legendary", "y");
    const base = getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, head: { ...head, effect: "thorns" }, chest: { ...chest, effect: "thorns" } });
    const geared = getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, head: { ...head, effect: "lucky" }, chest: { ...chest, effect: "prepared" } });
    expect(geared.goldBonus).toBeCloseTo(base.goldBonus + EFFECT.lucky);
    expect(geared.maxMana).toBe(base.maxMana + EFFECT.prepared);
  });

  it("wirken auch im Koop: Unbeugsam rettet, Dornen werfen zurück", () => {
    const players = ["a", "b"].map((id) => ({ id, name: id, profile: profile(["unyielding", "thorns"]) }));
    const state = startCoopBattle("k", "swamp-hydra", players, 0);
    const fragile = {
      ...state,
      boss: { ...state.boss, hp: 999_999, maxHp: 999_999 },
      heroes: state.heroes.map((h) => ({ ...h, combatant: { ...h.combatant, hp: 1 } })),
    };
    const { state: next, events } = resolveRound(fragile, {}, rng(0.5), 0);
    expect(events.some((e) => e.type === "endured")).toBe(true);
    expect(events.some((e) => e.type === "thorns")).toBe(true);
    expect(next.heroes.some((h) => h.endured && !h.down)).toBe(true);
  });
});
