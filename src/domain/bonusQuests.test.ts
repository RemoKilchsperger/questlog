import { describe, expect, it } from "vitest";
import { BONUS_QUESTS, getDailyBonusQuests } from "./bonusQuests";
import { dateKey } from "./calendar";
import { rollLoot } from "./loot";
import { calculateReward, CATEGORIES, dropChance, EFFORT_TIERS } from "./rewards";

const ALL = Object.values(BONUS_QUESTS).flat();

/** Die nächsten `count` Tage ab 1.1.2026 als "yyyy-mm-dd". */
const days = (count: number) => Array.from({ length: count }, (_, i) => dateKey(new Date(2026, 0, 1 + i)));

describe("Bonusquest-Katalog", () => {
  it("hat 25 Quests pro Stufe und mindestens 25 pro Kategorie", () => {
    for (const { key } of EFFORT_TIERS) expect(BONUS_QUESTS[key]).toHaveLength(25);
    for (const { key } of CATEGORIES) {
      expect(ALL.filter((q) => q.category === key).length).toBeGreaterThanOrEqual(25);
    }
  });

  it("IDs und Titel sind eindeutig", () => {
    expect(new Set(ALL.map((q) => q.id)).size).toBe(ALL.length);
    expect(new Set(ALL.map((q) => q.title)).size).toBe(ALL.length);
  });
});

describe("Tägliche Auswahl", () => {
  it("gibt pro Tag genau eine Quest je Stufe", () => {
    const quests = getDailyBonusQuests("2026-10-05");
    expect(quests.map((q) => q.effort)).toEqual(EFFORT_TIERS.map((t) => t.key));
  });

  it("ist für denselben Tag immer gleich", () => {
    expect(getDailyBonusQuests("2026-10-05")).toEqual(getDailyBonusQuests("2026-10-05"));
  });

  it("wiederholt nie die Quest vom Vortag und zeigt in 25 Tagen jede Quest einer Stufe", () => {
    const picks = days(400).map(getDailyBonusQuests);
    for (let d = 1; d < picks.length; d++) {
      for (let tier = 0; tier < EFFORT_TIERS.length; tier++) {
        expect(picks[d][tier].id).not.toBe(picks[d - 1][tier].id);
      }
    }
    // Ein Durchgang beginnt an einem durch 25 teilbaren Tag seit 1970.
    const start = days(60).findIndex((day) => Math.round(Date.parse(day) / 86_400_000) % 25 === 0);
    const cycle = picks.slice(start, start + 25);
    expect(new Set(cycle.map((p) => p[0].id)).size).toBe(25);
  });
});

describe("Bonus-Belohnung", () => {
  it("gibt mehr XP, Gold und Drop-Chance", () => {
    for (const { key } of EFFORT_TIERS) {
      const normal = calculateReward(key, "body");
      const bonus = calculateReward(key, "body", true);
      expect(bonus.xp).toBeGreaterThan(normal.xp);
      expect(bonus.gold).toBeGreaterThan(normal.gold);
      expect(dropChance(key, true)).toBeGreaterThan(dropChance(key));
      expect(dropChance(key, true)).toBeLessThanOrEqual(1);
    }
  });

  it("Bonus-Drops greifen auch dort, wo eine normale Quest leer ausginge", () => {
    // 0.06 liegt über der normalen Chance (5 %), aber unter der Bonus-Chance (7,5 %).
    const rng = () => 0.06;
    expect(rollLoot("quick", 1, "x", rng)).toBeNull();
    expect(rollLoot("quick", 1, "x", rng, true)).not.toBeNull();
  });
});
