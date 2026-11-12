// Klassen-Kern (Modell C, docs/klassen-neukonzept.md 4.1–4.3): Jede Klasse hat eine Rolle, eine
// Klassenleiste mit 4 Ladungen, die sie auf ihre eigene Art füllt, und eine Signaturfähigkeit, die die
// volle Leiste verbraucht.
//
// Die Signatur ist für andere Systeme **keine Fähigkeit**: kein Mana, keine Abklingzeit, kein Echo,
// Nachhall, Blutmagie, keine Eröffnung oder Deckung, keine Mehrfachtreffer-Knoten, keine Konzentration
// (docs/skilltree-ueberarbeitung.md 5.1). Knoten, die von Treffer, Krit oder Aktion sprechen, gelten.
// Für Boss-Mechaniken ist sie immer sicher: kein Zurückwerfen, kein Verschlingen, kein Aufladen.
//
// Hier steht nur, *was* die Klassen können – als Daten und reine Funktionen. Solo (combat.ts) und Koop
// (coopCombat.ts) zählen die Auslöser einer Runde in einem `ChargeTally` und führen die Signatur aus.

import type { AbilityDef, AbilityId } from "./abilities";
import type { HeroClassId } from "./heroClasses";
import type { DamageKind } from "./matchups";
import type { SkillWeapon } from "./skills";

export type ClassRole = "damage" | "tank" | "healer" | "support" | "control";

export const ROLE_LABELS: Readonly<Record<ClassRole, { name: string; icon: string }>> = {
  damage: { name: "Schaden", icon: "⚔️" },
  tank: { name: "Tank", icon: "🛡️" },
  healer: { name: "Heiler", icon: "💚" },
  support: { name: "Unterstützung", icon: "📯" },
  control: { name: "Kontrolle", icon: "💫" },
};

/** Grösse der Klassenleiste – für alle Klassen gleich. */
export const CHARGE_MAX = 4;
/** Höchstens so viele Ladungen pro Runde – die Fülldauer bleibt planbar, keine Ketten. */
export const CHARGE_PER_ROUND = 2;

/**
 * Was in einer Runde passiert ist – aus Sicht eines Helden. Solo und Koop füllen es, `chargeGain`
 * rechnet daraus die Ladungen. Ein Ereignis zählt für höchstens einen Auslöser derselben Klasse.
 */
export interface ChargeTally {
  /** Kritische Treffer des Helden */
  crits: number;
  /** … davon gegen ein markiertes Ziel (Waldläufer) */
  markedCrits: number;
  /** Er hat Schaden mit einem Treffer gemacht */
  dealt: boolean;
  /** Eingesetzte Waffen-Fähigkeit: ihre Waffe – null ohne */
  ability: SkillWeapon | null;
  /** … und sie heilt (Heiliges Licht, Läuterung, Arkane Heilung) */
  healAbility: boolean;
  /** Treffer, die ihn erreicht haben (auch wenn der Schild sie geschluckt hat) */
  hitsTaken: number;
  /** Abgewehrt, geblockt, pariert oder in Duellhaltung gemindert */
  guarded: boolean;
  /** Bollwerk hat einen Angriff geblockt */
  bulwarkBlock: boolean;
  /** Eigenes Gift, Feuer oder Bluten hat an einem Gegner gewirkt */
  dotTicked: boolean;
  /** Eigenes Bluten hat an einem Gegner gewirkt (das Ziel blutet) */
  bleedTicked: boolean;
  /** Gelandete Betäubungen (auch Einfrieren) – … */
  stuns: number;
  /** … davon Einfrieren (Eisstrahl, Frostbiss, Frostflasche) */
  freezes: number;
  /** Gelandete Schwächungen */
  weakens: number;
  /** Zweitschläge des Duellanten */
  extraHits: number;
  /** Konter (Parade, Vergeltung, Konterstellung, Duellhaltung) */
  counters: number;
  /** Gefallene Gegner (Boss und Begleiter) */
  foesDown: number;
  /** … davon mit eigenem Gift oder Feuer */
  dotFoesDown: number;
  /** Unter 50 % LP am Rundenende (Berserker: Auslöser zählen doppelt) */
  low: boolean;
  /** In dieser Runde die Signatur eingesetzt – die Runde lädt nicht */
  signature: boolean;
}

