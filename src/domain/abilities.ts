// Kampf-Fähigkeiten: Jeder Waffentyp (auch der Schild) hat einen Pool von vier
// Fähigkeiten, Zweihandwaffen von sechs. Jede Waffe trägt die Hälfte davon – fest
// aus ihrer uid gewürfelt (`rollWeaponAbilities`): Einhandwaffen 2, Zweihandwaffen 3.
// Zwei Einhandwaffen (oder Waffe und Schild) bringen so bis zu vier Fähigkeiten mit.
// Fähigkeiten kosten Mana und ersetzen den normalen Angriff einer Runde. Verfügbar
// sind die Fähigkeiten aller angelegten Waffen.
//
// Abklingzeit: Nach dem Einsatz ist eine Fähigkeit 1–4 Runden gesperrt – je
// stärker, desto länger. So lohnt es sich, den richtigen Moment abzupassen.
//
// Ids: Die erste Fähigkeit heisst wie der Waffentyp ("sword"), die weiteren
// bekommen ihre Nummer angehängt ("sword-2" … "sword-4", "staff-6").
//
// Mana: zu Kampfbeginn voll, +MANA_REGEN pro Runde. Das Maximum wächst mit
// Level und Intelligenz (siehe `maxManaFor`).

import type { DamageKind } from "./matchups";
import { hash, seededRng } from "./random";
import type { SkillWeapon } from "./skills";

/** Waffentypen mit sechs Fähigkeiten: die Zweihandwaffen. */
export type TwoHandedWeapon = "greatsword" | "greataxe" | "greathammer" | "staff" | "bow";

export type AbilityId = SkillWeapon | `${SkillWeapon}-${2 | 3 | 4}` | `${TwoHandedWeapon}-${5 | 6}`;

