// Golden Master für den Kampf: spielt hunderte Kämpfe mit festem Zufall durch – solo und
// koop, mit allen Kreaturen, Bossen, Waffen, Klassen, Skillpfaden, Item-Effekten, Elites,
// Rudeln, Seltenen, heroischen Bossen, Turm-Segen und Koop-Dungeons – und vergleicht
// einen Fingerabdruck jedes Kampfes (alle Ereignisse und Zustände) mit dem Snapshot.
//
// Zweck: Umbauten der Kampflogik (gemeinsamer Kern für Solo und Koop) dürfen das
// Verhalten nicht verändern – auch nicht die Reihenfolge, in der Zufall gezogen wird.
// Ändert sich der Kampf absichtlich, den Snapshot mit `npx vitest run -u` erneuern.
// Der Snapshot-Diff nennt die betroffenen Kämpfe – das grenzt eine Abweichung ein.

import { describe, expect, it } from "vitest";
import { abilitiesOf, type AbilityId } from "./abilities";
import {
  abilityBlocker,
  attackRound,
  DEFEND,
  drinkPotion,
  getHeroCombatProfile,
  livingAdds,
  potionBlocker,
  setTarget,
  startBattle,
  type BattleState,
  type HeroCombatProfile,
} from "./combat";
import {
  COOP_BOSSES,
  coopBossTurn,
  coopContent,
  coopAbilityBlocker,
  coopPotionBlocker,
  hasNextStage,
  HEROIC_SUFFIX,
  isCoopDungeon,
  nextDungeonStage,
  resolveRound,
  startCoopBattle,
  type CoopAction,
  type CoopBattleState,
  type CoopPlayer,
} from "./coopCombat";
import { blessCoopHero, coopDoors, voteDoor } from "./coopDungeonPaths";
import { AREAS, DUNGEONS, type CreatureDef } from "./creatures";
import { ELITE_AFFIXES, type EliteAffix } from "./elites";
import { EMPTY_EQUIPMENT } from "./equipment";
import { HERO_CLASSES } from "./heroClasses";
import { heroicAffixes, makeHeroic } from "./heroic";
import { ITEM_EFFECTS } from "./itemEffects";
import { createItem, indexForLevel } from "./items";
import { MAX_LEVEL, xpForNextLevel } from "./leveling";
import { WEAPON_KIND } from "./matchups";
import { POTIONS } from "./potions";
import { hash, seededRng } from "./random";
import { RARES, rareCreature } from "./rares";
import { SKILL_PATHS, type SkillWeapon } from "./skills";
import { BLESSINGS, blessedProfile, type BlessingId } from "./tower";
import { pathOrder, withSkills } from "../test/skills";
import type { Character, Equipment } from "./types";

const WEAPONS = Object.keys(WEAPON_KIND) as SkillWeapon[];
const CLASSES = [null, ...HERO_CLASSES.map((c) => c.id)];
const PATHS = SKILL_PATHS.map((p) => p.id);

type Rng = () => number;
const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const subset = <T,>(rng: Rng, list: readonly T[], chance: number): T[] => list.filter(() => rng() < chance);

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
  skills: {},
});

const gearAt = (level: number): Equipment => {
  const item = (type: string) => createItem(`${type}-${indexForLevel(level)}`, "rare", type, () => 0.5);
  return { ...EMPTY_EQUIPMENT, head: item("head"), chest: item("chest"), arms: item("arms"), legs: item("legs"), feet: item("feet"), weapon1: item("sword") };
};

/** Ein zufälliger, aber reproduzierbarer Held: Waffe, Klasse, Skills, Item-Effekte. */
function randomProfile(rng: Rng, level: number): HeroCombatProfile {
  const first = pick(rng, PATHS);
  const second = pick(rng, PATHS);
  const order = [...pathOrder(first, rng() < 0.5 ? 0 : 1), ...pathOrder(second, rng() < 0.5 ? 0 : 1)];
  const character = withSkills(heroAt(level), order);
  const base = getHeroCombatProfile(character, gearAt(level));
  const weapon = pick(rng, WEAPONS);
  const offhand = pick(rng, WEAPONS);
  const abilities = [...new Set([...abilitiesOf(weapon), ...abilitiesOf(offhand)].map((a) => a.id))].filter(() => rng() < 0.7);
  // Meist zäh, damit die Kämpfe lang genug für Phasen, Wut und Boss-Abläufe dauern – manchmal normal
  const toughness = rng() < 0.75 ? 2 + rng() * 3 : 1;
  return {
    ...base,
    maxHp: Math.round(base.maxHp * toughness),
    weapon,
    heroClass: pick(rng, CLASSES),
    abilities: abilities.slice(0, 6) as AbilityId[],
    itemEffects: subset(rng, ITEM_EFFECTS, 0.25).map((e) => e.id),
    critChance: Math.min(0.6, base.critChance + rng() * 0.2),
    ...(rng() < 0.3 && { potionPower: 1.3 }),
  };
}

