// Kampf-Fähigkeiten: Jeder Waffentyp (auch der Schild) bringt zwei Fähigkeiten
// mit, die Mana kosten und den normalen Angriff einer Runde ersetzen. Sie müssen
// im Skilltree freigeschaltet werden: die erste nach dem Meistern der Waffe, die
// zweite danach ab Level 25 (siehe skills.ts). Verfügbar sind die
// freigeschalteten Fähigkeiten aller angelegten Waffen.
//
// Ids: Die erste Fähigkeit heisst wie der Waffentyp ("sword"), die zweite
// bekommt "-2" angehängt ("sword-2") – so bleiben alte Spielstände gültig.
//
// Mana: zu Kampfbeginn voll, +MANA_REGEN pro Runde. Das Maximum wächst mit
// Level und Intelligenz (siehe `maxManaFor`).

import type { SkillWeapon } from "./skills";

export type AbilityId = SkillWeapon | `${SkillWeapon}-2`;

export interface AbilityDef {
  id: AbilityId;
  weapon: SkillWeapon;
  /** 1 = erste Fähigkeit der Waffe, 2 = zweite */
  tier: 1 | 2;
  name: string;
  icon: string;
  manaCost: number;
  description: string;
  /** Faktor auf den Schaden des Helden – pro Treffer */
  multiplier: number;
  /** Anzahl Treffer (Standard 1) */
  hits?: number;
  /** Trifft immer kritisch */
  guaranteedCrit?: boolean;
  /** Rüstung des Gegners wird ignoriert */
  ignoreArmor?: boolean;
  /** Gegner setzt in dieser Runde aus */
  stun?: boolean;
  /** Gift: Anteil des Heldenschadens pro Runde, ignoriert Rüstung */
  poison?: { percent: number; rounds: number };
  /** Feuer: Anteil des Heldenschadens pro Runde, ignoriert Rüstung */
  burn?: { percent: number; rounds: number };
  /** Bluten: Anteil des Heldenschadens pro Runde, ignoriert Rüstung */
  bleed?: { percent: number; rounds: number };
  /** Senkt die Rüstung des Gegners für den Rest des Kampfes */
  armorBreak?: number;
  /** Blockt den nächsten Angriff des Gegners komplett (inkl. aller Zusatzeffekte) */
  bulwark?: boolean;
  /** Finisher: Ist der Gegner unter `threshold` seiner LP, wirkt der Schaden `factor`-fach */
  execute?: { threshold: number; factor: number };
  /**
   * Abwehr gegen den nächsten gegnerischen Angriff: Schaden × `reduce`, danach
   * Konter mit `counter` × Heldenschaden und/oder Rückwurf von `reflect` × dem
   * ungeminderten Schaden.
   */
  guard?: Guard;
  /** Eigene Verstärkung ab der nächsten Runde: +percent Schaden für `rounds` Runden */
  empower?: { percent: number; rounds: number };
  /** Lebensraub: heilt um diesen Anteil des verursachten Schadens */
  lifesteal?: number;
  /** Heilt um diesen Anteil der maximalen Lebenspunkte */
  heal?: number;
  /** Schwächt den Gegner: macht `percent` weniger Schaden für `rounds` Runden */
  weaken?: { percent: number; rounds: number };
  /** Verwundbar: der Gegner erleidet `percent` mehr Schaden für `rounds` Runden */
  vulnerable?: { percent: number; rounds: number };
}

export interface Guard {
  reduce: number;
  counter?: number;
  reflect?: number;
}

export const MANA_REGEN = 6;

/** Mana-Maximum: 40 + 2 pro Level über 1 + 1 pro Intelligenz. */
export function maxManaFor(level: number, intellect: number): number {
  return 40 + (level - 1) * 2 + intellect;
}

