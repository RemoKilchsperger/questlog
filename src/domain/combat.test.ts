import { describe, expect, it } from "vitest";
import {
  attackRound,
  drinkPotion,
  flee,
  fleeCost,
  getHeroCombatProfile,
  BOSS_ITEM_DROP_CHANCE,
  rollBattleReward,
  rollBossLoot,
  rollBuffPotion,
  startBattle,
  type BattleState,
  type HeroCombatProfile,
} from "./combat";
import {
  AREAS,
  DUNGEONS,
  getCreature,
  getCreatureGold,
  getCreatureGoldDrop,
  getCreaturePotionDrop,
  rollCreatureGold,
  type CreatureDef,
} from "./creatures";
import { CREATURE_SPRITES } from "../game/creatureSprites";
import { SHARED_PALETTE } from "../game/sprites";
import { EMPTY_EQUIPMENT } from "./equipment";
import { BOSS_ITEMS, createItem, getBossItems, indexForLevel, ITEM_TYPES, ITEMS } from "./items";
import { lootPool } from "./loot";
import { MAX_LEVEL, xpForNextLevel } from "./leveling";
import { buyPotion, getPotion } from "./potions";
import type { Character, Equipment } from "./types";

const xpForLevel = (level: number) => {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += xpForNextLevel(l);
  return xp;
};

const heroAt = (level: number): Character => ({
  name: "Held",
  totalXp: xpForLevel(level),
  gold: 0,
  essence: 0,
  stats: { strength: level, intellect: level, endurance: level, charisma: level },
  spentPoints: 0,
  battlePoints: 5,
  battlePointSlot: 0,
  skills: {},
  abilities: [],
});

/** Volle gewöhnliche Ausrüstung des passenden Levels, zwei Schwerter. */
const gearAt = (level: number): Equipment => {
  const item = (type: string) => createItem(`${type}-${indexForLevel(level)}`, "common", type);
  return {
    head: item("head"),
    chest: item("chest"),
    arms: item("arms"),
    legs: item("legs"),
    feet: item("feet"),
    weapon1: item("sword"),
    weapon2: createItem(`sword-${indexForLevel(level)}`, "common", "sword2"),
  };
};

const fixedRng = (value: number) => () => value;

