import { advanceCoopDungeon } from "../test/coopDungeon";
import { describe, expect, it } from "vitest";
import { fullWeapon } from "../test/weapons";
import {
  BOSS_PHASES,
  DRUM_BONUS,
  DRUM_MAX,
  getBossPhase,
  RITUAL_HEAL,
  RITUAL_ROUNDS,

  SHIELD_EVERY,
  SHIELD_SHARE,
} from "./bossMechanics";
import { attackRound, getHeroCombatProfile, setTarget, startBattle, type BattleEvent, type BattleState } from "./combat";
import {
  CURSE_DAMAGE,
  COOP_STATIC_PER_HERO,
  CURSE_ROUNDS,
  DEVOUR_FREE,
  PLATES_MAX,
} from "./bossIntents";
import {
  BOSS,
  coopAbilityBlocker,
  coopEnemyStats,
  getCoopEnemy,
  resolveRound,
  startCoopBattle,
  type CoopBattleState,
  type CoopPlayer,
} from "./coopCombat";
import { AREAS, DUNGEONS, getCreature, getCreatureStats, getDungeon } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem } from "./items";
import { xpForNextLevel } from "./leveling";
import type { Character } from "./types";

const hero = (): Character => {
  let totalXp = 0;
  for (let l = 1; l < 30; l++) totalXp += xpForNextLevel(l);
  return {
    name: "Held",
    totalXp,
    gold: 0,
    essence: 0,
    stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 },
    spentPoints: 0,
    skills: {},
  };
};
const profile = getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, weapon1: createItem("sword-0", "common", "w1") });
const rng = (value: number) => () => value;

/** Ein sehr zäher Held gegen einen Boss mit vielen LP – Runden laufen vollständig ab. */
const bossFight = (bossId: string): BattleState => {
  const battle = startBattle("b", "Held", profile, getCreature(bossId).creature);
  return {
    ...battle,
    hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 },
    enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 },
  };
};
const withoutRoleAdd = (state: BattleState): BattleState => ({
  ...state,
  adds: state.adds!.map((a) => (a.role ? { ...a, combatant: { ...a.combatant, hp: 0 } } : a)),
});
const bossHit = (events: BattleEvent[], attacker: "hero" | "enemy") =>
  events.find((e) => e.type === "hit" && e.attacker === attacker && !e.add) as Extract<BattleEvent, { type: "hit" }>;