export const emptyTally = (): ChargeTally => ({
  crits: 0,
  markedCrits: 0,
  dealt: false,
  ability: null,
  healAbility: false,
  hitsTaken: 0,
  guarded: false,
  bulwarkBlock: false,
  dotTicked: false,
  bleedTicked: false,
  stuns: 0,
  freezes: 0,
  weakens: 0,
  extraHits: 0,
  counters: 0,
  foesDown: 0,
  dotFoesDown: 0,
  low: false,
  signature: false,
});

/** Ein Auslöser der Leiste – was er zählt, steht in `TRIGGER_COUNT`. */
export type ChargeTrigger =
  | "round"
  | "dealt"
  | "crit"
  | "markedCrit"
  | "ability"
  | "weaponAbility"
  | "healAbility"
  | "tookHit"
  | "wounded"
  | "untouched"
  | "hitOrGuarded"
  | "bulwarkBlock"
  | "dotTicked"
  | "bleedTicked"
  | "stun"
  | "freeze"
  | "weaken"
  | "extraHit"
  | "counter"
  | "foeDown"
  | "dotFoeDown";

const TRIGGER_COUNT: Readonly<Record<ChargeTrigger, (t: ChargeTally, weapon: SkillWeapon | undefined) => number>> = {
  round: () => 1,
  dealt: (t) => (t.dealt ? 1 : 0),
  crit: (t) => t.crits,
  markedCrit: (t) => t.markedCrits,
  ability: (t) => (t.ability ? 1 : 0),
  weaponAbility: (t, weapon) => (t.ability !== null && t.ability === weapon ? 1 : 0),
  healAbility: (t) => (t.healAbility ? 1 : 0),
  tookHit: (t) => t.hitsTaken,
  wounded: (t) => (t.hitsTaken > 0 ? 1 : 0),
  untouched: (t) => (t.hitsTaken === 0 ? 1 : 0),
  hitOrGuarded: (t) => (t.hitsTaken > 0 || t.guarded ? 1 : 0),
  bulwarkBlock: (t) => (t.bulwarkBlock ? 1 : 0),
  dotTicked: (t) => (t.dotTicked ? 1 : 0),
  bleedTicked: (t) => (t.bleedTicked ? 1 : 0),
  stun: (t) => t.stuns,
  freeze: (t) => t.freezes,
  weaken: (t) => t.weakens,
  extraHit: (t) => t.extraHits,
  counter: (t) => t.counters,
  foeDown: (t) => t.foesDown,
  dotFoeDown: (t) => t.dotFoesDown,
};

/** Die Signaturfähigkeit einer Klasse – Treffer wie eine Fähigkeit, dazu ihre eigene Wirkung. */
export interface SignatureDef {
  name: string;
  icon: string;
  description: string;
  /** Faktor auf den Heldenschaden pro Treffer (D) */
  multiplier: number;
  hits?: number;
  /** Treffer unter 50 % LP statt `hits` (Entfesseln) */
  frenzyHits?: number;
  /** Trifft alle Gegner */
  aoe?: "all";
  /** Schadensart – unabhängig von der Waffe */
  kind: DamageKind;
  /** Zählt auch als diese Art, wenn das wirksamer ist */
  altKind?: DamageKind;
  /** Zählt als Feuer statt Magie, wenn das gegen das Ziel wirksamer ist (Arkane Entladung) */
  fireOrMagic?: boolean;
  ignoreArmor?: boolean;
  guaranteedCrit?: boolean;
  /** Bricht Aufladen immer ab */
  interrupt?: boolean;
  execute?: { threshold: number; factor: number };
  bleedBonus?: number;
  /** Lebensraub – zusätzlich zum Lebensraub der Klasse */
  lifesteal?: number;
}

export interface ClassKit {
  roles: readonly [ClassRole] | readonly [ClassRole, ClassRole];
  passive: { name: string; text: string };
  /** Name der Leiste und wie sie sich füllt */
  gauge: { name: string; text: string };
  /** Ladungen pro Auslöser – zusammen höchstens CHARGE_PER_ROUND pro Runde */
  charge: Partial<Record<ChargeTrigger, number>>;
  /** Waffe für den Auslöser „weaponAbility“ */
  weapon?: SkillWeapon;
  signature: SignatureDef;
}

/* ───────────── Werte der Signaturen ───────────── */

