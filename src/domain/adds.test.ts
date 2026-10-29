import { describe, expect, it } from "vitest";
import { ABILITIES } from "./abilities";
import {
  ADD_REWARD_SHARE,
  attackRound,
  defeatedAdds,
  getHeroCombatProfile,
  livingAdds,
  rollBattleReward,
  setTarget,
  startBattle,
  type BattleEvent,
  type BattleState,
  type HeroCombatProfile,
} from "./combat";
import { getCreature, getCreatureStats, getCreatureXp } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem } from "./items";
import { xpForNextLevel } from "./leveling";
import type { Character, Equipment } from "./types";

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
    abilities: ABILITIES.map((a) => a.id),
  };
};
const withWeapons = (...ids: string[]): Equipment => ({
  ...EMPTY_EQUIPMENT,
  weapon1: ids[0] ? createItem(ids[0], "common", "w1") : null,
  weapon2: ids[1] ? createItem(ids[1], "common", "w2") : null,
});
const profileWith = (...weapons: string[]): HeroCombatProfile => getHeroCombatProfile(hero(), withWeapons(...weapons));
const chief = getCreature("goblin-chief").creature;
const raider = getCreature("goblin-raider").creature;

/** Ein sehr zäher Held gegen einen sehr zähen Goblinhäuptling samt Begleitern – volles Mana. */
const bossFight = (...weapons: string[]): BattleState => {
  const battle = startBattle("b", "Held", profileWith(...weapons), chief);
  return {
    ...battle,
    mana: 999,
    hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 },
    enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 },
  };
};
const rng = (value: number) => () => value;
/** Zufallszahlen der Reihe nach, danach von vorn. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const heroHits = (events: BattleEvent[], add?: string) =>
  events.filter((e) => e.type === "hit" && e.attacker === "hero" && e.add === add);
const enemyHits = (events: BattleEvent[], add?: string) =>
  events.filter((e) => e.type === "hit" && e.attacker === "enemy" && e.add === add);
const add = (state: BattleState, uid: string) => state.adds!.find((a) => a.uid === uid)!;

describe("Begleiter", () => {
  it("der Goblinhäuptling kämpft mit zwei zerbrechlichen Plünderern, normale Kreaturen allein", () => {
    const battle = startBattle("b", "Held", profileWith("sword-0"), chief);
    expect(battle.adds!.map((a) => a.uid)).toEqual(["add-1", "add-2"]);
    const stats = getCreatureStats(raider);
    for (const a of battle.adds!) {
      expect(a.creatureId).toBe("goblin-raider");
      expect(a.combatant.hp).toBe(a.combatant.maxHp);
      expect(a.combatant.maxHp).toBeLessThan(stats.maxHp / 2);
      expect(a.combatant.damage).toBeLessThan(stats.damage);
    }
    expect(startBattle("b", "Held", profileWith("sword-0"), getCreature("grey-wolf").creature).adds).toEqual([]);
  });

  it("greifen jede Runde nach dem Boss an", () => {
    const { events } = attackRound(bossFight("sword-0"), rng(0.5));
    expect(enemyHits(events)).toHaveLength(1);
    expect(enemyHits(events, "add-1")).toHaveLength(1);
    expect(enemyHits(events, "add-2")).toHaveLength(1);
  });

  it("lassen sich gezielt angreifen – fällt einer, geht der Kampf weiter und das Ziel springt zum Boss", () => {
    let state = setTarget(bossFight("sword-0"), "add-1");
    let events: BattleEvent[] = [];
    for (let i = 0; i < 20 && add(state, "add-1").combatant.hp > 0; i++) {
      ({ state, events } = attackRound(state, rng(0.5)));
      expect(heroHits(events)).toHaveLength(0);
    }
    expect(events).toContainEqual({ type: "defeated", side: "enemy", add: "add-1" });
    expect(enemyHits(events, "add-1")).toHaveLength(0);
    expect(state.status).toBe("active");
    expect(state.target).toBeUndefined();
    expect(livingAdds(state).map((a) => a.uid)).toEqual(["add-2"]);
    expect(defeatedAdds(state)).toEqual([raider]);
    expect(() => setTarget(state, "add-1")).toThrow();
    // Gefallene Begleiter bleiben liegen
    const next = attackRound(state, rng(0.5));
    expect(enemyHits(next.events, "add-1")).toHaveLength(0);
    expect(add(next.state, "add-1").combatant.hp).toBe(0);
  });

  it("fällt der Boss, ist der Kampf gewonnen – auch wenn Begleiter noch stehen", () => {
    const battle = bossFight("sword-0");
    const { state, events } = attackRound({ ...battle, enemy: { ...battle.enemy, hp: 1 } }, rng(0.5));
    expect(state.status).toBe("won");
    expect(livingAdds(state)).toHaveLength(2);
    expect(enemyHits(events, "add-1")).toHaveLength(0);
  });

  it("Erdbeben (Flächenwirkung) trifft und schwächt alle Gegner", () => {
    const { state, events } = attackRound(bossFight("greathammer-0"), rng(0.5), "greathammer-2");
    expect(heroHits(events)).toHaveLength(1);
    expect(heroHits(events, "add-1")).toHaveLength(1);
    expect(heroHits(events, "add-2")).toHaveLength(1);
    expect(state.enemyEffects.weaken).toBeDefined();
    for (const a of livingAdds(state)) expect(a.effects.weaken).toBeDefined();
  });

  it("Schockwelle würfelt die Betäubung für jeden Gegner einzeln", () => {
    const { events } = attackRound(bossFight("greathammer-0"), rng(0.1), "greathammer-3");
    expect(events.filter((e) => e.type === "stunned")).toHaveLength(3);
    expect(events.filter((e) => e.type === "hit" && e.attacker === "enemy")).toHaveLength(0);
  });

  it("Schwertwirbel verteilt seine Treffer zufällig auf die Gegner", () => {
    // Pro Treffer: Zielwahl, dann Krit und Streuung
    const { events } = attackRound(bossFight("sword-0"), sequence(0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9, 0.5, 0.5), "sword");
    expect(heroHits(events)).toHaveLength(1);
    expect(heroHits(events, "add-1")).toHaveLength(1);
    expect(heroHits(events, "add-2")).toHaveLength(1);
  });

  it("Meteor trifft das Ziel voll und die anderen mit halbem Schaden – brennen tut nur das Ziel", () => {
    const { state, events } = attackRound(bossFight("staff-0"), rng(0.5), "staff-2");
    const [main] = heroHits(events);
    expect(main.type === "hit" && main.damage).toBeGreaterThan(0);
    for (const uid of ["add-1", "add-2"]) {
      const [splash] = heroHits(events, uid);
      if (main.type !== "hit" || splash?.type !== "hit") throw new Error("Treffer fehlt");
      expect(Math.abs(splash.damage - main.damage / 2)).toBeLessThanOrEqual(1);
      expect(add(state, uid).effects.burn).toBeUndefined();
    }
    expect(state.enemyEffects.burn).toBeDefined();
  });

  it("Einzelziel-Fähigkeiten treffen nur das gewählte Ziel", () => {
    const { state, events } = attackRound(setTarget(bossFight("scepter-0"), "add-2"), rng(0.5), "scepter");
    expect(heroHits(events, "add-2")).toHaveLength(1);
    expect(heroHits(events)).toHaveLength(0);
    expect(add(state, "add-2").effects.poison ?? add(state, "add-2").combatant.hp === 0).toBeTruthy();
    expect(state.enemyEffects.poison).toBeUndefined();
  });

  it("Bollwerk blockt den ganzen gegnerischen Zug – Boss und Begleiter", () => {
    const { state, events } = attackRound(bossFight("shield-0"), rng(0.5), "shield");
    expect(events.filter((e) => e.type === "blocked")).toHaveLength(3);
    expect(events.filter((e) => e.type === "hit" && e.attacker === "enemy")).toHaveLength(0);
    expect(state.heroEffects.bulwark).toBeUndefined();
  });

  it("Parade wirkt nur gegen den Boss – die Begleiter treffen normal", () => {
    const { state, events } = attackRound(bossFight("sword-0"), rng(0.5), "sword-2");
    expect(events.filter((e) => e.type === "guarded")).toHaveLength(1);
    expect(enemyHits(events, "add-1")).toHaveLength(1);
    expect(state.heroEffects.guard).toBeUndefined();
  });

  it("besiegte Begleiter geben etwas Erfahrung, aber keine eigene Beute", () => {
    const profile = profileWith("sword-0");
    const alone = rollBattleReward(chief, profile, "u", rng(0.5));
    const withAdds = rollBattleReward(chief, profile, "u", rng(0.5), [raider, raider]);
    expect(withAdds.xp).toBe(alone.xp + 2 * Math.round(getCreatureXp(raider, profile.level) * ADD_REWARD_SHARE));
    expect(withAdds.gold).toBeGreaterThan(alone.gold);
    expect(withAdds.loot).toEqual(alone.loot);
  });
});
