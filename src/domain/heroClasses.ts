// Klassen: Wer mindestens 3 der 5 Rüstungsteile einer Rüstungsklasse trägt und
// die passende Waffe führt, bekommt einen Klassenbonus (z. B. leichte Rüstung
// + Stab → Magier). Es ist immer höchstens eine Klasse aktiv; passen mehrere,
// gilt die zuerst gelistete.
//
// Die Boni wirken an drei Stellen:
// - Kampfwerte (getHeroCombatProfile): Schaden, LP, Rüstung, Krit, Gold
// - Fähigkeiten (`classAbility`): Manakosten, Schaden, Treffer, Zusatzeffekte
// - Kampfmechanik (combat.ts, coopCombat.ts): Doppelschlag, Blutung bei Krit,
//   Regeneration, Raserei, Bedrohung im Koop

import { getAbility, type AbilityDef, type AbilityId } from "./abilities";
import { getArmorClassSummary } from "./equipment";
import { getItem } from "./items";
import type { ArmorClass, Equipment, WeaponType } from "./types";

export type HeroClassId =
  | "mage"
  | "warlock"
  | "assassin"
  | "ranger"
  | "duelist"
  | "plunderer"
  | "cleric"
  | "paladin"
  | "berserker"
  | "champion"
  | "warden";

export interface HeroClassDef {
  id: HeroClassId;
  name: string;
  icon: string;
  armorClass: ArmorClass;
  /** Waffen-Voraussetzung, lesbar */
  weapons: string;
  /** Bonus, lesbar */
  bonus: string;
  /** Passen die angelegten Waffen? (Liste der Waffentypen beider Hände) */
  matches: (weapons: WeaponType[]) => boolean;
}

/** Mindestanzahl Rüstungsteile derselben Klasse. */
export const CLASS_ARMOR_PIECES = 3;

const has = (type: WeaponType) => (weapons: WeaponType[]) => weapons.includes(type);

/** Alle Klassen – die Reihenfolge entscheidet, wenn mehrere passen. */
export const HERO_CLASSES: readonly HeroClassDef[] = [
  { id: "mage", name: "Magier", icon: "🔮", armorClass: "light", weapons: "Stab", bonus: "Fähigkeiten kosten 20 % weniger Mana und machen 5 % mehr Schaden", matches: has("staff") },
  { id: "warlock", name: "Hexer", icon: "☠️", armorClass: "light", weapons: "Zepter", bonus: "+5 % Schaden; Gift, Feuer und Bluten machen 50 % mehr Schaden und halten 1 Runde länger", matches: has("scepter") },
  { id: "assassin", name: "Assassine", icon: "🗡️", armorClass: "light", weapons: "Dolch", bonus: "+20 % Krit-Chance, kritische Treffer machen 2,25-fachen statt 1,5-fachen Schaden", matches: has("dagger") },
  { id: "ranger", name: "Waldläufer", icon: "🏹", armorClass: "medium", weapons: "Bogen", bonus: "+5 % Schaden, Pfeilhagel schiesst 5 statt 4 Pfeile", matches: has("bow") },
  { id: "duelist", name: "Duellant", icon: "⚔️", armorClass: "medium", weapons: "zwei Schwerter", bonus: "+10 % Schaden, 35 % Chance auf einen zweiten Schlag bei jedem normalen Angriff", matches: (w) => w.filter((t) => t === "sword").length === 2 },
  { id: "plunderer", name: "Plünderer", icon: "🪓", armorClass: "medium", weapons: "Axt", bonus: "+20 % Schaden, kritische Treffer lassen den Gegner 2 Runden bluten, +25 % Gold", matches: has("axe") },
  { id: "cleric", name: "Kleriker", icon: "✨", armorClass: "medium", weapons: "Streitkolben", bonus: "Heilt sich jede Runde um 3 % der Lebenspunkte, Heiltränke wirken 30 % stärker", matches: has("mace") },
  { id: "paladin", name: "Paladin", icon: "🛡️", armorClass: "heavy", weapons: "Streitkolben und Schild", bonus: "+40 % Schaden, +20 % Rüstung, Bollwerk kostet die Hälfte, im Koop doppelte Bedrohung", matches: (w) => w.includes("mace") && w.includes("shield") },
  { id: "berserker", name: "Berserker", icon: "💢", armorClass: "heavy", weapons: "Grossaxt", bonus: "Unter 50 % Lebenspunkten +30 % Schaden", matches: has("greataxe") },
  { id: "champion", name: "Champion", icon: "👑", armorClass: "heavy", weapons: "Zweihandschwert", bonus: "+15 % Schaden und +10 % Lebenspunkte", matches: has("greatsword") },
  { id: "warden", name: "Wächter", icon: "🏔️", armorClass: "heavy", weapons: "Grosshammer", bonus: "+15 % Lebenspunkte und +10 % Rüstung", matches: has("greathammer") },
];