describe("Begleiter mit Aufgabe", () => {
  it("jeder Gebiets- und Dungeon-Boss hat einen gewöhnlichen Begleiter und einen mit Aufgabe", () => {
    for (const area of [...AREAS, ...DUNGEONS]) {
      const boss = area.creatures.at(-1)!;
      const adds = startBattle("b", "Held", profile, boss).adds!;
      expect(adds.map((a) => a.role), boss.name).toEqual([undefined, expect.any(String)]);
    }
    const chief = startBattle("b", "Held", profile, getCreature("goblin-chief").creature);
    expect(chief.adds![1]).toMatchObject({ creatureId: "goblin-raider", role: "drummer", combatant: { name: "Goblin-Trommler" } });
  });

  /** Spielt n Runden mit normalen Angriffen auf den Boss. */
  const play = (state: BattleState, n: number) => {
    const events: BattleEvent[][] = [];
    for (let i = 0; i < n; i++) {
      const result = attackRound(state, rng(0.5));
      events.push(result.events);
      state = result.state;
    }
    return { state, events };
  };

  it("der Heiler heilt erst nach seinem Ritual – und greift nie an", () => {
    const battle = bossFight("ancient-lizard");
    const hurt = { ...battle, enemy: { ...battle.enemy, hp: 50_000 } };
    const { events } = play(hurt, RITUAL_ROUNDS);
    for (const round of events.slice(0, -1)) expect(round.some((e) => e.type === "addHeal"), "vor dem Ende des Rituals").toBe(false);
    expect(events.at(-1)!.find((e) => e.type === "addHeal")).toEqual({ type: "addHeal", add: "add-2", heal: Math.round(99_999 * RITUAL_HEAL) });
    expect(events.flat().filter((e) => e.type === "hit" && e.attacker === "enemy" && e.add === "add-2")).toHaveLength(0);
  });

  it("ein Treffer auf den Heiler unterbricht das Ritual", () => {
    const battle = bossFight("ancient-lizard");
    const hurt = { ...battle, enemy: { ...battle.enemy, hp: 50_000 } };
    // Kurz vor der Heilung: einmal den Heiler treffen …
    const almost = play(hurt, RITUAL_ROUNDS - 1).state;
    const healer = almost.adds!.find((a) => a.role === "healer")!;
    const tough = { ...almost, adds: almost.adds!.map((a) => (a.role ? { ...a, combatant: { ...a.combatant, hp: 99_999, maxHp: 99_999 } } : a)) };
    const hit = attackRound(setTarget(tough, healer.uid), rng(0.5));
    expect(hit.events).toContainEqual({ type: "interrupted", add: healer.uid });
    expect(hit.events.some((e) => e.type === "addHeal")).toBe(false);
    // … dann beginnt das Ritual von vorn
    expect(hit.state.adds!.find((a) => a.uid === healer.uid)!.cast).toBe(0);
  });

  it("der Schildträger hebt regelmässig einen Schild, der Treffer schluckt – Gift geht durch", () => {
    const battle = bossFight("cave-eye");
    const { state, events } = play(battle, SHIELD_EVERY);
    const raised = events.at(-1)!.find((e) => e.type === "bossShield");
    expect(raised).toEqual({ type: "bossShield", add: "add-2", shield: Math.round(99_999 * SHIELD_SHARE) });
    expect(state.bossShield).toBe(Math.round(99_999 * SHIELD_SHARE));
    // In der Runde, in der er den Schild hebt, greift er nicht an
    expect(events.at(-1)!.some((e) => e.type === "hit" && e.attacker === "enemy" && e.add === "add-2")).toBe(false);
    const next = attackRound(state, rng(0.5));
    const hit = bossHit(next.events, "hero");
    expect(hit.absorbed).toBeGreaterThan(0);
    expect(hit.damage).toBe(0);
    expect(next.state.bossShield).toBe(state.bossShield! - hit.absorbed!);
    // Gift trifft den Boss trotz Schild
    const poisoned = { ...state, enemyEffects: { poison: { damage: 50, roundsLeft: 2 } } };
    const poison = attackRound(poisoned, rng(0.5)).events.find((e) => e.type === "poison" && e.target === "enemy" && !e.add);
    expect(poison).toBeDefined();
  });

  it("der Trommler trommelt jede Runde lauter – eine Betäubung bringt ihn aus dem Takt", () => {
    const battle = bossFight("goblin-chief");
    const quiet = bossHit(attackRound(withoutRoleAdd(battle), rng(0.5)).events, "enemy");
    const drummed = play(battle, DRUM_MAX + 2).state;
    const drummer = drummed.adds!.find((a) => a.role === "drummer")!;
    expect(drummer.cast).toBe(DRUM_MAX);
    // Krummzahn: ohne Wutanfall in dieser Runde vergleichen
    const calm = { ...drummed, bossTurn: { intent: "attack" as const, rage: 0 } };
    const loud = bossHit(attackRound(calm, rng(0.5)).events, "enemy");
    expect(Math.abs(loud.damage - quiet.damage * (1 + DRUM_BONUS * DRUM_MAX))).toBeLessThanOrEqual(1);
    // Ein Betäubender Schlag auf den Trommler: Er setzt aus und beginnt von vorn
    const mace = getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, weapon1: fullWeapon("mace-0", "common", "w1") });
    const withMace = { ...calm, abilities: mace.abilities, mana: 999, maxMana: 999 };
    const stunned = attackRound(setTarget(withMace, drummer.uid), rng(0.01), "mace");
    expect(stunned.events).toContainEqual({ type: "interrupted", add: drummer.uid });
    expect(stunned.state.adds!.find((a) => a.uid === drummer.uid)!.cast).toBe(0);
  });
});