export interface AbilityDef {
  id: AbilityId;
  weapon: SkillWeapon;
  /** Nummer im Pool der Waffe: 1–4, bei Zweihandwaffen 1–6 */
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  icon: string;
  manaCost: number;
  /** Abklingzeit: so viele Runden ist die Fähigkeit nach dem Einsatz gesperrt (je stärker, desto länger) */
  cooldown: number;
  description: string;
  /** Faktor auf den Schaden des Helden – pro Treffer */
  multiplier: number;
  /** Anzahl Treffer (Standard 1) */
  hits?: number;
  /**
   * Flächenwirkung gegen Boss und Begleiter (Standard: nur das Ziel):
   * - "all": jeder Treffer trifft alle Gegner, Zusatzeffekte wirken auf alle
   * - "spread": jeder Treffer geht an einen zufälligen Gegner
   * - { splash }: das Ziel voll, alle anderen mit diesem Anteil (Zusatzeffekte nur aufs Ziel)
   */
  aoe?: AbilityAoe;
  /** Trifft immer kritisch */
  guaranteedCrit?: boolean;
  /** Rüstung des Gegners wird ignoriert */
  ignoreArmor?: boolean;
  /** Gegner setzt in dieser Runde aus */
  stun?: boolean;
  /** Chance auf die Betäubung (Standard: sicher) */
  stunChance?: number;
  /** Die Betäubung ist ein Einfrieren – wirkt gleich und zählt auch für die Immunität */
  freeze?: boolean;
  /** Gift: Anteil des Heldenschadens pro Runde, ignoriert Rüstung */
  poison?: { percent: number; rounds: number };
  /** Feuer: Anteil des Heldenschadens pro Runde, ignoriert Rüstung */
  burn?: { percent: number; rounds: number };
  /** Bluten: Anteil des Heldenschadens pro Runde, ignoriert Rüstung */
  bleed?: { percent: number; rounds: number };
  /** Senkt die Rüstung des Gegners für den Rest des Kampfes */
  armorBreak?: number;
  /** Blockt den nächsten Angriff des Gegners komplett (inkl. aller Zusatzeffekte) */
  bulwark?: boolean;
  /** Finisher: Ist der Gegner unter `threshold` seiner LP, wirkt der Schaden `factor`-fach */
  execute?: { threshold: number; factor: number };
  /**
   * Abwehr gegen den nächsten gegnerischen Angriff: Schaden × `reduce`, danach
   * Konter mit `counter` × Heldenschaden und/oder Rückwurf von `reflect` × dem
   * ungeminderten Schaden.
   */
  guard?: Guard;
  /** Eigene Verstärkung ab der nächsten Runde: +percent Schaden für `rounds` Runden */
  empower?: { percent: number; rounds: number };
  /** Lebensraub: heilt um diesen Anteil des verursachten Schadens */
  lifesteal?: number;
  /** Heilt um diesen Anteil der maximalen Lebenspunkte */
  heal?: number;
  /** Schwächt den Gegner: macht `percent` weniger Schaden für `rounds` Runden */
  weaken?: { percent: number; rounds: number };
  /** Verwundbar: der Gegner erleidet `percent` mehr Schaden für `rounds` Runden */
  vulnerable?: { percent: number; rounds: number };
  /** Schadensart der Fähigkeit statt der der Waffe (Mordschlag: Wucht) */
  kind?: DamageKind;
  /** Zählt auch als diese Schadensart, wenn das gegen das Ziel wirksamer ist (Heiliger Hammer: Magie) */
  altKind?: DamageKind;
  /** Entfernt Gift, Feuer und Bluten vom Helden */
  cleanse?: boolean;
  /**
   * Erlittener Schaden des Helden: `percent` mehr (negativ: weniger) für `rounds`
   * Runden – ab dieser Runde (Schildwall −30 %, Wutschrei +20 %)
   */
  damageTaken?: { percent: number; rounds: number };
  /** Zieht im Koop die Bedrohung auf den Helden wie Bollwerk */
  taunt?: boolean;
  /** Mehr Schaden gegen blutende Gegner (0.6 = +60 %) */
  bleedBonus?: number;
  /** Ausholen: Der nächste Angriff bzw. die nächste Fähigkeit macht so viel Schaden (Faktor) */
  charge?: number;
  /** Heilung über Zeit: `percent` der max. LP am Ende von `rounds` Runden – ab dieser Runde */
  renew?: { percent: number; rounds: number };
  /** Koop: Die anderen Helden bekommen diesen Anteil der Heilung (`heal` und `renew`) */
  groupHeal?: number;
  /** Gibt so viel Mana zurück */
  manaGain?: number;
  /** Schattenschritt: Die nächste Aktion des Helden trifft sicher kritisch */
  ambush?: boolean;
  /** Finte: Der nächste normale Angriff trifft doppelt */
  feint?: boolean;
  /** Mehr Schaden gegen erschütterte Gegner – in den letzten 2 Runden betäubt (Heiliger Hammer) */
  shakenBonus?: number;
  /** Gift und Feuer auf dem Ziel halten so viele Runden länger (Fluch der Schwäche) */
  extendDots?: number;
  /** Mehr Schaden, wenn der Gegner gerade auflädt (Richterstoss: 0.3 = +30 %) */
  chargingBonus?: number;
  /** So viele Treffer unter 50 % LP des Helden statt `hits` (Raserei) */
  frenzyHits?: number;
  /** Bricht das Aufladen eines Gegners immer ab, wenn sie ihn trifft (Wuchtiger Schlag) */
  interrupt?: boolean;
  /** Einfrier-Chance gegen brennende Gegner statt `stunChance` (Eisstrahl) */
  freezeVsBurning?: number;
}

export type AbilityAoe = "all" | "spread" | { splash: number };

export interface Guard {
  reduce: number;
  counter?: number;
  reflect?: number;
}

export const MANA_REGEN = 6;

/**
 * Nach einer Betäubung sind Bosse so viele Runden immun gegen weitere – solo
 * (Gebiets- und Dungeon-Bosse) und im Koop (dort alle Gegner). So lässt sich ein
 * Boss nicht dauerhaft festhalten, auch nicht mit mehreren Streitkolben.
 */
export const STUN_IMMUNITY_ROUNDS = 3;

/** Immunität nach einer Betäubung in dieser Runde: die Runde selbst plus `STUN_IMMUNITY_ROUNDS` folgende. */
export const freshStunImmunity = (): number => STUN_IMMUNITY_ROUNDS + 1;

/** Am Rundenende läuft eine Runde der Immunität ab. */
export function tickStunImmunity(rounds: number | undefined): number | undefined {
  return rounds !== undefined && rounds > 1 ? rounds - 1 : undefined;
}

/** Mana-Maximum: 40 + 2 pro Level über 1 + 1 pro Intelligenz. */
export function maxManaFor(level: number, intellect: number): number {
  return 40 + (level - 1) * 2 + intellect;
}

