// Buff-Food aus der Taverne (village.ts): Man isst genau ein Gericht, es wirkt
// für den nächsten Einsatz – einen Kampf im Gebiet, einen ganzen Dungeon, einen
// Turm-Lauf oder einen Koop-Kampf (Raid-Boss oder Koop-Dungeon). Danach ist man
// wieder hungrig. Die Wirkung steckt in den Kampfwerten (`withMeal`), deshalb gilt
// sie überall, wo der Held kämpft – auch im Koop, wo der Server den Spielstand liest.

import type { HeroCombatProfile } from "./combat";

/** Wirkung eines Gerichts – alles relativ, damit es auf jedem Level gleich viel bringt. */
export interface FoodEffect {
  /** mehr maximale Lebenspunkte (0.1 = +10 %) */
  hp?: number;
  /** mehr Schaden */
  damage?: number;
  /** mehr Rüstung */
  armor?: number;
  /** kritische Trefferchance, zusätzlich in Prozentpunkten (0.05 = +5 %) */
  crit?: number;
  /** mehr maximales Mana */
  mana?: number;
  /** mehr Gold pro Sieg, zusätzlich zum Charisma-Bonus */
  gold?: number;
}

export interface FoodDef {
  id: string;
  name: string;
  icon: string;
  effect: FoodEffect;
  /** Grundpreis auf Level 1 – steigt mit dem Level (`foodPrice`) */
  price: number;
  /** Ab dieser Stufe der Taverne zu kaufen */
  tavern: number;
  /** Rezept eines Besuchers (visitors.ts): erst zu kaufen, wenn man es bekommen hat */
  recipe?: boolean;
  /** Schatz-Rezept: nur aus einem Schatzraum (treasureMaps.ts), nie vom fahrenden Koch */
  treasure?: boolean;
}

export const FOODS: readonly FoodDef[] = [
  // Schankstube: einfache Gerichte mit einer Wirkung
  { id: "stew", name: "Eintopf", icon: "🍲", effect: { hp: 0.1 }, price: 10, tavern: 1 },
  { id: "sausage", name: "Bratwurst", icon: "🌭", effect: { damage: 0.08 }, price: 10, tavern: 1 },
  { id: "cheeseBread", name: "Käsebrot", icon: "🧀", effect: { armor: 0.15 }, price: 10, tavern: 1 },
  // Gasthaus: kräftigere Gerichte
  { id: "roast", name: "Wildbraten", icon: "🍖", effect: { damage: 0.15 }, price: 20, tavern: 2 },
  { id: "soup", name: "Bergkäsesuppe", icon: "🥣", effect: { hp: 0.2 }, price: 20, tavern: 2 },
  { id: "trout", name: "Gebratene Forelle", icon: "🐟", effect: { crit: 0.05 }, price: 20, tavern: 2 },
  { id: "mushrooms", name: "Pilzpfanne", icon: "🍄", effect: { mana: 0.25 }, price: 20, tavern: 2 },
  // Festhalle: Festmahle mit mehreren Wirkungen
  { id: "knightFeast", name: "Rittermahl", icon: "🍗", effect: { damage: 0.12, armor: 0.2 }, price: 40, tavern: 3 },
  { id: "festRoast", name: "Festbraten", icon: "🥘", effect: { hp: 0.2, damage: 0.1 }, price: 40, tavern: 3 },
  { id: "wizardPie", name: "Zauberpastete", icon: "🥧", effect: { mana: 0.25, crit: 0.05, damage: 0.08 }, price: 40, tavern: 3 },
  { id: "luckyCake", name: "Glückskuchen", icon: "🎂", effect: { gold: 0.3, hp: 0.1 }, price: 40, tavern: 3 },
  // Rezepte von Besuchern: ab der Schankstube, sobald man das Rezept hat – die
  // Gerichte von Yrla und dem fahrenden Koch sind etwas stärker als die Festmahle
  { id: "lilyStew", name: "Moorlilien-Eintopf", icon: "🌱", effect: { hp: 0.15, mana: 0.3, armor: 0.1 }, price: 30, tavern: 1, recipe: true },
  { id: "hunterRoast", name: "Jägerbraten", icon: "🦌", effect: { damage: 0.2, hp: 0.2 }, price: 50, tavern: 1, recipe: true },
  { id: "kingsBroth", name: "Königsbrühe", icon: "🍽️", effect: { hp: 0.25, armor: 0.25 }, price: 50, tavern: 1, recipe: true },
  { id: "spicedPie", name: "Gewürzpastete", icon: "🌶️", effect: { damage: 0.15, crit: 0.08 }, price: 50, tavern: 1, recipe: true },
  { id: "honeyCake", name: "Honigkuchen", icon: "🍯", effect: { gold: 0.4, hp: 0.15, mana: 0.15 }, price: 50, tavern: 1, recipe: true },
  // Schatz-Rezepte aus verborgenen Räumen: etwas stärker als die der Besucher
  { id: "piratePie", name: "Kapitänspastete", icon: "🏴‍☠️", effect: { damage: 0.18, crit: 0.06, gold: 0.2 }, price: 60, tavern: 1, recipe: true, treasure: true },
  { id: "dragonPepper", name: "Drachenpfeffer-Steak", icon: "🥩", effect: { damage: 0.22, hp: 0.2 }, price: 60, tavern: 1, recipe: true, treasure: true },
  { id: "goldenBroth", name: "Goldene Brühe", icon: "🫕", effect: { hp: 0.3, armor: 0.2, mana: 0.2 }, price: 60, tavern: 1, recipe: true, treasure: true },
];

