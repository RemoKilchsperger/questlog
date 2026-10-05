// Gemeinsame Darstellung der Tränke (Händler und Kampf).

import type { PotionEffect } from "../domain/potions";

/** Textfarbe je Wirkung: Heilung grün, Angriff rot, Rüstung blau. */
export const POTION_COLORS: Record<PotionEffect["kind"], string> = {
  heal: "text-xp",
  attack: "text-strength",
  armor: "text-intellect",
};

/** Rahmen und Hintergrund der Trank-Knöpfe im Kampf. */
export const POTION_BUTTONS: Record<PotionEffect["kind"], string> = {
  heal: "border-xp/70 bg-xp/10 text-xp hover:bg-xp/20",
  attack: "border-strength/70 bg-strength/10 text-strength hover:bg-strength/20",
  armor: "border-intellect/70 bg-intellect/10 text-intellect hover:bg-intellect/20",
};
