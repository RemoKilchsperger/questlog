import { describe, expect, it } from "vitest";
import { MANA_REGEN, type AbilityId } from "./abilities";
import {
  attackRound,
  DEFEND,
  SIGNATURE,
  signatureBlocker,
  startBattle,
  type BattleEvent,
  type BattleState,
  type HeroCombatProfile,
} from "./combat";
import {
  CHARGE_MAX,
  CHARGE_PER_ROUND,
  chargeGain,
  CLASS_KITS,
  CLERIC_PRAYER,
  emptyTally,
  PALADIN_VERDICT,
  RANGER_MARK,
  signatureBlocker as kitBlocker,
  strongerVulnerable,
  unleashCost,
  verdictBonus,
  WARDEN_BREAKER_WEAKEN,
  WARLOCK_HARVEST,
  type ChargeTally,
} from "./classKit";
import { getCreature } from "./creatures";
import { HERO_CLASSES, WARLOCK_DOT, WARLOCK_SWAP, type HeroClassId } from "./heroClasses";
import { classBuild, simHero } from "../test/classSim";

const rng = (value: number) => () => value;
const tally = (t: Partial<ChargeTally>): ChargeTally => ({ ...emptyTally(), ...t });

/** Held einer Klasse auf Lv. 30 gegen eine Kreatur mit sehr vielen LP – die Leiste wahlweise voll. */
function battle(heroClass: HeroClassId, creatureId = "grey-wolf", full = true, profile?: Partial<HeroCombatProfile>): BattleState {
  const hero = { ...simHero(classBuild(heroClass), 30, `kit-${heroClass}`), ...profile };
  const b = startBattle("t", "Held", hero, getCreature(creatureId).creature);
  return { ...b, enemy: { ...b.enemy, hp: 999_999, maxHp: 999_999 }, mana: 999, ...(full && { charge: CHARGE_MAX }) };
}
const heroHits = (events: readonly BattleEvent[]) =>
  events.filter((e): e is Extract<BattleEvent, { type: "hit" }> => e.type === "hit" && e.attacker === "hero");

describe("Klassenleiste", () => {
  it("jede Klasse hat Rolle, Passiv, Leiste und Signatur", () => {
    for (const c of HERO_CLASSES) {
      const kit = CLASS_KITS[c.id];
      expect(kit.roles.length, c.id).toBeGreaterThan(0);
      expect(Object.keys(kit.charge).length, c.id).toBeGreaterThan(0);
      expect(kit.signature.name, c.id).not.toBe("");
      expect(c.bonus).toBe(kit.passive.text);
    }
  });

  it("füllt sich nach der Klasse – höchstens 2 Ladungen pro Runde, die Runde der Signatur lädt nicht", () => {
    expect(chargeGain("assassin", tally({ crits: 1 }))).toBe(1);
    expect(chargeGain("assassin", tally({ crits: 1, ability: "dagger" }))).toBe(2);
    expect(chargeGain("assassin", tally({ crits: 3, ability: "dagger" }))).toBe(CHARGE_PER_ROUND);
    // Die Dolch-Fähigkeit zählt, eine andere Waffe nicht
    expect(chargeGain("assassin", tally({ ability: "sword" }))).toBe(0);
    // Magier: +2 pro Fähigkeit, egal von welcher Waffe
    expect(chargeGain("mage", tally({ ability: "sword" }))).toBe(2);
    expect(chargeGain("cleric", tally({}))).toBe(1);
    expect(chargeGain("cleric", tally({ ability: "mace", healAbility: true }))).toBe(2);
    expect(chargeGain("paladin", tally({ hitsTaken: 2 }))).toBe(1);
    expect(chargeGain("paladin", tally({ guarded: true, bulwarkBlock: true }))).toBe(2);
    expect(chargeGain("ranger", tally({ dealt: true }))).toBe(2); // getroffen hat ihn nichts
    expect(chargeGain("ranger", tally({ dealt: true, hitsTaken: 1 }))).toBe(1);
    expect(chargeGain("warden", tally({ ability: "greathammer", stuns: 1 }))).toBe(2);
    expect(chargeGain("cleric", tally({ signature: true }))).toBe(0);
    expect(chargeGain(null, tally({ crits: 2 }))).toBe(0);
  });

  it("Berserker: unter 50 % LP zählt jeder Auslöser doppelt (die Obergrenze bleibt)", () => {
    expect(chargeGain("berserker", tally({ hitsTaken: 1 }))).toBe(1);
    expect(chargeGain("berserker", tally({ hitsTaken: 1, low: true }))).toBe(2);
  });

  it("Signatur nur mit Klasse und voller Leiste", () => {
    expect(kitBlocker(null, 4)).toMatch(/Ohne Klasse/);
    expect(kitBlocker("mage", 3)).toMatch(/3\/4/);
    expect(kitBlocker("mage", 4)).toBeNull();
  });

  it("beginnt jeden Kampf leer – ohne Klasse gibt es keine", () => {
    const fresh = battle("cleric", "grey-wolf", false);
    expect(fresh.charge).toBe(0);
    const plain = startBattle("t", "Held", { ...simHero(classBuild("cleric"), 30, "x"), heroClass: null }, getCreature("grey-wolf").creature);
    expect(plain.charge).toBeUndefined();
    expect(signatureBlocker(plain)).toMatch(/Ohne Klasse/);
    // Kleriker: +1 pro Runde
    const { state, events } = attackRound(fresh, rng(0.5));
    expect(state.charge).toBe(1);
    expect(events).toContainEqual({ type: "charge", gained: 1, value: 1 });
  });

  it("die Signatur verbraucht die volle Leiste, kostet kein Mana und hat keine Abklingzeit", () => {
    const start = battle("mage");
    const { state, events } = attackRound(start, rng(0.5), SIGNATURE);
    expect(events[0]).toEqual({ type: "signature", classId: "mage" });
    expect(events.some((e) => e.type === "ability")).toBe(false);
    expect(state.charge).toBe(0);
    expect(state.mana).toBe(Math.min(start.maxMana, start.mana + 6));
    expect(state.cooldowns).toEqual({});
    expect(() => attackRound(battle("mage", "grey-wolf", false), rng(0.5), SIGNATURE)).toThrow(/nicht voll/);
  });
});

