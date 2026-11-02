import { describe, expect, it } from "vitest";
import {
  addCompanionXp,
  applyMissionXp,
  companionGearScore,
  companionLevel,
  dismissCompanion,
  EMPTY_RECRUIT_POOL,
  equipBest,
  equipCompanion,
  isBusy,
  isMissionDone,
  missionChance,
  missionDurationMs,
  missionLoot,
  missionXp,
  randomName,
  recruit,
  recruitPrice,
  rerollRecruits,
  rollMissionBoard,
  rollMissionOutcome,
  rollRecruitPool,
  rollTraits,
  startMission,
  TAVERN_RULES,
  traitText,
  type Companion,
  type CompanionTrait,
  type MissionDef,
} from "./companions";
import { EMPTY_EQUIPMENT } from "./equipment";
import { gearScore } from "./gearScore";
import { createItem, ITEMS } from "./items";
import { totalXpForLevel } from "./leveling";
import type { Equipment, ItemDef, OwnedItem, Rarity } from "./types";

/** Deterministischer Zufall für reproduzierbare Tests. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

let uidCounter = 0;
const uid = () => `uid-${++uidCounter}`;

const itemAt = (type: string, level: number, armorClass?: string): ItemDef =>
  ITEMS.filter((i) => i.type === type && (!armorClass || i.armorClass === armorClass) && i.requiredLevel <= level && !i.bossId).at(-1)!;

const owned = (def: ItemDef, rarity: Rarity = "common"): OwnedItem => createItem(def.id, rarity, uid(), seeded());

/** Volle Ausrüstung auf diesem Level – Rüstung und zwei Schwerter. */
function fullGear(level: number, rarity: Rarity = "common"): Equipment {
  return {
    head: owned(itemAt("head", level, "heavy"), rarity),
    chest: owned(itemAt("chest", level, "heavy"), rarity),
    arms: owned(itemAt("arms", level, "heavy"), rarity),
    legs: owned(itemAt("legs", level, "heavy"), rarity),
    feet: owned(itemAt("feet", level, "heavy"), rarity),
    weapon1: owned(itemAt("sword", level), rarity),
    weapon2: owned(itemAt("sword", level), rarity),
  };
}

const companion = (level: number, traits: CompanionTrait[] = [], equipment: Equipment = EMPTY_EQUIPMENT, id = uid()): Companion => ({
  id,
  name: `Test ${id}`,
  totalXp: totalXpForLevel(level),
  traits,
  equipment,
});

const mission = (overrides: Partial<MissionDef> = {}): MissionDef => ({
  id: "m1",
  title: "Test",
  areaId: "crystal-caves",
  level: 30,
  duration: "medium",
  size: 1,
  difficulty: "normal",
  ...overrides,
});

describe("Namen", () => {
  it("setzt Vorname und Beiname zusammen und vermeidet vergebene Namen", () => {
    const rng = seeded(7);
    const first = randomName([], rng);
    expect(first.split(" ").length).toBeGreaterThanOrEqual(2);
    const names = new Set<string>();
    for (let i = 0; i < 200; i++) names.add(randomName([...names], rng));
    expect(names.size).toBe(200);
  });
});