export const ABILITIES: readonly AbilityDef[] = [
  {
    id: "dagger",
    weapon: "dagger",
    tier: 1,
    name: "Hinterhältiger Stoss",
    icon: "🗡️",
    manaCost: 20,
    cooldown: 2,
    multiplier: 1.4,
    guaranteedCrit: true,
    description: "Ein gezielter Stich mit 1,4-fachem Schaden – trifft immer kritisch.",
  },
  {
    id: "sword",
    weapon: "sword",
    tier: 1,
    name: "Schwertwirbel",
    icon: "🌀",
    manaCost: 25,
    cooldown: 2,
    multiplier: 0.75,
    hits: 3,
    aoe: "spread",
    description: "Drei schnelle Hiebe – jeder kann kritisch treffen. Bei mehreren Gegnern trifft jeder Hieb einen zufälligen.",
  },
  {
    id: "greatsword",
    weapon: "greatsword",
    tier: 1,
    name: "Richterstoss",
    icon: "⚖️",
    manaCost: 35,
    cooldown: 2,
    multiplier: 2.3,
    chargingBonus: 0.3,
    description: "Ein gewaltiger Stoss mit 2,3-fachem Schaden – gegen einen Gegner, der gerade auflädt, 30 % stärker.",
  },
  {
    id: "axe",
    weapon: "axe",
    tier: 1,
    name: "Axtwurf",
    icon: "🪓",
    manaCost: 25,
    cooldown: 2,
    multiplier: 1.4,
    ignoreArmor: true,
    bleed: { percent: 0.25, rounds: 2 },
    description: "Die geworfene Axt durchschlägt jede Rüstung – 1,4-facher Schaden, der Gegner blutet 2 Runden lang.",
  },
  {
    id: "greataxe",
    weapon: "greataxe",
    tier: 1,
    name: "Spalter",
    icon: "💥",
    manaCost: 30,
    cooldown: 3,
    multiplier: 1.4,
    bleed: { percent: 0.25, rounds: 3 },
    aoe: { splash: 0.5 },
    description: "Ein Hieb mit 1,4-fachem Schaden – der Gegner blutet 3 Runden lang, umstehende Gegner erleiden halben Schaden.",
  },
  {
    id: "mace",
    weapon: "mace",
    tier: 1,
    name: "Betäubender Schlag",
    icon: "💫",
    manaCost: 30,
    cooldown: 3,
    multiplier: 1.2,
    stun: true,
    description: "Betäubt den Gegner – er kann in dieser Runde nicht zurückschlagen.",
  },
  {
    id: "greathammer",
    weapon: "greathammer",
    tier: 1,
    name: "Wuchtiger Schlag",
    icon: "🔨",
    manaCost: 40,
    cooldown: 2,
    multiplier: 2.2,
    interrupt: true,
    description: "Ein vernichtender Hieb mit 2,2-fachem Schaden – er bricht das Aufladen eines Gegners immer ab.",
  },
  {
    id: "scepter",
    weapon: "scepter",
    tier: 1,
    name: "Giftstrahl",
    icon: "☠️",
    manaCost: 25,
    cooldown: 2,
    multiplier: 0.6,
    ignoreArmor: true,
    poison: { percent: 0.4, rounds: 3 },
    description: "Vergiftet den Gegner: 3 Runden Giftschaden, der Rüstung ignoriert.",
  },
  {
    id: "staff",
    weapon: "staff",
    tier: 1,
    name: "Feuerball",
    icon: "🔥",
    manaCost: 40,
    cooldown: 2,
    multiplier: 1.9,
    ignoreArmor: true,
    burn: { percent: 0.3, rounds: 2 },
    description: "Ein Feuerball mit 1,9-fachem Schaden, der Rüstung ignoriert und den Gegner 2 Runden lang in Brand setzt.",
  },
  {
    id: "bow",
    weapon: "bow",
    tier: 1,
    name: "Pfeilhagel",
    icon: "🏹",
    manaCost: 35,
    cooldown: 2,
    multiplier: 0.45,
    hits: 4,
    aoe: "spread",
    description: "Vier Pfeile regnen herab – jeder kann kritisch treffen. Bei mehreren Gegnern verteilen sie sich zufällig.",
  },
  {
    id: "shield",
    weapon: "shield",
    tier: 1,
    name: "Bollwerk",
    icon: "🛡️",
    manaCost: 20,
    cooldown: 3,
    multiplier: 0,
    hits: 0,
    bulwark: true,
    description: "Statt anzugreifen hinter dem Schild verschanzen: Der nächste gegnerische Angriff wird komplett geblockt.",
  },
  // ───────────── Zweite Fähigkeiten (ab Level 25) ─────────────
  {
    id: "dagger-2",
    weapon: "dagger",
    tier: 2,
    name: "Meucheln",
    icon: "🩸",
    manaCost: 30,
    cooldown: 2,
    multiplier: 1,
    execute: { threshold: 0.3, factor: 3 },
    description: "Ein Stich ins Herz: dreifacher Schaden, wenn der Gegner unter 30 % seiner Lebenspunkte ist.",
  },
  {
    id: "sword-2",
    weapon: "sword",
    tier: 2,
    name: "Parade",
    icon: "🤺",
    manaCost: 25,
    cooldown: 2,
    multiplier: 0.6,
    guard: { reduce: 0.5, counter: 1 },
    description:
      "Ein leichter Hieb, dann in Abwehrhaltung: Der nächste gegnerische Angriff macht nur halben Schaden und du konterst mit vollem Schaden.",
  },
  {
    id: "greatsword-2",
    weapon: "greatsword",
    tier: 2,
    name: "Kriegsschrei",
    icon: "📯",
    manaCost: 30,
    cooldown: 4,
    multiplier: 1,
    empower: { percent: 0.25, rounds: 3 },
    description: "Ein Hieb mit lautem Schrei: In den nächsten 3 Runden machst du 25 % mehr Schaden.",
  },
  {
    id: "axe-2",
    weapon: "axe",
    tier: 2,
    name: "Zerfleischen",
    icon: "🐺",
    manaCost: 30,
    cooldown: 2,
    multiplier: 0.7,
    hits: 2,
    bleed: { percent: 0.3, rounds: 2 },
    description: "Zwei wilde Hiebe – der Gegner blutet 2 Runden lang.",
  },
  {
    id: "greataxe-2",
    weapon: "greataxe",
    tier: 2,
    name: "Blutrausch",
    icon: "🧛",
    manaCost: 35,
    cooldown: 3,
    multiplier: 1.6,
    lifesteal: 0.4,
    description: "Ein rasender Hieb mit 1,6-fachem Schaden – du heilst dich um 40 % des Schadens.",
  },
  {
    id: "mace-2",
    weapon: "mace",
    tier: 2,
    name: "Heiliges Licht",
    icon: "✨",
    manaCost: 35,
    cooldown: 4,
    multiplier: 0.5,
    heal: 0.25,
    description: "Heilt dich um 25 % deiner Lebenspunkte, dazu ein leichter Schlag.",
  },
  {
    id: "greathammer-2",
    weapon: "greathammer",
    tier: 2,
    name: "Erdbeben",
    icon: "🌋",
    manaCost: 40,
    cooldown: 3,
    multiplier: 1,
    ignoreArmor: true,
    weaken: { percent: 0.3, rounds: 2 },
    aoe: "all",
    description: "Der Boden bebt unter allen Gegnern: voller Schaden, der Rüstung ignoriert – sie machen 2 Runden lang 30 % weniger Schaden.",
  },
  {
    id: "scepter-2",
    weapon: "scepter",
    tier: 2,
    name: "Fluch der Schwäche",
    icon: "🕯️",
    manaCost: 30,
    cooldown: 4,
    multiplier: 0.6,
    ignoreArmor: true,
    weaken: { percent: 0.3, rounds: 3 },
    vulnerable: { percent: 0.2, rounds: 3 },
    extendDots: 1,
    description: "Verflucht den Gegner für 3 Runden: Er macht 30 % weniger Schaden und erleidet 20 % mehr. Gift und Feuer auf ihm halten 1 Runde länger.",
  },
  {
    id: "staff-2",
    weapon: "staff",
    tier: 2,
    name: "Meteor",
    icon: "☄️",
    manaCost: 60,
    cooldown: 4,
    multiplier: 2.3,
    ignoreArmor: true,
    burn: { percent: 0.3, rounds: 3 },
    aoe: { splash: 0.5 },
    description: "Ein Meteor mit 2,3-fachem Schaden, der Rüstung ignoriert und das Ziel 3 Runden lang in Brand setzt. Umstehende Gegner erleiden halben Schaden.",
  },
  {
    id: "bow-2",
    weapon: "bow",
    tier: 2,
    name: "Durchbohrender Schuss",
    icon: "🎯",
    manaCost: 35,
    cooldown: 2,
    multiplier: 2,
    ignoreArmor: true,
    description: "Ein gezielter Schuss mit 2-fachem Schaden, der Rüstung durchschlägt.",
  },
  {
    id: "shield-2",
    weapon: "shield",
    tier: 2,
    name: "Vergeltung",
    icon: "🔁",
    manaCost: 25,
    cooldown: 3,
    multiplier: 0,
    hits: 0,
    guard: { reduce: 0.5, reflect: 1 },
    description:
      "Statt anzugreifen: Der nächste gegnerische Angriff macht nur halben Schaden – und der volle Schaden trifft den Angreifer.",
  },
  // ───────────── Dritte Fähigkeiten der Zweihandwaffen (ab Level 25) ─────────────
  {
    id: "greatsword-3",
    weapon: "greatsword",
    tier: 3,
    name: "Klingensturm",
    icon: "🌪️",
    manaCost: 40,
    cooldown: 4,
    multiplier: 0.7,
    hits: 2,
    vulnerable: { percent: 0.1, rounds: 2 },
    aoe: "all",
    description: "Zwei wuchtige Hiebe gegen alle Gegner – jeder kann kritisch treffen. Danach erleiden sie 2 Runden lang 10 % mehr Schaden.",
  },
  {
    id: "greataxe-3",
    weapon: "greataxe",
    tier: 3,
    name: "Enthaupten",
    icon: "💀",
    manaCost: 35,
    cooldown: 3,
    multiplier: 1.3,
    execute: { threshold: 0.3, factor: 2.5 },
    description: "Ein Hieb mit 1,3-fachem Schaden – 2,5-fach so stark, wenn der Gegner unter 30 % seiner Lebenspunkte ist.",
  },
  {
    id: "greathammer-3",
    weapon: "greathammer",
    tier: 3,
    name: "Schockwelle",
    icon: "⚡",
    manaCost: 40,
    cooldown: 3,
    multiplier: 1.5,
    stun: true,
    stunChance: 0.3,
    aoe: "all",
    description: "Ein Schlag mit 1,5-fachem Schaden gegen alle Gegner – jeder ist mit 30 % Chance betäubt und kann nicht zurückschlagen.",
  },
  {
    id: "staff-3",
    weapon: "staff",
    tier: 3,
    name: "Eisstrahl",
    icon: "❄️",
    manaCost: 40,
    cooldown: 3,
    multiplier: 1.5,
    ignoreArmor: true,
    stun: true,
    stunChance: 0.4,
    freeze: true,
    freezeVsBurning: 0.6,
    description: "Ein eisiger Strahl mit 1,5-fachem Schaden, der Rüstung ignoriert – mit 40 % Chance friert der Gegner ein und setzt eine Runde aus, wenn er brennt sogar mit 60 %.",
  },
  {
    id: "bow-3",
    weapon: "bow",
    tier: 3,
    name: "Ausweichschuss",
    icon: "💨",
    manaCost: 30,
    cooldown: 3,
    multiplier: 1.2,
    guard: { reduce: 0.4 },
    description: "Ein Schuss mit 1,2-fachem Schaden, dann Rückzug: Der nächste gegnerische Angriff macht 60 % weniger Schaden.",
  },
  // ───────────── Erweiterte Pools: Einhand bis 4, Zweihand bis 6 ─────────────
  {
    id: "dagger-3",
    weapon: "dagger",
    tier: 3,
    name: "Giftklinge",
    icon: "🐍",
    manaCost: 25,
    cooldown: 2,
    multiplier: 0.8,
    poison: { percent: 0.35, rounds: 3 },
    description: "Ein Stich mit vergifteter Klinge – der Gegner erleidet 3 Runden lang Giftschaden.",
  },
  {
    id: "dagger-4",
    weapon: "dagger",
    tier: 4,
    name: "Schattenschritt",
    icon: "🌑",
    manaCost: 25,
    cooldown: 3,
    multiplier: 0.8,
    bulwark: true,
    ambush: true,
    description: "Ein Stich, dann verschwindest du in den Schatten: Der nächste gegnerische Angriff geht komplett ins Leere – und dein nächster Angriff trifft sicher kritisch.",
  },
  {
    id: "sword-3",
    weapon: "sword",
    tier: 3,
    name: "Finte",
    icon: "🎭",
    manaCost: 20,
    cooldown: 2,
    multiplier: 0.8,
    feint: true,
    description: "Ein angedeuteter Stich lockt die Deckung des Gegners: Dein nächster normaler Angriff trifft doppelt.",
  },
  {
    id: "sword-4",
    weapon: "sword",
    tier: 4,
    name: "Entwaffnen",
    icon: "🤚",
    manaCost: 25,
    cooldown: 3,
    multiplier: 1,
    weaken: { percent: 0.3, rounds: 2 },
    description: "Ein Hieb gegen die Waffenhand: Der Gegner macht 2 Runden lang 30 % weniger Schaden.",
  },
  {
    id: "axe-3",
    weapon: "axe",
    tier: 3,
    name: "Hackwirbel",
    icon: "🌪️",
    manaCost: 30,
    cooldown: 2,
    multiplier: 0.9,
    aoe: "all",
    description: "Ein Wirbel aus Axthieben trifft alle Gegner mit 0,9-fachem Schaden.",
  },
  {
    id: "axe-4",
    weapon: "axe",
    tier: 4,
    name: "Ausbluten",
    icon: "🔪",
    manaCost: 30,
    cooldown: 2,
    multiplier: 1.4,
    bleedBonus: 0.6,
    description: "Ein Hieb mit 1,4-fachem Schaden in die offene Wunde – gegen blutende Gegner 60 % stärker.",
  },
  {
    id: "mace-3",
    weapon: "mace",
    tier: 3,
    name: "Läuterung",
    icon: "🕊️",
    manaCost: 25,
    cooldown: 3,
    multiplier: 0.8,
    heal: 0.15,
    cleanse: true,
    description: "Ein Schlag mit 0,8-fachem Schaden, dann heilst du dich um 15 % deiner Lebenspunkte und befreist dich von Gift, Feuer und Bluten.",
  },
  {
    id: "mace-4",
    weapon: "mace",
    tier: 4,
    name: "Heiliger Hammer",
    icon: "🌟",
    manaCost: 30,
    cooldown: 2,
    // Review Nr. 6: Als reine Magie war er schlechter als keine Fähigkeit (5 von 10 Bossen widerstehen Magie)
    multiplier: 1.5,
    altKind: "magic",
    shakenBonus: 0.3,
    description:
      "Ein Schlag voll heiliger Kraft mit 1,5-fachem Schaden – er zählt als Wucht oder Magie, je nachdem, was gegen das Ziel wirksamer ist. Gegen erschütterte Gegner (in den letzten 2 Runden betäubt) 30 % stärker.",
  },
  {
    id: "scepter-3",
    weapon: "scepter",
    tier: 3,
    name: "Seelenfeuer",
    icon: "🟣",
    manaCost: 30,
    cooldown: 2,
    multiplier: 0.7,
    ignoreArmor: true,
    burn: { percent: 0.4, rounds: 3 },
    description: "Dunkles Feuer mit 0,7-fachem Schaden, das Rüstung ignoriert – der Gegner brennt 3 Runden lang.",
  },
  {
    id: "scepter-4",
    weapon: "scepter",
    tier: 4,
    name: "Lebensentzug",
    icon: "🧪",
    manaCost: 35,
    cooldown: 3,
    multiplier: 1.5,
    ignoreArmor: true,
    lifesteal: 0.5,
    description:
      "Saugt dem Gegner das Leben aus: 1,5-facher Schaden, der Rüstung ignoriert – du heilst dich um die Hälfte davon.",
  },
  {
    id: "shield-3",
    weapon: "shield",
    tier: 3,
    name: "Schildstoss",
    icon: "💢",
    manaCost: 25,
    cooldown: 3,
    multiplier: 1,
    stun: true,
    stunChance: 0.6,
    description:
      "Ein Stoss mit dem Schildrand – mit 60 % Chance ist der Gegner betäubt und kann nicht zurückschlagen.",
  },
  {
    id: "shield-4",
    weapon: "shield",
    tier: 4,
    name: "Schildwall",
    icon: "🧱",
    manaCost: 30,
    cooldown: 4,
    multiplier: 0.6,
    damageTaken: { percent: -0.5, rounds: 3 },
    taunt: true,
    description:
      "Ein Schildhieb mit 0,6-fachem Schaden, dann gehst du in Deckung: 3 Runden lang erleidest du 50 % weniger Schaden. Im Koop ziehst du die Aufmerksamkeit der Gegner auf dich.",
  },
  {
    id: "greatsword-4",
    weapon: "greatsword",
    tier: 4,
    name: "Kreuzhieb",
    icon: "✖️",
    manaCost: 35,
    cooldown: 2,
    multiplier: 1,
    hits: 2,
    description: "Zwei gekreuzte Hiebe mit je vollem Schaden – jeder kann kritisch treffen.",
  },
  {
    id: "greatsword-5",
    weapon: "greatsword",
    tier: 5,
    name: "Konterstellung",
    icon: "🗡️",
    manaCost: 30,
    cooldown: 3,
    multiplier: 1,
    guard: { reduce: 0.6, counter: 1.5 },
    description: "Ein Hieb, dann in Stellung: Der nächste gegnerische Angriff macht 40 % weniger Schaden und du konterst mit 1,5-fachem Schaden.",
  },
  {
    id: "greatsword-6",
    weapon: "greatsword",
    tier: 6,
    name: "Mordschlag",
    icon: "🔃",
    manaCost: 30,
    cooldown: 3,
    multiplier: 1.2,
    kind: "blunt",
    stun: true,
    stunChance: 0.3,
    description:
      "Du packst die Klinge und schlägst mit dem Knauf zu: 1,2-facher Schaden, der als Wucht statt als Klinge zählt – mit 30 % Chance ist der Gegner betäubt.",
  },
  {
    id: "greataxe-4",
    weapon: "greataxe",
    tier: 4,
    name: "Wirbelwind",
    icon: "🌀",
    manaCost: 40,
    cooldown: 3,
    multiplier: 0.7,
    hits: 2,
    aoe: "all",
    description: "Zwei kreisende Hiebe gegen alle Gegner mit je 0,7-fachem Schaden – jeder kann kritisch treffen.",
  },
  {
    id: "greataxe-5",
    weapon: "greataxe",
    tier: 5,
    name: "Wutschrei",
    icon: "😤",
    manaCost: 25,
    cooldown: 4,
    multiplier: 1,
    empower: { percent: 0.4, rounds: 3 },
    damageTaken: { percent: 0.2, rounds: 4 },
    description:
      "Ein Hieb mit wildem Schrei: In den nächsten 3 Runden machst du 40 % mehr Schaden – aber du erleidest ab sofort 20 % mehr.",
  },
  {
    id: "greataxe-6",
    weapon: "greataxe",
    tier: 6,
    name: "Raserei",
    icon: "🔥",
    manaCost: 35,
    cooldown: 3,
    multiplier: 0.6,
    hits: 3,
    frenzyHits: 4,
    description:
      "Drei wilde Hiebe mit je 0,6-fachem Schaden – jeder kann kritisch treffen. Unter 50 % deiner Lebenspunkte sind es vier.",
  },
  {
    id: "greathammer-4",
    weapon: "greathammer",
    tier: 4,
    name: "Zertrümmern",
    icon: "🪨",
    manaCost: 35,
    cooldown: 3,
    multiplier: 1.2,
    armorBreak: 0.25,
    description: "Ein Hieb mit 1,2-fachem Schaden, der die Panzerung zertrümmert: −25 % Rüstung des Gegners für den Rest des Kampfes.",
  },
  {
    id: "greathammer-5",
    weapon: "greathammer",
    tier: 5,
    name: "Unerschütterlich",
    icon: "⛰️",
    manaCost: 30,
    cooldown: 4,
    multiplier: 0,
    hits: 0,
    heal: 0.15,
    guard: { reduce: 0.5, counter: 0.5 },
    description: "Statt anzugreifen: Du heilst dich um 15 % deiner Lebenspunkte, der nächste gegnerische Angriff macht nur halben Schaden – und du stösst mit halbem Schaden zurück.",
  },
  {
    id: "greathammer-6",
    weapon: "greathammer",
    tier: 6,
    name: "Titanenschlag",
    icon: "🌋",
    manaCost: 45,
    cooldown: 4,
    multiplier: 0,
    hits: 0,
    charge: 3.5,
    description: "Statt anzugreifen holst du weit aus: Dein nächster normaler Angriff macht 3,5-fachen Schaden.",
  },
  {
    id: "staff-4",
    weapon: "staff",
    tier: 4,
    name: "Kettenblitz",
    icon: "⚡",
    manaCost: 40,
    cooldown: 3,
    multiplier: 1.3,
    ignoreArmor: true,
    aoe: { splash: 0.6 },
    description: "Ein Blitz mit 1,3-fachem Schaden, der Rüstung ignoriert – er springt auf alle anderen Gegner über (60 % Schaden).",
  },
  {
    id: "staff-5",
    weapon: "staff",
    tier: 5,
    name: "Arkane Heilung",
    icon: "💚",
    manaCost: 40,
    cooldown: 4,
    multiplier: 0,
    hits: 0,
    heal: 0.2,
    renew: { percent: 0.05, rounds: 3 },
    groupHeal: 0.5,
    description:
      "Statt anzugreifen: Du heilst dich sofort um 20 % deiner Lebenspunkte und 3 Runden lang um je 5 %. Im Koop heilt sie alle Mitspieler halb so stark.",
  },
  {
    id: "staff-6",
    weapon: "staff",
    tier: 6,
    name: "Arkaner Schild",
    icon: "🔮",
    manaCost: 20,
    cooldown: 3,
    multiplier: 0,
    hits: 0,
    guard: { reduce: 0.4 },
    manaGain: 15,
    description: "Statt anzugreifen: Ein Schild aus Magie – der nächste gegnerische Angriff macht 60 % weniger Schaden, und du gewinnst 15 Mana zurück.",
  },
  {
    id: "bow-4",
    weapon: "bow",
    tier: 4,
    name: "Jägermal",
    icon: "🎯",
    manaCost: 25,
    cooldown: 3,
    multiplier: 0.8,
    vulnerable: { percent: 0.2, rounds: 3 },
    description:
      "Ein Schuss mit 0,8-fachem Schaden markiert die Beute: 3 Runden lang erleidet sie 20 % mehr Schaden. Im Koop trifft die ganze Gruppe härter.",
  },
  {
    id: "bow-5",
    weapon: "bow",
    tier: 5,
    name: "Brandpfeil",
    icon: "🔥",
    manaCost: 30,
    cooldown: 2,
    multiplier: 1.1,
    burn: { percent: 0.3, rounds: 3 },
    description: "Ein brennender Pfeil mit 1,1-fachem Schaden – der Gegner brennt 3 Runden lang.",
  },
  {
    id: "bow-6",
    weapon: "bow",
    tier: 6,
    name: "Kopfschuss",
    icon: "🦅",
    manaCost: 40,
    cooldown: 4,
    multiplier: 1.5,
    guaranteedCrit: true,
    description: "Ein Schuss genau zwischen die Augen: 1,5-facher Schaden, trifft immer kritisch.",
  },
];

