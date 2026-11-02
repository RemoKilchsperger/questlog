import { describe, expect, it } from "vitest";
import { fullWeapon } from "../test/weapons";
import {
  AIRBORNE_MELEE,
  CHARGE_AFTER,
  CHARGE_BREAK,
  CURSE_DAMAGE,
  CURSE_ROUNDS,
  describeIntent,
  DEVOUR_FREE,
  DIVE_AFTER,
  EXPOSED_ROUNDS,
  EXPOSED_TAKEN,
  EYE_CLOSED_TAKEN,
  EYE_OPEN_ROUNDS,
  firstBossTurn,
  FLIGHT_ROUNDS,
  GROUND_ROUNDS,
  hasBossScript,
  PLATE_TAKEN,
  PLATES_MAX,
  RAGE_MAX,
  STAGGER_TAKEN,
  STATIC_MAX,
  VESSEL_HP,
  VESSEL_START,
} from "./bossIntents";
import {
  abilityBlocker,
  attackRound,
  setTarget,
  bossTurnOf,
  DEFEND,
  DEFEND_DAMAGE_TAKEN,
  DEFEND_MANA,
  getHeroCombatProfile,
  startBattle,
  type BattleEvent,
  type BattleState,
} from "./combat";
import { AREAS, DUNGEONS, getCreature } from "./creatures";
import { EMPTY_EQUIPMENT } from "./equipment";
import { xpForNextLevel } from "./leveling";
import type { Character } from "./types";

const hero = (): Character => {
  let totalXp = 0;
  for (let l = 1; l < 30; l++) totalXp += xpForNextLevel(l);
  return { name: "Held", totalXp, gold: 0, essence: 0, stats: { strength: 5, intellect: 5, endurance: 5, charisma: 1 }, spentPoints: 0, skills: {} };
};
const rng = (value: number) => () => value;

/** Zäher Held gegen einen zähen Boss ohne Begleiter – nur der Boss zählt. */
const bossFight = (bossId: string, weapon = "greatsword-0"): BattleState => {
  const profile = getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, weapon1: fullWeapon(weapon, "common", "w1") });
  const battle = startBattle("b", "Held", profile, getCreature(bossId).creature);
  return {
    ...battle,
    hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 },
    enemy: { ...battle.enemy, hp: 99_999, maxHp: 99_999 },
    mana: 999,
    maxMana: 999,
    adds: [],
  };
};
const bossHits = (events: BattleEvent[], attacker: "hero" | "enemy") =>
  events.filter((e): e is Extract<BattleEvent, { type: "hit" }> => e.type === "hit" && e.attacker === attacker && !e.add);

describe("Abwehren", () => {
  it("kein Angriff, halber Schaden und etwas Mana", () => {
    const battle = { ...bossFight("lich-king"), mana: 100, maxMana: 999 };
    const attack = attackRound(battle, rng(0.5));
    const defend = attackRound(battle, rng(0.5), DEFEND);
    expect(bossHits(defend.events, "hero")).toHaveLength(0);
    expect(defend.events).toContainEqual({ type: "defend", mana: DEFEND_MANA });
    const taken = (r: typeof attack) => bossHits(r.events, "enemy")[0].damage;
    expect(Math.abs(taken(defend) - taken(attack) * DEFEND_DAMAGE_TAKEN)).toBeLessThanOrEqual(1);
    expect(defend.state.mana - attack.state.mana).toBe(DEFEND_MANA);
  });
});

