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
  heroClass: null,
  critMultiplier: 1.5,
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

  it("Schaden erzeugt Bedrohung, der Boss wählt sein Ziel gewichtet danach", () => {
    const battle = tough(start([player("a", { damage: 10 }), player("b", { damage: 80 })]));
    const { state } = resolveRound(battle, {}, rng(0.5), 0);
    const [a, b] = state.heroes;
    expect(b.threat).toBeGreaterThan(a.threat);
    // Über viele Würfe entspricht die Trefferquote dem Anteil an der Bedrohung
    const heroes = state.heroes.map((h) => ({ ...h, threat: h.id === "a" ? 99 : 299 }));
    let hitsOnB = 0;
    for (let i = 0; i < 1000; i++) if (pickBossTarget(heroes, () => i / 1000)?.id === "b") hitsOnB++;
    expect(hitsOnB).toBe(750);
    // Ohne Bedrohung ist jeder gleich wahrscheinlich, Gefallene nie
    const fresh = state.heroes.map((h) => ({ ...h, threat: 0 }));
    expect(pickBossTarget(fresh, () => 0.25)?.id).toBe("a");
    expect(pickBossTarget(fresh, () => 0.75)?.id).toBe("b");
    expect(pickBossTarget(fresh.map((h) => (h.id === "a" ? { ...h, down: true } : h)), () => 0)?.id).toBe("b");
  });

  it("Bedrohung klingt jede Runde um 30 % ab – wer gerade viel Schaden macht, zählt mehr", () => {
    const battle = tough(start([player("a", { damage: 10 }), player("b", { damage: 80 })]));
    // a hat früher viel Bedrohung aufgebaut, b macht jetzt deutlich mehr Schaden
    const before = { ...battle, heroes: battle.heroes.map((h) => (h.id === "a" ? { ...h, threat: 300 } : h)) };
    let state = before;
    const dealt = (events: ReturnType<typeof resolveRound>["events"], id: string) =>
      events.reduce((sum, e) => sum + (e.type === "hit" && e.attacker === id ? e.damage : 0), 0);
    const first = resolveRound(state, {}, rng(0.5), 0);
    expect(first.state.heroes.find((h) => h.id === "a")!.threat).toBe(Math.round((300 + dealt(first.events, "a")) * 0.7));
    state = first.state;
    // Nach ein paar Runden hat b die alte Bedrohung von a überholt
    for (let i = 0; i < 4; i++) state = resolveRound(state, {}, rng(0.5), 0).state;
    const [a, b] = state.heroes;
    expect(b.threat).toBeGreaterThan(a.threat);
  });

  it("Bollwerk zieht 75 % der Angriffe auf den Schildträger – auch in einer Vierergruppe", () => {
    const team = [player("tank", { abilities: ["shield"], damage: 5 }), player("b", { damage: 90 }), player("c", { damage: 90 }), player("d", { damage: 90 })];
    const { state } = resolveRound(tough(start(team)), { tank: { ability: "shield" } }, rng(0.5), 0);
    // Nach dem Abklingen am Rundenende bleibt das Verhältnis gleich
    const total = state.heroes.reduce((sum, h) => sum + h.threat + 1, 0);
    const tankShare = (state.heroes.find((h) => h.id === "tank")!.threat + 1) / total;
    expect(tankShare).toBeGreaterThan(0.73);
    expect(tankShare).toBeLessThan(0.77);
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

describe("Koop-Kampf: Frostriese und Weltenverschlinger", () => {
  const battleAgainst = (bossId: string, players = [player("a"), player("b")]) => {
    const battle = startCoopBattle("k", bossId, players, 0);
    return { ...battle, round: getCoopBoss(bossId).ability.every, boss: { ...battle.boss, hp: 999_999, maxHp: 999_999 } };
  };

  it("Gletscherstampfer friert einen Helden ein – er setzt die nächste Runde aus und taut dann auf", () => {
    const { state, events } = resolveRound(battleAgainst("frost-giant"), {}, rng(0.5), 0);
    const frozen = events.find((e) => e.type === "frozen");
    expect(frozen).toBeDefined();
    const id = frozen!.type === "frozen" ? frozen!.heroId : "";
    expect(state.heroes.find((h) => h.id === id)!.effects.frozen).toBe(true);

    const next = resolveRound(state, {}, rng(0.5), 0);
    expect(next.events).toContainEqual({ type: "skipped", heroId: id });
    expect(next.events.some((e) => e.type === "hit" && e.attacker === id)).toBe(false);
    expect(next.state.heroes.find((h) => h.id === id)!.effects.frozen).toBeUndefined();
  });

  it("Leerenstrudel raubt allen Mana, normale Bisse heilen den Weltenverschlinger", () => {
    const { state, events } = resolveRound(battleAgainst("world-eater"), {}, rng(0.5), 0);
    expect(events.filter((e) => e.type === "manaBurn")).toHaveLength(2);
    expect(state.heroes.every((h) => h.mana < h.maxMana)).toBe(true);

    const hurt = { ...state, round: 1, boss: { ...state.boss, hp: 500_000 } };
    const bite = resolveRound(hurt, {}, rng(0.5), 0);
    const drain = bite.events.find((e) => e.type === "drain");
    expect(drain).toBeDefined();
    const bossHit = bite.events.find((e) => e.type === "hit" && e.attacker === BOSS);
    expect(drain!.type === "drain" && bossHit!.type === "hit" && drain!.heal).toBe(Math.round((bossHit as { damage: number }).damage * 0.5));
  });
});
