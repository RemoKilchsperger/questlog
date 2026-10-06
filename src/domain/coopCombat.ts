// Koop-Kampf: 2–4 Helden gegen einen Koop-Boss (Plan: docs/koop-kampf.md).
// Reine Logik wie combat.ts – wer sie ausführt (Host-Browser, später ein
// Server), ist egal. Pro Runde handeln zuerst alle Helden, danach der Boss.
//
// Ablauf einer Runde (`resolveRound`):
//   1. Jeder lebende Held der Reihe nach: optional ein Trank (für sich selbst
//      oder zum Wiederbeleben eines gefallenen Mitspielers), dann Angriff –
//      normal oder mit Fähigkeit. Schaden erzeugt Bedrohung.
//   2. Gift, Feuer und Bluten wirken – erst beim Boss, dann bei den Helden.
//   3. Bossphase: Fähigkeit (trifft alle) oder Angriff auf das Ziel mit der
//      höchsten Bedrohung (mit etwas Zufall). Betäubung lässt sie ausfallen.
//   4. Mana-Regeneration, Verstärkungen laufen ab.

import { MANA_REGEN, type AbilityId, type Guard } from "./abilities";
import {
  classAbility,
  CLERIC_POTION_FACTOR,
  CLERIC_REGEN,
  DUELIST_EXTRA_HIT,
  PALADIN_THREAT,
  PLUNDERER_BLEED,
  rageFactor,
  type HeroClassId,
} from "./heroClasses";
import {
  cooldownText,
  rollBattleReward,
  rollHit,
  tickCooldowns,
  type ActiveBuff,
  type BattleReward,
  type Combatant,
  type DamageOverTime,
  type HeroCombatProfile,
} from "./combat";
import { getCreatureStats, type CreatureDef } from "./creatures";
import { getPotion, potionHeal, type BuffKind } from "./potions";
import type { SkillWeapon } from "./skills";

export const COOP_MIN_PLAYERS = 2;
export const COOP_MAX_PLAYERS = 4;
/** Zeit pro Spielerphase – wer nicht wählt, greift normal an. */
export const COOP_TURN_SECONDS = 30;
/** Kampfpunkte pro Spieler, bezahlt beim Start. */
export const COOP_COST = 3;
/** XP und Gold eines Koop-Sieges im Vergleich zu einem Solo-Boss gleichen Levels. */
export const COOP_REWARD_FACTOR = 1.5;
/**
 * Am Ende jeder Runde verliert jeder Held diesen Anteil seiner Bedrohung – so
 * zählt vor allem, wer gerade viel Schaden macht, und das Ziel kann wechseln.
 */
export const THREAT_DECAY = 0.3;
/** Mit Bollwerk zieht der Schildträger diesen Anteil der Boss-Angriffe auf sich – egal wie gross die Gruppe ist. */
export const BULWARK_SHARE = 0.75;
/** Ab der zweiten Betäubung im Kampf wirkt sie nur noch mit dieser Chance. */
export const REPEAT_STUN_CHANCE = 0.5;

/** Id des Bosses in Ereignissen – Helden haben die Id ihres Spielers. */
export const BOSS = "boss";

export interface CoopBossAbility {
  name: string;
  icon: string;
  description: string;
  /** Eingesetzt in jeder Runde, deren Nummer durch `every` teilbar ist */
  every: number;
  multiplier: number;
  /** Trifft alle lebenden Helden statt nur das Ziel */
  aoe?: boolean;
  ignoreArmor?: boolean;
  poison?: { percent: number; rounds: number };
  /** Raubt jedem getroffenen Helden so viel Mana */
  manaBurn?: number;
  /** Friert einen Helden ein (meist den mit der höchsten Bedrohung): Er setzt die nächste Runde aus. */
  freeze?: boolean;
}

export interface CoopBossDef {
  id: string;
  name: string;
  description: string;
  level: number;
  /** Schlüssel der Grafik in src/game/creatureSprites.ts */
  sprite: string;
  /** Gebiet, dessen Hintergrund die Kampfszene zeigt (backgrounds.ts) */
  areaId: string;
  /** Stärke für 2 Spieler – mehr Spieler skalieren nach oben (siehe `coopBossStats`) */
  power: number;
  ability: CoopBossAbility;
  /** Normale Angriffe heilen den Boss um diesen Anteil des Schadens */
  lifesteal?: number;
}

