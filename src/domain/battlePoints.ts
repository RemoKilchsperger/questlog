// Kampfpunkte: Kämpfe sind begrenzt. Jeder Kampf kostet einen Punkt,
// erledigte Quests füllen sie wieder auf – längere Quests mehr
// (siehe `battlePoints` in EFFORT_TIERS). Zusätzlich gibt es alle 6 Stunden
// (0, 6, 12, 18 Uhr Ortszeit) einen Punkt geschenkt.

import { slotIndex } from "./calendar";
import type { Character } from "./types";

export const MAX_BATTLE_POINTS = 20;
export const START_BATTLE_POINTS = 5;
export const BATTLE_COST = 1;
export const REGEN_HOURS = 6;

/** Aktueller 6-Stunden-Abschnitt – gespeichert, um verpasste Geschenke nachzuholen. */
export function regenSlot(now: Date = new Date()): number {
  return slotIndex(now, REGEN_HOURS);
}

/**
 * Schreibt alle seit dem letzten Mal begonnenen 6-Stunden-Abschnitte gut
 * (je ein Punkt, höchstens bis zum Maximum). Gibt bei nichts Neuem
 * dasselbe Objekt zurück.
 */
export function regenerateBattlePoints(character: Character, now: Date = new Date()): Character {
  const slot = regenSlot(now);
  const passed = slot - character.battlePointSlot;
  if (passed <= 0) return character;
  return {
    ...character,
    battlePoints: Math.min(MAX_BATTLE_POINTS, character.battlePoints + passed),
    battlePointSlot: slot,
  };
}

/** Zieht die Kosten eines Kampfes ab – bzw. mehrerer, z. B. für einen ganzen Dungeon. */
export function spendBattlePoint(character: Character, amount: number = BATTLE_COST): Character {
  if (character.battlePoints < amount) {
    throw new Error(
      amount === BATTLE_COST
        ? "Keine Kampfpunkte mehr – erledige Quests, um neue zu bekommen."
        : `Nicht genug Kampfpunkte – dafür brauchst du ${amount}.`,
    );
  }
  return { ...character, battlePoints: character.battlePoints - amount };
}

/** Kosten eines Dungeons: ein Kampfpunkt pro Kampf, alle beim Betreten bezahlt. */
export function dungeonCost(fights: number): number {
  return fights * BATTLE_COST;
}

/** Füllt Kampfpunkte auf, höchstens bis MAX_BATTLE_POINTS. */
export function refillBattlePoints(character: Character, amount: number): Character {
  return { ...character, battlePoints: Math.min(MAX_BATTLE_POINTS, character.battlePoints + amount) };
}
