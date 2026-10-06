import { describe, expect, it } from "vitest";
import { ABILITIES, getAbility, MANA_REGEN, maxManaFor } from "./abilities";
import { abilityBlocker, attackRound, getHeroCombatProfile, startBattle, type BattleState } from "./combat";
import { getBossAbility, roundsUntilBossAbility } from "./bossAbilities";
import { AREAS, getCreature } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem, getItemStats } from "./items";
import { xpForNextLevel } from "./leveling";
import { clampSkills, MAX_SKILL_RANK, SKILL_BONUS_PER_RANK, unspentSkillPoints } from "./skills";
import type { Character, Equipment } from "./types";

const hero: Character = {
  name: "Held",
  totalXp: xpForNextLevel(1) * 4,
  gold: 0,
  essence: 0,
  stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 },
  spentPoints: 0,
  battlePoints: 5,
  battlePointSlot: 0,
  skills: {},
  // Fähigkeiten-Tests: alle freigeschaltet (das Freischalten selbst testet skills.test.ts)
  abilities: ABILITIES.map((a) => a.weapon),
};

const withWeapons = (...ids: string[]): Equipment => ({
  ...EMPTY_EQUIPMENT,
  weapon1: ids[0] ? createItem(ids[0], "common", "w1") : null,
  weapon2: ids[1] ? createItem(ids[1], "common", "w2") : null,
});

/** Kampf gegen einen sehr zähen Wolf – so endet keine Runde mit einem Sieg. */
const battleWith = (equipment: Equipment): BattleState => {
  const battle = startBattle("b", "Held", getHeroCombatProfile(hero, equipment), getCreature("grey-wolf").creature);
  return { ...battle, enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 } };
};
const rng = (value: number) => () => value;