/** Assassine „Halsschnitt“: gegen Ziele unter 30 % LP so viel stärker. */
export const ASSASSIN_THROAT = { threshold: 0.3, factor: 1.5 };
/** Hexer „Seelenernte“: heilt um diesen Anteil der geernteten DoTs, im Koop verflucht das Ziel (+10 %, 2 Runden). */
export const WARLOCK_HARVEST = { selfHeal: 0.25, rounds: 1, curse: { percent: 0.1, rounds: 2 } };
/** Waldläufer „Beute markieren“: erlittener Schaden des Ziels +15 % für 3 Runden (höherer Wert zählt). */
export const RANGER_MARK = { percent: 0.15, rounds: 3 };
/** Duellant „Duell“: so viele Gegnerzüge Duellhaltung – Treffer × 0,7, Konter mit 0,6 D. */
export const DUELIST_DUEL = { rounds: 2, reduce: 0.7, counter: 0.6 };
/** Kleriker „Gebet“: Heilung sich selbst, im Koop die Mitspieler; Wiederbeleben mit 25 % LP. */
export const CLERIC_PRAYER = { self: 0.08, group: 0.15, revive: 0.25 };
/**
 * Paladin „Richtspruch“: 40 % des seit dem letzten Richtspruch abgewehrten, geblockten oder geminderten
 * Schadens kommen dazu, höchstens 1,5 D. Im Koop bekommen die Mitspieler einen Schild von 10 % ihrer LP
 * (gemeinsamer Schild-Topf `ward`, höchstens WARD_MAX_SHARE).
 */
export const PALADIN_VERDICT = { share: 0.4, cap: 1.5, groupShield: 0.1 };
/** Berserker „Entfesseln“: kostet diesen Anteil der aktuellen LP (keine Blutmagie). */
export const BERSERKER_UNLEASH_COST = 0.1;
/** Champion „Kampfbanner“: 3 Runden +15 % Schaden für ihn, im Koop +10 % für die Mitspieler. */
export const CHAMPION_BANNER = { self: 0.15, group: 0.1, rounds: 3 };
/** Wächter „Bergbrecher“: Ist das Ziel gegen Betäubung immun, macht es 2 Runden 30 % weniger Schaden. */
export const WARDEN_BREAKER_WEAKEN = { percent: 0.3, rounds: 2 };