export function getHeroClass(id: HeroClassId): HeroClassDef {
  const def = HERO_CLASSES.find((c) => c.id === id);
  if (!def) throw new Error(`Unbekannte Klasse: ${id}`);
  return def;
}

/** Aktive Klasse der Ausrüstung – oder null. */
export function detectHeroClass(equipment: Equipment): HeroClassId | null {
  const { pieces } = getArmorClassSummary(equipment);
  const weapons = [equipment.weapon1, equipment.weapon2].filter((o) => o !== null).map((o) => getItem(o.itemId).type as WeaponType);
  const match = HERO_CLASSES.find((c) => pieces[c.armorClass] >= CLASS_ARMOR_PIECES && c.matches(weapons));
  return match?.id ?? null;
}

/* ───────────── Werte ───────────── */

/** Boni auf die Kampfwerte – wird in getHeroCombatProfile verrechnet. */
export interface ClassStatBonus {
  damage: number;
  hp: number;
  armor: number;
  crit: number;
  critMultiplier: number;
  gold: number;
}

export function classStatBonus(id: HeroClassId | null): ClassStatBonus {
  const bonus: ClassStatBonus = { damage: 0, hp: 0, armor: 0, crit: 0, critMultiplier: 1.5, gold: 0 };
  if (id === "assassin") return { ...bonus, crit: 0.2, critMultiplier: 2.25 };
  if (id === "ranger") return { ...bonus, damage: 0.05 };
  if (id === "duelist") return { ...bonus, damage: 0.1 };
  if (id === "warlock") return { ...bonus, damage: 0.05 };
  if (id === "plunderer") return { ...bonus, damage: 0.2, gold: 0.25 };
  if (id === "paladin") return { ...bonus, armor: 0.2, damage: 0.4 };
  if (id === "champion") return { ...bonus, damage: 0.15, hp: 0.1 };
  if (id === "warden") return { ...bonus, hp: 0.15, armor: 0.1 };
  return bonus;
}

/**
 * Fähigkeit so, wie die Klasse sie verändert: Magier (alle Fähigkeiten
 * günstiger und stärker), Hexer (stärkere, längere Zustände), Waldläufer
 * (Pfeilhagel mit 5 Pfeilen), Paladin (halbes Bollwerk).
 */
export function classAbility(id: AbilityId, heroClass: HeroClassId | null | undefined): AbilityDef {
  const base = getAbility(id);
  switch (heroClass) {
    case "mage":
      return { ...base, manaCost: Math.round(base.manaCost * 0.8), multiplier: base.multiplier * 1.05 };
    case "warlock": {
      const boost = (effect?: { percent: number; rounds: number }) =>
        effect && { percent: effect.percent * 1.5, rounds: effect.rounds + 1 };
      return { ...base, poison: boost(base.poison), burn: boost(base.burn), bleed: boost(base.bleed) };
    }
    case "ranger":
      return id === "bow" ? { ...base, hits: 5 } : base;
    case "paladin":
      return id === "shield" ? { ...base, manaCost: Math.round(base.manaCost / 2) } : base;
    default:
      return base;
  }
}

/* ───────────── Kampfmechanik ───────────── */

/** Duellant: Chance auf einen zweiten Schlag bei normalen Angriffen. */
export const DUELIST_EXTRA_HIT = 0.35;
/** Plünderer: Blutung bei kritischen Treffern – Anteil des Heldenschadens pro Runde. */
export const PLUNDERER_BLEED = { percent: 0.25, rounds: 2 };
/** Kleriker: Heilung pro Runde (Anteil der max. LP) und stärkere Heiltränke. */
export const CLERIC_REGEN = 0.03;
export const CLERIC_POTION_FACTOR = 1.3;
/** Berserker: Schadensbonus unter dieser LP-Schwelle. */
export const BERSERKER_THRESHOLD = 0.5;
export const BERSERKER_RAGE = 0.3;
/** Paladin: Faktor auf die Bedrohung im Koop. */
export const PALADIN_THREAT = 2;

/** Schadensfaktor in dieser Runde – Berserker wird bei wenig LP stärker. */
export function rageFactor(heroClass: HeroClassId | null | undefined, hp: number, maxHp: number): number {
  return heroClass === "berserker" && hp < maxHp * BERSERKER_THRESHOLD ? 1 + BERSERKER_RAGE : 1;
}