describe("Fähigkeiten", () => {
  it("jede Waffe inklusive Schild hat genau eine Fähigkeit", () => {
    expect(ABILITIES.map((a) => a.weapon).sort()).toEqual(
      ["axe", "dagger", "greataxe", "greathammer", "greatsword", "mace", "scepter", "shield", "staff", "sword"].sort(),
    );
  });

  it("verfügbar sind die Fähigkeiten der angelegten Waffen", () => {
    expect(battleWith(withWeapons("sword-0", "axe-0")).abilities).toEqual(["sword", "axe"]);
    expect(battleWith(withWeapons("sword-0", "shield-0")).abilities).toEqual(["sword", "shield"]);
    expect(abilityBlocker(battleWith(withWeapons("sword-0")), "axe")).toMatch(/Waffe/);
  });

  it("kostet Mana, Mana regeneriert jede Runde", () => {
    const battle = battleWith(withWeapons("sword-0"));
    expect(battle.mana).toBe(battle.maxMana);
    const after = attackRound(battle, rng(0.5), "sword").state;
    expect(after.mana).toBe(battle.maxMana - getAbility("sword").manaCost + MANA_REGEN);
    const empty = { ...battle, mana: 0 };
    expect(abilityBlocker(empty, "sword")).toMatch(/Mana/);
    expect(() => attackRound(empty, rng(0.5), "sword")).toThrow(/Mana/);
    expect(attackRound(empty, rng(0.5)).state.mana).toBe(MANA_REGEN);
  });

  it("Mana wächst mit Level und Intelligenz", () => {
    expect(maxManaFor(10, 20)).toBeGreaterThan(maxManaFor(1, 20));
    expect(maxManaFor(10, 30)).toBeGreaterThan(maxManaFor(10, 20));
  });

  it("Hinterhältiger Stoss trifft immer kritisch", () => {
    const events = attackRound(battleWith(withWeapons("dagger-0")), rng(0.99), "dagger").events;
    const hit = events.find((e) => e.type === "hit" && e.attacker === "hero");
    expect(hit?.type === "hit" && hit.crit).toBe(true);
  });

  it("Schwertwirbel trifft dreimal", () => {
    const events = attackRound(battleWith(withWeapons("sword-0")), rng(0.5), "sword").events;
    expect(events.filter((e) => e.type === "hit" && e.attacker === "hero")).toHaveLength(3);
  });

  it("Richterstoss, Wuchtiger Schlag und Feuerball machen deutlich mehr Schaden", () => {
    for (const [id, weapon] of [
      ["greatsword-0", "greatsword"],
      ["greathammer-0", "greathammer"],
      ["staff-0", "staff"],
    ] as const) {
      const battle = battleWith(withWeapons(id));
      const damage = (ability?: typeof weapon) => {
        const e = attackRound(battle, rng(0.5), ability).events.find((x) => x.type === "hit" && x.attacker === "hero");
        return e?.type === "hit" ? e.damage : 0;
      };
      expect(damage(weapon), weapon).toBeGreaterThan(damage() * 1.7);
    }
  });

  it("Betäubender Schlag verhindert den Gegenangriff", () => {
    const events = attackRound(battleWith(withWeapons("mace-0")), rng(0.5), "mace").events;
    expect(events.some((e) => e.type === "stunned")).toBe(true);
    expect(events.some((e) => e.type === "hit" && e.attacker === "enemy")).toBe(false);
  });

  it("Giftstrahl vergiftet für 3 Runden", () => {
    let state = attackRound(battleWith(withWeapons("scepter-0")), rng(0.5), "scepter").state;
    expect(state.log.some((e) => e.type === "poison")).toBe(true);
    expect(state.enemyEffects.poison?.roundsLeft).toBe(2);
    state = attackRound(attackRound(state, rng(0.5)).state, rng(0.5)).state;
    expect(state.log.filter((e) => e.type === "poison")).toHaveLength(3);
    expect(state.enemyEffects.poison).toBeUndefined();
  });

  it("Feuerball setzt den Gegner 2 Runden in Brand – zusätzlich zum Gift", () => {
    const equipment = withWeapons("staff-0", "scepter-0");
    let state = attackRound(battleWith(equipment), rng(0.5), "scepter").state;
    state = attackRound({ ...state, mana: state.maxMana }, rng(0.5), "staff").state;
    const burning = state.log.filter((e) => e.type === "burn");
    expect(burning).toHaveLength(1);
    expect(burning[0]).toMatchObject({ target: "enemy" });
    expect(state.enemyEffects.burn?.roundsLeft).toBe(1);
    // Gift und Feuer wirken in derselben Runde nebeneinander
    expect(state.log.filter((e) => e.round === 2).map((e) => e.type)).toEqual(
      expect.arrayContaining(["poison", "burn"]),
    );

    const before = state.enemy.hp;
    const { state: after, events } = attackRound(state, rng(0.5));
    expect(events.some((e) => e.type === "burn")).toBe(true);
    expect(after.enemyEffects.burn).toBeUndefined();
    // Feuer zieht tatsächlich LP ab: Treffer + Gift + Feuer = gesamter Verlust
    const dealt = events.reduce(
      (sum, e) => sum + ((e.type === "hit" && e.attacker === "hero") || e.type === "poison" || e.type === "burn" ? e.damage : 0),
      0,
    );
    expect(dealt).toBe(before - after.enemy.hp);
  });

  it("Spalter senkt die Rüstung des Gegners dauerhaft, Axtwurf ignoriert sie", () => {
    const battle = battleWith(withWeapons("greataxe-0"));
    const split = attackRound(battle, rng(0.5), "greataxe").state;
    expect(split.enemyEffects.armorBreak).toBe(0.3);
    const normalBefore = attackRound(battle, rng(0.5)).events[0];
    const normalAfter = attackRound(split, rng(0.5)).events[0];
    expect(normalAfter.type === "hit" && normalBefore.type === "hit" && normalAfter.damage).toBeGreaterThanOrEqual(
      normalBefore.type === "hit" ? normalBefore.damage : Infinity,
    );
    expect(getAbility("axe").ignoreArmor).toBe(true);
  });

  it("Spalter lässt den Gegner 3 Runden bluten", () => {
    let state = attackRound(battleWith(withWeapons("greataxe-0")), rng(0.5), "greataxe").state;
    expect(state.log.some((e) => e.type === "bleed" && e.target === "enemy")).toBe(true);
    expect(state.enemyEffects.bleed?.roundsLeft).toBe(2);
    state = attackRound(attackRound(state, rng(0.5)).state, rng(0.5)).state;
    expect(state.log.filter((e) => e.type === "bleed")).toHaveLength(3);
    expect(state.enemyEffects.bleed).toBeUndefined();
  });
});

describe("Bollwerk", () => {
  it("greift nicht an, blockt aber den nächsten gegnerischen Angriff komplett", () => {
    const battle = battleWith(withWeapons("sword-0", "shield-0"));
    const { state, events } = attackRound(battle, rng(0.5), "shield");
    expect(events.some((e) => e.type === "hit" && e.attacker === "hero")).toBe(false);
    expect(events.some((e) => e.type === "blocked")).toBe(true);
    expect(events.some((e) => e.type === "hit" && e.attacker === "enemy")).toBe(false);
    expect(state.hero.hp).toBe(battle.hero.hp);
    expect(state.heroEffects.bulwark).toBeFalsy(); // verbraucht
  });
});

