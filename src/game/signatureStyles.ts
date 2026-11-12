// Darstellung der Signaturen in den Kampfszenen (docs/klassen-neukonzept.md 6, „Phaser“): Für den Anfang
// zeigen die Szenen jede Signatur mit der Animation einer passenden Waffen-Fähigkeit (Ausholen, Geschoss,
// Einschlag) und einem goldenen Aufleuchten. Eigene Animationen pro Klasse können später folgen.

import type { AbilityId } from "../domain/abilities";
import type { HeroClassId } from "../domain/heroClasses";

/** Fähigkeit, deren Animation die Signatur einer Klasse leiht. */
export const SIGNATURE_STYLE: Readonly<Record<HeroClassId, AbilityId>> = {
  mage: "staff-2", // Meteor: der Himmel glüht
  warlock: "scepter-4", // Lebensentzug: dunkler Sog
  assassin: "dagger", // in Rauch auflösen, hinter dem Ziel auftauchen
  ranger: "bow-2", // Durchbohrender Schuss
  duelist: "sword-4", // Entwaffnen
  plunderer: "axe-2", // Zerfleischen
  cleric: "mace-2", // Heiliges Licht
  paladin: "mace-4", // Heiliger Hammer
  berserker: "greataxe-6", // Raserei
  champion: "greatsword-2", // Kriegsschrei
  warden: "greathammer-2", // Erdbeben
};

/** Goldton der Klassenleiste und der Signaturen. */
export const SIGNATURE_COLOR = 0xf5c542;
