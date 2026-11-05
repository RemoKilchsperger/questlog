// Wege durch die Dungeons (docs/dungeon-wege.md): Nach dem Eingangskampf wählt man an
// jeder Gabelung eine Tür – Kampf, Elite-Raum, Schrein, Händler, Falle oder Rätsel.
// Zwischenboss und Endboss bleiben an ihrem Platz. Reine Logik – der Lauf steht im
// Store (`dungeon`), gekämpft wird mit combat.ts.

import type { AreaDef, CreatureDef } from "./creatures";
import { ELITE_AFFIXES, type EliteAffix } from "./elites";
import { getPotion, THROW_POTIONS } from "./potions";
import { hash, seededRng } from "./random";
import { blessingOffer, type BlessingId } from "./tower";
import type { ArmorClass } from "./types";

/** `treasure`: verborgener Raum einer Schatzkarte (treasureMaps.ts) – nie an einer gewöhnlichen Gabelung */
export type RoomKind = "fight" | "elite" | "shrine" | "merchant" | "trap" | "riddle" | "treasure";

export interface RoomDef {
  kind: RoomKind;
  name: string;
  icon: string;
  /** Was man vor der Tür über den Raum weiss */
  description: string;
}

export const ROOMS: Record<RoomKind, RoomDef> = {
  fight: { kind: "fight", name: "Kampf", icon: "⚔️", description: "Ein Bewohner des Dungeons stellt sich dir in den Weg." },
  elite: { kind: "elite", name: "Elite-Raum", icon: "💀", description: "Hier wartet ein Elite-Gegner – gefährlich, aber mit sicherer Beute." },
  shrine: { kind: "shrine", name: "Schrein", icon: "⛩️", description: "Ein stiller Ort. Ein Segen begleitet dich bis zum Ende des Dungeons." },
  merchant: { kind: "merchant", name: "Händler", icon: "🛒", description: "Ein wandernder Händler – teuer, aber er hat, was man unterwegs braucht." },
  trap: { kind: "trap", name: "Falle", icon: "🪤", description: "Ein Gang voller Fallen. Dahinter liegt etwas Wertvolles." },
  riddle: { kind: "riddle", name: "Rätsel", icon: "🧩", description: "Eine Inschrift stellt eine Frage. Wer richtig antwortet, wird belohnt." },
  treasure: { kind: "treasure", name: "Schatzraum", icon: "🗺️", description: "Deine Schatzkarte führt hierher. Ein legendäres Item oder ein Rezept wartet." },
};

/** Räume, die an Gabelungen ausgelost werden – der Schatzraum kommt nur über eine Karte dazu. */
export const FORK_ROOMS: readonly RoomDef[] = Object.values(ROOMS).filter((r) => r.kind !== "treasure");

/** Räume ohne (sicheren) Kampf – höchstens einer pro Abschnitt */
export const CALM_ROOMS: readonly RoomKind[] = ["shrine", "merchant", "trap", "riddle"];
export const isCalm = (kind: RoomKind) => CALM_ROOMS.includes(kind);

/** Gewichte beim Auslosen der Türen */
const ROOM_WEIGHTS: Record<Exclude<RoomKind, "treasure">, number> = { fight: 30, elite: 20, shrine: 12, merchant: 12, trap: 13, riddle: 13 };

/** Chance, dass eine Tür verschlossen ist (❓) – man sieht erst drinnen, was dahinter liegt. */
export const HIDDEN_DOOR_CHANCE = 0.2;

export interface Door {
  kind: RoomKind;
  /** Verschlossene Tür: die Raumart zeigt sich erst beim Eintreten */
  hidden: boolean;
}

/* ───────────── Ablauf ───────────── */

/**
 * Schritte eines Dungeons: Eingang (immer ein Kampf), Gabelungen, Zwischenboss und Endboss an
 * ihrem Platz in `creatures`. Die Anzahl der Schritte bleibt wie bisher (acht).
 */
export type StepKind = "start" | "fork" | "midBoss" | "boss";

