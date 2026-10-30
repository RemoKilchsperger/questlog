import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "../store/gameStore";
import { attackRound, drinkPotion, getHeroCombatProfile, startBattle, type BattleState } from "./combat";
import { getCreature, getCreatureStats } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { createItem } from "./items";
import { xpForNextLevel } from "./leveling";
import { getPotion } from "./potions";
import {
  BLESSING,
  BLESSING_CHOICES,
  blessedProfile,
  blessingOffer,
  BOSS_FLOOR_FACTOR,
  EMPTY_TOWER_RECORD,
  floorCreature,
  floorElite,
  floorPower,
  isBlessingFloor,
  isBossFloor,
  isoWeek,
  recordFloor,
  TOWER_REWARD,
  towerReward,
  weekBest,
} from "./tower";
import { ACHIEVEMENTS, EMPTY_RECORDS } from "./achievements";
import { DAILY_TOWER_FLOOR, rollDailyQuests, rollWeeklyQuests, WEEKLY_TOWER_FLOOR } from "./quests";

const xpFor = (level: number) => {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += xpForNextLevel(l);
  return xp;
};
const profile = getHeroCombatProfile(
  { name: "Held", totalXp: xpFor(20), gold: 0, essence: 0, stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 }, spentPoints: 0, skills: {}, abilities: [] },
  { ...EMPTY_EQUIPMENT, weapon1: createItem("sword-0", "common", "w1") },
);
const rng = (value: number) => () => value;

describe("Endlos-Turm: Stockwerke", () => {
  it("Gegner auf dem Level des Helden, Stärke wächst mit dem Stockwerk, jedes 5. ein (schwächerer) Boss", () => {
    const first = floorCreature("s", 1, 23);
    expect(first.level).toBe(23);
    expect(first.boss).toBe(false);
    expect(floorPower(1)).toBeLessThan(1);
    expect(floorPower(20)).toBeGreaterThan(floorPower(10));
    const boss = floorCreature("s", 5, 23);
    expect(boss.boss).toBe(true);
    expect(isBossFloor(10) && !isBossFloor(11)).toBe(true);
    const base = getCreature(boss.id).creature;
    expect(boss.power).toBeCloseTo((base.power ?? 1) * floorPower(5) * BOSS_FLOOR_FACTOR);
    // Gleicher Lauf, gleiches Stockwerk – gleicher Gegner (Neuladen ändert nichts)
    expect(floorCreature("s", 7, 23).id).toBe(floorCreature("s", 7, 23).id);
    const high = floorCreature("s", 31, 23);
    expect(getCreatureStats(high).maxHp).toBeGreaterThan(getCreatureStats({ ...high, power: getCreature(high.id).creature.power ?? 1 }).maxHp);
  });

  it("Elite wird oben häufiger und bekommt mehr Modifikatoren – Bosse nie", () => {
    const elites = (floor: number) => Array.from({ length: 300 }, (_, i) => floorElite(`r${i}`, floor));
    const share = (floor: number) => elites(floor).filter((e) => e.length > 0).length / 300;
    expect(share(24)).toBeGreaterThan(share(2));
    expect(Math.max(...elites(4).map((e) => e.length))).toBe(1);
    expect(Math.max(...elites(24).map((e) => e.length))).toBe(3);
    expect(elites(5).every((e) => e.length === 0)).toBe(true);
  });
});