describe("Anwerben", () => {
  it("bessere Taverne gibt mehr und seltenere Traits", () => {
    const rng = seeded(3);
    const roll = (tier: 1 | 3) => Array.from({ length: 500 }, () => rollTraits(tier, rng));
    const low = roll(1);
    const high = roll(3);
    expect(low.every((t) => t.length === 1)).toBe(true);
    expect(low.flat().every((t) => t.rarity === "common" || t.rarity === "rare")).toBe(true);
    expect(high.every((t) => t.length === 2 || t.length === 3)).toBe(true);
    expect(high.flat().some((t) => t.rarity === "legendary")).toBe(true);
    // Jeder Trait höchstens einmal pro Begleiter
    for (const traits of high) expect(new Set(traits.map((t) => t.id)).size).toBe(traits.length);
  });

  it("Kandidaten starten 5 Level unter dem Helden, mindestens auf Level 1", () => {
    const pool = rollRecruitPool("2026-11-02", 2, 30, [], uid, seeded());
    expect(pool.recruits).toHaveLength(3);
    expect(pool.recruits.every((r) => companionLevel(r) === 25)).toBe(true);
    expect(new Set(pool.recruits.map((r) => r.name)).size).toBe(3);
    const low = rollRecruitPool("2026-11-02", 1, 3, [], uid, seeded());
    expect(low.recruits.every((r) => companionLevel(r) === 1)).toBe(true);
  });

  it("Preis hängt von Level und seltenstem Trait ab", () => {
    expect(recruitPrice(companion(30, [{ id: "treasure", rarity: "common" }]))).toBe(195);
    expect(recruitPrice(companion(30, [{ id: "treasure", rarity: "common" }, { id: "lucky", rarity: "rare" }]))).toBe(390);
    expect(recruitPrice(companion(1, [{ id: "swift", rarity: "legendary" }]))).toBe(400);
  });

  it("braucht Taverne, freien Platz und Gold", () => {
    const pool = rollRecruitPool("2026-11-02", 1, 10, [], uid, seeded());
    const candidate = pool.recruits[0];
    const price = recruitPrice(candidate);
    expect(() => recruit(pool, [], 10_000, candidate.id, 0)).toThrow("Taverne");
    expect(() => recruit(pool, [], price - 1, candidate.id, 1)).toThrow("Gold");
    const full = [companion(5), companion(5)];
    expect(full.length).toBe(TAVERN_RULES[1].slots);
    expect(() => recruit(pool, full, 10_000, candidate.id, 1)).toThrow("Plätze");
    const result = recruit(pool, [], price, candidate.id, 1);
    expect(result.gold).toBe(0);
    expect(result.companions).toEqual([candidate]);
    expect(result.pool.recruits).toHaveLength(2);
  });

  it("neu würfeln geht einmal am Tag", () => {
    const today = "2026-11-02";
    const first = rerollRecruits(EMPTY_RECRUIT_POOL, 1000, today, 1, 10, [], uid, seeded());
    expect(first.pool.rerolled).toBe(true);
    expect(first.gold).toBe(1000 - 95);
    expect(() => rerollRecruits(first.pool, 1000, today, 1, 10, [], uid, seeded())).toThrow("schon");
    // Am nächsten Tag wieder
    expect(() => rerollRecruits(first.pool, 1000, "2026-11-03", 1, 10, [], uid, seeded())).not.toThrow();
  });

  it("Entlassen gibt die Items zurück, aber nicht während einer Mission", () => {
    const gear = fullGear(20);
    const c = companion(20, [], gear);
    const result = dismissCompanion([c], [], c.id, []);
    expect(result.companions).toHaveLength(0);
    expect(result.inventory).toHaveLength(7);
    const busy = startMission(
      { date: "d", missions: [mission()], taken: [] },
      [],
      [c],
      "m1",
      [c.id],
      "d",
      0,
      uid(),
      seeded(),
    );
    expect(() => dismissCompanion([c], [], c.id, busy.active)).toThrow("Mission");
  });
});

describe("Traits", () => {
  it("beschreibt die Wirkung", () => {
    expect(traitText({ id: "treasure", rarity: "rare" })).toBe("+20 % Gold aus Missionen");
    expect(traitText({ id: "lucky", rarity: "epic" })).toBe("+8 Prozentpunkte Erfolgschance");
    expect(traitText({ id: "swift", rarity: "rare" })).toBe("−15 % Missionsdauer");
  });
});

describe("Level", () => {
  it("höchstens so hoch wie der Held", () => {
    const c = companion(20);
    const capped = addCompanionXp(c, 1_000_000, 22);
    expect(companionLevel(capped)).toBe(22);
    expect(capped.totalXp).toBe(totalXpForLevel(22));
    expect(companionLevel(addCompanionXp(c, 100, 30))).toBe(20);
  });
});

describe("Ausrüstung", () => {
  it("trägt Items unabhängig vom Level", () => {
    const sword = owned(itemAt("sword", 30));
    const result = equipCompanion(companion(1), [sword], sword.uid);
    expect(result.companion.equipment.weapon1).toBe(sword);
    expect(result.inventory).toHaveLength(0);
  });

  it("Kampferprobt erhöht den Gearscore", () => {
    const gear = fullGear(30);
    expect(companionGearScore(companion(30, [], gear))).toBe(gearScore(gear));
    expect(companionGearScore(companion(30, [{ id: "veteran", rarity: "legendary" }], gear))).toBe(Math.round(gearScore(gear) * 1.15));
  });

  it("Bestes anlegen wählt die höchsten Item-Scores", () => {
    const old = fullGear(10);
    const better = [
      owned(itemAt("head", 20, "light"), "rare"),
      owned(itemAt("greatsword", 20), "epic"),
      owned(itemAt("shield", 20)),
      owned(itemAt("shield", 20)),
      owned(itemAt("chest", 40, "medium"), "legendary"), // über dem Begleiterlevel
    ];
    const result = equipBest(companion(20, [], old), better);
    const eq = result.companion.equipment;
    expect(eq.head).toBe(better[0]);
    expect(eq.chest).toBe(better[4]);
    // Epische Zweihandwaffe (doppelt) schlägt zwei gewöhnliche Einhänder
    expect(eq.weapon1).toBe(better[1]);
    expect(eq.weapon2).toBeNull();
    // Nichts geht verloren
    const worn = Object.values(eq).filter((o) => o !== null);
    expect(worn.length + result.inventory.length).toBe(7 + better.length);
    expect(result.inventory).toContain(old.chest);
  });

  it("Bestes anlegen nimmt höchstens einen Schild", () => {
    const shields = [owned(itemAt("shield", 20), "epic"), owned(itemAt("shield", 20), "epic"), owned(itemAt("dagger", 10))];
    const eq = equipBest(companion(20), shields).companion.equipment;
    expect([eq.weapon1, eq.weapon2]).toContain(shields[2]);
  });
});