export function stepKind(dungeon: AreaDef, step: number): StepKind {
  const creature = dungeon.creatures[step];
  if (step === 0) return "start";
  if (creature.boss) return "boss";
  if (creature.midBoss) return "midBoss";
  return "fork";
}

/** Abschnitt eines Schritts: 0 bis zum Zwischenboss, 1 danach. */
export function sectionOf(dungeon: AreaDef, step: number): 0 | 1 {
  const mid = dungeon.creatures.findIndex((c) => c.midBoss);
  return step <= mid ? 0 : 1;
}

/** Zufall eines Laufs für einen Schritt – gleich beim Neuladen (Startwert aus Lauf und Schritt). */
export const stepRng = (seed: string, step: number, what: string) => seededRng(hash(`${seed}|${step}|${what}`));

/** Die gewöhnlichen Gegner eines Dungeons (jeder einmal). */
export function dungeonMobs(dungeon: AreaDef): CreatureDef[] {
  return dungeon.creatures
    .filter((c) => !c.boss && !c.midBoss)
    .filter((c, i, all) => all.findIndex((o) => o.id === c.id) === i);
}

/** Gegner eines Schritts: Zwischen- und Endboss an ihrem Platz, sonst ein zufälliger Gegner des Dungeons. */
export function stepCreature(dungeon: AreaDef, seed: string, step: number): CreatureDef {
  const kind = stepKind(dungeon, step);
  if (kind === "boss" || kind === "midBoss") return dungeon.creatures[step];
  const mobs = dungeonMobs(dungeon);
  return mobs[Math.floor(stepRng(seed, step, "creature")() * mobs.length)];
}

/**
 * Türen an einer Gabelung: zwei oder drei verschiedene Räume, immer mindestens ein Kampf
 * (gewöhnlich oder Elite). `calmAllowed`: Im Abschnitt war noch kein Raum ohne Kampf – sonst
 * stehen nur Kämpfe zur Wahl.
 */
export function forkDoors(seed: string, step: number, calmAllowed: boolean): Door[] {
  const rng = stepRng(seed, step, "doors");
  const count = rng() < 0.5 ? 2 : 3;
  type ForkRoom = keyof typeof ROOM_WEIGHTS;
  const pick = (pool: ForkRoom[]): ForkRoom => {
    const total = pool.reduce((sum, k) => sum + ROOM_WEIGHTS[k], 0);
    let roll = rng() * total;
    for (const kind of pool) {
      roll -= ROOM_WEIGHTS[kind];
      if (roll < 0) return kind;
    }
    return pool[pool.length - 1];
  };
  const kinds: ForkRoom[] = [pick(["fight", "elite"])];
  const rest = (Object.keys(ROOM_WEIGHTS) as ForkRoom[]).filter((k) => (calmAllowed || !isCalm(k)) && !kinds.includes(k));
  while (kinds.length < count && rest.length > 0) {
    const kind = pick(rest);
    kinds.push(kind);
    rest.splice(rest.indexOf(kind), 1);
  }
  // Mischen, damit der Kampf nicht immer links steht
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds.map((kind) => ({ kind, hidden: rng() < HIDDEN_DOOR_CHANCE }));
}

/** Elite-Raum: ein Modifikator vor dem Zwischenboss, zwei danach. */
export function eliteRoomAffixes(dungeon: AreaDef, seed: string, step: number): EliteAffix[] {
  const rng = stepRng(seed, step, "elite");
  const pool = ELITE_AFFIXES.map((a) => a.id);
  const count = sectionOf(dungeon, step) === 0 ? 1 : 2;
  const picked: EliteAffix[] = [];
  while (picked.length < count) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return picked;
}

/* ───────────── Schrein ───────────── */

/** Drei Segen zur Wahl (dieselben wie im Endlos-Turm). */
export function shrineOffer(seed: string, step: number, taken: readonly BlessingId[]): BlessingId[] {
  return blessingOffer(seed, step, taken);
}

/* ───────────── Händler ───────────── */