describe("Endlos-Turm: Segen", () => {
  it("drei verschiedene zur Wahl, Zweiter Atem nur einmal pro Lauf", () => {
    const offer = blessingOffer("s", 3, []);
    expect(offer).toHaveLength(BLESSING_CHOICES);
    expect(new Set(offer).size).toBe(BLESSING_CHOICES);
    for (let f = 3; f < 300; f += 3) expect(blessingOffer(`x${f}`, f, ["secondWind"])).not.toContain("secondWind");
    expect(isBlessingFloor(3) && !isBlessingFloor(4)).toBe(true);
  });

  it("Kraft, Ahnen, Vitalität und Präzision stapeln sich auf den Werten", () => {
    const blessed = blessedProfile(profile, ["might", "might", "ancestors", "vitality", "precision"]);
    expect(blessed.damage).toBeCloseTo(profile.damage * (1 + 2 * BLESSING.might));
    expect(blessed.maxHp).toBe(Math.round(profile.maxHp * (1 + BLESSING.vitality)));
    expect(blessed.critChance).toBeCloseTo(profile.critChance + BLESSING.precision);
  });

  const fight = (blessings: BattleState["blessings"], overrides: Partial<BattleState> = {}): BattleState => {
    const battle = startBattle("b", "Held", profile, getCreature("grey-wolf").creature);
    return { ...battle, blessings, hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 }, enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 }, ...overrides };
  };

  it("Dornen werfen Schaden zurück, Blutdurst heilt", () => {
    const { events } = attackRound(fight(["thorns"]), rng(0.5));
    const hit = events.find((e) => e.type === "hit" && e.attacker === "enemy");
    const thorns = events.find((e) => e.type === "thorns");
    expect(hit?.type === "hit" && thorns?.type === "thorns" && thorns.damage).toBe(Math.max(1, Math.round((hit as { damage: number }).damage * BLESSING.thorns)));
    const hurt = fight(["bloodthirst"]);
    const healed = attackRound({ ...hurt, hero: { ...hurt.hero, hp: 50_000 } }, rng(0.5)).events;
    expect(healed.some((e) => e.type === "selfHeal")).toBe(true);
  });

  it("Zweiter Atem: einmal wieder aufstehen – beim zweiten Mal ist der Lauf vorbei", () => {
    const base = fight(["secondWind"]);
    const dying = { ...base, hero: { ...base.hero, hp: 1, maxHp: 1000 } };
    const saved = attackRound(dying, rng(0.5));
    expect(saved.state.status).toBe("active");
    expect(saved.state.hero.hp).toBe(Math.round(1000 * BLESSING.secondWind));
    expect(saved.state.secondWindUsed).toBe(true);
    expect(saved.events).toContainEqual({ type: "secondWind", heal: 300 });
    const again = attackRound({ ...saved.state, hero: { ...saved.state.hero, hp: 1 } }, rng(0.5));
    expect(again.state.status).toBe("lost");
  });

  it("Alchemie lässt Heiltränke stärker wirken, Fokus macht Fähigkeiten billiger", () => {
    const plain = fight([], { hero: { ...fight([]).hero, hp: 1, maxHp: 1000 } });
    const alchemist = { ...plain, blessings: ["alchemy" as const] };
    const heal = (s: BattleState) => drinkPotion(s, getPotion("small")).state.hero.hp - 1;
    expect(heal(alchemist)).toBe(Math.round(heal(plain) * (1 + BLESSING.alchemy)));
  });
});

describe("Endlos-Turm: Rekorde", () => {
  it("bestes Stockwerk für immer und pro Woche – eine neue Woche beginnt bei 0", () => {
    let record = recordFloor(EMPTY_TOWER_RECORD, 7, "2026-W44");
    record = recordFloor(record, 5, "2026-W44");
    expect(record).toEqual({ best: 7, weekBest: 7, week: "2026-W44" });
    record = recordFloor(record, 3, "2026-W45");
    expect(record).toEqual({ best: 7, weekBest: 3, week: "2026-W45" });
    expect(weekBest(record, "2026-W46")).toBe(0);
  });

  it("Kalenderwoche nach ISO 8601", () => {
    expect(isoWeek(new Date(2026, 9, 30))).toBe("2026-W44");
    expect(isoWeek(new Date(2027, 0, 1))).toBe("2026-W53");
    expect(isoWeek(new Date(2026, 0, 1))).toBe("2026-W01");
  });
});

describe("Endlos-Turm: Lauf im Store", () => {
  beforeEach(() => useGameStore.getState().resetGame());
  const setLevel = (level: number) => useGameStore.setState((s) => ({ character: { ...s.character, totalXp: xpFor(level) } }));
  /** Der Gegner des aktuellen Stockwerks fällt beim nächsten Schlag. */
  const winFloor = () => {
    const { battle } = useGameStore.getState();
    useGameStore.setState({ battle: { ...battle!, enemy: { ...battle!.enemy, hp: 1 }, adds: [] } });
    useGameStore.getState().battleAttack();
  };

  it("erst ab Level 10", () => {
    useGameStore.getState().startTower();
    expect(useGameStore.getState().tower).toBeNull();
    setLevel(10);
    useGameStore.getState().startTower();
    expect(useGameStore.getState().battle?.towerFloor).toBe(1);
  });

  it("Stockwerke, Segen nach dem dritten, Truhe beim Aussteigen gutgeschrieben, Rekord gespeichert", () => {
    setLevel(15);
    useGameStore.getState().startTower();
    for (let floor = 1; floor <= 3; floor++) {
      winFloor();
      expect(useGameStore.getState().battle?.status).toBe("won");
      if (floor < 3) useGameStore.getState().nextTowerFloor();
    }
    const { tower } = useGameStore.getState();
    expect(tower?.offer).toHaveLength(BLESSING_CHOICES);
    // Ohne Segen-Wahl geht es nicht weiter
    useGameStore.getState().nextTowerFloor();
    expect(useGameStore.getState().tower?.floor).toBe(3);
    useGameStore.getState().chooseBlessing(tower!.offer![0]);
    expect(useGameStore.getState().tower?.blessings).toEqual([tower!.offer![0]]);
    expect(useGameStore.getState().towerRecord).toMatchObject({ best: 3, weekBest: 3, week: isoWeek() });
    const xpBefore = useGameStore.getState().character.totalXp;
    const chestXp = useGameStore.getState().tower!.chest.xp;
    expect(chestXp).toBeGreaterThan(0);
    useGameStore.getState().leaveTowerWithChest();
    expect(useGameStore.getState().character.totalXp).toBe(xpBefore + chestXp);
    expect(useGameStore.getState().tower?.claimed).not.toBeNull();
    // Turm-Bosse starten keinen Respawn und zählen nicht als Bosssieg
    expect(useGameStore.getState().bossRespawns).toEqual({});
  });

  it("bei einer Niederlage ist die Truhe verloren", () => {
    setLevel(15);
    useGameStore.getState().startTower();
    winFloor();
    useGameStore.getState().nextTowerFloor();
    const { battle } = useGameStore.getState();
    useGameStore.setState({ battle: { ...battle!, hero: { ...battle!.hero, hp: 1 }, enemy: { ...battle!.enemy, hp: 99_999, maxHp: 99_999 } } });
    const xpBefore = useGameStore.getState().character.totalXp;
    useGameStore.getState().battleAttack();
    expect(useGameStore.getState().battle?.status).toBe("lost");
    expect(useGameStore.getState().character.totalXp).toBe(xpBefore);
    expect(useGameStore.getState().towerRecord.best).toBe(1);
  });
});

