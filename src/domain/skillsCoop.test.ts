import { describe, expect, it } from "vitest";
import { MANA_REGEN } from "./abilities";
import { DEFEND_MANA, type HeroCombatProfile } from "./combat";
import { BOSS, coopAbilityCost, resolveRound, startCoopBattle, type CoopBattleState, type CoopEvent, type CoopPlayer } from "./coopCombat";
import { SKILL, type SkillRanks } from "./skills";

const profile = (overrides: Partial<HeroCombatProfile> = {}): HeroCombatProfile => ({
  level: 20,
  maxHp: 400,
  damage: 40,
  armor: 60,
  critChance: 0,
  goldBonus: 0,
  maxMana: 80,
  abilities: [],
  heroClass: null,
  critMultiplier: 1.5,
  ...overrides,
});
const player = (id: string, overrides: Partial<HeroCombatProfile> = {}): CoopPlayer => ({ id, name: id, profile: profile(overrides) });
const rng = (value: number) => () => value;
/** Zwei Helden gegen eine praktisch unverwundbare Hydra – `a` mit diesen Skills */
const start = (skills: SkillRanks, overrides: Partial<HeroCombatProfile> = {}): CoopBattleState => {
  const state = startCoopBattle("k", "swamp-hydra", [player("a", { skills, ...overrides }), player("b")], 0);
  return { ...state, boss: { ...state.boss, hp: 999_999, maxHp: 999_999 } };
};
const damageBy = (events: CoopEvent[], id: string) =>
  events.reduce((sum, e) => sum + (e.type === "hit" && e.attacker === id ? e.damage : 0), 0);

describe("Skilltree im Koop", () => {
  it("die Skills kommen aus dem Profil mit in den Kampf", () => {
    const state = start({ keenEdge: 2 });
    expect(state.heroes[0].skills).toEqual({ keenEdge: 2 });
    expect(state.heroes[1].skills).toBeUndefined();
  });

  it("Gefasst und Manafluss: mehr Mana beim Abwehren und pro Runde", () => {
    const state = start({ composure: 2, manaFlow: 3 });
    const mana0 = { ...state, heroes: state.heroes.map((h) => ({ ...h, mana: 0 })) };
    const { state: next, events } = resolveRound(mana0, { a: { defend: true }, b: { defend: true } }, rng(0.5), 0);
    expect(events).toContainEqual({ type: "defend", heroId: "a", mana: DEFEND_MANA + 2 * SKILL.composure });
    expect(next.heroes[0].mana).toBe(DEFEND_MANA + 2 * SKILL.composure + MANA_REGEN + 3 * SKILL.manaFlow);
    expect(next.heroes[1].mana).toBe(DEFEND_MANA + MANA_REGEN);
  });

  it("Hinrichter wirkt nur für den Helden mit dem Knoten", () => {
    const low = (state: CoopBattleState) => ({ ...state, boss: { ...state.boss, hp: 100_000 } });
    const events = resolveRound(low(start({ executioner: 3 })), {}, rng(0.5), 0).events;
    expect(damageBy(events, "a") / damageBy(events, "b")).toBeCloseTo(1 + 3 * SKILL.executioner.bonus, 1);
  });

  it("Gezahnte Klingen und Blutsturz zählen für den Verursacher des Blutens", () => {
    const state = start({ serratedEdge: 3, bloodburst: 1, reaper: 1 }, { critChance: 1 });
    // a trifft kritisch und lässt bluten (Schnitter), stärker durch Gezahnte Klingen
    const first = resolveRound(state, {}, rng(0.5), 0).state;
    expect(first.bossEffects.bleed?.sourceId).toBe("a");
    // Läuft es aus, platzt die Wunde
    const ending = { ...first, bossEffects: { bleed: { damage: 10, roundsLeft: 1, sourceId: "a" } } };
    const events = resolveRound({ ...ending, heroes: ending.heroes.map((h) => ({ ...h, combatant: { ...h.combatant, critChance: 0 } })) }, {}, rng(0.5), 0).events;
    expect(events).toContainEqual({ type: "bleed", target: BOSS, damage: 10 * SKILL.bloodburst, burst: true });
  });

  it("Eröffnung und Echo senken die Manakosten", () => {
    const state = start({ opening: 2, echo: 1 }, { abilities: ["sword"] });
    const full = coopAbilityCost(state.heroes[0], "sword", 2);
    expect(coopAbilityCost(state.heroes[0], "sword", 1)).toBe(Math.round(full * (1 - 2 * SKILL.opening)));
    const third = { ...state.heroes[0], effects: { casts: 2 } };
    expect(coopAbilityCost(third, "sword", 5)).toBe(0);
  });

  it("Schemen: weicht dem Boss aus", () => {
    // Der Boss greift den Helden mit der meisten Bedrohung an – bei rng 0 den ersten
    const events = resolveRound(start({ phantom: 1 }), {}, rng(0), 0).events;
    const dodged = events.filter((e) => e.type === "dodged");
    const hitsOnA = events.filter((e) => e.type === "hit" && e.target === "a");
    expect(dodged.length + hitsOnA.length).toBeGreaterThan(0);
    expect(hitsOnA).toHaveLength(0);
  });

  it("Zorn des Bollwerks: Stapel für den Abwehrenden, der getroffen wird", () => {
    let state = start({ wrath: 1 });
    // b wehrt nicht ab und hat keine Bedrohung … trotzdem kann der Boss jeden treffen – a wehrt jede Runde ab
    for (let i = 0; i < 4; i++) state = resolveRound(state, { a: { defend: true }, b: { defend: true } }, rng(0), 0).state;
    expect(state.heroes[0].effects.wrath ?? 0).toBeGreaterThan(0);
    expect(state.heroes[1].effects.wrath).toBeUndefined();
  });
});
