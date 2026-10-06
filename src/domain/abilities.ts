// Kampf-Fähigkeiten: Jeder Waffentyp (auch der Schild) bringt eine Fähigkeit
// mit, die Mana kostet und den normalen Angriff einer Runde ersetzt. Sie muss
// erst im Skilltree freigeschaltet werden (nach dem Meistern der Waffe). Verfügbar
// sind die freigeschalteten Fähigkeiten aller angelegten Waffen.
//
// Mana: zu Kampfbeginn voll, +MANA_REGEN pro Runde. Das Maximum wächst mit
// Level und Intelligenz (siehe `maxManaFor`).

import type { SkillWeapon } from "./skills";

export interface AbilityDef {
  weapon: SkillWeapon;
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
}

export const MANA_REGEN = 6;

/** Mana-Maximum: 40 + 2 pro Level über 1 + 1 pro Intelligenz. */
export function maxManaFor(level: number, intellect: number): number {
  return 40 + (level - 1) * 2 + intellect;
}

export const ABILITIES: readonly AbilityDef[] = [
  {
    weapon: "dagger",
    name: "Hinterhältiger Stoss",
    icon: "🗡️",
    manaCost: 20,
    multiplier: 1.2,
    guaranteedCrit: true,
    description: "Ein gezielter Stich – trifft immer kritisch.",
  },
  {
    weapon: "sword",
    name: "Schwertwirbel",
    icon: "🌀",
    manaCost: 25,
    multiplier: 0.55,
    hits: 3,
    description: "Drei schnelle Hiebe – jeder kann kritisch treffen.",
  },
  {
    weapon: "greatsword",
    name: "Richterstoss",
    icon: "⚖️",
    manaCost: 35,
    multiplier: 2,
    description: "Ein gewaltiger Stoss mit doppeltem Schaden.",
  },
  {
    weapon: "axe",
    name: "Axtwurf",
    icon: "🪓",
    manaCost: 25,
    multiplier: 1.4,
    ignoreArmor: true,
    description: "Die geworfene Axt durchschlägt jede Rüstung.",
  },
  {
    weapon: "greataxe",
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
    weapon: "mace",
    name: "Betäubender Schlag",
    icon: "💫",
    manaCost: 30,
    multiplier: 0.9,
    stun: true,
    description: "Betäubt den Gegner – er kann in dieser Runde nicht zurückschlagen.",
  },
  {
    weapon: "greathammer",
    name: "Wuchtiger Schlag",
    icon: "🔨",
    manaCost: 40,
    multiplier: 2.4,
    description: "Ein vernichtender Hieb mit 2,4-fachem Schaden.",
  },
  {
    weapon: "scepter",
    name: "Giftstrahl",
    icon: "☠️",
    manaCost: 25,
    multiplier: 0.6,
    ignoreArmor: true,
    poison: { percent: 0.4, rounds: 3 },
    description: "Vergiftet den Gegner: 3 Runden Giftschaden, der Rüstung ignoriert.",
  },
  {
    weapon: "staff",
    name: "Feuerball",
    icon: "🔥",
    manaCost: 40,
    multiplier: 1.7,
    ignoreArmor: true,
    burn: { percent: 0.3, rounds: 2 },
    description: "Ein Feuerball mit 1,7-fachem Schaden, der Rüstung ignoriert und den Gegner 2 Runden lang in Brand setzt.",
  },
  {
    weapon: "bow",
    name: "Pfeilhagel",
    icon: "🏹",
    manaCost: 35,
    multiplier: 0.5,
    hits: 4,
    description: "Vier Pfeile regnen auf den Gegner herab – jeder kann kritisch treffen.",
  },
  {
    weapon: "shield",
    name: "Bollwerk",
    icon: "🛡️",
    manaCost: 20,
    multiplier: 0,
    hits: 0,
    bulwark: true,
    description: "Statt anzugreifen hinter dem Schild verschanzen: Der nächste gegnerische Angriff wird komplett geblockt.",
  },
];

export function getAbility(weapon: SkillWeapon): AbilityDef {
  const ability = ABILITIES.find((a) => a.weapon === weapon);
  if (!ability) throw new Error(`Keine Fähigkeit für ${weapon}`);
  return ability;
}
