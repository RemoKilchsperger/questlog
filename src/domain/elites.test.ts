import { describe, expect, it } from "vitest";
import { attackRound, getHeroCombatProfile, rollBattleReward, startBattle, type BattleEvent, type BattleState } from "./combat";
import { resolveRound, rollCoopDungeonChest, startCoopBattle, type CoopBattleState, type CoopPlayer } from "./coopCombat";
import { getCreature, getCreatureGoldDrop, getCreatureStats, getCreatureXp, getDungeon } from "./creatures";
import {
  ARMORED_BONUS,
  coopElite,
  ELITE_AFFIXES,
  ELITE_DOUBLE_LEVEL,
  ELITE_REWARD_FACTOR,
  GIANT_BONUS,
  POISON,
  RAGE_BONUS,
  REGEN_SHARE,
  rollElite,
  SWIFT_SHARE,
  VAMPIRE_SHARE,
  type EliteAffix,
} from "./elites";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem } from "./items";
import { xpForNextLevel } from "./leveling";
import type { Character } from "./types";

const hero = (): Character => {
  let totalXp = 0;
  for (let l = 1; l < 10; l++) totalXp += xpForNextLevel(l);
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
/** Zufallszahlen der Reihe nach, danach von vorn. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const wolf = getCreature("grey-wolf").creature;

/** Ein sehr zäher Held gegen einen sehr zähen Wolf – Runden laufen vollständig ab. */
const fight = (elite: EliteAffix[] = []): BattleState => {
  const battle = startBattle("b", "Held", profile, wolf, profile.maxHp, elite);
  return {
    ...battle,
    hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 },
    enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 },
  };
};
const enemyHits = (events: BattleEvent[]) => events.filter((e) => e.type === "hit" && e.attacker === "enemy") as Extract<BattleEvent, { type: "hit" }>[];
const dealt = (events: BattleEvent[]) => enemyHits(events).reduce((sum, e) => sum + e.damage, 0);

