import { describe, expect, it } from "vitest";
import { MANA_REGEN } from "./abilities";
import { DEFEND_MANA, type HeroCombatProfile } from "./combat";
import { BOSS, coopAbilityBlocker, coopAbilityCost, resolveRound, startCoopBattle, type CoopBattleState, type CoopEvent, type CoopPlayer } from "./coopCombat";
import { layDot } from "./combatCore";
import { SKILL, WARD_MAX_SHARE, type SkillRanks } from "./skills";

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
/** Zwei Helden gegen einen praktisch unverwundbaren Raid-Boss (Standard: die Hydra) – `a` mit diesen Skills */
const start = (skills: SkillRanks, overrides: Partial<HeroCombatProfile> = {}, bossId = "swamp-hydra", b: Partial<HeroCombatProfile> = {}): CoopBattleState => {
  const state = startCoopBattle("k", bossId, [player("a", { skills, ...overrides }), player("b", b)], 0);
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
    const full = coopAbilityCost(state.heroes[0], "sword", 3);
    expect(coopAbilityCost(state.heroes[0], "sword", 1)).toBe(Math.round(full * (1 - 2 * SKILL.opening.share)));
    expect(coopAbilityCost(state.heroes[0], "sword", 2)).toBe(Math.round(full * (1 - 2 * SKILL.opening.share)));
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

describe("Neue Knoten im Koop (Etappe 3)", () => {
  it("Konzentration: Angriff oder Abwehren gibt mehr Mana, eine Fähigkeit nicht", () => {
    const state = start({ concentration: 3 }, { abilities: ["sword"] });
    const mana0 = { ...state, heroes: state.heroes.map((h) => ({ ...h, mana: 0 })) };
    expect(resolveRound(mana0, {}, rng(0.5), 0).state.heroes[0].mana).toBe(MANA_REGEN + 3 * SKILL.concentration);
    const rich = { ...state, heroes: state.heroes.map((h) => ({ ...h, mana: 80 })) };
    const cast = resolveRound(rich, { a: { ability: "sword" } }, rng(0.5), 0).state.heroes[0];
    expect(cast.mana).toBe(Math.min(80, 80 - coopAbilityCost(state.heroes[0], "sword", 1) + MANA_REGEN));
  });

  it("Deckung senkt die Kosten von Bollwerk", () => {
    const state = start({ cover: 2 }, { abilities: ["shield"] });
    expect(coopAbilityCost(state.heroes[0], "shield", 5)).toBe(coopAbilityCost(state.heroes[1], "shield", 5) - 2 * SKILL.cover.mana);
  });

  it("Wirbelnde Klingen und Vergiftete Waffen wirken pro Held", () => {
    const state = start({ whirlingBlades: 2, poisonedWeapons: 3 }, { abilities: ["sword"] });
    const whirl = resolveRound(state, { a: { ability: "sword" } }, rng(0.5), 0).events;
    const plainB = start({}, { abilities: ["sword"] });
    const whirlB = resolveRound(plainB, { a: { ability: "sword" } }, rng(0.5), 0).events;
    expect(damageBy(whirl, "a") / damageBy(whirlB, "a")).toBeCloseTo(1 + 2 * SKILL.whirlingBlades, 1);
    // rng 0: Gift durch den normalen Angriff von a, mit a als Verursacher (die Hydra ist gegen Gift immun)
    const giant = start({ poisonedWeapons: 3 }, {}, "frost-giant");
    const poisoned = resolveRound(giant, {}, rng(0), 0).state.bossEffects.poison;
    expect(poisoned?.sourceId).toBe("a");
  });
});

describe("Zweite Meisterschaften im Koop (Etappe 4)", () => {
  /** Zwei Schnitte-Helden mit Schwertwirbel gegen den Frostriesen (blutet) */
  const cutters = () => start({ thousandCuts: 1 }, { abilities: ["sword"] }, "frost-giant", { skills: { thousandCuts: 1 }, abilities: ["sword"] });

  it("Tausend Schnitte: ein gemeinsamer Stapel pro Gegner – zusammen höchstens 5", () => {
    const { state, events } = resolveRound(cutters(), { a: { ability: "sword" }, b: { ability: "sword" } }, rng(0.5), 0);
    const bleed = state.bossEffects.bleed!;
    expect(bleed.stacks).toBe(SKILL.thousandCuts.max);
    // Stapel pro Held zusammen = Stapel; b hat zuletzt gelegt
    const by = bleed.stacksBy ?? {};
    expect(Object.values(by).reduce((s, n) => s + n, 0)).toBe(SKILL.thousandCuts.max);
    expect(by.b).toBeGreaterThan(0);
    expect(bleed.sourceId).toBe("b");
    expect(events.some((e) => e.type === "bleed" && e.stacks === SKILL.thousandCuts.max)).toBe(true);
  });

  it("Tausend Schnitte: die Bedrohung des Blutens verteilt sich nach Stapeln", () => {
    const state = cutters();
    const bleeding = {
      ...state,
      bossEffects: { bleed: { damage: 1000, roundsLeft: 2, stacks: 4, sourceId: "a", stacksBy: { a: 1, b: 3 } } },
    };
    // Beide wehren ab: Bedrohung nur aus dem Bluten
    const next = resolveRound(bleeding, { a: { defend: true }, b: { defend: true } }, rng(0.5), 0).state;
    const [a, b] = next.heroes;
    expect(b.threat / a.threat).toBeCloseTo(3, 0);
  });

  it("Axtwurf ersetzt 3 Stapel à 8 %, aber nicht 5 Stapel", () => {
    const fx = (stacks: number) => ({ bleed: { damage: 8 * stacks, roundsLeft: 2, stacks, sourceId: "a" } });
    const axe = (stacks: number) =>
      layDot(fx(stacks), { creatureId: "frost-giant", kind: "bleed", base: 25, rounds: 2, skills: undefined, alive: true, own: undefined, tag: { sourceId: "b" } });
    const three = axe(3);
    const five = axe(5);
    expect(!three.immune && three.fx.bleed).toMatchObject({ damage: 25, sourceId: "b" });
    expect(!five.immune && five.fx.bleed).toMatchObject({ damage: 40, stacks: 5, sourceId: "a" });
  });

  it("Wächterschwur: Abwehren zieht 60 % der Bedrohung – Bollwerk gewinnt gegen ihn", () => {
    const state = start({ guardOath: 1 }, {}, "frost-giant", { abilities: ["shield"] });
    const threat = { ...state, heroes: state.heroes.map((h) => ({ ...h, threat: h.id === "b" ? 1000 : 0 })) };
    // a wehrt ab, b greift an: a hält danach 60 % der Gruppe
    const oath = resolveRound(threat, { a: { defend: true } }, rng(0.5), 0).state.heroes;
    const share = oath[0].threat / (oath[0].threat + oath[1].threat);
    expect(share).toBeGreaterThan(0.55);
    expect(share).toBeLessThan(0.65);
    // b mit Bollwerk zur selben Zeit: der höhere Anteil gewinnt
    const both = resolveRound(threat, { a: { defend: true }, b: { ability: "shield" } }, rng(0.5), 0).state.heroes;
    expect(both[1].threat).toBeGreaterThan(both[0].threat);
  });

  it("Blutmagie: der Server rechnet die LP-Kosten selbst – nicht unter 25 %", () => {
    const state = start({ bloodMagic: 1 }, { abilities: ["sword"] }, "frost-giant");
    const broke = { ...state, heroes: state.heroes.map((h) => ({ ...h, mana: 0 })) };
    const cost = coopAbilityCost(broke.heroes[0], "sword", 1);
    expect(coopAbilityBlocker(broke.heroes[0], "sword", null, 1)).toBeNull();
    const { events } = resolveRound(broke, { a: { ability: "sword" } }, rng(0.5), 0);
    expect(events).toContainEqual({ type: "bloodMagic", heroId: "a", damage: cost * SKILL.bloodMagic.hpPerMana });
    const weak = { ...broke.heroes[0], combatant: { ...broke.heroes[0].combatant, hp: 100 + cost } };
    expect(coopAbilityBlocker(weak, "sword", null, 1)).toMatch(/Blutmagie/);
    // Ungültig: Der Held greift normal an, ohne LP zu zahlen
    const tooWeak = { ...broke, heroes: [weak, broke.heroes[1]] };
    expect(resolveRound(tooWeak, { a: { ability: "sword" } }, rng(0.5), 0).events.some((e) => e.type === "bloodMagic")).toBe(false);
  });

  it("Lebensband: die Gruppenheilung eines Heilers mit Lebensband wird beim Mitspieler zum Schild", () => {
    const state = start({ lifebond: 1 }, { abilities: ["staff-5"] }, "frost-giant");
    const { state: next, events } = resolveRound(state, { a: { ability: "staff-5" } }, rng(0.5), 0);
    expect(events).toContainEqual(expect.objectContaining({ type: "shieldGained", heroId: "b", by: "a" }));
    expect(next.heroes[1].effects.ward ?? 0).toBeLessThanOrEqual(Math.round(next.heroes[1].combatant.maxHp * WARD_MAX_SHARE));
    // Ohne Lebensband beim Heiler kein Schild
    const plain = start({}, { abilities: ["staff-5"] }, "frost-giant");
    expect(resolveRound(plain, { a: { ability: "staff-5" } }, rng(0.5), 0).events.some((e) => e.type === "shieldGained")).toBe(false);
  });
});
