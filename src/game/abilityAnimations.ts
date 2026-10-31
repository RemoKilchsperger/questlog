// Animationen der erweiterten Fähigkeiten-Pools: Jede neue Fähigkeit nutzt die
// Ankündigung und den Treffer einer vorhandenen, die ihr ähnlich sieht – so
// braucht nicht jede Fähigkeit eigene Effekte in beiden Kampfszenen.

import type { AbilityId } from "../domain/abilities";

const ANIMATION: Partial<Record<AbilityId, AbilityId>> = {
  "dagger-3": "sword", // Giftklinge: schneller Stich
  "dagger-4": "dagger", // Schattenschritt: in den Schatten
  "sword-3": "axe-2", // Tiefe Wunde: blutige Schnitte
  "sword-4": "sword-2", // Entwaffnen: Hieb aus der Deckung
  "axe-3": "greatsword-3", // Hackwirbel: wirbelnde Hiebe
  "axe-4": "greataxe", // Spaltschlag: Rüstung bricht
  "mace-3": "mace-2", // Läuterung: Lichtsäule
  "mace-4": "mace-2", // Heiliger Hammer: leuchtender Schlag
  "scepter-3": "scepter", // Seelenfeuer: Strahl
  "scepter-4": "scepter-2", // Lebensentzug: dunkler Strahl
  "shield-3": "mace", // Schildstoss: betäubender Stoss
  "shield-4": "shield-2", // Schildwall: goldene Abwehrhaltung
  "greatsword-4": "axe-2", // Kreuzhieb
  "greatsword-5": "sword-2", // Konterstellung
  "greatsword-6": "greatsword-2", // Heldenmut: Schrei
  "greataxe-4": "greatsword-3", // Wirbelwind
  "greataxe-5": "greataxe-2", // Wutschrei: rote Aura
  "greataxe-6": "greataxe-3", // Ausbluten: Hieb von oben
  "greathammer-4": "greataxe", // Zertrümmern: Rüstung bricht
  "greathammer-5": "mace-2", // Unerschütterlich: Lichtsäule
  "greathammer-6": "greathammer-3", // Titanenschlag: Kraft sammelt sich am Hammer
  "staff-4": "scepter", // Kettenblitz: Strahl
  "staff-5": "mace-2", // Arkane Heilung: Lichtsäule
  "staff-6": "shield-2", // Arkaner Schild
  "bow-4": "bow-2", // Giftpfeil
  "bow-5": "bow-2", // Brandpfeil
  "bow-6": "bow-2", // Kopfschuss
};

/** Die Fähigkeit, deren Animation diese nutzt – meist sie selbst. */
export function animationOf(id: AbilityId): AbilityId {
  return ANIMATION[id] ?? id;
}
