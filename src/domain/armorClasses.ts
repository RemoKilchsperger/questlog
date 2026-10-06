// Rüstungsklassen: Jedes Rüstungsteil ist leicht (Stoff), mittel (Leder) oder
// schwer (Metall). Leichtere Rüstung schützt weniger, gibt dafür einen kleinen
// Ausgleich pro Teil. Grundlage für spätere Klassenboni (Rüstungsklasse +
// Waffentyp, z. B. leichte Rüstung + Stab → Magier).

import type { ArmorClass, ArmorSlot } from "./types";

export interface ArmorClassInfo {
  key: ArmorClass;
  label: string;
  icon: string;
  /** Anteil des Rüstungswerts im Vergleich zu schwerer Rüstung */
  armorFactor: number;
  /** Ausgleich pro angelegtem Teil */
  manaPerPiece: number;
  critPerPiece: number;
  /** 20 Materialstufen für den Namensanfang (eine pro 3 Level) */
  prefixes: readonly string[];
  /** Namensformen pro Rüstungsplatz – bestimmen auch die Form der Grafik */
  nouns: Readonly<Record<ArmorSlot, readonly string[]>>;
}

/** Metall-Stufen – Namensanfang für Waffen und schwere Rüstung. */
export const METAL_PREFIXES: readonly string[] = [
  "Rost", "Kupfer", "Bronze", "Eisen", "Wolfs", "Stahl", "Silber", "Runen", "Schatten", "Mondsilber",
  "Sturm", "Glut", "Frost", "Mithril", "Obsidian", "Adamant", "Drachen", "Sternen", "Phönix", "Götter",
];

export const ARMOR_CLASSES: readonly ArmorClassInfo[] = [
  {
    key: "light",
    label: "Leicht",
    icon: "🧵",
    armorFactor: 0.5,
    manaPerPiece: 4,
    critPerPiece: 0.006,
    prefixes: [
      "Leinen", "Woll", "Baumwoll", "Filz", "Samt", "Seiden", "Mondseiden", "Runen", "Schatten", "Sternen",
      "Sturm", "Glut", "Frost", "Feen", "Elfen", "Nebel", "Drachen", "Himmels", "Phönix", "Götter",
    ],
    nouns: {
      head: ["kapuze", "hut"],
      chest: ["robe", "gewand"],
      arms: ["armbinden", "ärmel"],
      legs: ["hose", "beinkleider"],
      feet: ["sandalen", "pantoffeln"],
    },
  },
  {
    key: "medium",
    label: "Mittel",
    icon: "🦌",
    armorFactor: 0.75,
    manaPerPiece: 0,
    critPerPiece: 0.004,
    prefixes: [
      "Rohleder", "Wildleder", "Hirschleder", "Wolfsleder", "Bärenleder", "Echsenleder", "Schattenleder",
      "Runenleder", "Nachtleder", "Sturmleder", "Glutleder", "Frostleder", "Wyvernleder", "Greifenleder",
      "Mantikorleder", "Basiliskenleder", "Drachenleder", "Sternenleder", "Phönixleder", "Titanenleder",
    ],
    nouns: {
      head: ["kappe", "haube"],
      chest: ["wams", "weste"],
      arms: ["handschuhe", "armschienen"],
      legs: ["hose", "beinlinge"],
      feet: ["stiefel", "schnürschuhe"],
    },
  },
  {
    key: "heavy",
    label: "Schwer",
    icon: "🛡️",
    armorFactor: 1,
    manaPerPiece: 0,
    critPerPiece: 0,
    prefixes: METAL_PREFIXES,
    nouns: {
      head: ["helm", "haube"],
      chest: ["harnisch", "panzer", "brünne"],
      arms: ["armschienen", "handschuhe", "stulpen"],
      legs: ["beinschienen", "beinlinge"],
      feet: ["stiefel", "schuhe"],
    },
  },
];

export function getArmorClass(key: ArmorClass): ArmorClassInfo {
  const info = ARMOR_CLASSES.find((c) => c.key === key);
  if (!info) throw new Error(`Unbekannte Rüstungsklasse: ${key}`);
  return info;
}

/** Klasse der Boss-Rüstungen – passend zum Thema des Bosses. */
export const BOSS_ARMOR_CLASS: Readonly<Record<string, ArmorClass>> = {
  "goblin-chief": "medium",
  "ancient-lizard": "medium",
  "cave-eye": "light",
  "primal-mammoth": "heavy",
  "lich-king": "light",
  ignaroth: "heavy",
  "ore-king": "heavy",
  "high-priestess": "light",
  "storm-lord": "medium",
  "void-lord": "heavy",
  "swamp-hydra": "medium",
  "frost-giant": "heavy",
  "world-eater": "light",
};
