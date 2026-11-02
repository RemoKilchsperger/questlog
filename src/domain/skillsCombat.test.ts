import { describe, expect, it } from "vitest";
import { fullWeapon } from "../test/weapons";
import { MANA_REGEN } from "./abilities";
import { abilityCost, attackRound, DEFEND, DEFEND_MANA, drinkPotion, getHeroCombatProfile, startBattle, type BattleState } from "./combat";
import { getCreature } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { xpForNextLevel } from "./leveling";
import { getPotion, POTIONS } from "./potions";
import { SKILL, type SkillRanks } from "./skills";
import type { Character, Equipment } from "./types";

const heroAt = (level: number): Character => {
  let totalXp = 0;
  for (let l = 1; l < level; l++) totalXp += xpForNextLevel(l);
  return { name: "Held", totalXp, gold: 0, essence: 0, stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 }, spentPoints: 0, skills: {} };
};
const withWeapons = (...ids: string[]): Equipment => ({
  ...EMPTY_EQUIPMENT,
  weapon1: ids[0] ? fullWeapon(ids[0], "common", "w1") : null,
  weapon2: ids[1] ? fullWeapon(ids[1], "common", "w2") : null,
});
/** Kampf gegen einen sehr zähen Wolf – mit diesen Skills (direkt in den Kampf gelegt). */
const battle = (skills: SkillRanks, ...weapons: string[]): BattleState => {
  const start = startBattle("b", "Held", getHeroCombatProfile(heroAt(30), withWeapons(...(weapons.length ? weapons : ["sword-30"]))), getCreature("grey-wolf").creature);
  return { ...start, mana: 999, maxMana: 999, skills, enemy: { ...start.enemy, hp: 99_999, maxHp: 99_999 } };
};
const rng = (value: number) => () => value;
/** Kein Krit, mittlere Streuung – der Wolf trifft */
const calm = rng(0.5);
type Events = ReturnType<typeof attackRound>["events"];
const heroDamage = (events: Events) => events.reduce((sum, e) => sum + (e.type === "hit" && e.attacker === "hero" ? e.damage : 0), 0);
const enemyDamage = (events: Events) => events.reduce((sum, e) => sum + (e.type === "hit" && e.attacker === "enemy" ? e.damage : 0), 0);

describe("Klinge", () => {
  it("Gezahnte Klingen: eigenes Bluten macht mehr Schaden", () => {
    const plain = attackRound(battle({}), calm, "sword-3").events.find((e) => e.type === "bleed")!;
    const sharp = attackRound(battle({ serratedEdge: 3 }), calm, "sword-3").events.find((e) => e.type === "bleed")!;
    expect(sharp.type === "bleed" && plain.type === "bleed" && sharp.damage / plain.damage).toBeCloseTo(1 + 3 * SKILL.serratedEdge, 1);
  });

  it("Adrenalin: Mana für jeden kritischen Treffer", () => {
    const start = { ...battle({ adrenaline: 3 }), mana: 0 };
    // rng 0: jeder Treffer ist kritisch
    expect(attackRound(start, rng(0)).state.mana).toBe(3 * SKILL.adrenaline + MANA_REGEN);
    expect(attackRound({ ...start, skills: {} }, rng(0)).state.mana).toBe(MANA_REGEN);
  });

  it("Blutgeruch: mehr Krit-Chance gegen blutende Gegner", () => {
    const start = battle({ bloodScent: 3 });
    const bleeding = { ...start, enemyEffects: { bleed: { damage: 1, roundsLeft: 3 } } };
    // Knapp über der normalen Krit-Chance: nur gegen den blutenden Gegner kritisch
    const roll = rng(start.hero.critChance + 0.01);
    expect(attackRound(start, roll).events.some((e) => e.type === "hit" && e.attacker === "hero" && e.crit)).toBe(false);
    expect(attackRound(bleeding, roll).events.some((e) => e.type === "hit" && e.attacker === "hero" && e.crit)).toBe(true);
  });

  it("Schnitter: kritische Treffer lassen bluten – Offene Wunde verlängert das Bluten", () => {
    expect(attackRound(battle({ reaper: 1 }), rng(0)).events.some((e) => e.type === "bleed" && e.target === "enemy")).toBe(true);
    expect(attackRound(battle({}), rng(0)).events.some((e) => e.type === "bleed")).toBe(false);
    const bleeding = (skills: SkillRanks) => ({ ...battle(skills), enemyEffects: { bleed: { damage: 1, roundsLeft: 2 } } });
    expect(attackRound(bleeding({ openWound: 1 }), rng(0)).state.enemyEffects.bleed?.roundsLeft).toBe(2);
    expect(attackRound(bleeding({}), rng(0)).state.enemyEffects.bleed?.roundsLeft).toBe(1);
  });

  it("Durchschlag: kritische Treffer ignorieren die Rüstung", () => {
    const armored = (skills: SkillRanks) => {
      const b = battle(skills);
      return { ...b, enemy: { ...b.enemy, armor: 2000 } };
    };
    expect(heroDamage(attackRound(armored({ piercing: 1 }), rng(0)).events)).toBeGreaterThan(
      3 * heroDamage(attackRound(armored({}), rng(0)).events),
    );
  });

  it("Hinrichter: mehr Schaden gegen angeschlagene Gegner", () => {
    const low = (skills: SkillRanks) => {
      const b = battle(skills);
      return { ...b, enemy: { ...b.enemy, hp: 20_000 } };
    };
    const ratio = heroDamage(attackRound(low({ executioner: 3 }), calm).events) / heroDamage(attackRound(low({}), calm).events);
    expect(ratio).toBeCloseTo(1 + 3 * SKILL.executioner.bonus, 1);
  });

  it("Blutsturz: läuft das Bluten aus, platzt die Wunde", () => {
    const start = { ...battle({ bloodburst: 1 }), enemyEffects: { bleed: { damage: 10, roundsLeft: 1 } } };
    const events = attackRound(start, calm).events;
    expect(events).toContainEqual({ type: "bleed", target: "enemy", damage: 10 * SKILL.bloodburst, burst: true });
    // Ohne den Knoten nicht, und auch nicht, solange es noch weiterblutet
    expect(attackRound({ ...start, skills: {} }, calm).events.some((e) => e.type === "bleed" && e.burst)).toBe(false);
    expect(attackRound({ ...start, enemyEffects: { bleed: { damage: 10, roundsLeft: 2 } } }, calm).events.some((e) => e.type === "bleed" && e.burst)).toBe(false);
  });
});