/** Koop-Bosse, aufsteigend nach Level – jeder mit eigenem Raid-Set (items.ts). */
export const COOP_BOSSES: readonly CoopBossDef[] = [
  {
    id: "swamp-hydra",
    name: "Sumpfhydra",
    description: "Drei Köpfe, ein Hunger. Ihr Giftatem trifft die ganze Gruppe.",
    level: 20,
    sprite: "hydra",
    areaId: "mistmarsh",
    power: 2,
    ability: {
      name: "Giftatem",
      icon: "🐍",
      description: "Alle 3 Runden: Giftwolke auf alle Helden, die 3 Runden nachwirkt.",
      every: 3,
      multiplier: 0.7,
      aoe: true,
      poison: { percent: 0.25, rounds: 3 },
    },
  },
  {
    id: "frost-giant",
    name: "Frostriese Hrimgar",
    description: "Ein Riese aus Gletschereis. Wer ihm zu nahe kommt, erstarrt.",
    level: 40,
    sprite: "frost-giant",
    areaId: "frost-peaks",
    power: 2,
    ability: {
      name: "Gletscherstampfer",
      icon: "❄️",
      description: "Alle 3 Runden: Erschütterung auf alle Helden – einer friert ein und setzt eine Runde aus.",
      every: 3,
      multiplier: 0.8,
      aoe: true,
      freeze: true,
    },
  },
  {
    id: "world-eater",
    name: "Weltenverschlinger",
    description: "Ein Schlund aus der Leere. Jeder Biss nährt ihn.",
    level: 60,
    sprite: "world-eater",
    areaId: "void-abyss",
    power: 1.9,
    lifesteal: 0.5,
    ability: {
      name: "Leerenstrudel",
      icon: "🌀",
      description: "Alle 3 Runden: zieht alle Helden in den Strudel (ignoriert Rüstung) und raubt je 30 Mana. Seine Bisse heilen ihn.",
      every: 3,
      multiplier: 0.9,
      aoe: true,
      ignoreArmor: true,
      manaBurn: 30,
    },
  },
];

export function getCoopBoss(id: string): CoopBossDef {
  const boss = COOP_BOSSES.find((b) => b.id === id);
  if (!boss) throw new Error(`Unbekannter Koop-Boss: ${id}`);
  return boss;
}

/** Der Koop-Boss als Kreatur – für Grafik, Werte und Beute wie ein Solo-Boss. */
export function coopBossCreature(boss: CoopBossDef): CreatureDef {
  return { id: boss.id, name: boss.name, sprite: boss.sprite, level: boss.level, boss: true, power: boss.power };
}

/**
 * Kampfwerte des Bosses für `players` Spieler. Ausgelegt auf zwei:
 * Lebenspunkte × n/2, Schaden +10 % pro Spieler über zwei.
 */
export function coopBossStats(boss: CoopBossDef, players: number): Combatant {
  const base = getCreatureStats(coopBossCreature(boss));
  const maxHp = Math.round((base.maxHp * players) / 2);
  return {
    name: boss.name,
    level: boss.level,
    maxHp,
    hp: maxHp,
    damage: base.damage * (1 + 0.1 * (players - 2)),
    armor: base.armor,
    critChance: base.critChance,
  };
}

type OverTimeKind = "poison" | "burn" | "bleed";
const OVER_TIME: readonly OverTimeKind[] = ["poison", "burn", "bleed"];

/** Gift/Feuer/Bluten am Boss merken sich, wer sie verursacht hat (Bedrohung). */
type SourcedDot = DamageOverTime & { sourceId: string };

