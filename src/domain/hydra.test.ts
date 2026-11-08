import { describe, expect, it } from "vitest";
import { getHeroCombatProfile, type HeroCombatProfile } from "./combat";
import { BOSS, coopAbilityDue, resolveRound, startCoopBattle, type CoopAction, type CoopBattleState, type CoopEvent, type CoopPlayer } from "./coopCombat";
import { createItem, indexForLevel } from "./items";
import { xpForNextLevel } from "./leveling";
import type { Character, Equipment } from "./types";
import { ACID, BLOOD_HEAL, FRENZY_EVERY, HEAD_GROW_ROUNDS, HEAD_HP, HYDRA_ID, NECK_TAKEN, VENOM } from "./hydra";

const profile = (overrides: Partial<HeroCombatProfile> = {}): HeroCombatProfile => ({
  level: 20,
  maxHp: 5000,
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
const start = () => startCoopBattle("k", HYDRA_ID, [player("a"), player("b")], 0);
const round = (state: CoopBattleState, actions = {}) => resolveRound(state, actions, rng(0.5), 0);
/** Hydra mit so vielen Lebenspunkten, dass sie nach der Heldenphase unter `share` steht. */
const at = (state: CoopBattleState, share: number): CoopBattleState => ({ ...state, boss: { ...state.boss, hp: Math.floor(state.boss.maxHp * share) } });
const ofType = <T extends CoopEvent["type"]>(events: CoopEvent[], type: T) => events.filter((e): e is Extract<CoopEvent, { type: T }> => e.type === type);

describe("Sumpfhydra: Köpfe abschlagen", () => {
  it("unter 75 % fällt der Giftkopf in den Kampf – mit 15 % ihrer LP, er handelt erst ab der nächsten Runde", () => {
    const first = round(at(start(), 0.8));
    expect(ofType(first.events, "headSevered")).toEqual([]);
    const { state, events } = round(at(start(), 0.74));
    expect(ofType(events, "headSevered")).toEqual([{ type: "headSevered", add: "add-1", head: "venom", seared: false }]);
    expect(state.heads).toBe(1);
    const head = state.adds![0];
    expect(head).toMatchObject({ uid: "add-1", head: "venom", grow: HEAD_GROW_ROUNDS });
    expect(head.combatant.maxHp).toBe(Math.round(state.boss.maxHp * HEAD_HP));
    expect(events.some((e) => e.type === "hit" && e.attacker === "add-1")).toBe(false);
  });

  it("ein Treffer über mehrere Schwellen schlägt nur einen Kopf ab – der nächste fällt in der Runde danach", () => {
    const first = round(at(start(), 0.2));
    expect(first.state.adds!.map((a) => a.head)).toEqual(["venom"]);
    const second = round(first.state);
    expect(second.state.adds!.map((a) => a.head)).toEqual(["venom", "acid"]);
    const third = round(second.state);
    expect(third.state.adds!.map((a) => a.head)).toEqual(["venom", "acid", "blood"]);
    expect(round(third.state).state.heads).toBe(3);
  });

  it("solange ein Kopf lebt, erleidet die Hydra nur die Hälfte des Schadens", () => {
    const open = round(at(start(), 0.9));
    const guarded = round(at(start(), 0.74)).state;
    const later = round(guarded);
    const dealt = (events: CoopEvent[]) => ofType(events, "hit").find((e) => e.attacker === "a" && e.target === BOSS)!;
    const plain = dealt(open.events);
    const neck = dealt(later.events);
    expect(neck.neck).toBe(true);
    expect(neck.damage).toBeCloseTo(plain.damage * NECK_TAKEN, -1);
  });

  it("lebt ein Kopf nach 3 Runden noch, wächst ein zweiter, gleicher Kopf – nur einmal", () => {
    let state = round(at(start(), 0.74)).state;
    state = { ...state, boss: { ...state.boss, hp: state.boss.maxHp } };
    const grown: CoopEvent[] = [];
    for (let i = 0; i < HEAD_GROW_ROUNDS + 2; i++) {
      const next = round(state);
      grown.push(...ofType(next.events, "headGrown"));
      state = { ...next.state, boss: { ...next.state.boss, hp: next.state.boss.maxHp } };
    }
    expect(grown).toEqual([{ type: "headGrown", add: "add-2", from: "add-1" }]);
    expect(state.adds!.map((a) => [a.head, a.grow])).toEqual([
      ["venom", undefined],
      ["venom", undefined],
    ]);
  });

  it("brennt die Hydra, wenn der Kopf fällt, ist der Stumpf ausgebrannt – es wächst keiner nach", () => {
    const burning = { ...at(start(), 0.74), bossEffects: { burn: { damage: 1, roundsLeft: 3, sourceId: "a" } } };
    const { state, events } = round(burning);
    expect(ofType(events, "headSevered")[0].seared).toBe(true);
    expect(state.adds![0].grow).toBeUndefined();
  });

  it("der Giftkopf vergiftet, das Gift stapelt sich bis 3-mal", () => {
    // Nur a steht – so beisst der Kopf immer ihn. Runden ohne Giftatem (alle 3 Runden).
    const spawned = round(at(start(), 0.74)).state;
    let state: CoopBattleState = { ...spawned, heroes: spawned.heroes.map((h) => (h.id === "b" ? { ...h, down: true } : h)) };
    const stack = Math.round(state.adds![0].combatant.damage * VENOM.percent);
    const poison = () => state.heroes.find((h) => h.id === "a")!.effects.poison?.damage;
    const play = (r: number) => {
      state = round({ ...state, round: r, boss: { ...state.boss, hp: state.boss.maxHp } }).state;
    };
    play(4);
    expect(poison()).toBe(stack);
    play(5);
    expect(poison()).toBe(stack * 2);
    play(7);
    play(8);
    expect(poison()).toBe(stack * VENOM.max);
  });

  it("der Säurekopf ätzt: Das Ziel erleidet 3 Runden lang mehr Schaden", () => {
    const venom = round(at(start(), 0.74)).state;
    const acid = round(at(venom, 0.49)).state;
    const { state, events } = round({ ...acid, adds: acid.adds!.map((a) => (a.head === "venom" ? { ...a, combatant: { ...a.combatant, hp: 0 } } : a)) });
    const etched = ofType(events, "etched");
    expect(etched).toHaveLength(1);
    const hero = state.heroes.find((h) => h.id === etched[0].heroId)!;
    expect(hero.effects.corroded).toEqual({ percent: ACID.percent, roundsLeft: ACID.rounds - 1 });
  });

  it("der Blutkopf heilt die Hydra jede Runde; danach rast sie: Giftatem alle 2 Runden", () => {
    let state = round(at(start(), 0.2)).state;
    state = round(state).state;
    state = round(state).state;
    expect(state.heads).toBe(3);
    const { events } = round(state);
    expect(ofType(events, "addHeal")).toEqual([{ type: "addHeal", add: "add-3", heal: Math.round(state.boss.maxHp * BLOOD_HEAL) }]);
    const even = { ...state, round: FRENZY_EVERY * 5 };
    expect(coopAbilityDue(even)?.name).toBe("Giftatem");
    expect(coopAbilityDue({ ...even, heads: 2 })).toBeNull();
  });

  it("andere Raid-Bosse verlieren keine Köpfe", () => {
    const giant = startCoopBattle("k", "frost-giant", [player("a"), player("b")], 0);
    const { state } = round({ ...giant, boss: { ...giant.boss, hp: Math.floor(giant.boss.maxHp * 0.2) } });
    expect(state.adds).toEqual([]);
    expect(state.heads).toBeUndefined();
  });
});

/* ───────────── Simulation: Wer die Köpfe liegen lässt, verliert ───────────── */

const heroAt = (level: number): Character => {
  let totalXp = 0;
  for (let l = 1; l < level; l++) totalXp += xpForNextLevel(l);
  return { name: "Held", totalXp, gold: 0, essence: 0, stats: { strength: level, intellect: level, endurance: level, charisma: level }, spentPoints: 0, skills: {} };
};
const epicGear = (level: number): Equipment => {
  const item = (type: string) => createItem(`${type}-${indexForLevel(level)}`, "epic", type, () => 0.5);
  return {
    head: item("head"),
    chest: item("chest"),
    arms: item("arms"),
    legs: item("legs"),
    feet: item("feet"),
    weapon1: item("sword"),
    weapon2: createItem(`sword-${indexForLevel(level)}`, "epic", "sword2", () => 0.5),
  };
};
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
/** Erst der Blutkopf (heilt), dann der Giftkopf, dann der Säurekopf */
const PRIORITY = { blood: 0, venom: 1, acid: 2 };

/** Zwei Helden (Lv. 44, episch) nur mit normalen Angriffen – `focus`: lebende Köpfe zuerst. */
function simulate(focus: boolean, rng: () => number): boolean {
  const hero = getHeroCombatProfile(heroAt(44), epicGear(44));
  let state = startCoopBattle("sim", HYDRA_ID, [player("a"), player("b")].map((p) => ({ ...p, profile: hero })), 0);
  while (state.status === "active" && state.round < 60) {
    const head = (state.adds ?? []).filter((a) => a.head && a.combatant.hp > 0).sort((x, y) => PRIORITY[x.head!] - PRIORITY[y.head!])[0];
    const action: CoopAction = focus && head ? { target: head.uid } : {};
    state = resolveRound(state, { a: action, b: action }, rng, 0).state;
  }
  return state.status === "won";
}

describe("Sumpfhydra: Simulation", () => {
  it("wer die Köpfe zuerst erledigt, gewinnt meistens – wer sie liegen lässt, fast nie", () => {
    const rng = seeded(44);
    const rate = (focus: boolean) => Array.from({ length: 60 }, () => simulate(focus, rng)).filter(Boolean).length / 60;
    expect(rate(true)).toBeGreaterThan(0.8);
    expect(rate(false)).toBeLessThan(0.1);
  });
});
