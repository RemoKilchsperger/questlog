import { describe, expect, it } from "vitest";
import { CHAMPION_BANNER, CHARGE_MAX, CLERIC_PRAYER, PALADIN_VERDICT } from "./classKit";
import {
  coopBannerShare,
  coopEnrageFactor,
  coopEnrageWarning,
  coopSignatureBlocker,
  COOP_ENRAGE_HEROIC_ROUND,
  COOP_ENRAGE_ROUND,
  COOP_ENRAGE_STEP,
  HEAL_THREAT,
  resolveRound,
  startCoopBattle,
  type CoopAction,
  type CoopBattleState,
  type CoopEvent,
} from "./coopCombat";
import type { HeroClassId } from "./heroClasses";
import { WARD_MAX_SHARE } from "./skills";
import { classBuild, simHero } from "../test/classSim";

const rng = (value: number) => () => value;

/** Raid gegen die Sumpfhydra mit vielen LP (keine Köpfe), Helden einer Klasse – Leisten wahlweise voll. */
function coop(classes: (HeroClassId | null)[], full = true): CoopBattleState {
  const players = classes.map((c, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    profile: { ...simHero(classBuild(c ?? "champion"), 30, `coop-${i}`), ...(c === null && { heroClass: null }) },
  }));
  const battle = startCoopBattle("k", "swamp-hydra", players, 0);
  return {
    ...battle,
    boss: { ...battle.boss, hp: 9_999_999, maxHp: 9_999_999 },
    heroes: battle.heroes.map((h) => ({ ...h, mana: 999, ...(full && h.charge !== undefined && { charge: CHARGE_MAX }) })),
  };
}
const ofType = <T extends CoopEvent["type"]>(events: readonly CoopEvent[], type: T) =>
  events.filter((e): e is Extract<CoopEvent, { type: T }> => e.type === type);

