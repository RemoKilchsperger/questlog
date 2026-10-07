// Gemeinsame Darstellung von Items (Farben, Texte) für Ausrüstung und Belohnungs-Popup.

import { getArmorClass } from "../domain/armorClasses";
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

/** Hauptwerte einzeln: Waffen Angriff, Rüstungsteile Rüstung, Schilde beides. */
export function mainStatParts(stats: ItemStats): { kind: "attack" | "armor"; text: string }[] {
  const parts: { kind: "attack" | "armor"; text: string }[] = [];
  if (stats.attack > 0) parts.push({ kind: "attack", text: `+${stats.attack} Angriff` });
  if (stats.armor > 0 || stats.attack <= 0) parts.push({ kind: "armor", text: `+${stats.armor} Rüstung` });
  return parts;
}

/** "+5 Angriff", "+4 Rüstung" bzw. bei Schilden "+5 Angriff · +4 Rüstung". */
export function mainStatText(stats: ItemStats): string {
  return mainStatParts(stats)
    .map((p) => p.text)
    .join(" · ");
}

export const MAIN_STAT_TEXT = { attack: "text-strength", armor: "text-intellect" } as const;

/** Name samt Verbesserungsstufe beim Schmied: "Eisenschwert +2". */
export function itemName(stats: ItemStats): string {
  return stats.upgrade > 0 ? `${stats.def.name} +${stats.upgrade}` : stats.def.name;
}

/** "Schwert", "Zweihandschwert · Zweihand", "Helm" … */
export function typeText(def: ItemDef): string {
  const label = getItemType(def.type).label;
  if (def.armorClass) return `${label} · ${getArmorClass(def.armorClass).label}`;
  return def.twoHanded ? `${label} · Zweihand` : label;
}

/** Ausgleich leichter und mittlerer Rüstung pro Teil: "+4 Mana · +0,6 % Krit" – leer bei schwerer. */
export function armorClassPerkText(def: ItemDef): string {
  if (!def.armorClass) return "";
  const { manaPerPiece, critPerPiece } = getArmorClass(def.armorClass);
  const parts = [
    manaPerPiece > 0 && `+${manaPerPiece} Mana`,
    critPerPiece > 0 && `+${(critPerPiece * 100).toLocaleString("de-CH")} % Krit`,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** "+2 Stärke · +1 Charisma" – leer bei Items ohne Boni. */
export function bonusText(bonuses: Partial<Stats>): string {
  return (Object.entries(bonuses) as [StatKey, number][])
    .map(([stat, value]) => `+${value} ${STAT_LABELS[stat]}`)
    .join(" · ");
}