export interface CoopHero {
  /** Id des Spielers */
  id: string;
  name: string;
  combatant: Combatant;
  mana: number;
  maxMana: number;
  abilities: AbilityId[];
  /** Abklingzeiten: verbleibende Runden (fehlt bei älteren Kämpfen) */
  cooldowns?: Partial<Record<AbilityId, number>>;
  /** Aktive Klasse (heroClasses.ts) – fehlt bei älteren Kämpfen */
  heroClass?: HeroClassId | null;
  buffs: Partial<Record<BuffKind, ActiveBuff>>;
  /** Sorten, die in diesem Kampf schon getrunken wurden – jede nur einmal pro Kampf. */
  potionsUsed: string[];
  effects: Partial<Record<OverTimeKind, DamageOverTime>> & {
    bulwark?: boolean;
    /** Eingefroren: setzt die nächste Runde aus */
    frozen?: boolean;
    /** Parade/Vergeltung gegen den nächsten Angriff des Bosses */
    guard?: Guard;
    /** Kriegsschrei: mehr Schaden */
    empower?: ActiveBuff;
  };
  threat: number;
  /** Auf 0 LP gefallen – handelt nicht und wird nicht angegriffen */
  down: boolean;
  /** Wurde schon einmal wiederbelebt (höchstens einmal pro Kampf) */
  revived: boolean;
}

export type CoopEvent =
  | { type: "potion"; heroId: string; targetId: string; potionId: string; heal: number; buff?: BuffKind; revive?: boolean }
  | { type: "ability"; heroId: string; ability: AbilityId; weapon: SkillWeapon; manaCost: number }
  /** Ein Held heilt sich durch eine Fähigkeit */
  | { type: "selfHeal"; heroId: string; heal: number }
  /** Parade/Vergeltung fängt Schaden ab und trifft den Boss */
  | { type: "guarded"; heroId: string; prevented: number }
  | { type: "counter"; heroId: string; damage: number }
  | { type: "hit"; attacker: string; target: string; damage: number; crit: boolean; weapon?: SkillWeapon; ability?: AbilityId }
  | { type: OverTimeKind; target: string; damage: number }
  | { type: "bossAbility"; bossId: string; name: string }
  | { type: "stunned" }
  | { type: "stunResisted" }
  | { type: "blocked"; heroId: string }
  | { type: "down"; heroId: string }
  | { type: "victory" }
  | { type: "wipe" }
  /** Ein Held wurde eingefroren bzw. setzt eingefroren aus */
  | { type: "frozen"; heroId: string }
  | { type: "skipped"; heroId: string }
  /** Der Boss raubt einem Helden Mana bzw. heilt sich durch seinen Biss */
  | { type: "manaBurn"; heroId: string; amount: number }
  | { type: "drain"; heal: number }
  /** Klassen-Regeneration (Kleriker) am Ende der Runde */
  | { type: "regen"; heroId: string; heal: number };

export type CoopStatus = "active" | "won" | "lost";

export interface CoopBattleState {
  id: string;
  bossId: string;
  round: number;
  /** Ende der aktuellen Spielerphase (ms seit 1970) – danach wird automatisch aufgelöst */
  deadline: number;
  heroes: CoopHero[];
  boss: Combatant;
  bossEffects: Partial<Record<OverTimeKind, SourcedDot>> & {
    armorBreak?: number;
    /** Geschwächt: macht `percent` weniger Schaden */
    weaken?: ActiveBuff;
    /** Verwundbar: erleidet `percent` mehr Schaden */
    vulnerable?: ActiveBuff;
  };
  /** Bisher versuchte Betäubungen – ab der zweiten nur noch mit Chance */
  stunsUsed: number;
  status: CoopStatus;
  log: (CoopEvent & { round: number })[];
}

/**
 * Was ein Spieler in einer Runde tut: optional ein Trank (Ziel: er selbst oder
 * ein gefallener Mitspieler), dann ein Angriff – mit `ability` als Fähigkeit.
 */
export interface CoopAction {
  potion?: { potionId: string; targetId: string };
  ability?: AbilityId;
}

export interface CoopPlayer {
  id: string;
  name: string;
  profile: HeroCombatProfile;
}

