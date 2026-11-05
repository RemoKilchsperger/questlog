import { describe, expect, it } from "vitest";
import { AREAS } from "./creatures";
import {
  announceRaid,
  damageable,
  defendRaid,
  EMPTY_RAIDS,
  effectiveVillage,
  failRaid,
  LEADER_POWER,
  RAID_BANDS,
  RAID_BASE_POWER,
  RAID_GAP_MS,
  RAID_WARNING_MS,
  raidBounty,
  raidFights,
  raidLineup,
  raidPower,
  raidsUnlocked,
  refreshRaids,
  repair,
  repairCost,
  repairedByBuild,
  type RaidState,
} from "./raids";
import { EMPTY_VILLAGE, type Village } from "./village";

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const first = () => 0;
let ids = 0;
const newId = () => `raid-${++ids}`;

const village = (tiers: Partial<Village>): Village => ({ ...EMPTY_VILLAGE, ...tiers });
const threeBuilt = village({ merchant: 1, smith: 1, tavern: 1 });
const ctx = (over: Partial<Parameters<typeof refreshRaids>[1]> = {}) => ({
  village: threeBuilt,
  heroLevel: 14,
  gold: 1000,
  materials: { clay: 50 },
  now: NOW,
  fighting: false,
  ...over,
});
const announced = (now = NOW): RaidState => ({ ...EMPTY_RAIDS, current: announceRaid("r", 14, now) });

describe("Banden", () => {
  it("jedes Gebiet hat eine Bande", () => {
    expect(RAID_BANDS.map((b) => b.areaId)).toEqual(AREAS.map((a) => a.id));
  });

  it("die Bande kommt aus dem Gebiet des Heldenlevels", () => {
    expect(announceRaid("a", 5, NOW).areaId).toBe("darkwood");
    expect(announceRaid("a", 14, NOW).areaId).toBe("mistmarsh");
    expect(announceRaid("a", 60, NOW).areaId).toBe("dragon-hoard");
    expect(announceRaid("a", 14, NOW).attackAt).toBe(NOW + RAID_WARNING_MS);
  });
});

describe("Ankündigung", () => {
  it("erst ab drei gebauten Gebäuden", () => {
    expect(raidsUnlocked(village({ merchant: 1, smith: 1 }))).toBe(false);
    expect(raidsUnlocked(threeBuilt)).toBe(true);
    expect(refreshRaids(EMPTY_RAIDS, ctx({ village: village({ merchant: 1 }) }), newId).raids.current).toBeNull();
  });

  it("die erste Bande kommt sofort, die nächste erst nach der Pause", () => {
    const { raids } = refreshRaids(EMPTY_RAIDS, ctx(), newId);
    expect(raids.current?.level).toBe(14);
    const after = defendRaid(raids, NOW, first);
    expect(after.next).toBe(NOW + RAID_GAP_MS.min);
    expect(refreshRaids(after, ctx({ now: NOW + RAID_GAP_MS.min - 1 }), newId).raids.current).toBeNull();
    expect(refreshRaids(after, ctx({ now: NOW + RAID_GAP_MS.min }), newId).raids.current).not.toBeNull();
  });

  it("verstrichene Frist: Die Bande greift an, die nächste kommt erst nach der Pause", () => {
    const raids = announced();
    const late = NOW + RAID_WARNING_MS;
    const change = refreshRaids(raids, ctx({ village: village({ merchant: 1, smith: 2, tavern: 1 }), now: late }), newId, first);
    expect(change.raids.report).toMatchObject({ kind: "missed", building: "smith" });
    expect(change.raids.current).toBeNull();
    expect(change.raids.next).toBeGreaterThan(late);
  });

  it("wer gerade gegen die Bande kämpft, darf zu Ende kämpfen", () => {
    const raids = announced();
    const change = refreshRaids(raids, ctx({ now: NOW + RAID_WARNING_MS + HOUR, fighting: true }), newId);
    expect(change.raids).toBe(raids);
  });
});