describe("Klassen im Koop", () => {
  it("Aktion `signature`: der Server prüft die volle Leiste selbst – sonst normaler Angriff", () => {
    const empty = coop(["mage", "champion"], false);
    expect(empty.heroes[0].charge).toBe(0);
    expect(coopSignatureBlocker(empty.heroes[0])).toMatch(/nicht voll/);
    const ignored = resolveRound(empty, { p0: { signature: true } }, rng(0.5), 0);
    expect(ofType(ignored.events, "signature")).toHaveLength(0);
    expect(ignored.events.some((e) => e.type === "hit" && e.attacker === "p0")).toBe(true);
    const used = resolveRound(coop(["mage", "champion"]), { p0: { signature: true } }, rng(0.5), 0);
    expect(ofType(used.events, "signature")).toEqual([{ type: "signature", heroId: "p0", classId: "mage" }]);
    expect(used.state.heroes[0].charge).toBe(0);
    // Ohne Klasse keine Leiste
    expect(coop([null, "champion"]).heroes[0].charge).toBeUndefined();
  });

  it("die Leiste rechnet der Server pro Held – Kleriker +1 pro Runde", () => {
    const { state, events } = resolveRound(coop(["cleric", "champion"], false), {}, rng(0.5), 0);
    expect(state.heroes[0].charge).toBe(1);
    expect(ofType(events, "charge")).toContainEqual({ type: "charge", heroId: "p0", gained: 1, value: 1 });
  });

  it("Gebet: heilt und reinigt die Gruppe und belebt einen Gefallenen mit 25 % LP", () => {
    const start = coop(["cleric", "champion", "warden"]);
    const hurt: CoopBattleState = {
      ...start,
      heroes: start.heroes.map((h, i) =>
        i === 2
          ? { ...h, down: true, combatant: { ...h.combatant, hp: 0 } }
          : { ...h, combatant: { ...h.combatant, hp: 10 }, effects: { poison: { damage: 3, roundsLeft: 3 } } },
      ),
      boss: { ...start.boss, damage: 0.001 },
    };
    const { events, state } = resolveRound(hurt, { p0: { signature: true } }, rng(0.5), 0);
    const heals = ofType(events, "selfHeal");
    expect(heals).toContainEqual({ type: "selfHeal", heroId: "p0", heal: Math.round(hurt.heroes[0].combatant.maxHp * CLERIC_PRAYER.self) });
    expect(heals).toContainEqual({ type: "selfHeal", heroId: "p1", heal: Math.round(hurt.heroes[1].combatant.maxHp * CLERIC_PRAYER.group), by: "p0" });
    expect(ofType(events, "cleansed").map((e) => e.heroId)).toEqual(["p0", "p1"]);
    const revived = ofType(events, "revived")[0];
    expect(revived).toEqual({ type: "revived", heroId: "p2", by: "p0", heal: Math.round(hurt.heroes[2].combatant.maxHp * CLERIC_PRAYER.revive) });
    expect(state.heroes[2].down).toBe(false);
    expect(state.heroes[2].revived).toBe(true);
  });

  it("Richtspruch: Gruppenschild im gemeinsamen Schild-Topf, zusammen höchstens 15 %", () => {
    const start = coop(["paladin", "champion", "cleric"]);
    const warded = { ...start, heroes: start.heroes.map((h, i) => (i === 2 ? { ...h, effects: { ward: Math.round(h.combatant.maxHp * 0.1) } } : h)) };
    const { events } = resolveRound(warded, { p0: { signature: true } }, rng(0.5), 0);
    const shields = ofType(events, "shieldGained");
    const maxHp = (i: number) => warded.heroes[i].combatant.maxHp;
    expect(shields).toContainEqual({ type: "shieldGained", heroId: "p1", amount: Math.round(maxHp(1) * PALADIN_VERDICT.groupShield), by: "p0" });
    expect(shields).toContainEqual({
      type: "shieldGained",
      heroId: "p2",
      amount: Math.round(maxHp(2) * WARD_MAX_SHARE) - Math.round(maxHp(2) * 0.1),
      by: "p0",
    });
    expect(shields.some((e) => e.heroId === "p0")).toBe(false);
  });

  it("Kampfbanner: +10 % für die Mitspieler ab der nächsten Runde – zwei Banner stapeln nicht", () => {
    let state = resolveRound(coop(["champion", "champion", "mage"]), { p0: { signature: true }, p1: { signature: true } }, rng(0.5), 0).state;
    const [a, b, mage] = state.heroes;
    expect(coopBannerShare(mage, state.heroes)).toBe(CHAMPION_BANNER.group);
    expect(coopBannerShare(a, state.heroes)).toBe(CHAMPION_BANNER.self);
    expect(coopBannerShare(b, state.heroes)).toBe(CHAMPION_BANNER.self);
    for (let i = 0; i < CHAMPION_BANNER.rounds; i++) state = resolveRound(state, {}, rng(0.5), 0).state;
    expect(coopBannerShare(state.heroes[2], state.heroes)).toBe(0);
  });

  it("Spott: Duellhaltung und Bollwerk (0,75) gewinnen gegen Wächterschwur (0,6), bei Gleichstand wer zuletzt handelt", () => {
    const start = coop(["duelist", "champion", "mage"]);
    const sworn = { ...start, heroes: start.heroes.map((h, i) => (i === 1 ? { ...h, skills: { guardOath: 1 } } : h)) };
    const actions: Record<string, CoopAction> = { p0: { signature: true }, p1: { defend: true } };
    const { state } = resolveRound(sworn, actions, rng(0.5), 0);
    const [duelist, oath, mage] = state.heroes;
    expect(duelist.threat).toBeGreaterThan(oath.threat + mage.threat);
    // Die Duellhaltung hält auch in der Runde danach
    expect(state.heroes[0].effects.duel).toBe(1);
  });

  it("Assassine „Schatten“: Krits erzeugen nur halbe Bedrohung", () => {
    const start = coop(["assassin", "assassin"], false);
    const plain = { ...start, heroes: start.heroes.map((h, i) => (i === 1 ? { ...h, heroClass: null } : h)) };
    const { events, state } = resolveRound(plain, {}, rng(0.01), 0);
    const crit = (id: string) => ofType(events, "hit").filter((e) => e.attacker === id && e.crit).reduce((s, e) => s + e.damage, 0);
    expect(crit("p0")).toBeGreaterThan(0);
    expect(state.heroes[0].threat / crit("p0")).toBeCloseTo((state.heroes[1].threat / crit("p1")) * 0.5, 1);
  });

  it("Heilung erzeugt Bedrohung: die Hälfte der geheilten LP beim Heiler", () => {
    const start = coop(["cleric", null], false);
    const hurt = {
      ...start,
      heroes: start.heroes.map((h) => ({ ...h, abilities: ["mace-2" as const], combatant: { ...h.combatant, hp: 10 } })),
      boss: { ...start.boss, damage: 0.001 },
    };
    const { events, state } = resolveRound(hurt, { p0: { ability: "mace-2" } }, rng(0.5), 0);
    const healed = ofType(events, "selfHeal").reduce((s, e) => s + e.heal, 0);
    const dealt = ofType(events, "hit").filter((e) => e.attacker === "p0").reduce((s, e) => s + e.damage, 0);
    // Heiliges Licht trifft auch: Bedrohung aus Schaden plus die Hälfte der Heilung (Gruppe), danach 30 % Abklingen
    expect(healed).toBeGreaterThan(0);
    expect(state.heroes[0].threat).toBe(Math.round((dealt + healed * HEAL_THREAT) * 0.7));
  });

  it("Seelenernte im Koop verflucht das Ziel: +10 % Schaden von allen, höherer Wert zählt", () => {
    const start = coop(["warlock", "champion"]);
    const dotted = { ...start, bossEffects: { poison: { damage: 50, roundsLeft: 3, sourceId: "p0" }, burn: { damage: 50, roundsLeft: 3, sourceId: "p1" } } };
    const { events, state } = resolveRound(dotted, { p0: { signature: true } }, rng(0.5), 0);
    // Nur das eigene Gift wird geerntet
    expect(ofType(events, "harvest")).toEqual([{ type: "harvest", heroId: "p0", target: "boss", damage: 50 }]);
    expect(ofType(events, "marked")).toContainEqual({ type: "marked", heroId: "p0", target: "boss", curse: true });
    expect(state.bossEffects.vulnerable?.percent).toBe(0.1);
  });
});