describe("Wehr", () => {
  it("Gefasst: Abwehren gibt mehr Mana", () => {
    const start = { ...battle({ composure: 2 }), mana: 0 };
    expect(attackRound(start, calm, DEFEND).events).toContainEqual({ type: "defend", mana: DEFEND_MANA + 2 * SKILL.composure });
  });

  it("Gegenschlag: die Aktion nach dem Abwehren trifft stärker", () => {
    const after = (skills: SkillRanks) => attackRound(attackRound(battle(skills), calm, DEFEND).state, calm);
    const ratio = heroDamage(after({ riposte: 3 }).events) / heroDamage(after({}).events);
    expect(ratio).toBeCloseTo(1 + 3 * SKILL.riposte, 1);
    // Danach ist er verbraucht
    expect(after({ riposte: 3 }).state.heroEffects.riposte).toBeUndefined();
  });

  it("Fels: beim Abwehren kommt noch weniger durch", () => {
    // Ein kräftiger Wolf – sonst verfälscht das Runden kleiner Treffer den Vergleich
    const strong = (skills: SkillRanks) => {
      const b = battle(skills);
      return { ...b, enemy: { ...b.enemy, damage: 2000 } };
    };
    const plain = enemyDamage(attackRound(strong({}), calm, DEFEND).events);
    const rock = enemyDamage(attackRound(strong({ rock: 1 }), calm, DEFEND).events);
    expect(rock / plain).toBeCloseTo(SKILL.rock / 0.5, 1);
  });

  it("Stachelwehr: wer den Abwehrenden trifft, erleidet die Hälfte selbst", () => {
    const events = attackRound(battle({ spikes: 1 }), calm, DEFEND).events;
    const thorns = events.find((e) => e.type === "thorns");
    expect(thorns?.type === "thorns" && thorns.damage).toBe(Math.round(enemyDamage(events) * SKILL.spikes));
    // Ohne Abwehren nicht
    expect(attackRound(battle({ spikes: 1 }), calm).events.some((e) => e.type === "thorns")).toBe(false);
  });

  it("Erschütterung und Unterbrecher: Wer betäubt, macht danach mehr Schaden und bekommt Mana", () => {
    // Betäubender Schlag betäubt sicher
    const start = { ...battle({ concussion: 3, interrupter: 1 }, "mace-30"), mana: 100 };
    const stunned = attackRound(start, calm, "mace");
    expect(stunned.state.enemyEffects.dazed).toBe(1);
    const cost = abilityCost(start, "mace");
    expect(stunned.state.mana).toBe(100 - cost + SKILL.interrupter + MANA_REGEN);
    const next = (skills: SkillRanks) => attackRound({ ...stunned.state, skills }, calm);
    expect(heroDamage(next({ concussion: 3 }).events) / heroDamage(next({}).events)).toBeCloseTo(1 + 3 * SKILL.concussion, 1);
    // Eine Runde später ist die Markierung weg
    expect(next({ concussion: 3 }).state.enemyEffects.dazed).toBeUndefined();
  });

  it("Wuchtschlag: Betäuben und Einfrieren mit Chance gelingt öfter", () => {
    // Eisstrahl friert mit 40 % ein – ein Wurf von 0,45 reicht erst mit Wuchtschlag
    const roll = rng(0.45);
    expect(attackRound(battle({ heavyBlow: 3 }, "staff-30"), roll, "staff-3").events.some((e) => e.type === "stunned")).toBe(true);
    expect(attackRound(battle({}, "staff-30"), roll, "staff-3").events.some((e) => e.type === "stunned")).toBe(false);
  });

  it("Zorn des Bollwerks: ein Stapel pro abgewehrter Runde, höchstens fünf", () => {
    let state = battle({ wrath: 1 });
    for (let i = 0; i < 7; i++) state = attackRound(state, calm, DEFEND).state;
    expect(state.heroEffects.wrath).toBe(SKILL.wrath.max);
    // Nach dem Abwehren zählt der Gegenschlag nicht – den hat dieser Held nicht
    const calmState = { ...state, heroEffects: { ...state.heroEffects, wrath: undefined } };
    const ratio = heroDamage(attackRound(state, calm).events) / heroDamage(attackRound(calmState, calm).events);
    expect(ratio).toBeCloseTo(1 + SKILL.wrath.max * SKILL.wrath.bonus, 1);
    // Ohne den Knoten gibt es keine Stapel
    expect(attackRound(battle({}), calm, DEFEND).state.heroEffects.wrath).toBeUndefined();
  });
});