describe("Gegner", () => {
  const raid = announceRaid("seed", 14, NOW);

  it("Wellen und Anführer – der Wachturm hält eine Welle auf", () => {
    expect(raidLineup(raid, 0, 0)).toHaveLength(4);
    expect(raidLineup(raid, 2, 0)).toHaveLength(3);
    expect(raidFights(3)).toBe(3);
  });

  it("alle auf dem Level der Bande, aus ihrem Gebiet, der Anführer als Elite mit zwei Modifikatoren", () => {
    const lineup = raidLineup(raid, 0, 0);
    const marsh = AREAS.find((a) => a.id === "mistmarsh")!.creatures.map((c) => c.id);
    for (const fight of lineup) {
      expect(fight.creature.level).toBe(14);
      expect(fight.creature.boss).toBe(false);
      expect(marsh).toContain(fight.creature.id);
    }
    const leader = lineup.at(-1)!;
    expect(leader.leader).toBe(true);
    expect(leader.elite).toHaveLength(2);
    expect(leader.creature.power).toBeCloseTo(RAID_BASE_POWER * LEADER_POWER);
  });

  it("gleicher Überfall, gleiche Gegner", () => {
    expect(raidLineup(raid, 1, 2)).toEqual(raidLineup(raid, 1, 2));
  });

  it("Wehranlage und Wachen schwächen die Angreifer", () => {
    expect(raidPower(0, 0)).toBe(RAID_BASE_POWER);
    expect(raidPower(1, 0)).toBeCloseTo(RAID_BASE_POWER * 0.9);
    expect(raidPower(3, 0)).toBeCloseTo(RAID_BASE_POWER * 0.8);
    expect(raidPower(0, 5)).toBeCloseTo(raidPower(0, 3));
    expect(raidLineup(raid, 3, 3)[0].creature.power).toBeCloseTo(raidPower(3, 3));
  });

  it("Beute der Bande: Gold, Material des Gebiets und sicher ein Item", () => {
    const bounty = raidBounty(raid, 14, "u1");
    expect(bounty.gold).toBe((3 + 14) * 10);
    expect(bounty.materials).toEqual({ clay: 5 });
    expect(bounty.loot).not.toBeNull();
    expect(bounty.xp).toBeGreaterThan(0);
  });
});

describe("Ausgang", () => {
  it("verteidigt: Bericht und Pause", () => {
    const raids = defendRaid(announced(), NOW, first);
    expect(raids.report).toEqual({ kind: "defended", areaId: "mistmarsh" });
    expect(raids.current).toBeNull();
  });

  it("verloren: ein Gebäude ab Stufe 2 wird beschädigt, nie die Wehranlage", () => {
    const v = village({ merchant: 1, smith: 2, tavern: 3, walls: 2 });
    expect(damageable(v, [])).toEqual(["smith", "tavern"]);
    expect(damageable(v, ["smith"])).toEqual(["tavern"]);
    const change = failRaid(announced(), "lost", v, 500, {}, NOW, first);
    expect(change.raids.damaged).toEqual(["smith"]);
    expect(change.gold).toBe(500);
  });

  it("ohne beschädigbares Gebäude wird das Lager geplündert", () => {
    const change = failRaid(announced(), "lost", threeBuilt, 1000, { darkwood: 50, clay: 4 }, NOW, first);
    expect(change.gold).toBe(900);
    expect(change.materials).toEqual({ darkwood: 40, clay: 4 });
    expect(change.raids.report).toMatchObject({ kind: "lost", building: null, gold: 100, materials: { darkwood: 10 } });
  });

  it("eine Festung hält jeden Angriff auf", () => {
    const change = failRaid(announced(), "missed", village({ smith: 3, walls: 3 }), 1000, { clay: 50 }, NOW, first);
    expect(change.raids.report?.kind).toBe("repelled");
    expect(change.raids.damaged).toEqual([]);
    expect(change.gold).toBe(1000);
  });
});

describe("Schaden und Reparatur", () => {
  const v = village({ smith: 2, tavern: 3 });

  it("ein beschädigtes Gebäude wirkt eine Stufe tiefer", () => {
    expect(effectiveVillage(v, ["smith", "tavern"])).toMatchObject({ smith: 1, tavern: 2 });
    expect(effectiveVillage(v, [])).toBe(v);
  });

  it("Reparatur kostet ein Viertel der Stufe", () => {
    expect(repairCost(v, "smith")).toEqual({ gold: 250, materials: { hardwood: 7, clay: 3 } });
    const raids = { ...EMPTY_RAIDS, damaged: ["smith" as const] };
    const change = repair(raids, v, "smith", 300, { hardwood: 10, clay: 3 });
    expect(change.raids.damaged).toEqual([]);
    expect(change.gold).toBe(50);
    expect(change.materials).toEqual({ hardwood: 3, clay: 0 });
    expect(() => repair(raids, v, "smith", 100, { hardwood: 10, clay: 3 })).toThrow("Gold");
  });

  it("ausbauen repariert gleich mit", () => {
    expect(repairedByBuild({ ...EMPTY_RAIDS, damaged: ["smith"] }, "smith").damaged).toEqual([]);
  });
});
