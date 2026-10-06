import { describe, expect, it } from "vitest";
import type { HeroCombatProfile } from "./combat";
import {
  BOSS,
  COOP_BOSSES,
  COOP_TURN_SECONDS,
  coopBossStats,
  getCoopBoss,
  pickBossTarget,
  resolveRound,
  rollCoopReward,
  startCoopBattle,
  type CoopBattleState,
  type CoopPlayer,
} from "./coopCombat";
import { getCreatureXp } from "./creatures";
import { getCreatureSprite } from "../game/creatureSprites";
import { hasBackground } from "../game/backgrounds";

const profile = (overrides: Partial<HeroCombatProfile> = {}): HeroCombatProfile => ({
  level: 20,
  maxHp: 400,
  damage: 40,
  armor: 60,
  critChance: 0,
  goldBonus: 0,
  maxMana: 80,
  abilities: [],
  ...overrides,
});
const player = (id: string, overrides: Partial<HeroCombatProfile> = {}): CoopPlayer => ({ id, name: id, profile: profile(overrides) });
const rng = (value: number) => () => value;
const HYDRA = "swamp-hydra";

const start = (players: CoopPlayer[] = [player("a"), player("b")]) => startCoopBattle("k", HYDRA, players, 0);
/** Boss praktisch unverwundbar, damit Runden vollständig ablaufen. */
const tough = (state: CoopBattleState): CoopBattleState => ({ ...state, boss: { ...state.boss, hp: 999_999, maxHp: 999_999 } });

describe("Koop-Kampf: Start und Skalierung", () => {
  it("braucht 2–4 Spieler mit eindeutigen Ids", () => {
    expect(() => start([player("a")])).toThrow();
    expect(() => start([player("a"), player("b"), player("c"), player("d"), player("e")])).toThrow();
    expect(() => start([player("a"), player("a")])).toThrow();
    expect(() => start([player("a"), player(BOSS)])).toThrow();
    expect(start().heroes.map((h) => h.combatant.hp)).toEqual([400, 400]);
  });

  it("der Boss wächst mit der Gruppe: LP × n/2, Schaden +10 % pro Spieler über zwei", () => {
    const boss = getCoopBoss(HYDRA);
    const two = coopBossStats(boss, 2);
    const four = coopBossStats(boss, 4);
    expect(four.maxHp).toBe(two.maxHp * 2);
    expect(four.damage).toBeCloseTo(two.damage * 1.2);
  });

  it("jeder Koop-Boss hat eine 16×16-Grafik und einen Hintergrund", () => {
    for (const boss of COOP_BOSSES) {
      const sprite = getCreatureSprite(boss.sprite);
      expect(sprite.grid).toHaveLength(16);
      expect(sprite.grid.every((row) => row.length === 16), boss.id).toBe(true);
      expect(hasBackground(boss.areaId), boss.id).toBe(true);
    }
  });

  it("die erste Spielerphase endet nach dem Zeitlimit", () => {
    expect(startCoopBattle("k", HYDRA, [player("a"), player("b")], 1000).deadline).toBe(1000 + COOP_TURN_SECONDS * 1000);
  });
});