describe("Signaturen solo", () => {
  it("Assassine – Halsschnitt: sicher kritisch, ignoriert Rüstung, gegen angeschlagene Ziele 1,5-fach", () => {
    const start = battle("assassin");
    const hit = heroHits(attackRound(start, rng(0.99), SIGNATURE).events)[0];
    expect(hit.crit).toBe(true);
    const low = { ...start, enemy: { ...start.enemy, hp: 100_000 } };
    const execute = heroHits(attackRound(low, rng(0.99), SIGNATURE).events)[0];
    expect(execute.damage / hit.damage).toBeCloseTo(1.5, 1);
  });

  it("Magier – Arkane Entladung: zählt als Feuer, wenn das wirksamer ist, und bricht Aufladen ab", () => {
    const hit = heroHits(attackRound(battle("mage", "ice-bear"), rng(0.5), SIGNATURE).events)[0];
    expect(hit.matchup).toBe("weak");
    let mammoth = battle("mage", "primal-mammoth");
    mammoth = { ...mammoth, bossTurn: { intent: "charging", charge: { taken: 0, roundsLeft: 2 }, step: 0 } };
    expect(attackRound(mammoth, rng(0.5), SIGNATURE).state.bossTurn?.intent).toBe("staggered");
  });

  it("Paladin – Richtspruch: abgewehrter Schaden fliesst ein, höchstens +1,5-fach", () => {
    let start = battle("paladin", "grey-wolf", false);
    start = attackRound(start, rng(0.5), DEFEND).state;
    expect(start.heroEffects.absorbed ?? 0).toBeGreaterThan(0);
    const absorbed = start.heroEffects.absorbed!;
    const full = { ...start, charge: CHARGE_MAX };
    const { state, events } = attackRound(full, rng(0.5), SIGNATURE);
    expect(events[0]).toEqual({ type: "signature", classId: "paladin", absorbed });
    expect(state.heroEffects.absorbed ?? 0).toBe(0);
    const plain = heroHits(attackRound({ ...full, heroEffects: {} }, rng(0.5), SIGNATURE).events)[0];
    const boosted = heroHits(events)[0];
    expect(boosted.damage / plain.damage).toBeCloseTo(1 + verdictBonus(absorbed, start.hero.damage), 1);
    expect(verdictBonus(1e9, 100)).toBe(PALADIN_VERDICT.cap);
  });

  it("Berserker – Entfesseln: kostet 10 % der LP, 3 Hiebe, unter 50 % LP 4", () => {
    const start = battle("berserker");
    const { state, events } = attackRound(start, rng(0.5), SIGNATURE);
    expect(events[0]).toEqual({ type: "signature", classId: "berserker", hpCost: unleashCost(start.hero.hp) });
    expect(heroHits(events)).toHaveLength(3);
    expect(state.hero.hp).toBeLessThan(start.hero.hp);
    const low = { ...start, hero: { ...start.hero, hp: Math.round(start.hero.maxHp * 0.4) } };
    expect(heroHits(attackRound(low, rng(0.5), SIGNATURE).events)).toHaveLength(4);
    expect(unleashCost(1)).toBe(0);
  });

  it("Duellant – Duell: 2 Gegnerzüge Duellhaltung, Treffer gemindert und gekontert", () => {
    const start = battle("duelist");
    const first = attackRound(start, rng(0.5), SIGNATURE);
    expect(first.events).toContainEqual({ type: "duel" });
    expect(first.events.some((e) => e.type === "counter")).toBe(true);
    expect(first.state.heroEffects.duel).toBe(1);
    const second = attackRound(first.state, rng(0.5));
    expect(second.events.some((e) => e.type === "counter")).toBe(true);
    expect(second.state.heroEffects.duel).toBeUndefined();
    expect(attackRound(second.state, rng(0.5)).events.some((e) => e.type === "counter")).toBe(false);
  });

  it("Kleriker – Gebet: heilt 20 %, entfernt Gift, Feuer und Bluten", () => {
    const start = battle("cleric");
    const hurt = { ...start, hero: { ...start.hero, hp: 10 }, heroEffects: { poison: { damage: 5, roundsLeft: 3 } } };
    const { events, state } = attackRound(hurt, rng(0.5), SIGNATURE);
    expect(events).toContainEqual({ type: "selfHeal", heal: Math.round(start.hero.maxHp * CLERIC_PRAYER.self) });
    expect(events).toContainEqual({ type: "cleansed" });
    expect(state.heroEffects.poison).toBeUndefined();
  });

  it("Hexer – Seelenernte: DoTs wirken sofort einmal, die Laufzeit bleibt, er heilt sich um 25 %", () => {
    const start = battle("warlock");
    const dotted = {
      ...start,
      hero: { ...start.hero, hp: 10 },
      enemyEffects: { poison: { damage: 40, roundsLeft: 3 }, burn: { damage: 20, roundsLeft: 2 } },
    };
    const { events, state } = attackRound(dotted, rng(0.5), SIGNATURE);
    expect(events).toContainEqual({ type: "harvest", damage: 60 });
    expect(events).toContainEqual({ type: "selfHeal", heal: Math.round(60 * WARLOCK_HARVEST.selfHeal) });
    expect(state.enemyEffects.poison?.roundsLeft).toBe(2); // nur der normale Tick
  });

  it("Hexer – Verderbnis: eigene DoTs stärker und länger; Wandelbare Flüche gegen Gift-Immune", () => {
    const scepter: AbilityId[] = ["scepter"];
    const warlock = { ...battle("warlock", "grey-wolf", false), abilities: scepter };
    const plain = { ...warlock, heroClass: null, charge: undefined };
    const strong = attackRound(warlock, rng(0.5), "scepter").state.enemyEffects.poison!;
    const weak = attackRound(plain, rng(0.5), "scepter").state.enemyEffects.poison!;
    expect(strong.damage / weak.damage).toBeCloseTo(WARLOCK_DOT.factor, 1);
    expect(strong.roundsLeft).toBe(weak.roundsLeft + WARLOCK_DOT.rounds);
    // Die Schlange ist gegen Gift immun: Der Hexer legt Feuer mit 60 %
    const serpent = { ...battle("warlock", "bog-serpent", false), abilities: scepter };
    const swapped = attackRound(serpent, rng(0.5), "scepter");
    expect(swapped.state.enemyEffects.poison).toBeUndefined();
    expect(swapped.state.enemyEffects.burn?.damage).toBeCloseTo(strong.damage * WARLOCK_SWAP, -1);
    expect(swapped.events.some((e) => e.type === "immune")).toBe(false);
  });

  it("Waldläufer – Beute markieren: +15 % erlittener Schaden für 3 Runden, der höhere Wert zählt", () => {
    const { state, events } = attackRound(battle("ranger"), rng(0.5), SIGNATURE);
    expect(events).toContainEqual({ type: "marked" });
    expect(state.enemyEffects.vulnerable).toEqual({ percent: RANGER_MARK.percent, roundsLeft: RANGER_MARK.rounds });
    expect(state.enemyEffects.marked).toBe(RANGER_MARK.rounds);
    expect(strongerVulnerable({ percent: 0.2, roundsLeft: 1 }, { percent: 0.15, roundsLeft: 3 })).toEqual({ percent: 0.2, roundsLeft: 1 });
    // Krits gegen Markierte laden die Leiste zusätzlich
    const crit = attackRound({ ...state, charge: 0 }, rng(0.01));
    expect(crit.state.charge).toBe(2);
  });

  it("Plünderer – Ausweiden: gegen Blutende stärker und heilt um die Hälfte", () => {
    const start = { ...battle("plunderer"), hero: { ...battle("plunderer").hero, hp: 10 } };
    const plain = attackRound(start, rng(0.5), SIGNATURE).events;
    const bleeding = attackRound({ ...start, enemyEffects: { bleed: { damage: 1, roundsLeft: 3 } } }, rng(0.5), SIGNATURE).events;
    expect(heroHits(bleeding)[0].damage / heroHits(plain)[0].damage).toBeCloseTo(1.5, 1);
    const heal = plain.find((e) => e.type === "selfHeal");
    expect(heal && heal.type === "selfHeal" && heal.heal).toBeGreaterThan(heroHits(plain)[0].damage * 0.5);
  });

  it("Champion – Kampfbanner: +15 % Schaden ab der nächsten Runde, 3 Runden lang", () => {
    const start = battle("champion");
    const plainHit = heroHits(attackRound(start, rng(0.5)).events)[0].damage;
    let state = attackRound(start, rng(0.5), SIGNATURE).state;
    for (let round = 0; round < 3; round++) {
      const r = attackRound(state, rng(0.5));
      expect(heroHits(r.events)[0].damage / plainHit, `Runde ${round + 1}`).toBeCloseTo(1.15, 1);
      state = r.state;
    }
    expect(heroHits(attackRound(state, rng(0.5)).events)[0].damage).toBe(plainHit);
  });

  it("Wächter – Bergbrecher: trifft alle, betäubt das Ziel sicher – immun: Schwächung statt Betäubung", () => {
    const boss = battle("warden", "goblin-chief");
    const { events } = attackRound({ ...boss, adds: boss.adds?.slice(0, 1) }, rng(0.5), SIGNATURE);
    expect(events).toContainEqual({ type: "stunned" });
    expect(new Set(heroHits(events).map((e) => e.add ?? "boss")).size).toBe(Math.min(2, 1 + (boss.adds?.length ?? 0)));
    const immune = { ...boss, enemyEffects: { stunImmunity: 3 } };
    const r = attackRound(immune, rng(0.5), SIGNATURE);
    expect(r.events).toContainEqual({ type: "weakened" });
    expect(r.events.some((e) => e.type === "stunned")).toBe(false);
    expect(r.state.enemyEffects.weaken).toEqual({ percent: WARDEN_BREAKER_WEAKEN.percent, roundsLeft: WARDEN_BREAKER_WEAKEN.rounds - 1 });
  });

  it("ist für Boss-Mechaniken sicher: das offene Höhlenauge wirft sie nicht zurück, Kaelthar lädt sich nicht auf", () => {
    const eye = battle("mage", "cave-eye");
    const open = { ...eye, bossTurn: { intent: "attack" as const, step: 1, eye: "open" as const } };
    const r = attackRound(open, rng(0.5), SIGNATURE);
    expect(r.events.some((e) => e.type === "reflected")).toBe(false);
    expect(heroHits(r.events).length).toBe(1);
    const storm = battle("mage", "storm-lord");
    expect(attackRound({ ...storm, bossTurn: { intent: "attack", static: 0 } }, rng(0.5), SIGNATURE).events.some((e) => e.type === "static")).toBe(false);
  });

  it("Skilltree: kein Echo, keine Konzentration in der Signatur-Runde (docs/skilltree-ueberarbeitung.md 5.1)", () => {
    const start = { ...battle("mage"), mana: 0, skills: { echo: 1, concentration: 2 }, heroEffects: { casts: 2 } };
    const { state, events } = attackRound(start, rng(0.5), SIGNATURE);
    expect(heroHits(events)).toHaveLength(1);
    expect(state.heroEffects.casts).toBe(2);
    // Konzentration gibt nur in Runden ohne Fähigkeit mehr – die Signatur zählt nicht als solche
    expect(state.mana).toBe(MANA_REGEN);
    expect(attackRound({ ...start, charge: 0 }, rng(0.5)).state.mana).toBeGreaterThan(MANA_REGEN);
  });
});