const findFood = (id: string) => FOODS.find((f) => f.id === id);

export function getFood(id: string): FoodDef {
  const food = findFood(id);
  if (!food) throw new Error(`Unbekanntes Gericht: ${id}`);
  return food;
}

/** Preis auf diesem Level – auf Level 30 etwa das Vierfache, auf Level 60 das Siebenfache. */
export function foodPrice(food: FoodDef, level: number): number {
  return Math.round(food.price * (1 + (level - 1) / 10));
}

/** Kampfwerte mit einem gegessenen Gericht – ohne Gericht unverändert. */
export function withMeal<T extends HeroCombatProfile>(profile: T, mealId: string | null | undefined): T {
  const food = mealId ? findFood(mealId) : undefined;
  if (!food) return profile;
  const { hp = 0, damage = 0, armor = 0, crit = 0, mana = 0, gold = 0 } = food.effect;
  return {
    ...profile,
    maxHp: Math.round(profile.maxHp * (1 + hp)),
    damage: profile.damage * (1 + damage),
    armor: Math.round(profile.armor * (1 + armor)),
    critChance: profile.critChance + crit,
    maxMana: Math.round(profile.maxMana * (1 + mana)),
    goldBonus: profile.goldBonus + gold,
  };
}

const EFFECT_LABELS: Record<keyof FoodEffect, string> = {
  hp: "LP",
  damage: "Schaden",
  armor: "Rüstung",
  crit: "Krit-Chance",
  mana: "Mana",
  gold: "Gold",
};

/** „+20 % LP, +10 % Schaden“ */
export function foodEffectText(food: FoodDef): string {
  return (Object.entries(food.effect) as [keyof FoodEffect, number][])
    .map(([key, value]) => `+${Math.round(value * 100)} % ${EFFECT_LABELS[key]}`)
    .join(", ");
}

/**
 * Isst ein Gericht. Es gibt nur eines auf einmal: Wer noch satt ist, muss erst
 * kämpfen. `tavernTier`: Ausbaustufe der Taverne, `recipes`: Rezepte von Besuchern.
 */
export function eatMeal(
  meal: string | null,
  gold: number,
  id: string,
  level: number,
  tavernTier: number,
  recipes: readonly string[] = [],
): { meal: string; gold: number } {
  const food = getFood(id);
  if (food.recipe && !recipes.includes(id)) throw new Error(`Für ${food.name} fehlt dir das Rezept.`);
  if (food.tavern > tavernTier) throw new Error(`${food.name} gibt es erst in der Taverne der Stufe ${food.tavern}.`);
  if (meal) throw new Error(`Du bist noch satt von ${getFood(meal).name}.`);
  const price = foodPrice(food, level);
  if (gold < price) throw new Error("Nicht genug Gold.");
  return { meal: id, gold: gold - price };
}