describe("Boss-Raserei im Koop", () => {
  it("ab Runde 20 +10 % pro Runde (additiv), heroisch ab Runde 30, angekündigt 3 Runden vorher", () => {
    expect(coopEnrageFactor(19, false)).toBe(1);
    expect(coopEnrageFactor(COOP_ENRAGE_ROUND, false)).toBeCloseTo(1 + COOP_ENRAGE_STEP);
    expect(coopEnrageFactor(25, false)).toBeCloseTo(1.6);
    expect(coopEnrageFactor(30, false)).toBeCloseTo(2.1);
    expect(coopEnrageFactor(29, true)).toBe(1);
    expect(coopEnrageFactor(COOP_ENRAGE_HEROIC_ROUND, true)).toBeCloseTo(1.1);
    expect([16, 17, 18, 19, 20].map((r) => coopEnrageWarning(r, false))).toEqual([null, 3, 2, 1, null]);
  });

  it("wirkt auf den Schaden des Bosses, aus state.round berechnet – mit Ereignis für Log und Szene", () => {
    const start = { ...coop(["champion", "champion"], false), heroes: coop(["champion", "champion"], false).heroes.map((h) => ({ ...h, combatant: { ...h.combatant, hp: 1e6, maxHp: 1e6 } })) };
    const bossDamage = (round: number) => {
      const { events } = resolveRound({ ...start, round: round * 3 === 0 ? 1 : round }, {}, rng(0.5), 0);
      return { events, damage: ofType(events, "hit").filter((e) => e.attacker === "boss").reduce((s, e) => s + e.damage, 0) };
    };
    // Runden ohne Fähigkeit der Hydra (alle 3 Runden): 16 und 20 – gleiche Würfe, nur die Raserei unterscheidet
    const before = bossDamage(16);
    const enraged = bossDamage(20);
    expect(ofType(before.events, "enrage")).toHaveLength(0);
    expect(ofType(enraged.events, "enrage")).toEqual([{ type: "enrage", factor: coopEnrageFactor(20, false) }]);
    expect(enraged.damage / before.damage).toBeCloseTo(1.1, 1);
    expect(ofType(bossDamage(17).events, "enrage")).toEqual([{ type: "enrage", factor: 1, roundsLeft: 3 }]);
  });
});