describe("Missionstafel", () => {
  it("vier Missionen rund ums Heldenlevel, Truppstärke höchstens so gross wie die Plätze", () => {
    const rng = seeded(11);
    for (let i = 0; i < 50; i++) {
      const board = rollMissionBoard("2026-11-02", 30, 1, rng);
      expect(board.missions.map((m) => m.level)).toEqual([22, 26, 30, 32]);
      expect(board.missions.every((m) => m.size >= 1 && m.size <= 2)).toBe(true);
      expect(new Set(board.missions.map((m) => m.id)).size).toBe(4);
    }
    const low = rollMissionBoard("2026-11-02", 2, 3, rng);
    expect(low.missions.map((m) => m.level)).toEqual([1, 1, 2, 4]);
    expect(low.missions.every((m) => m.areaId === "darkwood")).toBe(true);
    const high = rollMissionBoard("2026-11-02", 60, 3, rng);
    expect(high.missions.at(-1)!.level).toBe(60);
  });
});

describe("Erfolgschance", () => {
  it("50 % bei gleichem Gearscore, mehr mit besserer Ausrüstung", () => {
    const m = mission({ level: 30 });
    const common = companion(30, [], fullGear(30));
    expect(gearScore(common.equipment)).toBe(30);
    expect(missionChance(m, [common])).toBeCloseTo(0.5);
    // Seltene Items: Faktor 1.2 → 74 %
    expect(missionChance(m, [companion(30, [], fullGear(30, "rare"))])).toBeCloseTo(0.74);
    // Schwer braucht seltene Items für 50 %
    expect(missionChance(mission({ difficulty: "hard" }), [companion(30, [], fullGear(30, "rare"))])).toBeCloseTo(0.5);
    // Grenzen
    expect(missionChance(m, [companion(30)])).toBe(0.05);
    expect(missionChance(m, [companion(30, [], fullGear(30, "legendary"))])).toBe(0.95);
    expect(missionChance(m, [])).toBe(0);
  });

  it("Gruppe: Durchschnitt der Gearscores, Glückspilz zählt dazu", () => {
    const m = mission({ size: 2 });
    const strong = companion(30, [], fullGear(30, "rare"));
    const plain = companion(30, [], fullGear(30));
    // (36 + 30) / 2 = 33 → 10 % über den geforderten 30
    expect(missionChance(m, [strong, plain])).toBeCloseTo(0.62);
    const lucky = companion(30, [{ id: "lucky", rarity: "legendary" }], fullGear(30));
    expect(missionChance(m, [lucky])).toBeCloseTo(0.62);
  });
});

describe("Dauer", () => {
  it("Flink wirkt nur, wenn alle flink sind", () => {
    const m = mission({ duration: "long" });
    const fast = companion(30, [{ id: "swift", rarity: "legendary" }]);
    const fastish = companion(30, [{ id: "swift", rarity: "common" }]);
    expect(missionDurationMs(m, [companion(30)])).toBe(8 * 3_600_000);
    expect(missionDurationMs(m, [fast])).toBe(8 * 3_600_000 * 0.7);
    expect(missionDurationMs(m, [fast, fastish])).toBe(8 * 3_600_000 * 0.9);
    expect(missionDurationMs(m, [fast, companion(30)])).toBe(8 * 3_600_000);
  });
});

