// Tränke: kleine und normale Heiltränke beim Händler kaufen, grosse Heiltränke
// sowie Angriffs- und Rüstungstränke gibt es nur als Kampfbeute.
// Im Kampf einsetzen: pro Runde höchstens einer,
// und jede Sorte nur einmal pro Kampf. Heiltränke heilen einen Anteil der
// maximalen Lebenspunkte, Angriffs- und Rüstungstränke verstärken den Helden
// für einige Runden – alles in Prozent, damit sie auf jedem Level nützlich bleiben.

export type BuffKind = "attack" | "armor";

export type PotionEffect =
  /** Heilt einen Anteil der maximalen Lebenspunkte (0..1). */
  | { kind: "heal"; percent: number }
  /** Erhöht Schaden bzw. Rüstung um `percent` für `rounds` Runden (inklusive der aktuellen). */
  | { kind: BuffKind; percent: number; rounds: number };

export interface PotionDef {
  id: string;
  name: string;
  icon: string;
  effect: PotionEffect;
  /** Kaufpreis beim Händler – null: nur als Kampfbeute erhältlich */
  price: number | null;
}

export const POTIONS: readonly PotionDef[] = [
  { id: "small", name: "Kleiner Heiltrank", icon: "🧪", effect: { kind: "heal", percent: 0.2 }, price: 15 },
  { id: "medium", name: "Heiltrank", icon: "⚗️", effect: { kind: "heal", percent: 0.4 }, price: 45 },
  { id: "large", name: "Grosser Heiltrank", icon: "🏺", effect: { kind: "heal", percent: 0.6 }, price: null },
  { id: "attack", name: "Angriffstrank", icon: "🔥", effect: { kind: "attack", percent: 0.3, rounds: 3 }, price: null },
  { id: "armor", name: "Rüstungstrank", icon: "🪨", effect: { kind: "armor", percent: 1, rounds: 3 }, price: null },
];

/** Tränke, die der Händler verkauft. */
export const SHOP_POTIONS: readonly PotionDef[] = POTIONS.filter((p) => p.price !== null);

/** Verstärkungstränke – fallen selten bei jedem Gegner. */
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

/** "heilt 20 % der LP" bzw. "+30 % Schaden für 3 Runden". */
export function potionEffectText(potion: PotionDef): string {
  const { effect } = potion;
  const percent = Math.round(effect.percent * 100);
  return effect.kind === "heal"
    ? `heilt ${percent} % der LP`
    : `+${percent} % ${BUFF_LABELS[effect.kind]} für ${effect.rounds} Runden`;
}

export function buyPotion(stock: PotionStock, gold: number, id: string): { stock: PotionStock; gold: number } {
  const potion = getPotion(id);
  if (potion.price === null) throw new Error(`${potion.name} gibt es nur als Beute.`);
  if (gold < potion.price) throw new Error("Nicht genug Gold.");
  return { stock: { ...stock, [id]: (stock[id] ?? 0) + 1 }, gold: gold - potion.price };
}