/** Mini-Zufallsgenerator mit Startwert, damit die Simulation reproduzierbar ist. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
};

function simulate(hero: HeroCombatProfile, creature: CreatureDef, rng: () => number) {
  let state: BattleState = startBattle("b", "Held", hero, creature);
  while (state.status === "active") state = attackRound(state, rng).state;
  return state;
}

describe("Held", () => {
  it("hat Lebenspunkte, die mit Level und Ausdauer wachsen", () => {
    const base = getHeroCombatProfile(heroAt(1), EMPTY_EQUIPMENT);
    expect(base.maxHp).toBeGreaterThan(0);
    expect(getHeroCombatProfile(heroAt(10), EMPTY_EQUIPMENT).maxHp).toBeGreaterThan(base.maxHp);
    const tough = { ...heroAt(1), stats: { ...heroAt(1).stats, endurance: 50 } };
    expect(getHeroCombatProfile(tough, EMPTY_EQUIPMENT).maxHp).toBeGreaterThan(base.maxHp);
  });

  it("Ausrüstung erhöht Schaden und Rüstung", () => {
    const naked = getHeroCombatProfile(heroAt(10), EMPTY_EQUIPMENT);
    const geared = getHeroCombatProfile(heroAt(10), gearAt(10));
    expect(geared.damage).toBeGreaterThan(naked.damage);
    expect(geared.armor).toBeGreaterThan(0);
  });
});

describe("Kampfrunde", () => {
  const { creature } = getCreature("grey-wolf");
  const hero = getHeroCombatProfile(heroAt(3), gearAt(3));

  it("Held greift an, Kreatur schlägt zurück, nächste Runde beginnt", () => {
    const { state, events } = attackRound(startBattle("b", "Held", hero, creature), fixedRng(0.5));
    expect(events.map((e) => e.type)).toEqual(["hit", "hit"]);
    expect(state.enemy.hp).toBeLessThan(state.enemy.maxHp);
    expect(state.hero.hp).toBeLessThan(state.hero.maxHp);
    expect(state.round).toBe(2);
    expect(state.log).toHaveLength(2);
  });

  it("eine besiegte Kreatur schlägt nicht mehr zurück", () => {
    const battle = startBattle("b", "Held", hero, creature);
    const almostDead = { ...battle, enemy: { ...battle.enemy, hp: 1 } };
    const { state, events } = attackRound(almostDead, fixedRng(0.5));
    expect(state.status).toBe("won");
    expect(events.map((e) => e.type)).toEqual(["hit", "defeated"]);
    expect(state.hero.hp).toBe(state.hero.maxHp);
    expect(() => attackRound(state)).toThrow(/vorbei/);
  });

  it("der Kampf kann verloren werden", () => {
    const battle = startBattle("b", "Held", hero, creature);
    const almostDead = { ...battle, hero: { ...battle.hero, hp: 1 }, enemy: { ...battle.enemy, hp: 9999 } };
    const { state, events } = attackRound(almostDead, fixedRng(0.5));
    expect(state.status).toBe("lost");
    expect(state.hero.hp).toBe(0);
    expect(events.at(-1)).toEqual({ type: "defeated", side: "hero" });
  });
});

describe("Tränke", () => {
  const { creature } = getCreature("grey-wolf");
  const hero = getHeroCombatProfile(heroAt(3), gearAt(3));
  const hurt = (hp: number): BattleState => {
    const battle = startBattle("b", "Held", hero, creature);
    return { ...battle, hero: { ...battle.hero, hp } };
  };

  it("heilt, aber nie über das Maximum", () => {
    const { state } = drinkPotion(hurt(10), getPotion("small"));
    expect(state.hero.hp).toBe(10 + Math.round(hero.maxHp * 0.3));
    expect(drinkPotion(hurt(hero.maxHp - 2), getPotion("large")).state.hero.hp).toBe(hero.maxHp);
  });

  it("nur ein Trank pro Runde, jede Sorte nur einmal pro Kampf", () => {
    const { state } = drinkPotion(hurt(10), getPotion("small"));
    expect(() => drinkPotion(state, getPotion("medium"))).toThrow(/Runde/);
    const next = attackRound(state, fixedRng(0.5)).state;
    expect(next.potionUsedThisRound).toBe(false);
    expect(() => drinkPotion(next, getPotion("small"))).toThrow(/einmal|schon getrunken/);
    expect(() => drinkPotion(next, getPotion("medium"))).not.toThrow();
  });

  it("Angriffstrank erhöht den Schaden für 3 Runden", () => {
    const fresh = startBattle("b", "Held", hero, creature);
    const tough = { ...fresh, enemy: { ...fresh.enemy, hp: 99_999, maxHp: 99_999 } };
    const plain = attackRound(tough, fixedRng(0.5)).events[0];
    const buffed = drinkPotion(tough, getPotion("attack")).state;
    expect(buffed.buffs.attack).toEqual({ percent: 0.3, roundsLeft: 3 });
    const hit = attackRound(buffed, fixedRng(0.5));
    expect(hit.events[0].type === "hit" && plain.type === "hit" && hit.events[0].damage).toBeGreaterThan(
      plain.type === "hit" ? plain.damage : Infinity,
    );
    // läuft nach 3 Runden ab
    let s = hit.state;
    expect(s.buffs.attack?.roundsLeft).toBe(2);
    s = attackRound(attackRound(s, fixedRng(0.5)).state, fixedRng(0.5)).state;
    expect(s.buffs.attack).toBeUndefined();
  });

  it("Rüstungstrank senkt den erlittenen Schaden deutlich", () => {
    const veteran = getHeroCombatProfile(heroAt(30), gearAt(30));
    const fresh = startBattle("b", "Held", veteran, getCreature("crystal-scorpion").creature);
    const tough = { ...fresh, enemy: { ...fresh.enemy, hp: 99_999, maxHp: 99_999 } };
    const taken = (s: BattleState) => {
      const e = attackRound(s, fixedRng(0.5)).events[1];
      return e.type === "hit" ? e.damage : 0;
    };
    const armored = drinkPotion(tough, getPotion("armor")).state;
    expect(armored.buffs.armor).toEqual({ percent: 1, roundsLeft: 3 });
    expect(taken(armored)).toBeLessThan(taken(tough) * 0.9);
    // Verstärkungen gehen auch bei vollen Lebenspunkten
    expect(() => drinkPotion(tough, getPotion("attack"))).not.toThrow();
  });

  it("nicht bei vollen Lebenspunkten", () => {
    expect(() => drinkPotion(hurt(hero.maxHp), getPotion("small"))).toThrow(/voll/);
  });
});

describe("Flucht", () => {
  const { creature } = getCreature("grey-wolf");
  const hero = getHeroCombatProfile(heroAt(3), gearAt(3));

  it("beendet den Kampf ohne Gegenangriff", () => {
    const { state, events } = flee(startBattle("b", "Held", hero, creature), 11);
    expect(state.status).toBe("fled");
    expect(state.hero.hp).toBe(state.hero.maxHp);
    expect(events).toEqual([{ type: "fled", goldLost: 11 }]);
    expect(() => attackRound(state)).toThrow(/vorbei/);
  });

  it("kostet höchstens das vorhandene Gold", () => {
    expect(fleeCost(creature, 1000)).toBe(getCreatureGold(creature));
    expect(fleeCost(creature, 3)).toBe(3);
    expect(fleeCost(creature, 0)).toBe(0);
  });
});

describe("Belohnung", () => {
  it("Bosse lassen immer zwei Tränke fallen, stärkere in höheren Gebieten", () => {
    const hero = getHeroCombatProfile(heroAt(10), gearAt(10));
    const reward = rollBattleReward(getCreature("goblin-chief").creature, hero, "x", fixedRng(0.99));
    expect(reward.potions).toEqual({ potionId: "small", count: 2 });
    expect(getCreaturePotionDrop(getCreature("lich-king").creature).potionId).toBe("large");
    expect(rollBattleReward(getCreature("grey-wolf").creature, hero, "y", fixedRng(0.99)).potions).toBeNull();
    expect(rollBattleReward(getCreature("grey-wolf").creature, hero, "z", fixedRng(0.1)).potions).toEqual({
      potionId: "small",
      count: 1,
    });
  });

  it("Bosse geben immer Beute und mehr Gold", () => {
    const hero = getHeroCombatProfile(heroAt(10), gearAt(10));
    const boss = getCreature("goblin-chief").creature;
    const normal = getCreature("goblin-raider").creature;
    const bossReward = rollBattleReward(boss, hero, "x", fixedRng(0.99));
    expect(bossReward.loot).not.toBeNull();
    expect(bossReward.gold).toBeGreaterThan(rollBattleReward(normal, hero, "y", fixedRng(0.99)).gold);
    expect(rollBattleReward(normal, hero, "z", fixedRng(0.99)).loot).toBeNull();
  });

  it("Gold fällt bei normalen Kreaturen nur manchmal, innerhalb der Spanne", () => {
    const creature = getCreature("goblin-raider").creature;
    const { chance, min, max } = getCreatureGoldDrop(creature);
    expect(chance).toBeLessThan(1);
    expect(rollCreatureGold(creature, fixedRng(0.99))).toBe(0);
    expect(rollCreatureGold(creature, fixedRng(0))).toBe(min);
    expect(rollCreatureGold(creature, fixedRng(chance - 0.001))).toBeLessThanOrEqual(max);
    for (let i = 0; i < 200; i++) {
      const gold = rollCreatureGold(creature);
      expect(gold === 0 || (gold >= min && gold <= max)).toBe(true);
    }
  });
});

describe("Boss-Items", () => {
  const bosses = AREAS.map((a) => a.creatures.find((c) => c.boss)!);

  it("jeder Boss hat 2 Waffen, einen Helm und eine Brustrüstung", () => {
    for (const boss of bosses) {
      const items = getBossItems(boss.id);
      expect(items.filter((i) => i.kind === "weapon" && i.type !== "shield"), boss.id).toHaveLength(2);
      expect(items.filter((i) => i.type === "head"), boss.id).toHaveLength(1);
      expect(items.filter((i) => i.type === "chest"), boss.id).toHaveLength(1);
      expect(items.every((i) => i.requiredLevel === boss.level)).toBe(true);
    }
    expect(BOSS_ITEMS).toHaveLength(24 + 4 * 7);
  });

  it("Dungeon-Bosse haben 2 Waffen und ein komplettes Rüstungsset; Dolch und Schild sind abgedeckt", () => {
    for (const dungeon of DUNGEONS) {
      const boss = dungeon.creatures.at(-1)!;
      const items = getBossItems(boss.id);
      expect(items.filter((i) => i.kind === "weapon"), boss.id).toHaveLength(2);
      expect(items.filter((i) => i.kind === "armor").map((i) => i.type).sort(), boss.id).toEqual(
        ["arms", "chest", "feet", "head", "legs"],
      );
    }
    const weaponTypes = new Set(BOSS_ITEMS.filter((i) => i.kind === "weapon").map((i) => i.type));
    expect(weaponTypes.size).toBe(ITEM_TYPES.filter((t) => t.kind === "weapon").length);
  });

  it("Boss-Waffen übertreffen jedes Katalog-Item gleichen Typs und Levels deutlich", () => {
    for (const item of BOSS_ITEMS) {
      const peers = ITEMS.filter((i) => i.type === item.type && i.requiredLevel === item.requiredLevel);
      const key = item.kind === "weapon" ? "attack" : "armor";
      const best = Math.max(...peers.map((i) => i[key]));
      expect(item[key], item.id).toBeGreaterThanOrEqual(Math.round(best * (key === "attack" ? 1.3 : 1.15)));
    }
  });

  it("gibt es nur beim eigenen Boss, mit 10 % Chance und immer legendär", () => {
    const boss = getCreature("lich-king").creature;
    const drop = rollBossLoot(boss, "x", fixedRng(0.09));
    expect(drop?.rarity).toBe("legendary");
    expect(getBossItems("lich-king").map((i) => i.id)).toContain(drop?.itemId);
    expect(rollBossLoot(boss, "x", fixedRng(0.11))).toBeNull();
    expect(rollBossLoot(getCreature("grey-wolf").creature, "x", fixedRng(0))).toBeNull();
    expect(BOSS_ITEM_DROP_CHANCE).toBe(0.1);
  });

  it("Angriffs- und Rüstungstränke fallen selten bei jedem Gegner – kaufen kann man sie nicht", () => {
    expect(rollBuffPotion(fixedRng(0.05))).not.toBeNull();
    expect(["attack", "armor"]).toContain(rollBuffPotion(fixedRng(0.05)));
    expect(rollBuffPotion(fixedRng(0.07))).toBeNull();
    for (const id of ["attack", "armor", "large"]) {
      expect(() => buyPotion({}, 99_999, id)).toThrow(/Beute/);
    }
    expect(buyPotion({}, 99_999, "small").stock.small).toBe(1);
    // Normale Beute enthält nie Boss-Items
    expect(lootPool(60).some((i) => i.bossId)).toBe(false);
  });
});

describe("Gebiete und Balance", () => {
  it("6 Gebiete decken Level 1–60 lückenlos ab, jedes mit einem Boss am Ende", () => {
    expect(AREAS).toHaveLength(6);
    expect(AREAS[0].minLevel).toBe(1);
    expect(AREAS.at(-1)!.maxLevel).toBe(MAX_LEVEL);
    for (let i = 1; i < AREAS.length; i++) expect(AREAS[i].minLevel).toBe(AREAS[i - 1].maxLevel + 1);
    for (const area of AREAS) {
      const boss = area.creatures.at(-1)!;
      expect(boss.boss).toBe(true);
      expect(boss.level).toBe(area.maxLevel);
    }
  });

  it("jede Kreatur hat eine eigene, gültige 16×16-Grafik", () => {
    for (const area of [...AREAS, ...DUNGEONS]) {
      for (const creature of area.creatures) {
        const sprite = CREATURE_SPRITES[creature.sprite];
        expect(sprite, creature.name).toBeDefined();
        expect(sprite.grid, creature.name).toHaveLength(16);
        sprite.grid.forEach((row, y) => {
          expect(row.length, `${creature.sprite} Zeile ${y}`).toBe(16);
          for (const ch of row) {
            if (ch === ".") continue;
            expect(sprite.palette[ch] ?? SHARED_PALETTE[ch], `${creature.sprite}: Farbe „${ch}“`).toBeDefined();
          }
        });
      }
    }
  });

  it("ein gut ausgerüsteter Held besiegt Kreaturen seines Levels meistens", () => {
    for (const area of AREAS) {
      for (const creature of area.creatures.filter((c) => !c.boss)) {
        const hero = getHeroCombatProfile(heroAt(creature.level), gearAt(creature.level));
        const rng = seeded(creature.level);
        const results = Array.from({ length: 100 }, () => simulate(hero, creature, rng));
        const winRate = results.filter((r) => r.status === "won").length / results.length;
        const avgRounds = results.reduce((s, r) => s + r.round, 0) / results.length;
        expect(winRate, `${creature.name}: Siegquote`).toBeGreaterThan(0.9);
        expect(avgRounds, `${creature.name}: Runden`).toBeGreaterThanOrEqual(3);
        expect(avgRounds, `${creature.name}: Runden`).toBeLessThanOrEqual(10);
      }
    }
  });

  it("Bosse sind ohne Tränke eine echte Herausforderung", () => {
    for (const area of AREAS) {
      const boss = area.creatures.at(-1)!;
      const hero = getHeroCombatProfile(heroAt(boss.level), gearAt(boss.level));
      const rng = seeded(boss.level);
      const wins = Array.from({ length: 100 }, () => simulate(hero, boss, rng)).filter((r) => r.status === "won");
      expect(wins.length, `${boss.name}: Siege ohne Tränke`).toBeLessThan(90);
    }
  });
});