describe("Zweite Phase", () => {
  it("jeder Gebiets- und Dungeon-Boss hat eine – Raserei, Sammelruf oder beides", () => {
    for (const area of [...AREAS, ...DUNGEONS]) {
      const phase = getBossPhase(area.creatures.at(-1)!.id);
      expect(phase, area.name).not.toBeNull();
      expect(phase!.enrage || phase!.rally).toBeTruthy();
    }
    expect(BOSS_PHASES).toHaveLength(AREAS.length + DUNGEONS.length);
  });

  it("Raserei: unter der Hälfte der LP macht der Boss einmalig und bis zum Ende mehr Schaden", () => {
    const battle = bossFight("ancient-lizard");
    const damage = battle.enemy.damage;
    const above = attackRound({ ...battle, enemy: { ...battle.enemy, hp: 60_000 } }, rng(0.5));
    expect(above.events.some((e) => e.type === "bossPhase")).toBe(false);
    const below = attackRound({ ...battle, enemy: { ...battle.enemy, hp: 49_000 } }, rng(0.5));
    expect(below.events).toContainEqual({ type: "bossPhase", bossId: "ancient-lizard" });
    expect(below.state.phase).toBe(true);
    expect(below.state.enemy.damage).toBeCloseTo(damage * (1 + getBossPhase("ancient-lizard")!.enrage!));
    // Nur einmal pro Kampf
    const again = attackRound(below.state, rng(0.5));
    expect(again.events.some((e) => e.type === "bossPhase")).toBe(false);
    expect(again.state.enemy.damage).toBeCloseTo(below.state.enemy.damage);
  });

  it("Sammelruf: der gewöhnliche Begleiter steht wieder auf – der mit Aufgabe bleibt liegen", () => {
    const battle = bossFight("goblin-chief");
    const allDown = {
      ...battle,
      enemy: { ...battle.enemy, hp: 49_000 },
      adds: battle.adds!.map((a) => ({ ...a, combatant: { ...a.combatant, hp: 0 } })),
    };
    const { state, events } = attackRound(allDown, rng(0.5));
    expect(events).toContainEqual({ type: "bossPhase", bossId: "goblin-chief", rally: ["add-1"] });
    const [raider, drummer] = state.adds!;
    expect(raider.combatant.hp).toBe(raider.combatant.maxHp);
    expect(drummer.combatant.hp).toBe(0);
    // Der Wiederaufgestandene schlägt gleich mit zu
    expect(events.some((e) => e.type === "hit" && e.attacker === "enemy" && e.add === "add-1")).toBe(true);
    expect(setTarget(state, "add-1").target).toBe("add-1");
  });
});

describe("Koop-Dungeons", () => {
  const players: CoopPlayer[] = ["a", "b"].map((id) => ({ id, name: id, profile: { ...profile, maxHp: 99_999 } }));
  /** Koop-Kampf gegen den Endboss eines Dungeons – die Gegner davor sofort besiegt. */
  const atBoss = (dungeonId: string): CoopBattleState => {
    let state = startCoopBattle("k0", dungeonId, players, 0);
    for (let i = 1; i < getDungeon(dungeonId).creatures.length; i++) {
      const won = resolveRound({ ...state, boss: { ...state.boss, hp: 1 } }, {}, rng(0.5), 0).state;
      state = advanceCoopDungeon(won, `k${i}`);
    }
    return { ...state, heroes: state.heroes.map((h) => ({ ...h, combatant: { ...h.combatant, hp: 99_999, maxHp: 99_999 } })) };
  };

  it("Endbosse haben im Koop einen eigenen LP-Faktor", () => {
    const priestess = getCreature("high-priestess").creature;
    const coopHp = priestess.bossFactors!.coopHp!;
    expect(coopHp).toBeGreaterThan(priestess.bossFactors!.hp);
    const solo = getCreatureStats({ ...priestess, bossFactors: { ...priestess.bossFactors!, hp: coopHp } });
    // Zwei Spieler: LP × 2 × (1 + 10 %)
    expect(coopEnemyStats(getCoopEnemy("high-priestess"), 2).maxHp).toBe(Math.round(solo.maxHp * 2 * 1.1));
  });

  it("der Heiler heilt nach seinem Ritual – ein Treffer unterbricht es; die zweite Phase kommt einmal", () => {
    const state = atBoss("sunken-temple");
    expect(state.adds!.map((a) => a.role)).toEqual([undefined, "healer"]);
    const half = { ...state, boss: { ...state.boss, hp: Math.round(state.boss.maxHp * 0.45) } };
    // Kurz vor dem Ende des Rituals – ungestört heilt er
    const ready = { ...half, adds: half.adds!.map((a) => (a.role ? { ...a, cast: RITUAL_ROUNDS - 1 } : a)) };
    const { state: next, events } = resolveRound(ready, { a: { target: "add-1" }, b: { target: "add-1" } }, rng(0.5), 0);
    expect(events.some((e) => e.type === "addHeal" && e.add === "add-2")).toBe(true);
    expect(events).toContainEqual({ type: "bossPhase", bossId: "high-priestess", rally: ["add-1"] });
    expect(next.phase).toBe(true);
    expect(resolveRound(next, {}, rng(0.5), 0).events.some((e) => e.type === "bossPhase")).toBe(false);
    // Wer ihn trifft, unterbricht das Ritual
    const hit = resolveRound(ready, { a: { target: "add-2" } }, rng(0.5), 0);
    expect(hit.events).toContainEqual({ type: "interrupted", add: "add-2" });
    expect(hit.events.some((e) => e.type === "addHeal")).toBe(false);
  });

  it("der Schildträger hebt im Koop einen Schild über den Boss, der Treffer schluckt", () => {
    const state = atBoss("storm-tower");
    const tough = { ...state, boss: { ...state.boss, hp: 999_999, maxHp: 999_999 } };
    const raising = { ...tough, adds: tough.adds!.map((a) => (a.role ? { ...a, cast: SHIELD_EVERY - 1 } : a)) };
    const raised = resolveRound(raising, {}, rng(0.5), 0);
    expect(raised.events.some((e) => e.type === "bossShield")).toBe(true);
    expect(raised.state.bossShield).toBe(Math.round(999_999 * SHIELD_SHARE));
    const hit = resolveRound(raised.state, {}, rng(0.5), 0).events.find((e) => e.type === "hit" && e.attacker === "a" && e.target === BOSS);
    expect(hit?.type === "hit" && hit.absorbed).toBeGreaterThan(0);
  });
});

