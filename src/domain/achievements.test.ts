import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "../store/gameStore";
import {
  ACHIEVEMENTS,
  EMPTY_RECORDS,
  evaluateAchievements,
  FRAMES,
  getAchievement,
  MAX_TIERS,
  tierFor,
  tierName,
  totalTiers,
  unlockedTitles,
  type AchievementInput,
} from "./achievements";
import { EMPTY_COOP_STATS } from "./coopCombat";
import { xpForNextLevel } from "./leveling";
import { EMPTY_QUEST_LOG, QUESTS } from "./quests";
import type { Character } from "./types";

const character = (level = 1): Character => {
  let totalXp = 0;
  for (let l = 1; l < level; l++) totalXp += xpForNextLevel(l);
  return {
    name: "Held", totalXp, gold: 0, essence: 0,
    stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
    spentPoints: 0, skills: {}, abilities: [],
  };
};
const input = (overrides: Partial<AchievementInput> = {}): AchievementInput => ({
  character: character(),
  questLog: EMPTY_QUEST_LOG,
  bossCollection: [],
  coopStats: EMPTY_COOP_STATS,
  records: EMPTY_RECORDS,
  ...overrides,
});

describe("Erfolge", () => {
  it("haben eindeutige Ids, aufsteigende Stufen und je einen Titel", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length, a.id).toBeGreaterThan(0);
      expect([...a.tiers].sort((x, y) => x - y), a.id).toEqual([...a.tiers]);
    }
    expect(MAX_TIERS).toBe(ACHIEVEMENTS.reduce((s, a) => s + a.tiers.length, 0));
  });

  it("Stufen nach Zielwerten; einstufige Erfolge zählen als Gold", () => {
    const quests = getAchievement("quest-master");
    expect(tierFor(quests, 9)).toBe(0);
    expect(tierFor(quests, 10)).toBe(1);
    expect(tierFor(quests, 500)).toBe(3);
    expect(tierName(quests, 2)).toBe("Silber");
    expect(tierName(getAchievement("dragon-slayer"), 1)).toBe("Gold");
  });

  it("rechnen rückwirkend aus dem Spielstand – und fallen nie zurück", () => {
    const darkwood = QUESTS.filter((q) => q.areaId === "darkwood").map((q) => q.id);
    const first = evaluateAchievements(
      input({
        questLog: { active: {}, completed: darkwood },
        records: { ...EMPTY_RECORDS, questsCompleted: 12 },
        character: character(10),
      }),
      {},
    );
    expect(first.tiers["quest-master"]).toBe(1);
    expect(first.tiers.adventurer).toBe(1);
    expect(first.tiers.liberator).toBe(1);
    expect(first.tiers.climber).toBe(1);
    expect(first.unlocked).toContainEqual({ id: "quest-master", tier: 1 });
    // Weniger Fortschritt (z. B. neuer Spielstand) – die Stufe bleibt
    const later = evaluateAchievements(input(), first.tiers);
    expect(later.tiers["quest-master"]).toBe(1);
    expect(later.unlocked).toHaveLength(0);
  });

  it("ein Gebiet zählt erst als befreit, wenn alle seine Quests abgegeben sind", () => {
    const darkwood = QUESTS.filter((q) => q.areaId === "darkwood").map((q) => q.id);
    const { tiers } = evaluateAchievements(input({ questLog: { active: {}, completed: darkwood.slice(1) } }), {});
    expect(tiers.liberator).toBeUndefined();
  });

  it("Boss-Items zählen rückwirkend als besiegte Bosse und abgeschlossene Dungeons", () => {
    const { tiers } = evaluateAchievements(input({ bossCollection: ["boss-ignaroth-greatsword", "boss-ore-king-dagger"] }), {});
    expect(tiers["dragon-slayer"]).toBe(1);
    expect(tiers["boss-slayer"]).toBe(1);
    expect(tiers["dungeon-runner"]).toBe(1);
  });

  it("Titel für Gold-Stufen, Rahmen für Stufenzahl und besondere Erfolge", () => {
    const tiers = { "dragon-slayer": 1, "quest-master": 2, climber: 3 };
    expect(unlockedTitles(tiers).map((t) => t.title).sort()).toEqual(["Drachentöter", "Legende"]);
    expect(totalTiers(tiers)).toBe(6);
    const unlocked = FRAMES.filter((f) => f.unlocked(tiers)).map((f) => f.id);
    expect(unlocked).toEqual(["none", "bronze", "dragon"]);
  });
});

describe("Gear Score als Erfolg", () => {
  it("15 / 50 / 100 – Gold schaltet den Rahmen Meisterschmiede frei", () => {
    const at = (score: number) => evaluateAchievements(input({ records: { ...EMPTY_RECORDS, maxGearScore: score } }), {}).tiers["gear-score"];
    expect(at(14)).toBeUndefined();
    expect(at(50)).toBe(2);
    expect(at(100)).toBe(3);
    expect(FRAMES.find((f) => f.id === "forged")!.unlocked({ "gear-score": 3 })).toBe(true);
    expect(FRAMES.find((f) => f.id === "forged")!.unlocked({ "gear-score": 2 })).toBe(false);
  });
});

describe("Boss-Sets als Erfolge", () => {
  it("ein komplettes Set schaltet einen Titel passend zum Boss frei", () => {
    const goblin = ["boss-goblin-chief-axe", "boss-goblin-chief-mace", "boss-goblin-chief-bow", "boss-goblin-chief-head", "boss-goblin-chief-chest"];
    expect(getAchievement("set-goblin-chief").tiers).toEqual([goblin.length]);
    expect(evaluateAchievements(input({ bossCollection: goblin.slice(0, 4) }), {}).tiers["set-goblin-chief"]).toBeUndefined();
    const { tiers } = evaluateAchievements(input({ bossCollection: goblin }), {});
    expect(tiers["set-goblin-chief"]).toBe(1);
    expect(unlockedTitles(tiers).map((t) => t.title)).toContain("Goblinschreck");
  });

  it("jeder Boss hat ein Set-Erfolg, unbekannte Item-Ids stören nicht", () => {
    expect(ACHIEVEMENTS.filter((a) => a.category === "sets")).toHaveLength(13);
    expect(() => evaluateAchievements(input({ bossCollection: ["gibt-es-nicht"] }), {})).not.toThrow();
  });
});

describe("Erfolge im Spielstand", () => {
  beforeEach(() => useGameStore.getState().resetGame());

  it("werden nach Änderungen automatisch freigeschaltet und eingeblendet", () => {
    useGameStore.setState({ records: { ...EMPTY_RECORDS, questsCompleted: 10 }, achievementQueue: [] });
    const s = useGameStore.getState();
    expect(s.achievements["quest-master"]).toBe(1);
    expect(s.achievementQueue).toContainEqual({ id: "quest-master", tier: 1 });
  });

  it("Titel und Rahmen nur, wenn freigeschaltet", () => {
    useGameStore.getState().setTitle("dragon-slayer");
    useGameStore.getState().setFrame("gold");
    expect(useGameStore.getState().cosmetics).toEqual({ title: null, frame: "none" });
    useGameStore.setState({ bossCollection: ["boss-ignaroth-greatsword"] });
    useGameStore.getState().setTitle("dragon-slayer");
    useGameStore.getState().setFrame("dragon");
    expect(useGameStore.getState().cosmetics).toEqual({ title: "dragon-slayer", frame: "dragon" });
  });
});