describe("Koop-Kampf: Runde", () => {
  it("erst handeln alle Helden, dann greift der Boss an; fehlende Aktionen = normaler Angriff", () => {
    const { state, events } = resolveRound(tough(start()), { a: {} }, rng(0.5), 0);
    const order = events.filter((e) => e.type === "hit").map((e) => (e.type === "hit" ? e.attacker : ""));
    expect(order).toEqual(["a", "b", BOSS]);
    expect(state.round).toBe(2);
  });

  it("Schaden erzeugt Bedrohung, der Boss zielt meist auf die höchste", () => {
    const battle = tough(start([player("a", { damage: 10 }), player("b", { damage: 80 })]));
    const { state, events } = resolveRound(battle, {}, rng(0.5), 0);
    const [a, b] = state.heroes;
    expect(b.threat).toBeGreaterThan(a.threat);
    const bossHit = events.find((e) => e.type === "hit" && e.attacker === BOSS);
    expect(bossHit).toMatchObject({ target: "b" });
    // Mit Zufall über der Fokus-Schwelle trifft es einen beliebigen lebenden Helden
    expect(pickBossTarget(state.heroes, rng(0.99))?.id).toBeDefined();
  });

  it("Bollwerk zieht den Boss auf den Schildträger und blockt den Angriff", () => {
    const battle = tough(start([player("tank", { abilities: ["shield"], damage: 5 }), player("dd", { damage: 90 })]));
    const { state, events } = resolveRound(battle, { tank: { ability: "shield" } }, rng(0.5), 0);
    expect(events).toContainEqual({ type: "blocked", heroId: "tank" });
    expect(events.some((e) => e.type === "hit" && e.attacker === BOSS)).toBe(false);
    expect(state.heroes.find((h) => h.id === "dd")!.combatant.hp).toBe(400);
  });

  it("die Boss-Fähigkeit trifft alle und vergiftet", () => {
    const battle = { ...tough(start()), round: getCoopBoss(HYDRA).ability.every };
    const { state, events } = resolveRound(battle, {}, rng(0.5), 0);
    expect(events.some((e) => e.type === "bossAbility")).toBe(true);
    const targets = events.filter((e) => e.type === "hit" && e.attacker === BOSS).map((e) => (e.type === "hit" ? e.target : ""));
    expect(targets.sort()).toEqual(["a", "b"]);
    expect(state.heroes.every((h) => h.effects.poison)).toBe(true);
  });

  it("die erste Betäubung wirkt sicher, weitere nur mit Chance", () => {
    const stunner = () => tough(start([player("a", { abilities: ["mace"] }), player("b")]));
    const first = resolveRound(stunner(), { a: { ability: "mace" } }, rng(0.9), 0);
    expect(first.events).toContainEqual({ type: "stunned" });
    const again = resolveRound({ ...first.state, heroes: first.state.heroes.map((h) => ({ ...h, mana: 80 })) }, { a: { ability: "mace" } }, rng(0.9), 0);
    expect(again.events).toContainEqual({ type: "stunResisted" });
  });
});

describe("Koop-Kampf: Fallen und Wiederbeleben", () => {
  const withDown = (): CoopBattleState => {
    const battle = tough(start());
    return {
      ...battle,
      heroes: battle.heroes.map((h) => (h.id === "b" ? { ...h, down: true, combatant: { ...h.combatant, hp: 0 } } : h)),
    };
  };

  it("Gefallene handeln nicht und werden nicht angegriffen", () => {
    const { events } = resolveRound(withDown(), {}, rng(0.5), 0);
    expect(events.some((e) => e.type === "hit" && (e.attacker === "b" || e.target === "b"))).toBe(false);
  });

  it("ein Heiltrank belebt einen gefallenen Mitspieler wieder – einmal pro Kampf", () => {
    const { state, events } = resolveRound(withDown(), { a: { potion: { potionId: "medium", targetId: "b" } } }, rng(0.5), 0);
    const b = state.heroes.find((h) => h.id === "b")!;
    expect(events).toContainEqual(expect.objectContaining({ type: "potion", heroId: "a", targetId: "b", revive: true }));
    expect(b.down).toBe(false);
    expect(b.revived).toBe(true);
    expect(b.combatant.hp).toBeGreaterThan(0);

    // Zweites Mal: wieder gefallen, Wiederbeleben geht nicht mehr
    const fallen = { ...state, heroes: state.heroes.map((h) => (h.id === "b" ? { ...h, down: true, combatant: { ...h.combatant, hp: 0 } } : h)) };
    const second = resolveRound(fallen, { a: { potion: { potionId: "small", targetId: "b" } } }, rng(0.5), 0);
    expect(second.state.heroes.find((h) => h.id === "b")!.down).toBe(true);
  });

  it("die Gruppe verliert erst, wenn alle gefallen sind; sie gewinnt, wenn der Boss fällt", () => {
    const battle = start([player("a", { maxHp: 1 }), player("b", { maxHp: 1 })]);
    const weak = { ...battle, round: getCoopBoss(HYDRA).ability.every, boss: { ...battle.boss, hp: 999_999 } };
    const lost = resolveRound(weak, {}, rng(0.5), 0);
    expect(lost.state.status).toBe("lost");
    expect(lost.events.at(-1)).toEqual({ type: "wipe" });

    const nearlyDead = { ...start(), boss: { ...start().boss, hp: 1 } };
    const won = resolveRound(nearlyDead, {}, rng(0.5), 0);
    expect(won.state.status).toBe("won");
    expect(won.events.some((e) => e.type === "hit" && e.attacker === BOSS)).toBe(false);
  });
});

describe("Koop-Kampf: Beute", () => {
  it("jeder würfelt selbst: garantiertes Item, XP 1,5 × Solo-Boss", () => {
    const reward = rollCoopReward(HYDRA, profile(), "x", rng(0.5));
    expect(reward.loot).not.toBeNull();
    const solo = getCreatureXp({ id: "x", name: "x", sprite: "x", level: 20, boss: true });
    expect(reward.xp).toBe(Math.round(solo * 1.5));
  });
});