describe("Arkan", () => {
  it("Manafluss: mehr Mana pro Runde", () => {
    expect(attackRound({ ...battle({ manaFlow: 3 }), mana: 0 }, calm).state.mana).toBe(MANA_REGEN + 3 * SKILL.manaFlow);
  });

  it("Eröffnung: in der ersten Runde kosten Fähigkeiten weniger", () => {
    const start = battle({ opening: 2 }, "staff-30");
    const full = abilityCost({ ...start, skills: {} }, "staff");
    expect(abilityCost(start, "staff")).toBe(Math.round(full * (1 - 2 * SKILL.opening)));
    expect(abilityCost({ ...start, round: 2 }, "staff")).toBe(full);
  });

  it("Funkenflug und Pyromant: eigenes Feuer stärker und länger", () => {
    const burn = (skills: SkillRanks) => attackRound(battle(skills, "staff-30"), calm, "staff").state.enemyEffects.burn!;
    // Kleine Zahlen – das Runden verschiebt das Verhältnis etwas
    expect(Math.abs(burn({ kindling: 3 }).damage / burn({}).damage - (1 + 3 * SKILL.kindling))).toBeLessThan(0.1);
    expect(burn({ pyromancer: 1 }).roundsLeft).toBe(burn({}).roundsLeft + 1);
  });

  it("Kryomant und Schmelzen: Feuer auf einen Eingefrorenen trifft doppelt und taut ihn auf", () => {
    // Eisstrahl friert ein (rng 0) – die Markierung bleibt für die nächste Runde
    const frozen = attackRound(battle({ melt: 1 }, "staff-30"), rng(0), "staff-3").state;
    expect(frozen.enemyEffects.chilled).toBe(1);
    const fire = (skills: SkillRanks) => attackRound({ ...frozen, skills, cooldowns: {} }, calm, "staff");
    expect(heroDamage(fire({ melt: 1 }).events) / heroDamage(fire({}).events)).toBeCloseTo(SKILL.melt, 1);
    expect(fire({ melt: 1 }).state.enemyEffects.chilled).toBeUndefined();
    expect(heroDamage(fire({ cryomancer: 1 }).events) / heroDamage(fire({}).events)).toBeCloseTo(1 + SKILL.cryomancer.taken, 1);
  });

  it("Nachhall: manchmal keine Abklingzeit", () => {
    expect(attackRound(battle({ afterglow: 3 }, "staff-30"), rng(0), "staff").state.cooldowns?.staff).toBeUndefined();
    expect(attackRound(battle({}, "staff-30"), rng(0), "staff").state.cooldowns?.staff).toBeGreaterThan(0);
  });

  it("Echo: jede dritte Fähigkeit kostet nichts und trifft noch einmal halb", () => {
    let state = battle({ echo: 1 }, "greatsword-30");
    const used: Events[] = [];
    for (let i = 0; i < 3; i++) {
      const round = attackRound({ ...state, cooldowns: {} }, calm, "greatsword");
      used.push(round.events);
      state = round.state;
    }
    const third = used[2].find((e) => e.type === "ability");
    expect(third).toMatchObject({ manaCost: 0, echo: true });
    expect(used[0].find((e) => e.type === "ability")).not.toMatchObject({ echo: true });
    expect(heroDamage(used[2]) / heroDamage(used[0])).toBeCloseTo(1 + SKILL.echo.share, 1);
  });
});