export const CLASS_KITS: Readonly<Record<HeroClassId, ClassKit>> = {
  mage: {
    roles: ["damage", "control"],
    passive: { name: "Arkane Effizienz", text: "Fähigkeiten kosten 20 % weniger Mana." },
    gauge: { name: "Arkane Ladung", text: "+2 pro eingesetzter Fähigkeit, +1 wenn ein Gegner einfriert." },
    charge: { ability: 2, freeze: 1 },
    signature: {
      name: "Arkane Entladung",
      icon: "🌟",
      description: "1,8-facher Schaden, ignoriert Rüstung, zählt als Feuer oder Magie (was wirksamer ist) und bricht Aufladen immer ab.",
      multiplier: 1.8,
      kind: "magic",
      fireOrMagic: true,
      ignoreArmor: true,
      interrupt: true,
    },
  },
  warlock: {
    roles: ["damage", "support"],
    passive: {
      name: "Verderbnis",
      text: "+5 % Schaden; eigenes Gift, Feuer und Bluten +40 % und 1 Runde länger. Wandelbare Flüche: Ist das Ziel gegen Gift immun, wird es Feuer mit 60 % der Stärke (und umgekehrt).",
    },
    gauge: {
      name: "Seelen",
      text: "+1 pro Runde, in der eines deiner DoTs wirkt, +2 pro Zepter-Fähigkeit, +1 wenn ein vergifteter oder brennender Gegner fällt.",
    },
    charge: { dotTicked: 1, weaponAbility: 2, dotFoeDown: 1 },
    weapon: "scepter",
    signature: {
      name: "Seelenernte",
      icon: "👻",
      description:
        "Ein Treffer mit 0,7-fachem Schaden, dann wirkt jedes deiner DoTs am Ziel sofort eine Runde (die Laufzeit bleibt). Heilt dich um 25 % davon. Im Koop ist das Ziel 2 Runden verflucht: +10 % Schaden von allen.",
      multiplier: 0.7,
      kind: "magic",
    },
  },
  assassin: {
    roles: ["damage"],
    passive: { name: "Meuchler", text: "+10 % Krit-Chance, kritische Treffer machen den 2-fachen Schaden. Im Koop erzeugen Krits nur halbe Bedrohung." },
    gauge: { name: "Schwachstelle", text: "+1 pro kritischem Treffer, +2 pro Dolch-Fähigkeit." },
    charge: { crit: 1, weaponAbility: 2 },
    weapon: "dagger",
    signature: {
      name: "Halsschnitt",
      icon: "🔪",
      description: "0,8-facher Schaden, trifft sicher kritisch und ignoriert Rüstung – gegen Ziele unter 30 % LP 1,5-fach.",
      multiplier: 0.8,
      kind: "pierce",
      guaranteedCrit: true,
      ignoreArmor: true,
      execute: ASSASSIN_THROAT,
    },
  },
  ranger: {
    roles: ["damage", "support"],
    passive: { name: "Fernkämpfer", text: "+8 % Schaden, Pfeilhagel schiesst 5 statt 4 Pfeile." },
    gauge: {
      name: "Fokus",
      text: "+1 pro Runde mit Treffer, +1 pro Runde, in der dich nichts trifft, +1 pro Bogen-Fähigkeit, +1 pro Krit gegen markierte Ziele.",
    },
    charge: { dealt: 1, untouched: 1, weaponAbility: 1, markedCrit: 1 },
    weapon: "bow",
    signature: {
      name: "Beute markieren",
      icon: "🎯",
      description: "Ein Schuss mit 1,2-fachem Schaden, danach ist das Ziel 3 Runden markiert: +15 % erlittener Schaden (im Koop von allen; der höhere Wert mit Jägermal zählt).",
      multiplier: 1.2,
      kind: "pierce",
    },
  },
  duelist: {
    roles: ["damage", "tank"],
    passive: { name: "Fechtkunst", text: "+10 % Schaden, 40 % Chance auf einen zweiten Schlag bei normalen Angriffen." },
    gauge: { name: "Rhythmus", text: "+1 pro Zweitschlag, +1 pro Konter, +2 pro Schwert-Fähigkeit." },
    charge: { extraHit: 1, counter: 1, weaponAbility: 2 },
    weapon: "sword",
    signature: {
      name: "Duell",
      icon: "🤺",
      description:
        "Ein Hieb mit 1-fachem Schaden, danach 2 Runden Duellhaltung: Angriffe des Bosses machen 30 % weniger Schaden, und du konterst jeden mit 0,6-fachem Schaden. Im Koop zieht sie die Angriffe auf dich wie Bollwerk.",
      multiplier: 1,
      kind: "blade",
    },
  },
  plunderer: {
    roles: ["damage"],
    passive: { name: "Beutezug", text: "+15 % Schaden, 8 % Lebensraub, kritische Treffer lassen 2 Runden bluten, +25 % Gold." },
    gauge: { name: "Gier", text: "+1 pro Runde, in der dein Bluten wirkt, +1 pro Krit, +2 pro Axt-Fähigkeit." },
    charge: { bleedTicked: 1, crit: 1, weaponAbility: 2 },
    weapon: "axe",
    signature: {
      name: "Ausweiden",
      icon: "🩸",
      description: "1,4-facher Schaden, gegen blutende Gegner 1,5-fach, heilt dich um 50 % des Schadens.",
      multiplier: 1.4,
      kind: "blade",
      bleedBonus: 0.5,
      lifesteal: 0.5,
    },
  },
  cleric: {
    roles: ["healer", "support"],
    passive: {
      name: "Frömmigkeit",
      text: "Heilt dich jede Runde um 2 % der LP, Heiltränke wirken 15 % stärker, im Koop heilen Heiliges Licht und Läuterung alle Mitspieler halb so stark mit.",
    },
    gauge: { name: "Glaube", text: "+1 pro Runde, +1 pro Heilfähigkeit (Heiliges Licht, Läuterung, Arkane Heilung)." },
    charge: { round: 1, healAbility: 1 },
    signature: {
      name: "Gebet",
      icon: "🕯️",
      description:
        "Heilt dich um 8 % der LP, entfernt Gift, Feuer und Bluten und trifft mit 0,6-fachem Schaden (Wucht oder Magie). Im Koop heilt es alle Mitspieler um 15 %, reinigt sie und belebt einen Gefallenen mit 25 % LP wieder.",
      multiplier: 0.6,
      kind: "blunt",
      altKind: "magic",
    },
  },
  paladin: {
    roles: ["tank", "healer"],
    passive: {
      name: "Schildeid",
      text: "+10 % Schaden, +20 % Rüstung, Bollwerk kostet die Hälfte, Bollwerk und Vergeltung schlagen mit halbem Schaden zu (Schildstoss), im Koop doppelte Bedrohung. Geweihte Klinge: Ein Schwert skaliert beim Paladin mit Ausdauer.",
    },
    gauge: { name: "Entschlossenheit", text: "+1 pro Runde, in der du getroffen wirst oder abwehrst, blockst oder parierst, +1 für einen Bollwerk-Block." },
    charge: { hitOrGuarded: 1, bulwarkBlock: 1 },
    signature: {
      name: "Richtspruch",
      icon: "⚖️",
      description:
        "Ein Wuchtschlag mit 1-fachem Schaden plus 40 % des Schadens, den du seit dem letzten Richtspruch abgewehrt, geblockt oder gemindert hast (höchstens +1,5-fach). Im Koop bekommen alle Mitspieler einen Schild von 10 % ihrer LP.",
      multiplier: 1,
      kind: "blunt",
    },
  },
  berserker: {
    roles: ["damage"],
    passive: { name: "Blutzorn", text: "+10 % Schaden, unter 50 % LP weitere +20 %, 8 % Lebensraub." },
    gauge: { name: "Wut", text: "+1 pro Runde, in der du getroffen wirst, +1 pro Krit – unter 50 % LP zählt alles doppelt." },
    charge: { wounded: 1, crit: 1 },
    signature: {
      name: "Entfesseln",
      icon: "😡",
      description: "Kostet 10 % deiner aktuellen LP, dann 3 Hiebe mit je 0,45-fachem Schaden (unter 50 % LP: 4), jeder kann kritisch treffen, 20 % Lebensraub.",
      multiplier: 0.45,
      hits: 3,
      frenzyHits: 4,
      kind: "blade",
      lifesteal: 0.2,
    },
  },
  champion: {
    roles: ["damage", "support"],
    passive: { name: "Vorkämpfer", text: "+8 % Schaden, +10 % Lebenspunkte." },
    gauge: { name: "Ruhm", text: "+1 pro Runde mit Treffer, +1 pro Krit, +1 wenn ein Gegner fällt." },
    charge: { dealt: 1, crit: 1, foeDown: 1 },
    signature: {
      name: "Kampfbanner",
      icon: "🏳️",
      description: "Ein Hieb mit 1,2-fachem Schaden, dann steht 3 Runden ein Banner: +15 % Schaden für dich, im Koop +10 % für alle Mitspieler (Banner stapeln nicht).",
      multiplier: 1.2,
      kind: "blade",
    },
  },
  warden: {
    roles: ["control", "tank"],
    passive: { name: "Bergwacht", text: "+10 % Rüstung, Schwächungen wirken 1 Runde länger." },
    gauge: { name: "Beben", text: "+2 pro Grosshammer-Fähigkeit, +1 pro gelandeter Betäubung oder Schwächung." },
    charge: { weaponAbility: 2, stun: 1, weaken: 1 },
    weapon: "greathammer",
    signature: {
      name: "Bergbrecher",
      icon: "⛰️",
      description:
        "0,8-facher Wuchtschaden an alle Gegner, das Ziel ist sicher betäubt – ist es immun, macht es stattdessen 2 Runden 30 % weniger Schaden. Bricht Aufladen immer ab.",
      multiplier: 0.8,
      aoe: "all",
      kind: "blunt",
      interrupt: true,
    },
  },
};

