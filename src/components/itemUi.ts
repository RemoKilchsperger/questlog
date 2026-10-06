// Gemeinsame Darstellung von Items (Farben, Texte) für Ausrüstung und Belohnungs-Popup.

import { getItemType, getRarity } from "../domain/items";
import { STAT_LABELS } from "../domain/rewards";
import type { ItemDef, ItemStats, Rarity, StatKey, Stats } from "../domain/types";

export const RARITY_TEXT: Record<Rarity, string> = {
  common: "text-parchment",
  rare: "text-rare",
  epic: "text-epic",
  legendary: "text-legendary",
};

export const RARITY_BORDER: Record<Rarity, string> = {
  common: "border-night-700",
  rare: "border-rare/70",
  epic: "border-epic/70",
  legendary: "border-legendary/80",
};

export function rarityLabel(rarity: Rarity): string {
  return getRarity(rarity).label;
}

/** "+5 Angriff" bzw. "+4 Rüstung" (Schilde geben Rüstung). */
export function mainStatText(stats: ItemStats): string {
  return stats.attack > 0 ? `+${stats.attack} Angriff` : `+${stats.armor} Rüstung`;
}

/** Name samt Verbesserungsstufe beim Schmied: "Eisenschwert +2". */
export function itemName(stats: ItemStats): string {
  return stats.upgrade > 0 ? `${stats.def.name} +${stats.upgrade}` : stats.def.name;
}

/** "Schwert", "Zweihandschwert · Zweihand", "Helm" … */
export function typeText(def: ItemDef): string {
  const label = getItemType(def.type).label;
  return def.twoHanded ? `${label} · Zweihand` : label;
}

/** "+2 Stärke · +1 Charisma" – leer bei Items ohne Boni. */
export function bonusText(bonuses: Partial<Stats>): string {
  return (Object.entries(bonuses) as [StatKey, number][])
    .map(([stat, value]) => `+${value} ${STAT_LABELS[stat]}`)
    .join(" · ");
}
