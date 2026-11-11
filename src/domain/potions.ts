// Tränke: kleine Heiltränke gibt es immer beim Händler, alle anderen erst beim
// Alchemisten – je nach seiner Ausbaustufe (village.ts). Dazu fallen sie als Kampfbeute.
// Im Kampf einsetzen: pro Runde höchstens einer,
// und jede Sorte nur einmal pro Kampf. Heiltränke heilen einen Anteil der
// maximalen Lebenspunkte, Angriffs- und Rüstungstränke verstärken den Helden
// für einige Runden – alles in Prozent, damit sie auf jedem Level nützlich bleiben.
// Wurftränke (docs/wurftraenke.md) wirft man auf das Ziel: Sie zählen wie ein
// getrunkener Trank und fliegen mit dem nächsten Zug des Helden.

export type BuffKind = "attack" | "armor";

/** Was ein Wurftrank am Ziel anrichtet. */
export type ThrowKind = "burn" | "poison" | "freeze" | "acid" | "smoke" | "blast";

export type PotionEffect =
  /** Heilt einen Anteil der maximalen Lebenspunkte (0..1). */
  | { kind: "heal"; percent: number }
  /** Erhöht Schaden bzw. Rüstung um `percent` für `rounds` Runden (inklusive der aktuellen). */
  | { kind: BuffKind; percent: number; rounds: number }
  /**
   * Wurftrank: `percent` ist je nach Art der Anteil des Heldenschadens pro Runde (Feuer, Gift)
   * bzw. sofort an allen Gegnern (Sprengflasche), die Rüstungsminderung (Säure) oder die Schwächung (Rauch).
   */
  | { kind: "throw"; throw: ThrowKind; percent: number; rounds: number };

export interface PotionDef {
  id: string;
  name: string;
  icon: string;
  effect: PotionEffect;
  /** Kaufpreis */
  price: number;
  /** Ab dieser Stufe des Alchemisten zu kaufen (0: beim Strassenhändler) */
  alchemist: number;
}

export const POTIONS: readonly PotionDef[] = [
  { id: "small", name: "Kleiner Heiltrank", icon: "🧪", effect: { kind: "heal", percent: 0.2 }, price: 15, alchemist: 0 },
  { id: "medium", name: "Heiltrank", icon: "⚗️", effect: { kind: "heal", percent: 0.4 }, price: 45, alchemist: 1 },
  { id: "large", name: "Grosser Heiltrank", icon: "🏺", effect: { kind: "heal", percent: 0.6 }, price: 150, alchemist: 3 },
  { id: "attack", name: "Angriffstrank", icon: "🔥", effect: { kind: "attack", percent: 0.3, rounds: 3 }, price: 120, alchemist: 2 },
  { id: "armor", name: "Rüstungstrank", icon: "🪨", effect: { kind: "armor", percent: 1, rounds: 3 }, price: 120, alchemist: 2 },
  { id: "firebomb", name: "Brandflasche", icon: "☄️", effect: { kind: "throw", throw: "burn", percent: 0.3, rounds: 3 }, price: 60, alchemist: 1 },
  { id: "venom", name: "Giftphiole", icon: "☠️", effect: { kind: "throw", throw: "poison", percent: 0.25, rounds: 4 }, price: 60, alchemist: 1 },
  { id: "frostbomb", name: "Frostbombe", icon: "🧊", effect: { kind: "throw", throw: "freeze", percent: 0, rounds: 1 }, price: 140, alchemist: 2 },
  { id: "acid", name: "Säureflasche", icon: "🫗", effect: { kind: "throw", throw: "acid", percent: 0.25, rounds: 0 }, price: 120, alchemist: 2 },
  { id: "smoke", name: "Rauchbombe", icon: "💨", effect: { kind: "throw", throw: "smoke", percent: 0.3, rounds: 2 }, price: 120, alchemist: 2 },
  { id: "blast", name: "Sprengflasche", icon: "💥", effect: { kind: "throw", throw: "blast", percent: 0.5, rounds: 0 }, price: 250, alchemist: 3 },
];

/** Wirft man diesen Trank auf einen Gegner? */
export function isThrowable(potion: PotionDef): boolean {
  return potion.effect.kind === "throw";
}