export function classKit(id: HeroClassId): ClassKit {
  return CLASS_KITS[id];
}

/**
 * Ladungen einer Runde: die Auslöser der Klasse, beim Berserker unter 50 % LP doppelt – höchstens
 * CHARGE_PER_ROUND. Die Runde der Signatur lädt nicht (sonst füllten sicher kritische oder kontende
 * Signaturen sich selbst wieder an).
 */
export function chargeGain(heroClass: HeroClassId | null | undefined, tally: ChargeTally): number {
  if (!heroClass || tally.signature) return 0;
  const kit = CLASS_KITS[heroClass];
  let gain = 0;
  for (const [trigger, weight] of Object.entries(kit.charge) as [ChargeTrigger, number][]) gain += weight * TRIGGER_COUNT[trigger](tally, kit.weapon);
  if (heroClass === "berserker" && tally.low) gain *= 2;
  return Math.min(CHARGE_PER_ROUND, gain);
}

/** Neue Füllung der Leiste nach einer Runde. */
export const nextCharge = (charge: number, gain: number): number => Math.min(CHARGE_MAX, charge + gain);

/** Leiste voll? */
export const chargeFull = (charge: number | undefined): boolean => (charge ?? 0) >= CHARGE_MAX;

/** Warum die Signatur gerade nicht geht – oder null. */
export function signatureBlocker(heroClass: HeroClassId | null | undefined, charge: number | undefined): string | null {
  if (!heroClass) return "Ohne Klasse gibt es keine Signatur – trage 3 Rüstungsteile einer Klasse und die passende Waffe.";
  if (!chargeFull(charge)) return `Die Klassenleiste ist noch nicht voll (${charge ?? 0}/${CHARGE_MAX}).`;
  return null;
}

