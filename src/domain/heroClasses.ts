// Klassen: Wer mindestens 3 der 5 Rüstungsteile einer Rüstungsklasse trägt und
// die passende Waffe führt, bekommt eine Klasse (z. B. leichte Rüstung
// + Stab → Magier). Es ist immer höchstens eine Klasse aktiv; passen mehrere,
// gilt die zuerst gelistete.
//
// Seit dem Klassen-Kern (Modell C, docs/klassen-neukonzept.md) hat jede Klasse eine Rolle, ein Passiv,
// eine Klassenleiste und eine Signaturfähigkeit (classKit.ts). Die Passive wirken an drei Stellen:
// - Kampfwerte (getHeroCombatProfile): Schaden, LP, Rüstung, Krit, Gold
// - Fähigkeiten (`classAbility`): Manakosten, Treffer, Zusatzeffekte
// - Kampfmechanik (combatCore.ts, combat.ts, coopCombat.ts): Zweitschlag, Blutung bei Krit,
//   Lebensraub, Regeneration, Blutzorn, Verderbnis, Bedrohung im Koop

import { getAbility, type AbilityDef, type AbilityId } from "./abilities";
import { CLASS_KITS } from "./classKit";
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
  /** Passiv, lesbar (aus classKit.ts) */
  bonus: string;
  /** Passen die angelegten Waffen? (Liste der Waffentypen beider Hände) */
  matches: (weapons: WeaponType[]) => boolean;
}

/** Mindestanzahl Rüstungsteile derselben Klasse. */
export const CLASS_ARMOR_PIECES = 3;

const has = (type: WeaponType) => (weapons: WeaponType[]) => weapons.includes(type);

/** Alle Klassen – die Reihenfolge entscheidet, wenn mehrere passen. */
export const HERO_CLASSES: readonly HeroClassDef[] = [
  { id: "mage", name: "Magier", icon: "🔮", armorClass: "light", weapons: "Stab", bonus: CLASS_KITS.mage.passive.text, matches: has("staff") },
  { id: "warlock", name: "Hexer", icon: "☠️", armorClass: "light", weapons: "Zepter", bonus: CLASS_KITS.warlock.passive.text, matches: has("scepter") },
  { id: "assassin", name: "Assassine", icon: "🗡️", armorClass: "light", weapons: "Dolch", bonus: CLASS_KITS.assassin.passive.text, matches: has("dagger") },
  { id: "ranger", name: "Waldläufer", icon: "🏹", armorClass: "medium", weapons: "Bogen", bonus: CLASS_KITS.ranger.passive.text, matches: has("bow") },
  {
    id: "duelist",
    name: "Duellant",
    icon: "⚔️",
    armorClass: "medium",
    weapons: "zwei Schwerter",
    bonus: CLASS_KITS.duelist.passive.text,
    matches: (w) => w.filter((t) => t === "sword").length === 2,
  },
  { id: "plunderer", name: "Plünderer", icon: "🪓", armorClass: "medium", weapons: "Axt", bonus: CLASS_KITS.plunderer.passive.text, matches: has("axe") },
  { id: "cleric", name: "Kleriker", icon: "✨", armorClass: "medium", weapons: "Streitkolben", bonus: CLASS_KITS.cleric.passive.text, matches: has("mace") },
  // Paladin auch mit Schwert und Schild (docs/klassen-neukonzept.md 4.3): kein Konflikt mit dem Duellanten,
  // der zwei Schwerter und mittlere Rüstung braucht. Ohne Schild bleibt schwer + Schwert klassenlos.
  {
    id: "paladin",
    name: "Paladin",
    icon: "🛡️",
    armorClass: "heavy",
    weapons: "Streitkolben oder Schwert und Schild",
    bonus: CLASS_KITS.paladin.passive.text,
    matches: (w) => w.includes("shield") && (w.includes("mace") || w.includes("sword")),
  },
  { id: "berserker", name: "Berserker", icon: "💢", armorClass: "heavy", weapons: "Grossaxt", bonus: CLASS_KITS.berserker.passive.text, matches: has("greataxe") },
  { id: "champion", name: "Champion", icon: "👑", armorClass: "heavy", weapons: "Zweihandschwert", bonus: CLASS_KITS.champion.passive.text, matches: has("greatsword") },
  { id: "warden", name: "Wächter", icon: "🏔️", armorClass: "heavy", weapons: "Grosshammer", bonus: CLASS_KITS.warden.passive.text, matches: has("greathammer") },
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

/** Assassine „Meuchler“: Krit-Chance und Krit-Faktor (Modell C: +10 % statt +20 %, 2,0 statt 2,25). */
export const ASSASSIN_CRIT = 0.1;
export const ASSASSIN_CRIT_MULTIPLIER = 2;

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
  if (id === "assassin") return { ...bonus, crit: ASSASSIN_CRIT, critMultiplier: ASSASSIN_CRIT_MULTIPLIER };
  if (id === "ranger") return { ...bonus, damage: 0.08 };
  if (id === "duelist") return { ...bonus, damage: 0.1 };
  if (id === "plunderer") return { ...bonus, damage: 0.15, gold: 0.25 };
  if (id === "paladin") return { ...bonus, armor: 0.2, damage: 0.1 };
  if (id === "berserker") return { ...bonus, damage: 0.1 };
  if (id === "champion") return { ...bonus, damage: 0.08, hp: 0.1 };
  if (id === "warden") return { ...bonus, armor: 0.1 };
  if (id === "warlock") return { ...bonus, damage: 0.05 };
  return bonus;
}