export type MerchantOffer =
  | { kind: "potion"; potionId: string; price: number }
  | { kind: "care"; percent: number; price: number }
  | { kind: "blessing"; blessing: BlessingId; price: number };

/** Der Händler im Dungeon verlangt mehr als der im Dorf. */
export const MERCHANT_MARKUP = 1.5;
/** Wundversorgung: heilt so viel der Lebenspunkte */
export const CARE_HEAL = 0.4;

/** Heiltrank, den der Händler in diesem Dungeon führt – passend zum Level. */
export function merchantHealPotion(dungeon: AreaDef): string {
  return dungeon.minLevel > 40 ? "large" : dungeon.minLevel >= 20 ? "medium" : "small";
}

/**
 * Angebot des Händlers: ein Heiltrank und ein Wurftrank (je einmal kaufbar), Wundversorgung und ein
 * Segen. Bezahlt wird mit dem eigenen Gold. Die Preise richten sich nach dem Heiltrank des Dungeons.
 */
export function merchantOffers(dungeon: AreaDef, seed: string, step: number, taken: readonly BlessingId[]): MerchantOffer[] {
  const rng = stepRng(seed, step, "merchant");
  const heal = getPotion(merchantHealPotion(dungeon));
  const throwable = THROW_POTIONS[Math.floor(rng() * THROW_POTIONS.length)];
  const [blessing] = blessingOffer(seed, step, taken, 1);
  const unit = heal.price * MERCHANT_MARKUP;
  return [
    { kind: "potion", potionId: heal.id, price: Math.round(unit) },
    { kind: "potion", potionId: throwable.id, price: Math.round(throwable.price * MERCHANT_MARKUP) },
    { kind: "care", percent: CARE_HEAL, price: Math.round(unit * 2) },
    { kind: "blessing", blessing, price: Math.round(unit * 5) },
  ];
}

/* ───────────── Falle ───────────── */

export interface TrapDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const TRAPS: readonly TrapDef[] = [
  { id: "spears", name: "Speerfalle", icon: "🗡️", text: "Eine Platte gibt unter deinem Fuss nach – aus den Wänden schiessen Speere." },
  { id: "pit", name: "Fallgrube", icon: "🕳️", text: "Der Boden bricht weg, unten blitzen spitze Pfähle." },
  { id: "darts", name: "Giftpfeile", icon: "🎯", text: "Aus winzigen Löchern in der Wand zischen Pfeile." },
  { id: "boulder", name: "Rollender Fels", icon: "🪨", text: "Ein Felsbrocken donnert den Gang hinunter, genau auf dich zu." },
  { id: "collapse", name: "Einsturz", icon: "🧱", text: "Die Decke ächzt – dann prasseln Steine herab." },
];

export type TrapChoice = "dodge" | "endure";

/** Schaden der Falle, wenn sie voll trifft – Anteil der maximalen Lebenspunkte. */
export const TRAP_DAMAGE = 0.25;
/** Ausweichen: Chance je Rüstungsklasse – leichte Rüstung ist flink. */
export const TRAP_DODGE: Record<ArmorClass, number> = { light: 0.7, medium: 0.55, heavy: 0.3 };
/** Einstecken: Anteil des Schadens je Rüstungsklasse – schwere Rüstung hält viel ab. */
export const TRAP_ENDURE: Record<ArmorClass, number> = { light: 1, medium: 0.7, heavy: 0.4 };

/** Rüstungsklasse mit den meisten Teilen – ohne Rüstung zählt man als leicht, bei Gleichstand die mittlere. */
export function mainArmorClass(pieces: Record<ArmorClass, number>): ArmorClass {
  const max = Math.max(pieces.light, pieces.medium, pieces.heavy);
  if (max === 0) return "light";
  if (pieces.medium === max) return "medium";
  return pieces.heavy === max ? "heavy" : "light";
}