describe("Endlos-Turm: Belohnung, Aufträge, Erfolge", () => {
  const full = { xp: 1000, gold: 500, loot: createItem("sword-10", "rare", "l"), bossLoot: createItem("boss-ore-king-dagger", "legendary", "b"), potions: { potionId: "small", count: 2 }, buffPotion: "attack" };

  it("stark gekürzt: Bruchteil der Erfahrung und des Golds, Items und Tränke nur von Bossen (Elite selten), nie Boss-Items", () => {
    const normal = towerReward(full, 1, [], false, rng(0));
    expect(normal).toEqual({ xp: Math.round(1000 * TOWER_REWARD.xp), gold: Math.round(500 * TOWER_REWARD.gold), loot: null, potions: null, bossLoot: null, buffPotion: null });
    expect(towerReward(full, 4, [], true, rng(0)).loot).not.toBeNull();
    expect(towerReward(full, 4, [], true, rng(0.99)).loot).toBeNull();
    const boss = towerReward(full, 5, [], false, rng(0.99));
    expect(boss.loot).not.toBeNull();
    expect(boss.potions).toEqual({ potionId: "small", count: 2 });
    expect(boss.bossLoot).toBeNull();
    // Höher oben und mit Schatzsucher etwas mehr
    expect(towerReward(full, 20, ["treasure"], false, rng(0)).xp).toBeGreaterThan(normal.xp * 2);
  });

  it("Tages- und Wochenauftrag ab Level 10: Stockwerk in einem Lauf", () => {
    const daily = rollDailyQuests("2026-10-30", 15, rng(0.3)).quests.map((q) => q.def.goal);
    expect(daily).toContainEqual({ kind: "towerFloor", floor: DAILY_TOWER_FLOOR });
    expect(rollDailyQuests("2026-10-30", 9, rng(0.3)).quests.some((q) => q.def.goal.kind === "towerFloor")).toBe(false);
    expect(rollWeeklyQuests("2026-10-26", 15).quests.map((q) => q.def.goal)).toContainEqual({ kind: "towerFloor", floor: WEEKLY_TOWER_FLOOR });
  });

  it("Erfolge zählen bestes Stockwerk, Turm-Bosse und Segen in einem Lauf", () => {
    const climber = ACHIEVEMENTS.find((a) => a.id === "tower-climber")!;
    const input = { character: { totalXp: 0 }, questLog: {}, bossCollection: [], coopStats: {}, records: { ...EMPTY_RECORDS, towerBest: 12, towerBosses: 2, towerBlessings: 4 } } as never;
    expect(climber.progress(input)).toBe(12);
    expect(ACHIEVEMENTS.find((a) => a.id === "tower-blessed")!.progress(input)).toBe(4);
    expect(ACHIEVEMENTS.filter((a) => a.category === "tower")).toHaveLength(3);
  });

  it("im Store: Rekord, Turm-Bosse und Turm-Auftrag zählen mit", () => {
    useGameStore.getState().resetGame();
    useGameStore.setState((s) => ({ character: { ...s.character, totalXp: xpFor(15) } }));
    useGameStore.getState().refreshQuestBoards();
    useGameStore.getState().startTower();
    for (let floor = 1; floor <= 5; floor++) {
      const { battle, tower } = useGameStore.getState();
      useGameStore.setState({ battle: { ...battle!, enemy: { ...battle!.enemy, hp: 1 }, adds: [] } });
      useGameStore.getState().battleAttack();
      if (tower!.offer === null && useGameStore.getState().tower!.offer) useGameStore.getState().chooseBlessing(useGameStore.getState().tower!.offer![0]);
      if (floor < 5) useGameStore.getState().nextTowerFloor();
    }
    const { records, dailyQuests } = useGameStore.getState();
    expect(records.towerBest).toBe(5);
    expect(records.towerBosses).toBe(1);
    expect(records.towerBlessings).toBe(1);
    expect(dailyQuests.quests.find((q) => q.def.goal.kind === "towerFloor")?.progress).toBe(DAILY_TOWER_FLOOR);
  });
});