describe("Elite-Gegner", () => {
  it("nur normale Kreaturen, mit 10 % Chance; ab Level 30 manchmal zwei verschiedene Modifikatoren", () => {
    expect(rollElite(wolf, rng(0.5))).toEqual([]);
    expect(rollElite(getCreature("goblin-chief").creature, rng(0))).toEqual([]);
    expect(rollElite(wolf, sequence(0.05, 0.99, 0))).toHaveLength(1);
    // Unter Level 30 nie zwei – auch wenn der Wurf dafür passen würde
    expect(rollElite(wolf, sequence(0.05, 0, 0, 0))).toHaveLength(1);
    const bear = getCreature("ice-bear").creature;
    expect(bear.level).toBeGreaterThanOrEqual(ELITE_DOUBLE_LEVEL);
    const two = rollElite(bear, sequence(0.05, 0.1, 0, 0));
    expect(two).toHaveLength(2);
    expect(new Set(two).size).toBe(2);
    for (const id of two) expect(ELITE_AFFIXES.map((a) => a.id)).toContain(id);
  });

  it("Gepanzert und Riesig verändern die Grundwerte", () => {
    const stats = getCreatureStats(wolf);
    const armored = startBattle("b", "Held", profile, wolf, profile.maxHp, ["armored"]);
    expect(armored.elite).toEqual(["armored"]);
    expect(armored.enemy.armor).toBe(Math.round(stats.armor * (1 + ARMORED_BONUS)));
    const giant = startBattle("b", "Held", profile, wolf, profile.maxHp, ["giant"]);
    expect(giant.enemy.maxHp).toBe(Math.round(stats.maxHp * (1 + GIANT_BONUS)));
    expect(giant.enemy.hp).toBe(giant.enemy.maxHp);
    expect(startBattle("b", "Held", profile, wolf).elite).toBeUndefined();
  });

  it("Rasend macht mehr Schaden, unter der Hälfte der LP noch mehr", () => {
    const plain = dealt(attackRound(fight(), rng(0.5)).events);
    const raging = dealt(attackRound(fight(["raging"]), rng(0.5)).events);
    expect(Math.abs(raging - plain * (1 + RAGE_BONUS.base))).toBeLessThanOrEqual(1);
    const hurt = fight(["raging"]);
    const low = dealt(attackRound({ ...hurt, enemy: { ...hurt.enemy, hp: 40_000 } }, rng(0.5)).events);
    expect(Math.abs(low - plain * (1 + RAGE_BONUS.low))).toBeLessThanOrEqual(1);
  });

  it("Flink greift zweimal schwächer an", () => {
    const plain = dealt(attackRound(fight(), rng(0.5)).events);
    const hits = enemyHits(attackRound(fight(["swift"]), rng(0.5)).events);
    expect(hits).toHaveLength(2);
    for (const hit of hits) expect(Math.abs(hit.damage - plain * SWIFT_SHARE)).toBeLessThanOrEqual(1);
  });

  it("Vampirisch heilt sich um einen Teil seines Schadens, Giftig vergiftet", () => {
    const battle = fight(["vampiric", "poisonous"]);
    const { state, events } = attackRound({ ...battle, enemy: { ...battle.enemy, hp: 50_000 } }, rng(0.5));
    const heal = events.find((e) => e.type === "drain");
    expect(heal).toEqual({ type: "drain", heal: Math.round(dealt(events) * VAMPIRE_SHARE) });
    expect(state.heroEffects.poison).toEqual({
      damage: Math.max(1, Math.round(battle.enemy.damage * POISON.percent)),
      roundsLeft: POISON.rounds,
    });
  });

  it("Regenerierend heilt sich am Rundenende – ausser er brennt", () => {
    const battle = fight(["regenerating"]);
    const hurt = { ...battle, enemy: { ...battle.enemy, hp: 50_000 } };
    expect(attackRound(hurt, rng(0.5)).events).toContainEqual({ type: "enemyRegen", heal: Math.round(99_999 * REGEN_SHARE) });
    const burning = { ...hurt, enemyEffects: { burn: { damage: 5, roundsLeft: 2 } } };
    expect(attackRound(burning, rng(0.5)).events.some((e) => e.type === "enemyRegen")).toBe(false);
  });

  it("Explosiv explodiert beim Tod – das kann den Helden mitreissen, Bollwerk blockt", () => {
    const battle = startBattle("b", "Held", profile, wolf, profile.maxHp, ["explosive"]);
    const dying = { ...battle, enemy: { ...battle.enemy, hp: 1 } };
    const won = attackRound(dying, rng(0.5));
    const blast = won.events.find((e) => e.type === "explosion");
    if (blast?.type !== "explosion") throw new Error("Keine Explosion");
    expect(blast.damage).toBeGreaterThan(0);
    expect(won.state.status).toBe("won");
    expect(won.state.hero.hp).toBe(battle.hero.hp - blast.damage);
    // Mit wenigen LP reisst die Explosion den Helden mit
    const lost = attackRound({ ...dying, hero: { ...dying.hero, hp: 1 } }, rng(0.5));
    expect(lost.state.status).toBe("lost");
    expect(lost.events.at(-1)).toEqual({ type: "defeated", side: "hero" });
    // Ein Bollwerk aus der Vorrunde fängt sie ab
    const safe = attackRound({ ...dying, hero: { ...dying.hero, hp: 1 }, heroEffects: { bulwark: true } }, rng(0.5));
    expect(safe.events).toContainEqual({ type: "explosion", damage: 0, blocked: true });
    expect(safe.state.status).toBe("won");
  });

  it("Belohnung: doppelte Erfahrung, sicheres doppeltes Gold und sichere Beute", () => {
    const reward = rollBattleReward(wolf, profile, "u", rng(0.99), [], true);
    expect(reward.xp).toBe(getCreatureXp(wolf, profile.level) * ELITE_REWARD_FACTOR);
    expect(reward.loot).not.toBeNull();
    const { max } = getCreatureGoldDrop(wolf);
    expect(reward.gold).toBe(Math.round(max * ELITE_REWARD_FACTOR * (1 + profile.goldBonus)));
    // Gewöhnlich: bei diesem Wurf weder Beute noch Gold
    const plain = rollBattleReward(wolf, profile, "u", rng(0.99));
    expect(plain.loot).toBeNull();
    expect(plain.gold).toBe(0);
  });
});