/**
 * Die Signatur als Fähigkeit für die Treffer (combatCore: strikeFactors, heroVolley) – ohne Mana und
 * Abklingzeit. Die Id ist nur ein Platzhalter: Ereignisse und Abklingzeiten nennen nie die Signatur als
 * Waffen-Fähigkeit, Solo und Koop melden sie mit dem Ereignis `signature`.
 */
export function signatureAbility(heroClass: HeroClassId, weapon: SkillWeapon | null | undefined): AbilityDef {
  const s = CLASS_KITS[heroClass].signature;
  return {
    id: "signature" as AbilityId,
    weapon: weapon ?? "sword",
    tier: 1,
    name: s.name,
    icon: s.icon,
    manaCost: 0,
    cooldown: 0,
    description: s.description,
    multiplier: s.multiplier,
    kind: s.kind,
    ...(s.hits && { hits: s.hits }),
    ...(s.frenzyHits && { frenzyHits: s.frenzyHits }),
    ...(s.aoe && { aoe: s.aoe }),
    ...(s.altKind && { altKind: s.altKind }),
    ...(s.fireOrMagic && { fireOrMagic: true }),
    ...(s.ignoreArmor && { ignoreArmor: true }),
    ...(s.guaranteedCrit && { guaranteedCrit: true }),
    ...(s.interrupt && { interrupt: true }),
    ...(s.execute && { execute: s.execute }),
    ...(s.bleedBonus && { bleedBonus: s.bleedBonus }),
    ...(s.lifesteal && { lifesteal: s.lifesteal }),
  };
}

/** Paladin: Zusatzfaktor des Richtspruchs aus abgewehrtem Schaden (`absorbed`) bei Heldenschaden `damage`. */
export function verdictBonus(absorbed: number | undefined, damage: number): number {
  if (!absorbed || damage <= 0) return 0;
  return Math.min(PALADIN_VERDICT.cap, (absorbed * PALADIN_VERDICT.share) / damage);
}

/** Berserker: LP-Kosten von Entfesseln – nie tödlich. */
export const unleashCost = (hp: number): number => Math.max(0, Math.min(hp - 1, Math.round(hp * BERSERKER_UNLEASH_COST)));

/** Kampfbanner: Faktor auf den Schaden – ab der Runde nach dem Aufstellen (`roundsLeft` ≤ Dauer). */
export function bannerShare(banner: { percent: number; roundsLeft: number } | undefined): number {
  return banner && banner.roundsLeft <= CHAMPION_BANNER.rounds ? banner.percent : 0;
}

/** Verwundbarkeit, bei der der höhere Wert zählt (Markierung, Fluch, Jägermal) – die längere Dauer bleibt beim höheren. */
export function strongerVulnerable(
  current: { percent: number; roundsLeft: number } | undefined,
  next: { percent: number; roundsLeft: number },
): { percent: number; roundsLeft: number } {
  if (!current || next.percent > current.percent) return next;
  if (next.percent === current.percent) return { percent: current.percent, roundsLeft: Math.max(current.roundsLeft, next.roundsLeft) };
  return current;
}