export function startCoopBattle(id: string, bossId: string, players: CoopPlayer[], now: number): CoopBattleState {
  if (players.length < COOP_MIN_PLAYERS || players.length > COOP_MAX_PLAYERS) {
    throw new Error(`Ein Koop-Kampf braucht ${COOP_MIN_PLAYERS}–${COOP_MAX_PLAYERS} Spieler.`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length || players.some((p) => p.id === BOSS)) {
    throw new Error("Ungültige Spieler-Ids.");
  }
  const boss = getCoopBoss(bossId);
  return {
    id,
    bossId,
    round: 1,
    deadline: now + COOP_TURN_SECONDS * 1000,
    heroes: players.map(({ id: heroId, name, profile }) => ({
      id: heroId,
      name,
      combatant: {
        name,
        level: profile.level,
        maxHp: profile.maxHp,
        hp: profile.maxHp,
        damage: profile.damage,
        armor: profile.armor,
        critChance: profile.critChance,
        critMultiplier: profile.critMultiplier,
      },
      mana: profile.maxMana,
      maxMana: profile.maxMana,
      abilities: profile.abilities,
      cooldowns: {},
      heroClass: profile.heroClass,
      buffs: {},
      potionsUsed: [],
      effects: {},
      threat: 0,
      down: false,
      revived: false,
    })),
    boss: coopBossStats(boss, players.length),
    bossEffects: {},
    stunsUsed: 0,
    status: "active",
    log: [],
  };
}

/** Held mit den Werten aktiver Verstärkungen. */
function buffed(hero: CoopHero): Combatant {
  return {
    ...hero.combatant,
    damage: hero.combatant.damage * (1 + (hero.buffs.attack?.percent ?? 0)),
    armor: Math.round(hero.combatant.armor * (1 + (hero.buffs.armor?.percent ?? 0))),
  };
}

/** Warum dieser Trank nicht geht – oder null. Ziel: man selbst oder ein gefallener Mitspieler. */
export function coopPotionBlocker(state: CoopBattleState, heroId: string, potionId: string, targetId: string): string | null {
  const hero = state.heroes.find((h) => h.id === heroId);
  const target = state.heroes.find((h) => h.id === targetId);
  if (!hero || !target) return "Unbekannter Held.";
  if (hero.down) return "Du bist gefallen.";
  if (hero.potionsUsed.includes(potionId)) return "Diese Sorte hast du in diesem Kampf schon getrunken.";
  const potion = getPotion(potionId);
  if (target.id !== hero.id) {
    if (!target.down) return "Nur gefallene Mitspieler lassen sich wiederbeleben.";
    if (target.revived) return `${target.name} wurde schon einmal wiederbelebt.`;
    if (potion.effect.kind !== "heal") return "Zum Wiederbeleben braucht es einen Heiltrank.";
    return null;
  }
  if (potion.effect.kind === "heal" && hero.combatant.hp >= hero.combatant.maxHp) return "Deine Lebenspunkte sind schon voll.";
  return null;
}

/** Warum diese Fähigkeit nicht geht – oder null. */
export function coopAbilityBlocker(hero: CoopHero, id: AbilityId): string | null {
  if (!hero.abilities.includes(id)) return "Dafür brauchst du die passende Waffe und die freigeschaltete Fähigkeit.";
  const wait = hero.cooldowns?.[id] ?? 0;
  if (wait > 0) return cooldownText(wait);
  const { manaCost } = classAbility(id, hero.heroClass);
  if (hero.mana < manaCost) return `Nicht genug Mana (${manaCost} nötig).`;
  return null;
}

/**
 * Ziel des Bosses, gewichtet nach Bedrohung: Wer 60 % der Bedrohung der Gruppe
 * hat, wird mit 60 % Wahrscheinlichkeit angegriffen. Ohne Bedrohung (z. B. in
 * der ersten Runde) ist jeder lebende Held gleich wahrscheinlich.
 */
export function pickBossTarget(heroes: CoopHero[], rng: () => number): CoopHero | null {
  const alive = heroes.filter((h) => !h.down);
  if (alive.length === 0) return null;
  // +1, damit auch Helden ohne Bedrohung eine kleine Chance behalten
  const weights = alive.map((h) => h.threat + 1);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < alive.length; i++) {
    roll -= weights[i];
    if (roll < 0) return alive[i];
  }
  return alive[alive.length - 1];
}

/**
 * Löst eine Runde auf. Fehlende Aktionen (Zeit abgelaufen) gelten als normaler
 * Angriff; ungültige Tränke oder Fähigkeiten werden ignoriert – der Held greift
 * dann normal an, damit ein veralteter Klick nie die Runde blockiert.
 */