describe("Boss-Fähigkeiten", () => {
  const bosses = AREAS.map((a) => a.creatures.find((c) => c.boss)!);
  const bossBattle = (bossId: string, equipment = withWeapons("sword-0", "shield-0")): BattleState => {
    const battle = startBattle("b", "Held", getHeroCombatProfile(hero, equipment), getCreature(bossId).creature);
    // Unverwundbar machen, damit jede Runde vollständig abläuft
    return {
      ...battle,
      hero: { ...battle.hero, hp: 999_999, maxHp: 999_999 },
      enemy: { ...battle.enemy, hp: 999_999, maxHp: 999_999 },
    };
  };
  /** Spielt bis zur ersten Runde, in der der Boss seine Fähigkeit einsetzt. */
  const toAbilityRound = (battle: BattleState) => {
    let state = battle;
    while (roundsUntilBossAbility(state.creatureId, state.round) !== 0) state = attackRound(state, rng(0.5)).state;
    return state;
  };

  it("jeder Gebietsboss hat eine Fähigkeit, normale Kreaturen keine", () => {
    for (const boss of bosses) expect(getBossAbility(boss.id), boss.id).not.toBeNull();
    expect(getBossAbility("grey-wolf")).toBeNull();
  });

  it("wird angekündigt und in der fälligen Runde eingesetzt", () => {
    const battle = bossBattle("goblin-chief");
    expect(roundsUntilBossAbility("goblin-chief", 1)).toBe(2);
    expect(roundsUntilBossAbility("goblin-chief", 2)).toBe(1);
    const due = toAbilityRound(battle);
    expect(due.round).toBe(3);
    const { events } = attackRound(due, rng(0.5));
    expect(events.some((e) => e.type === "bossAbility")).toBe(true);
    expect(events.filter((e) => e.type === "hit" && e.attacker === "enemy")).toHaveLength(3); // Rasender Hieb
  });

  it("Bollwerk blockt die Boss-Fähigkeit samt Gift, Betäubung verhindert sie", () => {
    const due = toAbilityRound(bossBattle("ancient-lizard"));
    const blocked = attackRound(due, rng(0.5), "shield");
    expect(blocked.events.some((e) => e.type === "blocked")).toBe(true);
    expect(blocked.state.heroEffects.poison).toBeUndefined();

    const dueMace = toAbilityRound(bossBattle("ancient-lizard", withWeapons("mace-0")));
    const stunned = attackRound(dueMace, rng(0.5), "mace");
    expect(stunned.events.some((e) => e.type === "bossAbility")).toBe(false);
  });

  it("Giftbiss vergiftet, Feueratem setzt in Brand, Lebensentzug heilt, Lähmender Blick raubt Mana", () => {
    const bite = attackRound(toAbilityRound(bossBattle("ancient-lizard")), rng(0.5)).state;
    expect(bite.heroEffects.poison?.roundsLeft).toBe(3);
    const poisoned = attackRound(bite, rng(0.5));
    expect(poisoned.events.some((e) => e.type === "poison" && e.target === "hero")).toBe(true);

    const lich = toAbilityRound(bossBattle("lich-king"));
    const hurtLich = { ...lich, enemy: { ...lich.enemy, hp: 1000 } };
    expect(attackRound(hurtLich, rng(0.5)).events.some((e) => e.type === "drain")).toBe(true);

    const breath = attackRound(toAbilityRound(bossBattle("ignaroth")), rng(0.5)).state;
    expect(breath.heroEffects.burn?.roundsLeft).toBe(2);
    expect(breath.heroEffects.poison).toBeUndefined();
    const burning = attackRound(breath, rng(0.5));
    expect(burning.events.some((e) => e.type === "burn" && e.target === "hero")).toBe(true);

    const eye = toAbilityRound(bossBattle("cave-eye"));
    const gaze = attackRound(eye, rng(0.5));
    expect(gaze.events.some((e) => e.type === "manaBurn")).toBe(true);
    expect(gaze.state.mana).toBeLessThan(eye.mana);
  });
});

describe("Schild-Skill", () => {
  it("erhöht die Rüstung angelegter Schilde, nicht den Schaden", () => {
    const equipment = withWeapons("sword-30", "shield-30");
    const shieldArmor = getItemStats(equipment.weapon2!).armor;
    const plain = getHeroCombatProfile({ ...hero, totalXp: xpForNextLevel(1) * 40 }, equipment);
    const trained = getHeroCombatProfile(
      { ...hero, totalXp: xpForNextLevel(1) * 40, skills: { shield: MAX_SKILL_RANK } },
      equipment,
    );
    expect(trained.armor).toBe(plain.armor + Math.round(shieldArmor * MAX_SKILL_RANK * SKILL_BONUS_PER_RANK));
    expect(trained.damage).toBeCloseTo(plain.damage);
  });
});

describe("Skilltree-Grenze", () => {
  it("höchstens 5 Ränge à 2 % – zu hohe alte Ränge werden gekappt und die Punkte frei", () => {
    expect(MAX_SKILL_RANK * SKILL_BONUS_PER_RANK).toBeCloseTo(0.1);
    const old = { ...hero, totalXp: xpForNextLevel(1) * 20, skills: { sword: 8 }, abilities: [] };
    const clamped = { ...old, skills: clampSkills(old.skills) };
    expect(clamped.skills.sword).toBe(MAX_SKILL_RANK);
    expect(unspentSkillPoints(clamped)).toBe(unspentSkillPoints({ ...old, skills: {} }) - MAX_SKILL_RANK);
  });
});