describe("Koop: Abwehren und die Abläufe der Dungeon-Bosse", () => {
  const strong = getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, weapon1: fullWeapon("greatsword-0", "common", "w1") });
  const group = (ids: string[]): CoopPlayer[] => ids.map((id) => ({ id, name: id, profile: { ...strong, maxHp: 99_999, maxMana: 999 } }));
  /** Endboss eines Dungeons, Gegner davor sofort besiegt, ohne Begleiter – zähe Helden, zäher Boss */
  const bossOf = (dungeonId: string, ids = ["a", "b"]): CoopBattleState => {
    let state = startCoopBattle("k0", dungeonId, group(ids), 0);
    for (let i = 1; i < getDungeon(dungeonId).creatures.length; i++) {
      state = advanceCoopDungeon(resolveRound({ ...state, boss: { ...state.boss, hp: 1 } }, {}, rng(0.5), 0).state, `k${i}`);
    }
    return {
      ...state,
      adds: [],
      boss: { ...state.boss, hp: 999_999, maxHp: 999_999 },
      heroes: state.heroes.map((h) => ({ ...h, combatant: { ...h.combatant, hp: 99_999, maxHp: 99_999 }, mana: 999 })),
    };
  };
  const hpOf = (s: CoopBattleState, id: string) => s.heroes.find((h) => h.id === id)!.combatant.hp;

  it("Abwehren: kein Angriff, halber Schaden, etwas Mana", () => {
    const state = { ...bossOf("abandoned-mine"), heroes: bossOf("abandoned-mine").heroes.map((h) => ({ ...h, mana: 0, threat: h.id === "a" ? 1e9 : 0 })) };
    const plain = resolveRound(state, {}, rng(0.5), 0);
    const defended = resolveRound(state, { a: { defend: true } }, rng(0.5), 0);
    expect(defended.events).toContainEqual({ type: "defend", heroId: "a", mana: 10 });
    expect(defended.events.some((e) => e.type === "hit" && e.attacker === "a")).toBe(false);
    const taken = (r: typeof plain) => 99_999 - hpOf(r.state, "a");
    expect(Math.abs(taken(defended) - taken(plain) / 2)).toBeLessThanOrEqual(1);
  });

  it("Erzkönig: so viele Panzerplatten pro Held wie solo – die Gruppe bricht sie gemeinsam", () => {
    const state = bossOf("abandoned-mine", ["a", "b", "c"]);
    expect(state.bossTurn).toMatchObject({ plates: PLATES_MAX * 3, platesMax: PLATES_MAX * 3 });
    const round = resolveRound(state, {}, rng(0.5), 0);
    expect(round.state.bossTurn?.plates).toBe(PLATES_MAX * 3 - 3);
    let s: CoopBattleState = { ...state, bossTurn: { ...state.bossTurn!, plates: 2 } };
    const broken = resolveRound(s, {}, rng(0.5), 0);
    expect(broken.events).toContainEqual({ type: "platesBroken" });
    s = broken.state;
    while (s.bossTurn!.plates === 0) s = resolveRound(s, {}, rng(0.5), 0).state;
    expect(s.bossTurn?.plates).toBe(PLATES_MAX * 3);
  });

  it("Neferet: Der Fluch liegt auf einem Helden, bricht los und springt auf einen anderen über", () => {
    const state = bossOf("sunken-temple");
    const cursed = resolveRound({ ...state, bossTurn: { intent: "ability", ability: "high-priestess" } }, { a: { defend: true }, b: { defend: true } }, rng(0.5), 0);
    const curse = cursed.state.bossTurn?.curse;
    expect(curse?.roundsLeft).toBe(CURSE_ROUNDS);
    expect(cursed.events).toContainEqual({ type: "cursed", heroId: curse!.heroId });
    let s = cursed.state;
    for (let i = 0; i < CURSE_ROUNDS - 1; i++) s = resolveRound(s, { a: { defend: true }, b: { defend: true } }, rng(0.5), 0).state;
    const burst = resolveRound(s, {}, rng(0.5), 0);
    expect(burst.events).toContainEqual({ type: "curseBurst", heroId: curse!.heroId!, damage: Math.round(99_999 * CURSE_DAMAGE) });
    const jumped = burst.state.bossTurn?.curse;
    expect(jumped?.heroId).toBeDefined();
    expect(jumped?.heroId).not.toBe(curse!.heroId);
    expect(burst.events).toContainEqual({ type: "cursed", heroId: jumped!.heroId });
  });

  it("Kaelthar: Im Koop braucht er Ladungen je Held – jede Fähigkeit der Gruppe zählt", () => {
    const state = bossOf("storm-tower");
    const both = { a: { ability: "greatsword" as const }, b: { ability: "greatsword" as const } };
    let s = state;
    for (let i = 0; i < COOP_STATIC_PER_HERO - 1; i++) s = resolveRound({ ...s, heroes: s.heroes.map((h) => ({ ...h, cooldowns: {} })) }, both, rng(0.5), 0).state;
    // Zwei Helden: (COOP_STATIC_PER_HERO - 1) × 2 Ladungen, er braucht COOP_STATIC_PER_HERO × 2
    expect(s.bossTurn).toMatchObject({ static: (COOP_STATIC_PER_HERO - 1) * 2, staticMax: COOP_STATIC_PER_HERO * 2 });
    s = resolveRound({ ...s, heroes: s.heroes.map((h) => ({ ...h, cooldowns: {} })) }, both, rng(0.5), 0).state;
    expect(s.bossTurn).toMatchObject({ intent: "ability", ability: "storm-lord-discharge" });
    // Die Entladung trifft alle
    const discharge = resolveRound(s, {}, rng(0.5), 0).events.filter((e) => e.type === "hit" && e.attacker === BOSS);
    expect(new Set(discharge.map((e) => e.type === "hit" && e.target))).toEqual(new Set(["a", "b"]));
  });

  it("Xal'Zar: verschlingt die Fähigkeit des Helden mit der meisten Bedrohung – die Gruppe befreit sie", () => {
    const state = bossOf("void-abyss");
    const devour = { ...state, bossTurn: { intent: "devour" as const }, heroes: state.heroes.map((h) => ({ ...h, threat: h.id === "b" ? 500 : 10 })) };
    const swallowed = resolveRound(devour, { a: { defend: true }, b: { defend: true } }, rng(0.5), 0);
    expect(swallowed.events).toContainEqual({ type: "devoured", heroId: "b", ability: "greatsword" });
    const turn = swallowed.state.bossTurn!;
    expect(turn.devoured).toMatchObject({ ability: "greatsword", heroId: "b" });
    const [a, b] = swallowed.state.heroes;
    expect(coopAbilityBlocker(b, "greatsword", turn)).toMatch(/gefangen/);
    expect(coopAbilityBlocker(a, "greatsword", turn)).toBeNull();
    // Genug Schaden der Gruppe befreit sie
    const freed = resolveRound({ ...swallowed.state, bossTurn: { ...turn, devoured: { ...turn.devoured!, taken: 999_999 * DEVOUR_FREE } } }, {}, rng(0.5), 0);
    expect(freed.events).toContainEqual({ type: "freed", heroId: "b", ability: "greatsword" });
    expect(freed.state.bossTurn?.devoured).toBeUndefined();
  });
});