export function resolveRound(
  state: CoopBattleState,
  actions: Record<string, CoopAction>,
  rng: () => number = Math.random,
  now: number = Date.now(),
): { state: CoopBattleState; events: CoopEvent[] } {
  if (state.status !== "active") throw new Error("Der Kampf ist vorbei.");
  const events: CoopEvent[] = [];
  let heroes = state.heroes.map((h) => ({ ...h, combatant: { ...h.combatant }, effects: { ...h.effects } }));
  let boss = { ...state.boss };
  let bossEffects = { ...state.bossEffects };
  let stunsUsed = state.stunsUsed;
  let stunAttempt = false;
  /** Helden mit Bollwerk – ihre Bedrohung wird nach der Heldenphase hochgesetzt */
  const taunts: CoopHero[] = [];
  const byId = (id: string) => heroes.find((h) => h.id === id)!;
  const knockDown = (hero: CoopHero) => {
    if (hero.combatant.hp > 0 || hero.down) return;
    hero.down = true;
    hero.threat = 0;
    hero.effects = {};
    hero.buffs = {};
    events.push({ type: "down", heroId: hero.id });
  };

  /** Pro Held die in dieser Runde eingesetzte Fähigkeit (für die Abklingzeit) */
  const used = new Map<string, { id: AbilityId; cooldown: number }>();

  // 1. Die Helden handeln der Reihe nach.
  for (const hero of heroes) {
    if (hero.down || boss.hp <= 0) continue;
    if (hero.effects.frozen) {
      // Eingefroren: diese Runde keine Aktion, danach taut der Held auf
      hero.effects.frozen = undefined;
      events.push({ type: "skipped", heroId: hero.id });
      continue;
    }
    const action = actions[hero.id] ?? {};

    if (action.potion && !coopPotionBlocker({ ...state, heroes }, hero.id, action.potion.potionId, action.potion.targetId)) {
      const potion = getPotion(action.potion.potionId);
      const target = byId(action.potion.targetId);
      hero.potionsUsed = [...hero.potionsUsed, potion.id];
      if (target.id !== hero.id) {
        // Wiederbeleben: steht mit der Heilwirkung des Tranks wieder auf
        target.down = false;
        target.revived = true;
        target.combatant.hp = Math.max(1, potionHeal(potion, target.combatant.maxHp));
        events.push({ type: "potion", heroId: hero.id, targetId: target.id, potionId: potion.id, heal: target.combatant.hp, revive: true });
      } else if (potion.effect.kind === "heal") {
        const factor = hero.heroClass === "cleric" ? CLERIC_POTION_FACTOR : 1;
        const heal = Math.min(Math.round(potionHeal(potion, hero.combatant.maxHp) * factor), hero.combatant.maxHp - hero.combatant.hp);
        hero.combatant.hp += heal;
        events.push({ type: "potion", heroId: hero.id, targetId: hero.id, potionId: potion.id, heal });
      } else {
        const { kind, percent, rounds } = potion.effect;
        hero.buffs = { ...hero.buffs, [kind]: { percent, roundsLeft: rounds } };
        events.push({ type: "potion", heroId: hero.id, targetId: hero.id, potionId: potion.id, heal: 0, buff: kind });
      }
    }

    const ability = action.ability && !coopAbilityBlocker(hero, action.ability) ? classAbility(action.ability, hero.heroClass) : null;
    const plain = buffed(hero);
    // Berserker: bei wenig Lebenspunkten mehr Schaden; Kriegsschrei: Verstärkung
    const strong = {
      ...plain,
      damage:
        plain.damage *
        rageFactor(hero.heroClass, hero.combatant.hp, hero.combatant.maxHp) *
        (1 + (hero.effects.empower?.percent ?? 0)),
    };
    const threatFactor = hero.heroClass === "paladin" ? PALADIN_THREAT : 1;
    if (ability) {
      hero.mana -= ability.manaCost;
      used.set(hero.id, ability);
      events.push({ type: "ability", heroId: hero.id, ability: ability.id, weapon: ability.weapon, manaCost: ability.manaCost });
      if (ability.guard) hero.effects.guard = ability.guard;
      // +1, weil die Verstärkung erst ab der nächsten Runde zählt
      if (ability.empower) hero.effects.empower = { percent: ability.empower.percent, roundsLeft: ability.empower.rounds + 1 };
      if (ability.weaken) bossEffects = { ...bossEffects, weaken: { percent: ability.weaken.percent, roundsLeft: ability.weaken.rounds } };
      if (ability.vulnerable) {
        bossEffects = { ...bossEffects, vulnerable: { percent: ability.vulnerable.percent, roundsLeft: ability.vulnerable.rounds } };
      }
      if (ability.heal) {
        const heal = Math.min(hero.combatant.maxHp - hero.combatant.hp, Math.round(hero.combatant.maxHp * ability.heal));
        hero.combatant.hp += heal;
        if (heal > 0) events.push({ type: "selfHeal", heroId: hero.id, heal });
      }
      if (ability.armorBreak) bossEffects = { ...bossEffects, armorBreak: ability.armorBreak };
      if (ability.stun) stunAttempt = true;
      for (const kind of OVER_TIME) {
        const effect = ability[kind];
        if (!effect) continue;
        const damage = Math.max(1, Math.round(strong.damage * effect.percent));
        bossEffects = { ...bossEffects, [kind]: { damage, roundsLeft: effect.rounds, sourceId: hero.id } };
      }
      if (ability.bulwark) {
        hero.effects.bulwark = true;
        taunts.push(hero);
      }
    }
    // Finisher (Meucheln) und Verwundbarkeit des Bosses
    const execute = ability?.execute && boss.hp < boss.maxHp * ability.execute.threshold ? ability.execute.factor : 1;
    const vulnerable = 1 + (bossEffects.vulnerable?.percent ?? 0);
    const attacker: Combatant = ability
      ? {
          ...strong,
          damage: strong.damage * ability.multiplier * execute * vulnerable,
          critChance: ability.guaranteedCrit ? 1 : strong.critChance,
        }
      : { ...strong, damage: strong.damage * vulnerable };
    const armor = ability?.ignoreArmor ? 0 : Math.round(boss.armor * (1 - (bossEffects.armorBreak ?? 0)));
    let dealt = 0;
    const strike = () => {
      const hit = rollHit(attacker, { ...boss, armor }, rng);
      dealt += Math.min(boss.hp, hit.damage);
      boss.hp = Math.max(0, boss.hp - hit.damage);
      hero.threat += hit.damage * threatFactor;
      events.push({ type: "hit", attacker: hero.id, target: BOSS, ...hit, ...(ability && { weapon: ability.weapon, ability: ability.id }) });
      // Plünderer: kritische Treffer lassen bluten
      if (hit.crit && hero.heroClass === "plunderer" && boss.hp > 0) {
        const damage = Math.max(1, Math.round(strong.damage * PLUNDERER_BLEED.percent));
        if ((bossEffects.bleed?.damage ?? 0) <= damage) {
          bossEffects = { ...bossEffects, bleed: { damage, roundsLeft: PLUNDERER_BLEED.rounds, sourceId: hero.id } };
        }
      }
    };
    for (let i = 0; i < (ability?.hits ?? 1) && boss.hp > 0; i++) strike();
    // Duellant: Chance auf einen zweiten Schlag bei normalen Angriffen
    if (!ability && hero.heroClass === "duelist" && boss.hp > 0 && rng() < DUELIST_EXTRA_HIT) strike();
    // Blutrausch: Lebensraub
    if (ability?.lifesteal && dealt > 0) {
      const heal = Math.min(hero.combatant.maxHp - hero.combatant.hp, Math.round(dealt * ability.lifesteal));
      hero.combatant.hp += heal;
      if (heal > 0) events.push({ type: "selfHeal", heroId: hero.id, heal });
    }
  }

  // Bollwerk: erst jetzt, wenn alle Helden gehandelt haben – der Schildträger bekommt so viel
  // Bedrohung, dass er BULWARK_SHARE der Gruppe hält (bei 75 % das Dreifache aller anderen zusammen)
  for (const taunter of taunts) {
    const others = heroes.filter((h) => h !== taunter && !h.down).reduce((sum, h) => sum + h.threat, 0);
    taunter.threat = Math.max(taunter.threat, 20, Math.round((others * BULWARK_SHARE) / (1 - BULWARK_SHARE)));
  }

  // 2. Gift, Feuer, Bluten – erst am Boss, dann an den Helden
  for (const kind of OVER_TIME) {
    const effect = bossEffects[kind];
    if (!effect || boss.hp <= 0) continue;
    const damage = Math.round(effect.damage * (1 + (bossEffects.vulnerable?.percent ?? 0)));
    boss.hp = Math.max(0, boss.hp - damage);
    const source = heroes.find((h) => h.id === effect.sourceId && !h.down);
    if (source) source.threat += damage * (source.heroClass === "paladin" ? PALADIN_THREAT : 1);
    events.push({ type: kind, target: BOSS, damage });
    bossEffects = { ...bossEffects, [kind]: effect.roundsLeft > 1 ? { ...effect, roundsLeft: effect.roundsLeft - 1 } : undefined };
  }
  if (boss.hp > 0) {
    for (const hero of heroes) {
      for (const kind of OVER_TIME) {
        const effect = hero.effects[kind];
        if (!effect || hero.down) continue;
        hero.combatant.hp = Math.max(0, hero.combatant.hp - effect.damage);
        events.push({ type: kind, target: hero.id, damage: effect.damage });
        hero.effects[kind] = effect.roundsLeft > 1 ? { ...effect, roundsLeft: effect.roundsLeft - 1 } : undefined;
        knockDown(hero);
      }
    }
  }

  // 3. Bossphase
  let status: CoopStatus = "active";
  if (boss.hp <= 0) {
    status = "won";
    events.push({ type: "victory" });
  } else if (heroes.every((h) => h.down)) {
    status = "lost";
    events.push({ type: "wipe" });
  } else {
    let stunned = false;
    if (stunAttempt) {
      stunned = stunsUsed === 0 || rng() < REPEAT_STUN_CHANCE;
      stunsUsed++;
      events.push({ type: stunned ? "stunned" : "stunResisted" });
    }
    if (!stunned) {
      const def = getCoopBoss(state.bossId);
      const special = state.round % def.ability.every === 0 ? def.ability : null;
      if (special) events.push({ type: "bossAbility", bossId: def.id, name: special.name });
      // Geschwächt (Erdbeben, Fluch): weniger Schaden
      const attacker = { ...boss, damage: boss.damage * (special?.multiplier ?? 1) * (1 - (bossEffects.weaken?.percent ?? 0)) };
      const targets = special?.aoe ? heroes.filter((h) => !h.down) : [pickBossTarget(heroes, rng)!];
      for (const target of targets) {
        if (target.effects.bulwark) {
          // Bollwerk blockt den Angriff samt Zusatzeffekten
          target.effects.bulwark = undefined;
          events.push({ type: "blocked", heroId: target.id });
          continue;
        }
        const defender = special?.ignoreArmor ? { ...buffed(target), armor: 0 } : buffed(target);
        const rolled = rollHit(attacker, defender, rng);
        // Parade/Vergeltung: nur ein Teil kommt durch, dann Konter bzw. Rückwurf
        const guard = target.effects.guard;
        const hit = guard ? { ...rolled, damage: Math.max(1, Math.round(rolled.damage * guard.reduce)) } : rolled;
        target.combatant.hp = Math.max(0, target.combatant.hp - hit.damage);
        events.push({ type: "hit", attacker: BOSS, target: target.id, ...hit });
        if (guard) {
          target.effects.guard = undefined;
          events.push({ type: "guarded", heroId: target.id, prevented: rolled.damage - hit.damage });
          let counter = guard.reflect ? Math.round(rolled.damage * guard.reflect) : 0;
          if (guard.counter && target.combatant.hp > 0) {
            const own = buffed(target);
            const armor = Math.round(boss.armor * (1 - (bossEffects.armorBreak ?? 0)));
            counter += rollHit({ ...own, damage: own.damage * guard.counter }, { ...boss, armor }, rng).damage;
          }
          if (counter > 0 && boss.hp > 0) {
            boss.hp = Math.max(0, boss.hp - counter);
            target.threat += counter * (target.heroClass === "paladin" ? PALADIN_THREAT : 1);
            events.push({ type: "counter", heroId: target.id, damage: counter });
          }
        }
        if (special?.poison && target.combatant.hp > 0) {
          const damage = Math.max(1, Math.round(boss.damage * special.poison.percent));
          target.effects.poison = { damage, roundsLeft: special.poison.rounds };
        }
        if (special?.manaBurn && target.combatant.hp > 0) {
          const amount = Math.min(target.mana, special.manaBurn);
          target.mana -= amount;
          if (amount > 0) events.push({ type: "manaBurn", heroId: target.id, amount });
        }
        if (!special && def.lifesteal) {
          // Lebensraub: normale Bisse heilen den Boss
          const heal = Math.min(boss.maxHp - boss.hp, Math.round(hit.damage * def.lifesteal));
          boss.hp += heal;
          if (heal > 0) events.push({ type: "drain", heal });
        }
        knockDown(target);
      }
      if (special?.freeze) {
        const frozen = pickBossTarget(heroes, rng);
        if (frozen) {
          frozen.effects.frozen = true;
          events.push({ type: "frozen", heroId: frozen.id });
        }
      }
      if (boss.hp <= 0) {
        // Konter oder Rückwurf hat den Boss erledigt
        status = "won";
        events.push({ type: "victory" });
      } else if (heroes.every((h) => h.down)) {
        status = "lost";
        events.push({ type: "wipe" });
      }
    }
  }

  // Kleriker: Regeneration am Ende der Runde
  if (status === "active") {
    for (const hero of heroes) {
      if (hero.down || hero.heroClass !== "cleric") continue;
      const heal = Math.min(hero.combatant.maxHp - hero.combatant.hp, Math.round(hero.combatant.maxHp * CLERIC_REGEN));
      if (heal > 0) {
        hero.combatant.hp += heal;
        events.push({ type: "regen", heroId: hero.id, heal });
      }
    }
  }

  // 4. Mana, Verstärkungen und abklingende Bedrohung
  const tick = (b: ActiveBuff | undefined) => (b && b.roundsLeft > 1 ? { ...b, roundsLeft: b.roundsLeft - 1 } : undefined);
  bossEffects = { ...bossEffects, weaken: tick(bossEffects.weaken), vulnerable: tick(bossEffects.vulnerable) };
  heroes = heroes.map((h) => ({
    ...h,
    effects: { ...h.effects, empower: tick(h.effects.empower) },
    cooldowns: tickCooldowns(h.cooldowns, used.get(h.id) ?? null),
    threat: Math.round(h.threat * (1 - THREAT_DECAY)),
    mana: h.down ? h.mana : Math.min(h.maxMana, h.mana + MANA_REGEN),
    buffs: Object.fromEntries(
      Object.entries(h.buffs)
        .filter(([, b]) => b && b.roundsLeft > 1)
        .map(([k, b]) => [k, { ...b!, roundsLeft: b!.roundsLeft - 1 }]),
    ),
  }));

  return {
    state: {
      ...state,
      heroes,
      boss,
      bossEffects,
      stunsUsed,
      status,
      round: status === "active" ? state.round + 1 : state.round,
      deadline: now + COOP_TURN_SECONDS * 1000,
      log: [...state.log, ...events.map((e) => ({ ...e, round: state.round }))],
    },
    events,
  };
}