describe("Plage", () => {
  it("Schleichendes Gift: Gift stapelt sich – Fäulnis lässt es bei drei Stapeln platzen", () => {
    const poison = (skills: SkillRanks, times: number) => {
      let state = battle(skills, "scepter-30");
      const events: Events = [];
      for (let i = 0; i < times; i++) {
        const round = attackRound({ ...state, cooldowns: {} }, calm, "scepter");
        events.push(...round.events);
        state = round.state;
      }
      return { state, events };
    };
    expect(poison({ creepingPoison: 1 }, 2).state.enemyEffects.poison?.stacks).toBe(2);
    expect(poison({}, 2).state.enemyEffects.poison?.stacks).toBeUndefined();
    const rot = poison({ rot: 1 }, 3);
    expect(rot.events.some((e) => e.type === "poison" && e.burst)).toBe(true);
    expect(rot.state.enemyEffects.poison).toBeUndefined();
  });

  it("Kräuterkunde: Heiltränke heilen mehr", () => {
    const potion = POTIONS.find((p) => p.effect.kind === "heal")!;
    const hurt = (skills: SkillRanks) => {
      const b = battle(skills);
      return { ...b, hero: { ...b.hero, hp: 1 } };
    };
    const heal = (skills: SkillRanks) => drinkPotion(hurt(skills), getPotion(potion.id)).state.hero.hp - 1;
    expect(heal({ herbalism: 2 }) / heal({})).toBeCloseTo(1 + 2 * SKILL.herbalism, 1);
  });

  it("Gegengift: Gift, Feuer und Bluten schaden weniger", () => {
    const poisoned = (skills: SkillRanks) => ({ ...battle(skills), heroEffects: { poison: { damage: 100, roundsLeft: 3 } } });
    const taken = (skills: SkillRanks) => attackRound(poisoned(skills), calm).events.find((e) => e.type === "poison" && e.target === "hero");
    expect(taken({ antidote: 2 })).toMatchObject({ damage: Math.round(100 * (1 - 2 * SKILL.antidote)) });
  });

  it("Blutsauger: heilt um einen Teil des Schadens", () => {
    // Ein kräftiger Held – bei kleinen Treffern rundet der Anteil auf 0
    const start = (skills: SkillRanks) => {
      const b = battle(skills);
      return { ...b, hero: { ...b.hero, hp: 10, damage: 1000 } };
    };
    expect(attackRound(start({ leech: 1 }), calm).events.some((e) => e.type === "selfHeal")).toBe(true);
    expect(attackRound(start({}), calm).events.some((e) => e.type === "selfHeal")).toBe(false);
  });

  it("Schemen: weicht Angriffen manchmal aus", () => {
    const events = attackRound(battle({ phantom: 1 }), rng(0)).events;
    expect(events).toContainEqual({ type: "dodged" });
    expect(enemyDamage(events)).toBe(0);
  });

  it("Notverband: heilt einmal pro Kampf unter 30 % LP", () => {
    const low = (state: BattleState) => ({ ...state, hero: { ...state.hero, hp: Math.round(state.hero.maxHp * 0.2) } });
    const first = attackRound(low(battle({ bandage: 3 })), calm);
    expect(first.state.heroEffects.bandaged).toBe(true);
    expect(first.events.some((e) => e.type === "selfHeal")).toBe(true);
    expect(attackRound(low(first.state), calm).events.some((e) => e.type === "selfHeal")).toBe(false);
  });

  it("Seuche: fällt ein vergifteter Begleiter, springt sein Gift über", () => {
    const start = battle({ plague: 1 });
    const add = { uid: "add-1", creatureId: "grey-wolf", combatant: { ...start.enemy, hp: 1, maxHp: 100 }, effects: { poison: { damage: 7, roundsLeft: 3 } } };
    const withAdd = { ...start, adds: [add], target: "add-1" };
    expect(attackRound(withAdd, calm).state.enemyEffects.poison).toBeDefined();
    expect(attackRound({ ...withAdd, skills: {} }, calm).state.enemyEffects.poison).toBeUndefined();
  });
});