describe("Beute und EP", () => {
  it("wächst mit Dauer, Truppstärke und Schwierigkeit", () => {
    const one = missionLoot(mission({ duration: "long" }), [companion(30)]);
    // 20 Sieg-Äquivalente: 20 × 0.4 × 33 Gold, 10 Kristallsplitter
    expect(one.gold).toBe(264);
    expect(one.materials).toEqual({ crystalShard: 10 });
    expect(one.essence).toBe(16);
    expect(one.itemChance).toBe(0.6);
    const three = missionLoot(mission({ duration: "long", size: 3, difficulty: "heroic" }), [companion(30), companion(30), companion(30)]);
    expect(three.gold).toBe(Math.round(264 * 3 * 1.5));
  });

  it("Beute-Traits der Gruppe werden zusammengezählt", () => {
    const m = mission({ duration: "long", size: 2 });
    const a = companion(30, [{ id: "treasure", rarity: "rare" }, { id: "plunder", rarity: "legendary" }]);
    const b = companion(30, [{ id: "treasure", rarity: "rare" }, { id: "gatherer", rarity: "common" }]);
    const loot = missionLoot(m, [a, b]);
    expect(loot.gold).toBe(Math.round(264 * 2 * 1.4));
    expect(loot.materials).toEqual({ crystalShard: 22 });
    expect(loot.itemChance).toBeCloseTo(0.9);
  });

  it("Lernbegierig für sich, Lehrmeister für die anderen", () => {
    const m = mission({ size: 2 });
    const eager = companion(30, [{ id: "eager", rarity: "rare" }]);
    const mentor = companion(30, [{ id: "mentor", rarity: "legendary" }]);
    const plain = missionXp(m, companion(30), []);
    expect(missionXp(m, eager, [eager, mentor])).toBe(Math.round(plain * 1.45));
    expect(missionXp(m, mentor, [eager, mentor])).toBe(plain);
  });

  it("Misserfolg gibt nur ein Viertel der EP", () => {
    const m = mission();
    const c = companion(30);
    const failed = rollMissionOutcome(m, [c], uid(), () => 0.99);
    expect(failed.success).toBe(false);
    expect(failed.gold).toBe(0);
    expect(failed.item).toBeNull();
    expect(failed.xp[c.id]).toBe(Math.round(missionXp(m, c, [c]) * 0.25));
  });

  it("Erfolg gibt Beute und EP", () => {
    const c = companion(30, [], fullGear(30, "legendary"));
    const outcome = rollMissionOutcome(mission({ duration: "long" }), [c], uid(), () => 0.01);
    expect(outcome.success).toBe(true);
    expect(outcome.gold).toBeGreaterThan(0);
    expect(outcome.item).not.toBeNull();
    const [after] = applyMissionXp([c], outcome, 60);
    expect(after.totalXp).toBe(c.totalXp + outcome.xp[c.id]);
  });
});

describe("Losschicken", () => {
  const board = { date: "d", missions: [mission({ size: 2 })], taken: [] };
  const a = companion(30, [{ id: "swift", rarity: "common" }], fullGear(30));
  const b = companion(30, [{ id: "swift", rarity: "rare" }], fullGear(30));

  it("prüft Tafel, Truppstärke und ob die Begleiter frei sind", () => {
    expect(() => startMission(board, [], [a, b], "m1", [a.id, b.id], "morgen", 0, uid())).toThrow("gestern");
    expect(() => startMission(board, [], [a, b], "m1", [a.id], "d", 0, uid())).toThrow("genau 2");
    expect(() => startMission(board, [], [a, b], "m1", [a.id, a.id], "d", 0, uid())).toThrow("genau 2");
    expect(() => startMission(board, [], [a, b], "nope", [a.id, b.id], "d", 0, uid())).toThrow("gibt es nicht");
  });

  it("legt das Ergebnis fest und sperrt Mission und Begleiter", () => {
    const now = 1_000_000;
    const result = startMission(board, [], [a, b], "m1", [a.id, b.id], "d", now, uid(), seeded());
    const [started] = result.active;
    expect(result.board.taken).toEqual(["m1"]);
    expect(started.end - started.start).toBe(2 * 3_600_000 * 0.9);
    expect(started.chance).toBeCloseTo(0.5);
    expect(Object.keys(started.outcome.xp)).toEqual([a.id, b.id]);
    expect(isBusy(result.active, a.id)).toBe(true);
    expect(isMissionDone(started, now + 1000)).toBe(false);
    expect(isMissionDone(started, started.end)).toBe(true);
    expect(() => startMission(result.board, result.active, [a, b], "m1", [a.id, b.id], "d", now, uid())).toThrow("schon angenommen");
    const second = { ...result.board, missions: [...board.missions, mission({ id: "m2" })] };
    expect(() => startMission(second, result.active, [a, b], "m2", [a.id], "d", now, uid())).toThrow("unterwegs");
  });
});