/** Tränke zum Trinken bzw. zum Werfen. */
export const DRINK_POTIONS: readonly PotionDef[] = POTIONS.filter((p) => !isThrowable(p));
export const THROW_POTIONS: readonly PotionDef[] = POTIONS.filter(isThrowable);

/** Tränke, die es auf dieser Stufe des Alchemisten zu kaufen gibt. */
export function potionsForSale(alchemistTier: number): PotionDef[] {
  return POTIONS.filter((p) => p.alchemist <= alchemistTier);
}

/** Tränke, die es mit der Kräuterhütte (Stufe 1) zu kaufen gibt – der frühere Händler. */
export const SHOP_POTIONS: readonly PotionDef[] = potionsForSale(1);

/** Verstärkungs- und Wurftränke – fallen selten bei jedem Gegner. */
export const BUFF_POTIONS: readonly PotionDef[] = POTIONS.filter((p) => p.effect.kind !== "heal");

export const BUFF_LABELS: Record<BuffKind, string> = { attack: "Schaden", armor: "Rüstung" };

/** Anzahl Tränke pro Sorte im Besitz des Helden. */
export type PotionStock = Record<string, number>;

/** Startvorrat für neue (und migrierte) Spielstände. */
export const STARTER_POTIONS: PotionStock = { small: 3 };

export function getPotion(id: string): PotionDef {
  const potion = POTIONS.find((p) => p.id === id);
  if (!potion) throw new Error(`Unbekannter Trank: ${id}`);
  return potion;
}

/** Geheilte Lebenspunkte (0 bei Tränken, die nicht heilen). */
export function potionHeal(potion: PotionDef, maxHp: number): number {
  return potion.effect.kind === "heal" ? Math.max(1, Math.round(maxHp * potion.effect.percent)) : 0;
}

/** "heilt 20 % der LP", "+30 % Schaden für 3 Runden" bzw. was ein Wurftrank anrichtet. */
export function potionEffectText(potion: PotionDef): string {
  const { effect } = potion;
  const percent = Math.round(effect.percent * 100);
  if (effect.kind === "heal") return `heilt ${percent} % der LP`;
  if (effect.kind !== "throw") return `+${percent} % ${BUFF_LABELS[effect.kind]} für ${effect.rounds} Runden`;
  switch (effect.throw) {
    case "burn":
      return `Feuer: ${effect.rounds} Runden je ${percent} % deines Schadens`;
    case "poison":
      return `Gift: ${effect.rounds} Runden je ${percent} % deines Schadens`;
    case "freeze":
      return "friert das Ziel ein – es setzt eine Runde aus";
    case "acid":
      return `−${percent} % Rüstung des Ziels für den Rest des Kampfes`;
    case "smoke":
      return `das Ziel macht ${effect.rounds} Runden ${percent} % weniger Schaden`;
    case "blast":
      return `${percent} % deines Schadens an allen Gegnern, ignoriert Rüstung`;
  }
}

/**
 * Aufschlag pro Level über 1. Tränke wirken in Prozent und bleiben deshalb auf jedem Level
 * gleich nützlich – mit festen Preisen kosteten sie auf Level 30 nur noch einen halben Kampf
 * an Gold. Halb so steil wie beim Essen (food.ts), weil Heiltränke auch als Beute fallen.
 */
export const POTION_PRICE_PER_LEVEL = 0.05;

/** Kaufpreis auf diesem Level: Grundpreis × (1 + (Level − 1) / 20) – Level 30 etwa ×2.5, Level 60 etwa ×4. */
export function potionPrice(potion: PotionDef, level: number): number {
  return Math.round(potion.price * (1 + Math.max(0, level - 1) * POTION_PRICE_PER_LEVEL));
}

/** Kauft einen Trank – `alchemistTier`: Ausbaustufe des Alchemisten (village.ts), `level`: Level des Helden. */
export function buyPotion(
  stock: PotionStock,
  gold: number,
  id: string,
  alchemistTier = 1,
  level = 1,
): { stock: PotionStock; gold: number } {
  const potion = getPotion(id);
  if (potion.alchemist > alchemistTier) {
    throw new Error(`${potion.name} gibt es erst beim Alchemisten der Stufe ${potion.alchemist} – sonst nur als Beute.`);
  }
  const price = potionPrice(potion, level);
  if (gold < price) throw new Error("Nicht genug Gold.");
  return { stock: { ...stock, [id]: (stock[id] ?? 0) + 1 }, gold: gold - price };
}