describe("Absichten der Bosse", () => {
  it("Bosse zeigen ihre Absicht, normale Kreaturen haben keine", () => {
    expect(startBattle("b", "Held", getHeroCombatProfile(hero(), EMPTY_EQUIPMENT), getCreature("grey-wolf").creature).bossTurn).toBeUndefined();
    expect(bossFight("lich-king").bossTurn).toMatchObject({ intent: "attack" });
    // Ältere Kämpfe ohne gespeicherte Absicht beginnen den Ablauf von vorn
    expect(bossTurnOf({ ...bossFight("lich-king"), bossTurn: undefined, round: 3 })).toEqual({ intent: "attack", vessel: VESSEL_START });
    // Der Lich setzt seine Fähigkeit weiter im festen Takt ein
    let lich = bossFight("lich-king");
    for (let i = 0; i < 2; i++) lich = attackRound(lich, rng(0.5)).state;
    expect(lich.bossTurn).toMatchObject({ intent: "ability", ability: "lich-king" });
  });

  it("Krummzahn: jeder Treffer staut Wut, bei voller Wut kommt der Wutanfall – Abwehren staut keine", () => {
    let state = bossFight("goblin-chief");
    for (let i = 0; i < RAGE_MAX - 1; i++) state = attackRound(state, rng(0.5)).state;
    expect(state.bossTurn).toEqual({ intent: "attack", rage: RAGE_MAX - 1 });
    expect(attackRound(state, rng(0.5), DEFEND).state.bossTurn).toEqual({ intent: "attack", rage: RAGE_MAX - 1 });
    const angry = attackRound(state, rng(0.5)).state;
    expect(angry.bossTurn).toEqual({ intent: "ability", ability: "goblin-chief", rage: 0 });
    expect(describeIntent("goblin-chief", angry.bossTurn!).tone).toBe("danger");
    const outburst = attackRound(angry, rng(0.5));
    expect(outburst.events).toContainEqual({ type: "bossAbility", bossId: "goblin-chief", abilityId: "goblin-chief" });
    expect(bossHits(outburst.events, "enemy")).toHaveLength(4);
    // Der Treffer in der Runde des Wutanfalls zählt schon für den nächsten
    expect(outburst.state.bossTurn).toEqual({ intent: "attack", rage: 1 });
  });

  it("Höhlenauge: offen wirft es Fähigkeiten zurück, geschlossen erleidet es mehr Schaden", () => {
    const open = bossFight("cave-eye");
    expect(open.bossTurn).toMatchObject({ intent: "ability", eye: "open" });
    const reflected = attackRound(open, rng(0.5), "greatsword");
    expect(reflected.events.some((e) => e.type === "reflected" && e.damage > 0)).toBe(true);
    expect(reflected.state.enemy.hp).toBe(open.enemy.hp);
    expect(reflected.state.hero.hp).toBeLessThan(open.hero.hp - bossHits(reflected.events, "enemy")[0].damage);
    // Normale Angriffe treffen auch das offene Auge
    expect(bossHits(attackRound(open, rng(0.5)).events, "hero")).toHaveLength(1);

    let state = open;
    for (let i = 0; i < EYE_OPEN_ROUNDS; i++) state = attackRound(state, rng(0.5)).state;
    expect(state.bossTurn?.eye).toBe("closed");
    const closedHit = bossHits(attackRound(state, rng(0.5)).events, "hero")[0].damage;
    const openHit = bossHits(attackRound({ ...state, bossTurn: { intent: "attack", step: 1, eye: "open" } }, rng(0.5)).events, "hero")[0].damage;
    expect(Math.abs(closedHit - openHit * (1 + EYE_CLOSED_TAKEN))).toBeLessThanOrEqual(1);
  });

  describe("Urmammut: Ansturm", () => {
    const charging = () => {
      let state = bossFight("primal-mammoth");
      for (let i = 0; i < CHARGE_AFTER; i++) state = attackRound(state, rng(0.5)).state;
      return state;
    };

    it("lädt nach einigen Angriffen auf und greift dabei nicht an – ungestört folgt der Ansturm", () => {
      const state = charging();
      expect(state.bossTurn).toEqual({ intent: "charging", charge: { taken: 0, roundsLeft: 1 } });
      const round = attackRound(state, rng(0.5), DEFEND);
      expect(bossHits(round.events, "enemy")).toHaveLength(0);
      expect(round.events).toContainEqual({ type: "charging", roundsLeft: 1 });
      expect(round.state.bossTurn).toEqual({ intent: "ability", ability: "primal-mammoth" });
      expect(attackRound(round.state, rng(0.5)).events).toContainEqual({ type: "bossAbility", bossId: "primal-mammoth", abilityId: "primal-mammoth" });
    });

    it("genug Schaden beim Aufladen bricht den Ansturm ab – er taumelt und erleidet mehr Schaden", () => {
      const state = charging();
      // Ein Boss mit wenig LP: ein Treffer reicht für die Schwelle
      const fragile = { ...state, enemy: { ...state.enemy, maxHp: 20, hp: 20 } };
      const hits = bossHits(attackRound(fragile, rng(0.5)).events, "hero");
      expect(hits[0].damage).toBeGreaterThanOrEqual(20 * CHARGE_BREAK);
      const broken = attackRound(fragile, rng(0.5)).state;
      expect(broken.bossTurn).toEqual({ intent: "staggered", step: 0 });
      const stagger = attackRound(broken, rng(0.5));
      expect(stagger.events).toContainEqual({ type: "staggered" });
      expect(bossHits(stagger.events, "enemy")).toHaveLength(0);
      const plain = bossHits(attackRound({ ...broken, bossTurn: { intent: "attack", step: 0 } }, rng(0.5)).events, "hero")[0].damage;
      expect(Math.abs(bossHits(stagger.events, "hero")[0].damage - plain * (1 + STAGGER_TAKEN))).toBeLessThanOrEqual(1);
      expect(stagger.state.bossTurn).toEqual({ intent: "attack", step: 0 });
    });

    it("eine Betäubung bricht den Ansturm ab", () => {
      const state = { ...charging(), abilities: bossFight("primal-mammoth", "mace-0").abilities };
      const stunned = attackRound(state, rng(0.01), "mace");
      expect(stunned.events.some((e) => e.type === "stunned" && !e.add)).toBe(true);
      expect(stunned.state.bossTurn?.intent).toBe("staggered");
    });
  });

  it("alle Bosse haben einen eigenen Ablauf und beginnen mit einer Absicht", () => {
    for (const area of [...AREAS, ...DUNGEONS]) {
      const boss = area.creatures.at(-1)!;
      expect(hasBossScript(boss.id), boss.id).toBe(true);
      expect(firstBossTurn(boss.id), boss.id).not.toBeNull();
    }
  });

  it("Sumpfechse: taucht ab – nicht angreifbar, das Wasser löscht ihr Feuer – dann der Hinterhalt", () => {
    let state = bossFight("ancient-lizard");
    for (let i = 0; i < DIVE_AFTER; i++) state = attackRound(state, rng(0.5)).state;
    expect(state.bossTurn).toMatchObject({ intent: "submerged" });
    const burning = { ...state, enemyEffects: { burn: { damage: 50, roundsLeft: 2 } } };
    const dive = attackRound(burning, rng(0.5), "greatsword");
    expect(dive.events).toContainEqual({ type: "evaded" });
    expect(dive.events).toContainEqual({ type: "submerged", extinguished: true });
    expect(dive.state.enemy.hp).toBe(state.enemy.hp);
    expect(bossHits(dive.events, "enemy")).toHaveLength(0);
    expect(dive.state.bossTurn).toMatchObject({ intent: "ability", ability: "ancient-lizard" });
    expect(attackRound(dive.state, rng(0.5)).events).toContainEqual({ type: "bossAbility", bossId: "ancient-lizard", abilityId: "ancient-lizard" });
  });

  describe("Lichkönig: Seelengefäss", () => {
    const withSkeleton = () => {
      const battle = startBattle("b", "Held", getHeroCombatProfile(hero(), { ...EMPTY_EQUIPMENT, weapon1: fullWeapon("greatsword-0", "common", "w1") }), getCreature("lich-king").creature);
      return { ...battle, hero: { ...battle.hero, hp: 99_999, maxHp: 99_999 } };
    };

    it("ohne gefallene Skelette bleibt er liegen", () => {
      const state = withSkeleton();
      const dying = { ...state, enemy: { ...state.enemy, hp: 1 } };
      expect(attackRound(dying, rng(0.5)).state.status).toBe("won");
    });

    it("jedes gefallene Skelett lädt das Gefäss auf – fällt er, steht er einmal wieder auf", () => {
      const state = withSkeleton();
      const skeleton = state.adds!.find((a) => !a.role)!;
      const weak = { ...state, adds: state.adds!.map((a) => (a === skeleton ? { ...a, combatant: { ...a.combatant, hp: 1 } } : a)) };
      const killed = attackRound(setTarget(weak, skeleton.uid), rng(0.5)).state;
      expect(killed.bossTurn?.vessel).toBe(1);
      const dying = { ...killed, enemy: { ...killed.enemy, hp: 1 } };
      const risen = attackRound(dying, rng(0.5));
      const heal = Math.round(dying.enemy.maxHp * VESSEL_HP);
      expect(risen.events).toContainEqual({ type: "risen", heal });
      expect(risen.state.status).toBe("active");
      expect(risen.state.bossTurn?.vessel).toBe(0);
      // Das Gefäss ist zerbrochen – beim zweiten Mal bleibt er liegen
      expect(attackRound({ ...risen.state, enemy: { ...risen.state.enemy, hp: 1 } }, rng(0.5)).state.status).toBe("won");
    });
  });

  it("Ignaroth: in der Luft streift ihn der Nahkampf nur, der Bogen trifft voll – beim Landen der Feueratem", () => {
    let state = bossFight("ignaroth");
    const ground = bossHits(attackRound(state, rng(0.5)).events, "hero")[0].damage;
    for (let i = 0; i < GROUND_ROUNDS; i++) state = attackRound(state, rng(0.5)).state;
    expect(state.bossTurn).toMatchObject({ intent: "attack", airborne: true });
    const air = bossHits(attackRound(state, rng(0.5)).events, "hero")[0];
    expect(air.grazed).toBe(true);
    expect(Math.abs(air.damage - ground * AIRBORNE_MELEE)).toBeLessThanOrEqual(1);
    const archer = bossFight("ignaroth", "bow-0");
    const bowGround = bossHits(attackRound(archer, rng(0.5)).events, "hero")[0];
    const bowAir = bossHits(attackRound({ ...archer, bossTurn: state.bossTurn }, rng(0.5)).events, "hero")[0];
    expect(bowAir.grazed).toBeUndefined();
    expect(bowAir.damage).toBe(bowGround.damage);
    for (let i = 0; i < FLIGHT_ROUNDS; i++) state = attackRound(state, rng(0.5)).state;
    expect(state.bossTurn).toMatchObject({ intent: "ability", ability: "ignaroth" });
  });

  it("Erzkönig: Treffer brechen Panzerplatten ab (Wucht zwei), ohne Platten ist er verwundbar, dann wachsen sie nach", () => {
    const state = bossFight("ore-king");
    expect(state.bossTurn?.plates).toBe(PLATES_MAX);
    const plated = attackRound(state, rng(0.5));
    expect(plated.state.bossTurn?.plates).toBe(PLATES_MAX - 1);
    const platedHit = bossHits(plated.events, "hero")[0];
    expect(platedHit.plated).toBe(true);
    const bareHit = bossHits(attackRound({ ...state, bossTurn: { intent: "attack", plates: 0, exposed: 1 } }, rng(0.5)).events, "hero")[0];
    expect(Math.abs(platedHit.damage / bareHit.damage - PLATE_TAKEN / (1 + EXPOSED_TAKEN))).toBeLessThan(0.02);
    // Der Hammer bricht zwei auf einmal
    expect(attackRound(bossFight("ore-king", "greathammer-0"), rng(0.5)).state.bossTurn?.plates).toBe(PLATES_MAX - 2);

    let s = state;
    for (let i = 0; i < PLATES_MAX - 1; i++) s = attackRound(s, rng(0.5)).state;
    const last = attackRound(s, rng(0.5));
    expect(last.events).toContainEqual({ type: "platesBroken" });
    s = last.state;
    expect(s.bossTurn).toMatchObject({ plates: 0, exposed: EXPOSED_ROUNDS });
    for (let i = 0; i < EXPOSED_ROUNDS - 1; i++) s = attackRound(s, rng(0.5)).state;
    const regrow = attackRound(s, rng(0.5));
    expect(regrow.events).toContainEqual({ type: "platesRegrown" });
    expect(regrow.state.bossTurn?.plates).toBe(PLATES_MAX);
  });

  describe("Neferet: Fluch", () => {
    /** Kurz vor dem Fluch der Mumie (Runde 6) */
    const beforeCurse = () => ({ ...bossFight("high-priestess"), round: 6, bossTurn: { intent: "ability" as const, ability: "high-priestess" } });

    it("der Fluch der Mumie legt einen Fluch, der nach einigen Runden losbricht – Abwehren halbiert ihn", () => {
      const cursed = attackRound(beforeCurse(), rng(0.5));
      expect(cursed.events).toContainEqual({ type: "cursed" });
      expect(cursed.state.bossTurn?.curse?.roundsLeft).toBe(CURSE_ROUNDS);
      let s = { ...cursed.state, mana: 0 };
      for (let i = 0; i < CURSE_ROUNDS - 1; i++) s = attackRound(s, rng(0.5), DEFEND).state;
      expect(describeIntent("high-priestess", s.bossTurn!).tone).toBe("danger");
      const burst = attackRound(s, rng(0.5)).events.find((e) => e.type === "curseBurst");
      expect(burst).toEqual({ type: "curseBurst", damage: Math.round(s.hero.maxHp * CURSE_DAMAGE) });
      const defended = attackRound(s, rng(0.5), DEFEND).events.find((e) => e.type === "curseBurst");
      expect(defended).toEqual({ type: "curseBurst", damage: Math.round(s.hero.maxHp * CURSE_DAMAGE * DEFEND_DAMAGE_TAKEN) });
    });

    it("genug Schaden an ihr bricht den Fluch", () => {
      const cursed = attackRound(beforeCurse(), rng(0.5)).state;
      const weak = { ...cursed, enemy: { ...cursed.enemy, hp: cursed.bossTurn!.curse!.breakAt + 1 } };
      const round = attackRound(weak, rng(0.5));
      expect(round.events).toContainEqual({ type: "curseBroken" });
      expect(round.events.some((e) => e.type === "curseBurst")).toBe(false);
      expect(round.state.bossTurn?.curse).toBeUndefined();
    });
  });

  it("Kaelthar: jede Fähigkeit lädt ihn auf – voll geladen entlädt er sich, Abwehren lädt nicht", () => {
    let state = bossFight("storm-lord");
    expect(attackRound(state, rng(0.5), DEFEND).state.bossTurn?.static).toBe(0);
    for (let i = 0; i < STATIC_MAX; i++) {
      const round = attackRound({ ...state, cooldowns: {}, round: 1 }, rng(0.5), "greatsword");
      expect(round.events).toContainEqual({ type: "static", charges: i + 1 });
      state = round.state;
    }
    expect(state.bossTurn).toMatchObject({ intent: "ability", ability: "storm-lord-discharge" });
    const discharge = attackRound(state, rng(0.5));
    expect(discharge.events).toContainEqual({ type: "bossAbility", bossId: "storm-lord", abilityId: "storm-lord-discharge" });
    expect(discharge.state.bossTurn?.static).toBe(0);
  });

  it("Xal'Zar: verschlingt die stärkste Fähigkeit, schlägt mit ihr zu und gibt sie erst nach genug Schaden frei", () => {
    const start = bossFight("void-lord");
    const devour = attackRound(start, rng(0.5)).state;
    expect(devour.bossTurn).toEqual({ intent: "devour" });
    const swallowed = attackRound(devour, rng(0.5), DEFEND);
    expect(bossHits(swallowed.events, "enemy")).toHaveLength(0);
    // Die stärkste Schadens-Fähigkeit des Zweihandschwerts: Richterstoss (2,3-fach)
    expect(swallowed.events).toContainEqual({ type: "devoured", ability: "greatsword" });
    const sealed = swallowed.state;
    // Runde 3 gehört seiner eigenen Fähigkeit (fester Takt), danach schlägt er mit der verschlungenen zu
    expect(sealed.bossTurn).toMatchObject({ intent: "ability", devoured: { ability: "greatsword", taken: 0 } });
    expect(abilityBlocker(sealed, "greatsword")).toMatch(/gefangen/);
    const next = attackRound(sealed, rng(0.5), DEFEND).state;
    expect(next.bossTurn).toMatchObject({ intent: "stolen", devoured: { ability: "greatsword" } });
    const stolen = attackRound(next, rng(0.5), DEFEND);
    expect(stolen.events).toContainEqual({ type: "stolen", ability: "greatsword" });
    expect(stolen.events.some((e) => e.type === "bossAbility")).toBe(false);
    // Genug Schaden befreit sie
    const hurt = { ...sealed, enemy: { ...sealed.enemy, maxHp: 100, hp: 100 } };
    const freed = attackRound({ ...hurt, bossTurn: { intent: "stolen", devoured: { ability: "greatsword", taken: 100 * DEVOUR_FREE } } }, rng(0.5));
    expect(freed.events).toContainEqual({ type: "freed", ability: "greatsword" });
    expect(freed.state.bossTurn?.devoured).toBeUndefined();
    expect(abilityBlocker(freed.state, "greatsword")).toBeNull();
  });
});