export const ABILITIES: readonly AbilityDef[] = [
  {
    id: "dagger",
    weapon: "dagger",
    tier: 1,
    name: "Hinterhältiger Stoss",
    icon: "🗡️",
    manaCost: 20,
    multiplier: 1.2,
    guaranteedCrit: true,
    description: "Ein gezielter Stich – trifft immer kritisch.",
  },
  {
    id: "sword",
    weapon: "sword",
    tier: 1,
    name: "Schwertwirbel",
    icon: "🌀",
    manaCost: 25,
    multiplier: 0.55,
    hits: 3,
    description: "Drei schnelle Hiebe – jeder kann kritisch treffen.",
  },
  {
    id: "greatsword",
    weapon: "greatsword",
    tier: 1,
    name: "Richterstoss",
    icon: "⚖️",
    manaCost: 35,
    multiplier: 2,
    description: "Ein gewaltiger Stoss mit doppeltem Schaden.",
  },
  {
    id: "axe",
    weapon: "axe",
    tier: 1,
    name: "Axtwurf",
    icon: "🪓",
    manaCost: 25,
    multiplier: 1.4,
    ignoreArmor: true,
    description: "Die geworfene Axt durchschlägt jede Rüstung.",
  },
  {
    id: "greataxe",
    weapon: "greataxe",
    tier: 1,
    name: "Spalter",
    icon: "💥",
    manaCost: 30,
    multiplier: 1.5,
    armorBreak: 0.3,
    bleed: { percent: 0.25, rounds: 3 },
    description:
      "Spaltet die Panzerung: −30 % Rüstung des Gegners für den Rest des Kampfes, dazu blutet er 3 Runden lang.",
  },
  {
    id: "mace",
    weapon: "mace",
    tier: 1,
    name: "Betäubender Schlag",
    icon: "💫",
    manaCost: 30,
    multiplier: 0.9,
    stun: true,
    description: "Betäubt den Gegner – er kann in dieser Runde nicht zurückschlagen.",
  },
  {
    id: "greathammer",
    weapon: "greathammer",
    tier: 1,
    name: "Wuchtiger Schlag",
    icon: "🔨",
    manaCost: 40,
    multiplier: 2.4,
    description: "Ein vernichtender Hieb mit 2,4-fachem Schaden.",
  },
  {
    id: "scepter",
    weapon: "scepter",
    tier: 1,
    name: "Giftstrahl",
    icon: "☠️",
    manaCost: 25,
    multiplier: 0.6,
    ignoreArmor: true,
    poison: { percent: 0.4, rounds: 3 },
    description: "Vergiftet den Gegner: 3 Runden Giftschaden, der Rüstung ignoriert.",
  },
  {
    id: "staff",
    weapon: "staff",
    tier: 1,
    name: "Feuerball",
    icon: "🔥",
    manaCost: 40,
    multiplier: 1.7,
    ignoreArmor: true,
    burn: { percent: 0.3, rounds: 2 },
    description: "Ein Feuerball mit 1,7-fachem Schaden, der Rüstung ignoriert und den Gegner 2 Runden lang in Brand setzt.",
  },
  {
    id: "bow",
    weapon: "bow",
    tier: 1,
    name: "Pfeilhagel",
    icon: "🏹",
    manaCost: 35,
    multiplier: 0.5,
    hits: 4,
    description: "Vier Pfeile regnen auf den Gegner herab – jeder kann kritisch treffen.",
  },
  {
    id: "shield",
    weapon: "shield",
    tier: 1,
    name: "Bollwerk",
    icon: "🛡️",
    manaCost: 20,
    multiplier: 0,
    hits: 0,
    bulwark: true,
    description: "Statt anzugreifen hinter dem Schild verschanzen: Der nächste gegnerische Angriff wird komplett geblockt.",
  },
  // ───────────── Zweite Fähigkeiten (ab Level 25) ─────────────
  {
    id: "dagger-2",
    weapon: "dagger",
    tier: 2,
    name: "Meucheln",
    icon: "🩸",
    manaCost: 30,
    multiplier: 1,
    execute: { threshold: 0.3, factor: 3 },
    description: "Ein Stich ins Herz: dreifacher Schaden, wenn der Gegner unter 30 % seiner Lebenspunkte ist.",
  },
  {
    id: "sword-2",
    weapon: "sword",
    tier: 2,
    name: "Parade",
    icon: "🤺",
    manaCost: 25,
    multiplier: 0.6,
    guard: { reduce: 0.5, counter: 1 },
    description:
      "Ein leichter Hieb, dann in Abwehrhaltung: Der nächste gegnerische Angriff macht nur halben Schaden und du konterst mit vollem Schaden.",
  },
  {
    id: "greatsword-2",
    weapon: "greatsword",
    tier: 2,
    name: "Kriegsschrei",
    icon: "📯",
    manaCost: 30,
    multiplier: 1,
    empower: { percent: 0.25, rounds: 3 },
    description: "Ein Hieb mit lautem Schrei: In den nächsten 3 Runden machst du 25 % mehr Schaden.",
  },
  {
    id: "axe-2",
    weapon: "axe",
    tier: 2,
    name: "Zerfleischen",
    icon: "🐺",
    manaCost: 30,
    multiplier: 0.7,
    hits: 2,
    bleed: { percent: 0.3, rounds: 2 },
    description: "Zwei wilde Hiebe – der Gegner blutet 2 Runden lang.",
  },
  {
    id: "greataxe-2",
    weapon: "greataxe",
    tier: 2,
    name: "Blutrausch",
    icon: "🧛",
    manaCost: 35,
    multiplier: 1.6,
    lifesteal: 0.4,
    description: "Ein rasender Hieb mit 1,6-fachem Schaden – du heilst dich um 40 % des Schadens.",
  },
  {
    id: "mace-2",
    weapon: "mace",
    tier: 2,
    name: "Heiliges Licht",
    icon: "✨",
    manaCost: 35,
    multiplier: 0.5,
    heal: 0.25,
    description: "Heilt dich um 25 % deiner Lebenspunkte, dazu ein leichter Schlag.",
  },
  {
    id: "greathammer-2",
    weapon: "greathammer",
    tier: 2,
    name: "Erdbeben",
    icon: "🌋",
    manaCost: 40,
    multiplier: 1.3,
    ignoreArmor: true,
    weaken: { percent: 0.4, rounds: 2 },
    description: "Der Boden bebt: 1,3-facher Schaden, der Rüstung ignoriert – der Gegner macht 2 Runden lang 40 % weniger Schaden.",
  },
  {
    id: "scepter-2",
    weapon: "scepter",
    tier: 2,
    name: "Fluch der Schwäche",
    icon: "🕯️",
    manaCost: 30,
    multiplier: 0.6,
    ignoreArmor: true,
    weaken: { percent: 0.3, rounds: 3 },
    vulnerable: { percent: 0.2, rounds: 3 },
    description: "Verflucht den Gegner für 3 Runden: Er macht 30 % weniger Schaden und erleidet 20 % mehr.",
  },
  {
    id: "staff-2",
    weapon: "staff",
    tier: 2,
    name: "Meteor",
    icon: "☄️",
    manaCost: 60,
    multiplier: 2.6,
    ignoreArmor: true,
    burn: { percent: 0.3, rounds: 3 },
    description: "Ein Meteor mit 2,6-fachem Schaden, der Rüstung ignoriert und den Gegner 3 Runden lang in Brand setzt.",
  },
  {
    id: "bow-2",
    weapon: "bow",
    tier: 2,
    name: "Durchbohrender Schuss",
    icon: "🎯",
    manaCost: 35,
    multiplier: 1.8,
    ignoreArmor: true,
    bleed: { percent: 0.25, rounds: 2 },
    description: "Ein gezielter Schuss mit 1,8-fachem Schaden, der Rüstung durchschlägt – der Gegner blutet 2 Runden lang.",
  },
  {
    id: "shield-2",
    weapon: "shield",
    tier: 2,
    name: "Vergeltung",
    icon: "🔁",
    manaCost: 25,
    multiplier: 0,
    hits: 0,
    guard: { reduce: 0.5, reflect: 1 },
    description:
      "Statt anzugreifen: Der nächste gegnerische Angriff macht nur halben Schaden – und der volle Schaden trifft den Angreifer.",
  },
];

export function getAbility(id: AbilityId): AbilityDef {
  const ability = ABILITIES.find((a) => a.id === id);
  if (!ability) throw new Error(`Unbekannte Fähigkeit: ${id}`);
  return ability;
}

/** Fähigkeiten eines Waffentyps, erste zuerst. */
export function abilitiesOf(weapon: SkillWeapon): AbilityDef[] {
  return ABILITIES.filter((a) => a.weapon === weapon);
}

/** Ist das eine bekannte Fähigkeits-Id? (für Daten von aussen, z. B. Koop-Befehle) */
export function isAbilityId(id: unknown): id is AbilityId {
  return typeof id === "string" && ABILITIES.some((a) => a.id === id);
}