export function getAbility(id: AbilityId): AbilityDef {
  const ability = ABILITIES.find((a) => a.id === id);
  if (!ability) throw new Error(`Unbekannte Fähigkeit: ${id}`);
  return ability;
}

/** Fähigkeiten eines Waffentyps, erste zuerst. */
export function abilitiesOf(weapon: SkillWeapon): AbilityDef[] {
  return ABILITIES.filter((a) => a.weapon === weapon);
}

/** So viele Fähigkeiten trägt eine Waffe: die Hälfte ihres Pools – Einhand 2 von 4, Zweihand 3 von 6. */
export function abilitySlots(weapon: SkillWeapon): number {
  return abilitiesOf(weapon).length / 2;
}

/** Die Fähigkeiten einer Waffe – fest aus ihrer uid gewürfelt, in der Reihenfolge des Pools. */
export function rollWeaponAbilities(uid: string, weapon: SkillWeapon): AbilityId[] {
  const rng = seededRng(hash(`abilities|${uid}`));
  const pool = abilitiesOf(weapon).map((a) => a.id);
  const picked = new Set<AbilityId>();
  while (picked.size < abilitySlots(weapon)) picked.add(pool[Math.floor(rng() * pool.length)]);
  return pool.filter((id) => picked.has(id));
}

/** Ist das eine bekannte Fähigkeits-Id? (für Daten von aussen, z. B. Koop-Befehle) */
export function isAbilityId(id: unknown): id is AbilityId {
  return typeof id === "string" && ABILITIES.some((a) => a.id === id);
}