/** Koop-Erfolge eines Helden – im Spielstand und im öffentlichen Profil. */
export interface CoopStats {
  wins: number;
  /** Ids der Koop-Bosse, die der Held mindestens einmal besiegt hat */
  bosses: string[];
}

export const EMPTY_COOP_STATS: CoopStats = { wins: 0, bosses: [] };

export function recordCoopWin(stats: CoopStats, bossId: string): CoopStats {
  return { wins: stats.wins + 1, bosses: stats.bosses.includes(bossId) ? stats.bosses : [...stats.bosses, bossId] };
}

/** Wird der Boss in dieser Runde seine Fähigkeit einsetzen? (für die Ankündigung) */
export function coopAbilityDue(state: CoopBattleState): boolean {
  return state.round % getCoopBoss(state.bossId).ability.every === 0;
}

/**
 * Beute eines Spielers nach einem Koop-Sieg – jeder würfelt selbst. Wie ein
 * Solo-Boss gleichen Levels (garantiertes Item, Tränke), XP und Gold × 1,5.
 */
export function rollCoopReward(bossId: string, hero: HeroCombatProfile, uid: string, rng: () => number = Math.random): BattleReward {
  const reward = rollBattleReward(coopBossCreature(getCoopBoss(bossId)), hero, uid, rng);
  return {
    ...reward,
    xp: Math.round(reward.xp * COOP_REWARD_FACTOR),
    gold: Math.round(reward.gold * COOP_REWARD_FACTOR),
  };
}