/**
 * Fähigkeit so, wie die Klasse sie verändert: Magier (günstiger), Waldläufer (Pfeilhagel mit 5 Pfeilen),
 * Kleriker (Heilung für die Gruppe im Koop), Paladin (halbes Bollwerk, Schildstoss), Wächter (längere
 * Schwächung). Den Hexer verstärkt jedes eigene Gift, Feuer und Bluten beim Legen (`layDot` mit `warlock`),
 * nicht nur das seiner Fähigkeiten.
 */
export function classAbility(id: AbilityId, heroClass: HeroClassId | null | undefined): AbilityDef {
  const base = getAbility(id);
  switch (heroClass) {
    case "mage":
      return { ...base, manaCost: Math.round(base.manaCost * MAGE_MANA_FACTOR) };
    case "ranger":
      return id === "bow" ? { ...base, hits: 5 } : base;
    case "cleric":
      // Solo wirkt `groupHeal` nicht – dort heilt er wie bisher nur sich
      return CLERIC_GROUP_HEALS.includes(id) ? { ...base, groupHeal: CLERIC_GROUP_HEAL } : base;
    case "paladin":
      if (id === "shield") return { ...base, manaCost: Math.round(base.manaCost / 2), ...SHIELD_BASH };
      return id === "shield-2" ? { ...base, ...SHIELD_BASH } : base;
    case "warden":
      return base.weaken ? { ...base, weaken: { ...base.weaken, rounds: base.weaken.rounds + 1 } } : base;
    default:
      return base;
  }
}

/* ───────────── Kampfmechanik ───────────── */

/** Magier „Arkane Effizienz“: Faktor auf die Manakosten (vorher dazu +5 % Schaden). */
export const MAGE_MANA_FACTOR = 0.8;
/** Hexer „Verderbnis“: eigenes Gift, Feuer und Bluten stärker und länger (vorher ×1,5 nur auf Fähigkeiten-DoTs) … */
export const WARLOCK_DOT = { factor: 1.4, rounds: 1 };
/** … „Wandelbare Flüche“: Gift gegen Gift-Immune wird Feuer mit diesem Anteil (und umgekehrt). */
export const WARLOCK_SWAP = 0.6;
/** Duellant „Fechtkunst“: Chance auf einen zweiten Schlag bei normalen Angriffen. */
export const DUELIST_EXTRA_HIT = 0.4;
/** Plünderer: Blutung bei kritischen Treffern – Anteil des Heldenschadens pro Runde. */
export const PLUNDERER_BLEED = { percent: 0.25, rounds: 2 };
/** Plünderer: heilt sich um diesen Anteil des verursachten Schadens. */
export const PLUNDERER_LIFESTEAL = 0.08;
/** Kleriker: Heilung pro Runde (Anteil der max. LP) und stärkere Heiltränke. */
export const CLERIC_REGEN = 0.02;
export const CLERIC_POTION_FACTOR = 1.15;
/**
 * Kleriker im Koop: Heiliges Licht und Läuterung heilen alle lebenden Mitspieler mit diesem Anteil mit
 * (Review Nr. 5) – so gibt es neben der Arkanen Heilung des Stabs einen Heiler. Das Reinigen bleibt beim Kleriker.
 */
export const CLERIC_GROUP_HEAL = 0.5;
const CLERIC_GROUP_HEALS: readonly AbilityId[] = ["mace-2", "mace-3"];
/** Berserker „Blutzorn“: +10 % Schaden immer (classStatBonus), unter dieser LP-Schwelle weitere … */
export const BERSERKER_THRESHOLD = 0.5;
export const BERSERKER_RAGE = 0.2;
/** … und Lebensraub. */
export const BERSERKER_LIFESTEAL = 0.08;
/** Paladin: Bollwerk und Vergeltung schlagen zusätzlich einmal mit halbem Schaden zu (Schildstoss). */
export const PALADIN_SHIELD_BASH = 0.5;
const SHIELD_BASH = { multiplier: PALADIN_SHIELD_BASH, hits: 1 };
/** Paladin: Faktor auf die Bedrohung im Koop. */
export const PALADIN_THREAT = 2;
/** Assassine im Koop „Schatten“: Bedrohung aus ihren kritischen Treffern zählt nur so viel. */
export const ASSASSIN_CRIT_THREAT = 0.5;

/**
 * Paladin „Geweihte Klinge“ mit Schwert: Lebensraub. Der Schwert-Pool hat keine Heilung (Heiliges Licht, Läuterung
 * gibt es nur am Streitkolben) – ohne diesen Ausgleich lag der Schwert-Paladin in der Simulation über 30 Punkte
 * unter dem Streitkolben-Paladin (Ziel: höchstens 5).
 */
export const PALADIN_BLADE_LIFESTEAL = 0.2;

/** Lebensraub eines Angriffs: von der Fähigkeit (Blutrausch, Signatur), von Plünderer, Berserker und Schwert-Paladin. */
export function lifestealShare(heroClass: HeroClassId | null | undefined, ability: AbilityDef | null, weapon?: WeaponType | null): number {
  const own =
    heroClass === "plunderer"
      ? PLUNDERER_LIFESTEAL
      : heroClass === "berserker"
        ? BERSERKER_LIFESTEAL
        : heroClass === "paladin" && weapon === "sword"
          ? PALADIN_BLADE_LIFESTEAL
          : 0;
  return (ability?.lifesteal ?? 0) + own;
}

/** Schadensfaktor in dieser Runde – Berserker wird bei wenig LP stärker (zusätzlich zu +10 % immer). */
export function rageFactor(heroClass: HeroClassId | null | undefined, hp: number, maxHp: number): number {
  return heroClass === "berserker" && hp < maxHp * BERSERKER_THRESHOLD ? 1 + BERSERKER_RAGE : 1;
}