describe("Elite-Gegner im Koop-Dungeon", () => {
  const players: CoopPlayer[] = ["a", "b"].map((id) => ({ id, name: id, profile }));
  const mine = getDungeon("abandoned-mine");
  /** Erste Durchgangs-Id, deren erster Gegner Elite ist – bzw. gewöhnlich. */
  const runWith = (elite: boolean) => {
    for (let i = 0; ; i++) if ((coopElite(`run-${i}`, 0, mine.creatures[0]).length > 0) === elite) return `run-${i}`;
  };

  it("gewürfelt aus Durchgang und Kampf – gleich für Server und Truhe, nie beim Raid- oder Dungeon-Boss", () => {
    const id = runWith(true);
    const state = startCoopBattle(id, mine.id, players, 0);
    expect(state.elite).toEqual(coopElite(id, 0, mine.creatures[0]));
    expect(startCoopBattle(runWith(false), mine.id, players, 0).elite).toBeUndefined();
    expect(startCoopBattle("r", "swamp-hydra", players, 0).elite).toBeUndefined();
    expect(coopElite(id, mine.creatures.length - 1, mine.creatures.at(-1)!)).toEqual([]);
  });

  it("die Truhe zählt den Elite-Kampf doppelt", () => {
    const won = (id: string): CoopBattleState => ({ ...startCoopBattle(id, mine.id, players, 0), status: "won" });
    const elite = rollCoopDungeonChest(won(runWith(true)), profile, "a");
    const plain = rollCoopDungeonChest(won(runWith(false)), profile, "a");
    expect(elite.xp).toBe(getCreatureXp(mine.creatures[0], profile.level) * ELITE_REWARD_FACTOR);
    expect(plain.xp).toBe(getCreatureXp(mine.creatures[0], profile.level));
  });

  it("Explosiv trifft beim Tod alle stehenden Helden – Bollwerk blockt, fallen alle, ist der Kampf verloren", () => {
    const base = startCoopBattle(runWith(false), mine.id, players, 0);
    const dying: CoopBattleState = { ...base, elite: ["explosive"], boss: { ...base.boss, hp: 1 } };
    const { state, events } = resolveRound(dying, {}, rng(0.5), 0);
    const blast = events.find((e) => e.type === "explosion");
    if (blast?.type !== "explosion") throw new Error("Keine Explosion");
    expect(blast.hits.map((h) => h.heroId)).toEqual(["a", "b"]);
    expect(blast.hits.every((h) => h.damage > 0)).toBe(true);
    expect(state.status).toBe("won");
    const fragile = {
      ...dying,
      heroes: dying.heroes.map((h, i) => ({ ...h, combatant: { ...h.combatant, hp: 1 }, effects: i === 0 ? { bulwark: true } : {} })),
    };
    const after = resolveRound(fragile, {}, rng(0.5), 0);
    const hits = after.events.find((e) => e.type === "explosion");
    expect(hits?.type === "explosion" && hits.hits[0]).toEqual({ heroId: "a", damage: 0, blocked: true });
    expect(after.state.status).toBe("won");
    const doomed = { ...fragile, heroes: fragile.heroes.map((h) => ({ ...h, effects: {} })) };
    expect(resolveRound(doomed, {}, rng(0.5), 0).state.status).toBe("lost");
  });

  it("Regenerierend und Vampirisch heilen den Gegner auch im Koop", () => {
    const base = startCoopBattle(runWith(false), mine.id, players, 0);
    const hurt: CoopBattleState = {
      ...base,
      elite: ["regenerating", "vampiric"],
      boss: { ...base.boss, hp: 50_000, maxHp: 99_999 },
      heroes: base.heroes.map((h) => ({ ...h, combatant: { ...h.combatant, hp: 99_999, maxHp: 99_999 } })),
    };
    const { events } = resolveRound(hurt, {}, rng(0.5), 0);
    expect(events).toContainEqual({ type: "enemyRegen", heal: Math.round(99_999 * REGEN_SHARE) });
    expect(events.some((e) => e.type === "drain")).toBe(true);
  });
});