/** Rollender Fingerabdruck über alles, was im Kampf passiert. */
function recorder(name: string) {
  let digest = hash(name);
  return {
    add(value: unknown) {
      digest = hash(`${digest}|${JSON.stringify(value)}`);
    },
    done: () => digest.toString(16).padStart(8, "0"),
  };
}

/* ───────────────────────── Solo ───────────────────────── */

function playSolo(name: string, start: BattleState, seed: number): string {
  const rec = recorder(name);
  const fight = seededRng(seed);
  const choose = seededRng(seed ^ 0x5bd1e995);
  let state = start;
  rec.add(state);
  for (let step = 0; step < 60 && state.status === "active"; step++) {
    try {
      // Ziel wechseln
      if (choose() < 0.3) {
        const targets = [...(state.enemy.hp > 0 ? [undefined] : []), ...livingAdds(state).map((a) => a.uid)];
        state = setTarget(state, pick(choose, targets));
      }
      // Manchmal erst ein Trank (Trinken oder Werfen)
      if (choose() < 0.2) {
        const potion = pick(choose, POTIONS);
        if (potionBlocker(state, potion) === null) {
          const r = drinkPotion(state, potion);
          rec.add(r.events);
          state = r.state;
        }
      }
      if (state.status !== "active") break;
      const usable = state.abilities.filter((id) => abilityBlocker(state, id) === null);
      const roll = choose();
      const action = roll < 0.15 ? DEFEND : roll < 0.6 && usable.length > 0 ? pick(choose, usable) : undefined;
      const r = attackRound(state, fight, action);
      rec.add(r.events);
      state = r.state;
    } catch (error) {
      rec.add(`throw: ${(error as Error).message}`);
      break;
    }
  }
  rec.add({ ...state, log: undefined });
  return rec.done();
}

const SOLO_CREATURES: CreatureDef[] = [...AREAS, ...DUNGEONS].flatMap((a) => a.creatures);

describe("Golden Master: Solo-Kämpfe", () => {
  it("verhalten sich unverändert", () => {
    const results: Record<string, string> = {};
    SOLO_CREATURES.forEach((creature, i) => {
      for (let variant = 0; variant < 4; variant++) {
        const seed = hash(`${creature.id}#${variant}`);
        const rng = seededRng(seed);
        const level = Math.min(MAX_LEVEL, Math.max(1, creature.level + Math.floor(rng() * 5) - 2));
        let hero = randomProfile(rng, level);
        let name = `${creature.id}#${variant}`;
        let battle: BattleState;
        if (variant === 0) {
          battle = startBattle(`s${i}`, "Held", hero, creature);
        } else if (variant === 1) {
          // Elite oder Rudel
          const pack = !creature.boss && rng() < 0.5;
          const elite: EliteAffix[] = pack ? [] : subset(rng, ELITE_AFFIXES, 0.3).map((a) => a.id).slice(0, 2);
          battle = startBattle(`s${i}`, "Held", hero, creature, hero.maxHp, elite, pack);
          name += pack ? ":pack" : `:elite(${elite.join(",")})`;
        } else if (variant === 2) {
          // Heroischer Boss bzw. seltene Variante
          const rare = RARES.find((r) => r.creatureId === creature.id);
          if (creature.boss) {
            battle = makeHeroic(startBattle(`s${i}`, "Held", hero, creature, hero.maxHp, heroicAffixes(creature.id)));
            name += ":heroic";
          } else if (rare) {
            battle = { ...startBattle(`s${i}`, "Held", hero, rareCreature(rare), hero.maxHp, [...rare.affixes]), rare: rare.id };
            name += ":rare";
          } else {
            battle = startBattle(`s${i}`, "Held", hero, creature, Math.round(hero.maxHp * 0.4));
            name += ":wounded";
          }
        } else {
          // Turm-Segen
          const blessings = subset(rng, BLESSINGS, 0.35).map((b) => b.id) as BlessingId[];
          hero = blessedProfile(hero, blessings);
          battle = { ...startBattle(`s${i}`, "Held", hero, creature), blessings, towerFloor: 1 + Math.floor(rng() * 30) };
          name += `:blessed(${blessings.join(",")})`;
        }
        results[name] = playSolo(name, battle, seed);
      }
    });
    expect(Object.keys(results).length).toBeGreaterThan(150);
    expect(results).toMatchSnapshot();
  });
});