/** Was die Falle anrichtet: Schaden in Lebenspunkten (mindestens 1 LP bleibt immer). */
export function trapOutcome(
  choice: TrapChoice,
  armorClass: ArmorClass,
  maxHp: number,
  hp: number,
  rng: () => number,
): { dodged: boolean; damage: number } {
  const full = maxHp * TRAP_DAMAGE;
  const dodged = choice === "dodge" && rng() < TRAP_DODGE[armorClass];
  const raw = dodged ? 0 : Math.round(full * (choice === "endure" ? TRAP_ENDURE[armorClass] : 1));
  return { dodged, damage: Math.min(raw, hp - 1) };
}

/* ───────────── Rätsel ───────────── */

export interface RiddleDef {
  id: string;
  text: string;
  answer: string;
  wrong: readonly [string, string];
  /** Was bei einer falschen Antwort passiert: Schaden oder ein Wächter erwacht (Kampf) */
  failure: "damage" | "guardian";
}

export const RIDDLES: readonly RiddleDef[] = [
  { id: "map", text: "Ich habe Städte, aber keine Häuser, Wälder, aber keine Bäume, und Flüsse ohne Wasser.", answer: "Eine Karte", wrong: ["Ein Traum", "Ein Spiegel"], failure: "damage" },
  { id: "steps", text: "Je mehr du davon machst, desto mehr lässt du hinter dir.", answer: "Schritte", wrong: ["Schulden", "Feinde"], failure: "guardian" },
  { id: "name", text: "Es gehört dir, und doch gebrauchen es andere weit öfter als du.", answer: "Dein Name", wrong: ["Dein Schwert", "Dein Gold"], failure: "damage" },
  { id: "echo", text: "Ich spreche ohne Mund und höre ohne Ohren. In Höhlen bin ich zu Hause.", answer: "Das Echo", wrong: ["Der Wind", "Ein Geist"], failure: "guardian" },
  { id: "hole", text: "Je mehr man davon wegnimmt, desto grösser wird es.", answer: "Ein Loch", wrong: ["Ein Berg", "Der Hunger"], failure: "damage" },
  { id: "age", text: "Ich steige und steige und falle doch nie.", answer: "Das Alter", wrong: ["Der Rauch", "Der Mond"], failure: "guardian" },
  { id: "coffin", text: "Wer mich macht, will mich nicht. Wer mich kauft, braucht mich nicht. Wer mich braucht, sieht mich nicht.", answer: "Ein Sarg", wrong: ["Eine Krone", "Eine Wiege"], failure: "damage" },
  { id: "candle", text: "Je länger ich stehe, desto kürzer werde ich.", answer: "Eine Kerze", wrong: ["Ein Turm", "Ein Baum"], failure: "guardian" },
];

/** Schaden einer falschen Antwort (Anteil der maximalen Lebenspunkte). */
export const RIDDLE_DAMAGE = 0.2;

export function getRiddle(id: string): RiddleDef {
  const def = RIDDLES.find((r) => r.id === id);
  if (!def) throw new Error(`Unbekanntes Rätsel: ${id}`);
  return def;
}

export function getTrap(id: string): TrapDef {
  const def = TRAPS.find((t) => t.id === id);
  if (!def) throw new Error(`Unbekannte Falle: ${id}`);
  return def;
}

/** Eine Falle bzw. ein Rätsel, das in diesem Lauf noch nicht vorkam. */
function pickUnseen<T extends { id: string }>(list: readonly T[], seed: string, step: number, seen: readonly string[]): T {
  const fresh = list.filter((x) => !seen.includes(x.id));
  const pool = fresh.length > 0 ? fresh : list;
  return pool[Math.floor(stepRng(seed, step, "room")() * pool.length)];
}

export const pickTrap = (seed: string, step: number, seen: readonly string[]) => pickUnseen(TRAPS, seed, step, seen);

/** Rätsel und Antworten in zufälliger Reihenfolge. */
export function pickRiddle(seed: string, step: number, seen: readonly string[]): { riddle: RiddleDef; options: string[] } {
  const riddle = pickUnseen(RIDDLES, seed, step, seen);
  const rng = stepRng(seed, step, "options");
  const options = [riddle.answer, ...riddle.wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { riddle, options };
}