/* ───────────────────────── Koop ───────────────────────── */

function playCoop(name: string, start: CoopBattleState, seed: number): string {
  const rec = recorder(name);
  const fight = seededRng(seed);
  const choose = seededRng(seed ^ 0x5bd1e995);
  let state = start;
  let now = 0;
  rec.add(state);
  for (let step = 0; step < 150; step++) {
    try {
      if (state.status === "won" && hasNextStage(state)) {
        // Zwischen den Stufen manchmal ein Segen
        if (choose() < 0.4) {
          const id = pick(choose, BLESSINGS).id;
          state = { ...state, heroes: state.heroes.map((h) => blessCoopHero(h, id)) };
        }
        now += 1000;
        const id = `${start.id}-${step}`;
        // An einer Gabelung stimmt der erste Held für eine Kampf- oder Elite-Tür
        const doors = coopDoors(state);
        const fights = (doors ?? []).flatMap((d, i) => (d.kind === "fight" || d.kind === "elite" ? [i] : []));
        if (doors && fights.length === 0) break;
        const heroId = state.heroes[0].id;
        state = doors
          ? voteDoor(state, heroId, pick(choose, fights), { present: [heroId], hostId: heroId }, () => id, now)
          : nextDungeonStage(state, id, now);
        rec.add(state);
        continue;
      }
      if (state.status !== "active") break;
      const actions: Record<string, CoopAction> = {};
      const turn = coopBossTurn(state);
      const targets = [undefined, ...(state.adds ?? []).filter((a) => a.combatant.hp > 0).map((a) => a.uid)];
      for (const hero of state.heroes) {
        if (hero.down || choose() < 0.1) continue; // keine Wahl = normaler Angriff
        const action: CoopAction = {};
        const target = pick(choose, targets);
        if (target) action.target = target;
        const roll = choose();
        if (roll < 0.15) action.defend = true;
        else if (roll < 0.6) {
          const usable = hero.abilities.filter((id) => coopAbilityBlocker(hero, id, turn, state.round) === null);
          if (usable.length > 0) action.ability = pick(choose, usable);
        }
        if (choose() < 0.15) {
          const potion = pick(choose, POTIONS);
          const on = pick(choose, [hero.id, ...state.heroes.map((h) => h.id), ...targets.filter((t) => t !== undefined)]);
          if (coopPotionBlocker(state, hero.id, potion.id, on) === null) action.potion = { potionId: potion.id, targetId: on };
        }
        actions[hero.id] = action;
      }
      now += 1000;
      const r = resolveRound(state, actions, fight, now);
      rec.add(r.events);
      state = r.state;
    } catch (error) {
      rec.add(`throw: ${(error as Error).message}`);
      break;
    }
  }
  rec.add(state);
  return rec.done();
}

const COOP_CONTENT = [
  ...COOP_BOSSES.map((b) => b.id),
  ...DUNGEONS.filter((d) => isCoopDungeon(d.id)).flatMap((d) => [d.id, `${d.id}${HEROIC_SUFFIX}`]),
];

describe("Golden Master: Koop-Kämpfe", () => {
  it("verhalten sich unverändert", () => {
    const results: Record<string, string> = {};
    for (const content of COOP_CONTENT) {
      for (let variant = 0; variant < 4; variant++) {
        const name = `${content}#${variant}`;
        const seed = hash(name);
        const rng = seededRng(seed);
        const count = 2 + Math.floor(rng() * 3);
        const level = Math.min(MAX_LEVEL, coopContent(content).level + Math.floor(rng() * 5));
        const players: CoopPlayer[] = Array.from({ length: count }, (_, p) => ({
          id: `p${p}`,
          name: `Held ${p}`,
          profile: randomProfile(rng, level),
        }));
        results[`${name}:${count}x${level}`] = playCoop(name, startCoopBattle(name, content, players, 0), seed);
      }
    }
    expect(Object.keys(results).length).toBeGreaterThan(20);
    expect(results).toMatchSnapshot();
  });
});
