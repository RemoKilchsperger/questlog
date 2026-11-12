// Skilltree: vier Pfade, die verändern, wie die Kampf-Mechaniken wirken – Krit, Bluten und
// Mehrfachtreffer (Klinge), Abwehren und Betäubung (Wehr), Mana und Elemente (Arkan), Gift
// und Überleben (Plage). Die Pfade hängen an keiner Waffe; die Fähigkeiten liegen
// weiterhin auf den Waffen selbst (abilities.ts).
//
// Regeln (docs/skilltree.md, Überarbeitung: docs/skilltree-ueberarbeitung.md):
// - Alle 2 Level gibt es einen Skillpunkt (Level 60: 30 Punkte).
// - Eine Stufe öffnet sich erst mit genug Punkten im selben Pfad (TIER_POINTS).
// - Viele Knoten brauchen einen Knoten darüber (`requires`, einer davon genügt).
// - Gabelungen (`fork`): pro Pfad auf Stufe 3 nur einer der beiden Knoten.
// - Meisterschaft: ganz unten, zwei pro Pfad als Gabel, nur eine im ganzen Baum. Sie öffnet bei
//   12 Punkten, die Pfade haben aber 18–20 Ränge davor – wer meistert, lässt bewusst etwas liegen.
// - `validateSkills` prüft gespeicherte Ränge gegen diese Regeln (Client und Koop-Server gleich).
// Gegen Gold lassen sich alle Skillpunkte zurücksetzen – sobald im Dorf ein
// Trainingsplatz steht, ausgebaut günstiger bis kostenlos.

import { getLevel } from "./leveling";
import type { Character, WeaponType } from "./types";
import { TRAINING_RESET_FACTOR, type BuildingTier } from "./village";

/** Alle Waffentypen inkl. Schild – für Fähigkeiten und Schadensarten. */
export type SkillWeapon = WeaponType;

export type SkillPath = "blade" | "guard" | "arcane" | "plague";

export type SkillId =
  // Klinge
  | "keenEdge"
  | "whirlingBlades"
  | "serratedEdge"
  | "adrenaline"
  | "bloodScent"
  | "reaper"
  | "piercing"
  | "bladeDance"
  | "executioner"
  | "bloodburst"
  | "thousandCuts"
  // Wehr
  | "ironSkin"
  | "cover"
  | "composure"
  | "concussion"
  | "riposte"
  | "rock"
  | "spikes"
  | "heavyBlow"
  | "interrupter"
  | "wrath"
  | "guardOath"
  // Arkan
  | "deepWell"
  | "concentration"
  | "kindling"
  | "manaFlow"
  | "opening"
  | "pyromancer"
  | "cryomancer"
  | "melt"
  | "afterglow"
  | "echo"
  | "bloodMagic"
  // Plage
  | "toughness"
  | "poisonedWeapons"
  | "venom"
  | "herbalism"
  | "antidote"
  | "creepingPoison"
  | "leech"
  | "phantom"
  | "bandage"
  | "plague"
  | "rot"
  | "lifebond";

export type SkillRanks = Partial<Record<SkillId, number>>;

/** Stufe 1–4 und die Meisterschaft (5). */
export type SkillTier = 1 | 2 | 3 | 4 | 5;

export interface SkillNode {
  id: SkillId;
  path: SkillPath;
  tier: SkillTier;
  /** Spalte im Baum: 0 links, 1 Mitte, 2 rechts */
  col: 0 | 1 | 2;
  name: string;
  icon: string;
  maxRank: number;
  /** Wirkung beim angegebenen Rang (1 bis maxRank) */
  text: (rank: number) => string;
  /** Mindestens einer dieser Knoten braucht einen Rang */
  requires?: SkillId[];
  /** Gabelung: nur einer der Knoten mit derselben Gabel – auf Stufe 3 und bei der Meisterschaft (`<pfad>-master`) */
  fork?: string;
}

export interface SkillPathDef {
  id: SkillPath;
  name: string;
  icon: string;
  theme: string;
}

export const SKILL_PATHS: readonly SkillPathDef[] = [
  { id: "blade", name: "Klinge", icon: "⚔️", theme: "Krit, Bluten, Mehrfachtreffer" },
  { id: "guard", name: "Wehr", icon: "🛡️", theme: "Abwehren, Konter, Betäubung" },
  { id: "arcane", name: "Arkan", icon: "🔮", theme: "Mana, Abklingzeiten, Elemente" },
  { id: "plague", name: "Plage", icon: "☠️", theme: "Gift, Tränke, Überleben" },
];

/**
 * Punkte im selben Pfad, ab denen eine Stufe offen ist – Index = Stufe. Die Meisterschaft öffnet bei 12,
 * die Pfade haben aber 18–20 Ränge davor: Wer meistert, lässt bewusst 6–8 Ränge liegen
 * (docs/skilltree-ueberarbeitung.md, Abschnitt 2).
 */
export const TIER_POINTS: Readonly<Record<SkillTier, number>> = { 1: 0, 2: 3, 3: 6, 4: 9, 5: 12 };

/**
 * Schild-Topf (`ward`) eines Helden: alle Quellen zusammen (Lebensband, später der Gruppenschild des
 * Paladins) höchstens so viel seiner max. LP. Er verfällt am Kampfende.
 */
export const WARD_MAX_SHARE = 0.15;

/** Alle Werte der Knoten an einer Stelle – pro Rang, wo der Knoten mehrere hat. */
export const SKILL = {
  keenEdge: 0.03,
  /** Wirbelnde Klingen: mehr Schaden für Fähigkeiten mit mindestens `multiHit` Treffern */
  whirlingBlades: 0.08,
  serratedEdge: 0.2,
  adrenaline: 2,
  bloodScent: 0.05,
  /** Anteil des Heldenschadens pro Runde – blutet der Gegner schon stärker, hält jenes Bluten `extend` Runden länger */
  reaper: { percent: 0.15, rounds: 2, extend: 1 },
  /** Klingentanz: der nächste normale Angriff nach einer Mehrfachtreffer-Fähigkeit */
  bladeDance: 0.1,
  executioner: { threshold: 0.3, bonus: 0.1 },
  /** So viele Runden Blutschaden auf einmal */
  bloodburst: 3,
  /** Tausend Schnitte: Stapel pro Treffer (Anteil des Heldenschadens pro Runde), Runden, höchstens so viele Stapel */
  thousandCuts: { percent: 0.08, rounds: 2, max: 5 },
  /** Ab so vielen Treffern zählt eine Fähigkeit als Mehrfachtreffer (Wirbelnde Klingen, Klingentanz, Tausend Schnitte) */
  multiHit: 2,
  ironSkin: 0.04,
  /** Deckung: so viel Mana weniger pro Rang für Fähigkeiten, die abwehren oder blocken – nie unter `floor` */
  cover: { mana: 5, floor: 5 },
  composure: 5,
  concussion: 0.08,
  riposte: 0.15,
  /** Abwehren mit Fels: so viel Schaden kommt noch durch */
  rock: 0.25,
  spikes: 0.5,
  heavyBlow: 0.06,
  interrupter: 15,
  wrath: { bonus: 0.08, max: 5 },
  /** Wächterschwur: Abwehren heilt `heal` der max. LP; im Koop hält der Held danach `share` der Bedrohung */
  guardOath: { heal: 0.04, share: 0.6 },
  deepWell: 5,
  /** Konzentration: Mana am Rundenende pro Rang, wenn der Held keine Fähigkeit eingesetzt hat */
  concentration: 2,
  kindling: 0.15,
  manaFlow: 1,
  /** Eröffnung: in den ersten `rounds` Runden kosten Fähigkeiten `share` pro Rang weniger */
  opening: { share: 0.25, rounds: 2 },
  pyromancer: { rounds: 1, taken: 0.15 },
  cryomancer: { chance: 0.2, taken: 0.25 },
  /** Schmelzen gegen Eingefrorene: Feuer-Fähigkeiten × `fire` (taut auf), alle anderen Treffer × `other` */
  melt: { fire: 1.6, other: 1.15 },
  /** Nachhall: Chance pro Rang, dass eine Fähigkeit kein Mana kostet */
  afterglow: 0.08,
  echo: { every: 3, share: 0.3 },
  /** Blutmagie: LP pro fehlendem Mana, nicht unter `floor` der max. LP – dafür `mana` weniger Mana-Maximum */
  bloodMagic: { hpPerMana: 2, floor: 0.25, mana: 0.15 },
  toughness: 0.02,
  /** Vergiftete Waffen: Chance pro Rang bei normalen Angriffen – Gift mit `percent` des Heldenschadens pro Runde */
  poisonedWeapons: { chance: 0.08, percent: 0.2, rounds: 3 },
  venom: 0.2,
  herbalism: 0.08,
  antidote: 0.1,
  poisonStacks: 3,
  leech: 0.02,
  phantom: 0.03,
  bandage: { threshold: 0.3, heal: 0.04 },
} as const;

const pct = (share: number) => `${Math.round(share * 100)} %`;

export const SKILL_TREE: readonly SkillNode[] = [
  /* ───────────── Klinge ───────────── */
  { id: "keenEdge", path: "blade", tier: 1, col: 0, name: "Scharfe Klingen", icon: "🔪", maxRank: 3,
    text: (r) => `+${pct(SKILL.keenEdge * r)} Krit-Chance.` },
  { id: "whirlingBlades", path: "blade", tier: 1, col: 1, name: "Wirbelnde Klingen", icon: "🌪️", maxRank: 2,
    text: (r) => `Fähigkeiten mit mindestens ${SKILL.multiHit} Treffern machen ${pct(SKILL.whirlingBlades * r)} mehr Schaden.` },
  { id: "serratedEdge", path: "blade", tier: 1, col: 2, name: "Gezahnte Klingen", icon: "🩸", maxRank: 3,
    text: (r) => `Bluten, das du verursachst, macht ${pct(SKILL.serratedEdge * r)} mehr Schaden.` },
  { id: "adrenaline", path: "blade", tier: 2, col: 0, name: "Adrenalin", icon: "⚡", maxRank: 3, requires: ["keenEdge", "whirlingBlades"],
    text: (r) => `Jeder kritische Treffer gibt dir ${SKILL.adrenaline * r} Mana.` },
  { id: "bloodScent", path: "blade", tier: 2, col: 2, name: "Blutgeruch", icon: "🐺", maxRank: 3, requires: ["serratedEdge", "whirlingBlades"],
    text: (r) => `+${pct(SKILL.bloodScent * r)} Krit-Chance gegen blutende Gegner.` },
  { id: "reaper", path: "blade", tier: 3, col: 0, name: "Schnitter", icon: "🌾", maxRank: 1, fork: "blade", requires: ["adrenaline", "bloodScent"],
    text: () =>
      `Deine kritischen Treffer lassen den Gegner ${SKILL.reaper.rounds} Runden bluten – mit jeder Waffe. Blutet er schon stärker, hält jenes Bluten ${SKILL.reaper.extend} Runde länger (einmal pro Runde).` },
  { id: "piercing", path: "blade", tier: 3, col: 2, name: "Durchschlag", icon: "🎯", maxRank: 1, fork: "blade", requires: ["adrenaline", "bloodScent"],
    text: () => "Deine kritischen Treffer ignorieren die Rüstung." },
  { id: "bladeDance", path: "blade", tier: 4, col: 0, name: "Klingentanz", icon: "🤺", maxRank: 2, requires: ["reaper", "piercing"],
    text: (r) => `Nach einer Fähigkeit mit mindestens ${SKILL.multiHit} Treffern macht dein nächster normaler Angriff ${pct(SKILL.bladeDance * r)} mehr Schaden.` },
  { id: "executioner", path: "blade", tier: 4, col: 2, name: "Hinrichter", icon: "🪓", maxRank: 3, requires: ["reaper", "piercing"],
    text: (r) => `+${pct(SKILL.executioner.bonus * r)} Schaden gegen Gegner unter ${pct(SKILL.executioner.threshold)} ihrer Lebenspunkte.` },
  { id: "bloodburst", path: "blade", tier: 5, col: 0, name: "Blutsturz", icon: "💥", maxRank: 1, fork: "blade-master", requires: ["bladeDance", "executioner"],
    text: () => `Läuft Bluten aus, platzt die Wunde: Der Gegner erleidet sofort den Blutschaden von ${SKILL.bloodburst} Runden.` },
  { id: "thousandCuts", path: "blade", tier: 5, col: 2, name: "Tausend Schnitte", icon: "🗡️", maxRank: 1, fork: "blade-master", requires: ["bladeDance", "executioner"],
    text: () =>
      `Jeder Treffer einer Fähigkeit mit mindestens ${SKILL.multiHit} Treffern legt einen Bluten-Stapel: ${pct(SKILL.thousandCuts.percent)} deines Schadens pro Runde, ${SKILL.thousandCuts.rounds} Runden. Bis ${SKILL.thousandCuts.max} Stapel, neue frischen die Dauer auf.` },

  /* ───────────── Wehr ───────────── */
  { id: "ironSkin", path: "guard", tier: 1, col: 0, name: "Eiserne Haut", icon: "🛡️", maxRank: 3,
    text: (r) => `+${pct(SKILL.ironSkin * r)} Rüstung.` },
  { id: "cover", path: "guard", tier: 1, col: 1, name: "Deckung", icon: "🧱", maxRank: 2,
    text: (r) =>
      `Fähigkeiten, die abwehren oder blocken (Parade, Bollwerk, Schildwall …), kosten ${SKILL.cover.mana * r} Mana weniger – nie unter ${SKILL.cover.floor}.` },
  { id: "composure", path: "guard", tier: 1, col: 2, name: "Gefasst", icon: "🧘", maxRank: 2,
    text: (r) => `Abwehren gibt ${SKILL.composure * r} Mana mehr.` },
  { id: "concussion", path: "guard", tier: 2, col: 0, name: "Erschütterung", icon: "💫", maxRank: 3, requires: ["ironSkin", "cover"],
    text: (r) => `Wen du betäubst oder einfrierst, der erleidet in der Runde danach ${pct(SKILL.concussion * r)} mehr Schaden von dir.` },
  { id: "riposte", path: "guard", tier: 2, col: 2, name: "Gegenschlag", icon: "⚔️", maxRank: 3, requires: ["composure", "cover"],
    text: (r) => `Nach dem Abwehren macht deine nächste Aktion ${pct(SKILL.riposte * r)} mehr Schaden.` },
  { id: "rock", path: "guard", tier: 3, col: 0, name: "Fels", icon: "🪨", maxRank: 1, fork: "guard", requires: ["concussion", "riposte"],
    text: () => `Beim Abwehren erleidest du nur noch ${pct(SKILL.rock)} statt 50 % des Schadens.` },
  { id: "spikes", path: "guard", tier: 3, col: 2, name: "Stachelwehr", icon: "🌵", maxRank: 1, fork: "guard", requires: ["concussion", "riposte"],
    text: () => `Wer dich trifft, während du abwehrst, erleidet ${pct(SKILL.spikes)} seines Schadens selbst.` },
  { id: "heavyBlow", path: "guard", tier: 4, col: 0, name: "Wuchtschlag", icon: "🔨", maxRank: 3, requires: ["rock", "spikes"],
    text: (r) => `Fähigkeiten, die nur mit einer Chance betäuben oder einfrieren, gelingen ${pct(SKILL.heavyBlow * r)} öfter.` },
  { id: "interrupter", path: "guard", tier: 4, col: 2, name: "Unterbrecher", icon: "✋", maxRank: 1, requires: ["rock", "spikes"],
    text: () => `Betäubst du einen Gegner, unterbrichst ein Ritual oder bringst einen Boss ins Taumeln, bekommst du ${SKILL.interrupter} Mana.` },
  { id: "wrath", path: "guard", tier: 5, col: 0, name: "Zorn des Bollwerks", icon: "🔥", maxRank: 1, fork: "guard-master", requires: ["heavyBlow", "interrupter"],
    text: () =>
      `Jede Runde, in der du einen Angriff abwehrst, blockst oder parierst, gibt dir einen Zorn-Stapel: +${pct(SKILL.wrath.bonus)} Schaden, höchstens ${SKILL.wrath.max}.` },
  { id: "guardOath", path: "guard", tier: 5, col: 2, name: "Wächterschwur", icon: "🔰", maxRank: 1, fork: "guard-master", requires: ["heavyBlow", "interrupter"],
    text: () =>
      `Abwehren heilt dich um ${pct(SKILL.guardOath.heal)} deiner Lebenspunkte. Im Koop ziehst du damit die Angriffe auf dich: Du hältst ${pct(SKILL.guardOath.share)} der Bedrohung der Gruppe.` },

  /* ───────────── Arkan ───────────── */
  { id: "deepWell", path: "arcane", tier: 1, col: 0, name: "Tiefer Brunnen", icon: "💧", maxRank: 3,
    text: (r) => `+${SKILL.deepWell * r} Mana.` },
  { id: "concentration", path: "arcane", tier: 1, col: 1, name: "Konzentration", icon: "🔋", maxRank: 3,
    text: (r) => `Setzt du in einer Runde keine Fähigkeit ein (Angriff oder Abwehren), bekommst du ${SKILL.concentration * r} Mana mehr.` },
  { id: "kindling", path: "arcane", tier: 1, col: 2, name: "Funkenflug", icon: "🔥", maxRank: 3,
    text: (r) => `Feuer, das du legst, macht ${pct(SKILL.kindling * r)} mehr Schaden.` },
  { id: "manaFlow", path: "arcane", tier: 2, col: 0, name: "Manafluss", icon: "🌊", maxRank: 3, requires: ["deepWell", "concentration"],
    text: (r) => `+${SKILL.manaFlow * r} Mana pro Runde.` },
  { id: "opening", path: "arcane", tier: 2, col: 2, name: "Eröffnung", icon: "✨", maxRank: 2, requires: ["kindling", "concentration"],
    text: (r) => `In den ersten ${SKILL.opening.rounds} Runden eines Kampfes kosten Fähigkeiten ${pct(SKILL.opening.share * r)} weniger Mana.` },
  { id: "pyromancer", path: "arcane", tier: 3, col: 0, name: "Pyromant", icon: "🌋", maxRank: 1, fork: "arcane", requires: ["manaFlow", "opening"],
    text: () => `Dein Feuer brennt ${SKILL.pyromancer.rounds} Runde länger, brennende Gegner erleiden ${pct(SKILL.pyromancer.taken)} mehr Schaden von dir.` },
  { id: "cryomancer", path: "arcane", tier: 3, col: 2, name: "Kryomant", icon: "❄️", maxRank: 1, fork: "arcane", requires: ["manaFlow", "opening"],
    text: () =>
      `Einfrieren gelingt ${pct(SKILL.cryomancer.chance)} öfter, eingefrorene Gegner erleiden in der Runde danach ${pct(SKILL.cryomancer.taken)} mehr Schaden von dir. Deine Betäubungen zählen als Einfrieren.` },
  { id: "melt", path: "arcane", tier: 4, col: 0, name: "Schmelzen", icon: "💦", maxRank: 1, requires: ["pyromancer", "cryomancer"],
    text: () =>
      `Gegen eingefrorene Gegner machen Fähigkeiten mit Feuer ${pct(SKILL.melt.fire - 1)} mehr Schaden – das Eis schmilzt dabei –, alle anderen Treffer ${pct(SKILL.melt.other - 1)} mehr.` },
  { id: "afterglow", path: "arcane", tier: 4, col: 2, name: "Nachhall", icon: "🔁", maxRank: 3, requires: ["pyromancer", "cryomancer"],
    text: (r) => `Mit ${pct(SKILL.afterglow * r)} Chance kostet eine Fähigkeit kein Mana.` },
  { id: "echo", path: "arcane", tier: 5, col: 0, name: "Echo", icon: "🔮", maxRank: 1, fork: "arcane-master", requires: ["melt", "afterglow"],
    text: () => `Jede ${SKILL.echo.every}. Fähigkeit in einem Kampf kostet kein Mana und trifft ein zweites Mal mit ${pct(SKILL.echo.share)} Schaden.` },
  { id: "bloodMagic", path: "arcane", tier: 5, col: 2, name: "Blutmagie", icon: "🧛", maxRank: 1, fork: "arcane-master", requires: ["melt", "afterglow"],
    text: () =>
      `Reicht dein Mana nicht, zahlst du den Rest mit Lebenspunkten: ${SKILL.bloodMagic.hpPerMana} LP pro fehlendem Mana – nicht, wenn du danach unter ${pct(SKILL.bloodMagic.floor)} wärst. Dafür ${pct(SKILL.bloodMagic.mana)} weniger Mana.` },

  /* ───────────── Plage ───────────── */
  { id: "toughness", path: "plague", tier: 1, col: 0, name: "Zähigkeit", icon: "💪", maxRank: 2,
    text: (r) => `+${pct(SKILL.toughness * r)} Lebenspunkte.` },
  { id: "poisonedWeapons", path: "plague", tier: 1, col: 1, name: "Vergiftete Waffen", icon: "🦷", maxRank: 3,
    text: (r) =>
      `Deine normalen Angriffe vergiften mit ${pct(SKILL.poisonedWeapons.chance * r)} Chance: ${pct(SKILL.poisonedWeapons.percent)} deines Schadens pro Runde, ${SKILL.poisonedWeapons.rounds} Runden.` },
  { id: "venom", path: "plague", tier: 1, col: 2, name: "Giftmischer", icon: "🧪", maxRank: 3,
    text: (r) => `Gift, das du verursachst, macht ${pct(SKILL.venom * r)} mehr Schaden.` },
  { id: "herbalism", path: "plague", tier: 2, col: 0, name: "Kräuterkunde", icon: "🌱", maxRank: 2, requires: ["toughness"],
    text: (r) => `Heiltränke heilen ${pct(SKILL.herbalism * r)} mehr.` },
  { id: "antidote", path: "plague", tier: 2, col: 1, name: "Gegengift", icon: "🌿", maxRank: 2, requires: ["toughness", "poisonedWeapons", "venom"],
    text: (r) => `Gift, Feuer und Bluten schaden dir ${pct(SKILL.antidote * r)} weniger.` },
  { id: "creepingPoison", path: "plague", tier: 2, col: 2, name: "Schleichendes Gift", icon: "🐍", maxRank: 1, requires: ["venom", "poisonedWeapons"],
    text: () => `Dein Gift stapelt sich bis zu ${SKILL.poisonStacks}-mal, statt nur erneuert zu werden.` },
  { id: "leech", path: "plague", tier: 3, col: 0, name: "Blutsauger", icon: "🦇", maxRank: 1, fork: "plague", requires: ["herbalism", "antidote", "creepingPoison"],
    text: () => `Du heilst dich um ${pct(SKILL.leech)} des Schadens, den du verursachst.` },
  { id: "phantom", path: "plague", tier: 3, col: 2, name: "Schemen", icon: "👻", maxRank: 1, fork: "plague", requires: ["herbalism", "antidote", "creepingPoison"],
    text: () => `Mit ${pct(SKILL.phantom)} Chance weichst du einem gegnerischen Angriff aus.` },
  { id: "bandage", path: "plague", tier: 4, col: 0, name: "Notverband", icon: "🩹", maxRank: 3, requires: ["leech", "phantom"],
    text: (r) =>
      `Fällst du zum ersten Mal in einem Kampf unter ${pct(SKILL.bandage.threshold)} deiner Lebenspunkte, heilst du dich um ${pct(SKILL.bandage.heal * r)}.` },
  { id: "plague", path: "plague", tier: 4, col: 2, name: "Seuche", icon: "🦠", maxRank: 1, requires: ["leech", "phantom"],
    text: () => "Fällt ein vergifteter Gegner, springt sein Gift auf einen anderen über." },
  { id: "rot", path: "plague", tier: 5, col: 0, name: "Fäulnis", icon: "☠️", maxRank: 1, fork: "plague-master", requires: ["bandage", "plague"],
    text: () => `Dein Gift stapelt sich. Erreicht es ${SKILL.poisonStacks} Stapel, platzt es: Der Gegner erleidet sofort den ganzen restlichen Giftschaden.` },
  { id: "lifebond", path: "plague", tier: 5, col: 2, name: "Lebensband", icon: "🔗", maxRank: 1, fork: "plague-master", requires: ["bandage", "plague"],
    text: () =>
      `Heilung über deine vollen Lebenspunkte wird zu einem Schild (höchstens ${pct(WARD_MAX_SHARE)} deiner LP), der Schaden vor den LP abfängt – bis zum Ende des Kampfes. Im Koop wird auch deine Heilung bei Mitspielern zum Schild.` },
];

export function getSkillNode(id: SkillId): SkillNode {
  const node = SKILL_TREE.find((n) => n.id === id);
  if (!node) throw new Error(`Unbekannter Skill: ${id}`);
  return node;
}

/** Rang eines Knotens in einer Rangliste – 0, wenn nicht gelernt. */
export function rankIn(ranks: SkillRanks | undefined, id: SkillId): number {
  return ranks?.[id] ?? 0;
}

/** Rang eines Knotens beim Helden. */
export function skillRank(character: Character, id: SkillId): number {
  return rankIn(character.skills, id);
}

/** Punkte in einem Pfad (bzw. nur in den Stufen unter `below`). */
function pathPoints(ranks: SkillRanks, path: SkillPath, below: SkillTier | 6 = 6): number {
  return SKILL_TREE.filter((n) => n.path === path && n.tier < below).reduce((sum, n) => sum + rankIn(ranks, n.id), 0);
}

/**
 * Ränge, die gegen die Regeln des Baums verstossen, fallen weg – so lange, bis der Stand stabil ist:
 * unbekannte Knoten, zu hohe Ränge, nicht erreichte Stufen (gezählt werden nur die Punkte in den Stufen
 * darüber – so wie beim Lernen), fehlende Voraussetzungen, beide Knoten einer Gabelung, mehr als eine
 * Meisterschaft und – mit `level` – mehr Punkte als verdient (dann zuerst die tiefsten).
 * Client (Spielstand) und Koop-Server (Cloud-Spielstand) behandeln alte oder manipulierte Stände damit gleich.
 */
export function validateSkills(skills: Record<string, number | undefined> | undefined, level?: number): SkillRanks {
  const ranks: SkillRanks = {};
  for (const node of SKILL_TREE) {
    const rank = Math.min(node.maxRank, Math.floor(Number(skills?.[node.id] ?? 0)));
    if (rank > 0) ranks[node.id] = rank;
  }
  // Mehr Punkte als verdient: die tiefsten Ränge zuerst weg (Meisterschaft, dann Stufe 4 …)
  if (level !== undefined) {
    const budget = earnedSkillPoints(level);
    const deepestFirst = [...SKILL_TREE].sort((a, b) => b.tier - a.tier);
    let spent = Object.values(ranks).reduce((sum, r) => sum + (r ?? 0), 0);
    for (const node of deepestFirst) {
      while (spent > budget && rankIn(ranks, node.id) > 0) {
        ranks[node.id] = rankIn(ranks, node.id) - 1;
        if (ranks[node.id] === 0) delete ranks[node.id];
        spent--;
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    const seenForks = new Set<string>();
    let master = false;
    for (const node of SKILL_TREE) {
      if (rankIn(ranks, node.id) === 0) continue;
      const broken =
        pathPoints(ranks, node.path, node.tier) < TIER_POINTS[node.tier] ||
        (node.requires !== undefined && !node.requires.some((id) => rankIn(ranks, id) > 0)) ||
        (node.fork !== undefined && seenForks.has(node.fork)) ||
        (node.tier === 5 && master);
      if (broken) {
        delete ranks[node.id];
        changed = true;
        continue;
      }
      if (node.fork) seenForks.add(node.fork);
      if (node.tier === 5) master = true;
    }
  }
  return ranks;
}

/**
 * Nur gültige Ränge: unbekannte Knoten (z. B. die Waffen-Ränge des alten Skilltrees) fallen weg,
 * zu hohe werden gekappt, Regelverstösse verworfen (`validateSkills`) – die Punkte sind wieder frei.
 */
export function sanitizeSkills(skills: Record<string, number | undefined> | undefined, level?: number): SkillRanks {
  return validateSkills(skills, level);
}

/** Ein Skillpunkt alle 2 Level: Level 2 → 1, Level 60 → 30. */
export function earnedSkillPoints(level: number): number {
  return Math.floor(level / 2);
}

/** Skillpunkte, die ein Level-up von `before` auf `after` bringt. */
export function skillPointsGained(before: number, after: number): number {
  return earnedSkillPoints(after) - earnedSkillPoints(before);
}

/** Zusatz für den Level-up-Hinweis: „ und +1 Skillpunkt“ – leer, wenn das Level-up keinen bringt. */
export function skillPointsNote(before: number, after: number): string {
  const gained = skillPointsGained(before, after);
  return gained > 0 ? ` und +${gained} Skillpunkt${gained > 1 ? "e" : ""}` : "";
}

/** Vergebene Punkte – insgesamt oder in einem Pfad. */
export function spentSkillPoints(character: Character, path?: SkillPath): number {
  return SKILL_TREE.filter((n) => !path || n.path === path).reduce((sum, n) => sum + skillRank(character, n.id), 0);
}

/** Durch Level-ups verdiente minus bereits vergebene Skillpunkte. */
export function unspentSkillPoints(character: Character): number {
  return Math.max(0, earnedSkillPoints(getLevel(character.totalXp)) - spentSkillPoints(character));
}

/** Der andere Knoten einer Gabelung – oder null. */
export function forkRival(node: SkillNode): SkillNode | null {
  return SKILL_TREE.find((n) => n.fork !== undefined && n.fork === node.fork && n.id !== node.id) ?? null;
}

/** Warum dieser Knoten gerade nicht gelernt werden kann – oder null. */
export function skillBlocker(character: Character, id: SkillId): string | null {
  const node = SKILL_TREE.find((n) => n.id === id);
  if (!node) return "Unbekannter Skill.";
  if (skillRank(character, id) >= node.maxRank) return "Höchster Rang erreicht.";
  const needed = TIER_POINTS[node.tier];
  if (spentSkillPoints(character, node.path) < needed) {
    const path = SKILL_PATHS.find((p) => p.id === node.path)!;
    return `Braucht ${needed} Punkte im Pfad ${path.name}.`;
  }
  if (node.requires && !node.requires.some((r) => skillRank(character, r) > 0)) {
    return `Braucht zuerst ${node.requires.map((r) => getSkillNode(r).name).join(" oder ")}.`;
  }
  const rival = forkRival(node);
  if (rival && skillRank(character, rival.id) > 0) return `Du hast schon ${rival.name} gewählt.`;
  if (node.tier === 5) {
    const other = SKILL_TREE.find((n) => n.tier === 5 && n.id !== id && skillRank(character, n.id) > 0);
    if (other) return `Du hast schon die Meisterschaft ${other.name} – es gibt nur eine.`;
  }
  if (unspentSkillPoints(character) <= 0) return "Keine Skillpunkte – steige ein Level auf.";
  return null;
}

/** Steigert einen Knoten um einen Rang. */
export function learnSkill(character: Character, id: SkillId): Character {
  const blocker = skillBlocker(character, id);
  if (blocker) throw new Error(blocker);
  return { ...character, skills: { ...character.skills, [id]: skillRank(character, id) + 1 } };
}

/**
 * Gold für das Zurücksetzen aller Skillpunkte: 12.5 × Level × (1 + Level/10), Lv. 20 → 750 –
 * mal den Faktor des Trainingsplatzes (Stufe 2 halb so viel, Stufe 3 gratis).
 * Bewusst günstig, damit sich das Ausprobieren anderer Klassen und Builds lohnt.
 */
export function skillResetCost(level: number, training: BuildingTier = 1): number {
  return Math.round(12.5 * level * (1 + level / 10) * (TRAINING_RESET_FACTOR[training] ?? 1));
}

/** Warum die Skillpunkte gerade nicht zurückgesetzt werden können – oder null. */
export function skillResetBlocker(character: Character, training: BuildingTier): string | null {
  if (TRAINING_RESET_FACTOR[training] === null) return "Baue zuerst den Trainingsplatz im Dorf.";
  if (spentSkillPoints(character) === 0) return "Du hast noch keine Skillpunkte vergeben.";
  if (character.gold < skillResetCost(getLevel(character.totalXp), training)) return "Nicht genug Gold.";
  return null;
}

/** Setzt alle Ränge zurück – die Skillpunkte sind wieder frei. */
export function resetSkills(character: Character, training: BuildingTier): Character {
  const blocker = skillResetBlocker(character, training);
  if (blocker) throw new Error(blocker);
  return {
    ...character,
    gold: character.gold - skillResetCost(getLevel(character.totalXp), training),
    skills: {},
  };
}

/* ───────────── Wirkung im Kampf (solo und Koop) ───────────── */

/**
 * Was die Knoten an den Grundwerten ändern – Krit, Rüstung (Faktor), LP (Faktor), Mana (dazu) und
 * Mana-Faktor (Blutmagie: weniger Mana-Maximum).
 */
export function skillStatBonus(ranks: SkillRanks | undefined): { crit: number; armor: number; hp: number; mana: number; manaFactor: number } {
  return {
    crit: SKILL.keenEdge * rankIn(ranks, "keenEdge"),
    armor: SKILL.ironSkin * rankIn(ranks, "ironSkin"),
    hp: SKILL.toughness * rankIn(ranks, "toughness"),
    mana: SKILL.deepWell * rankIn(ranks, "deepWell"),
    manaFactor: rankIn(ranks, "bloodMagic") > 0 ? 1 - SKILL.bloodMagic.mana : 1,
  };
}

export type SkillDotKind = "poison" | "burn" | "bleed";

/** Faktor auf Gift, Feuer und Bluten, die der Held verursacht. */
export function ownDotFactor(ranks: SkillRanks | undefined, kind: SkillDotKind): number {
  if (kind === "bleed") return 1 + SKILL.serratedEdge * rankIn(ranks, "serratedEdge");
  if (kind === "burn") return 1 + SKILL.kindling * rankIn(ranks, "kindling");
  return 1 + SKILL.venom * rankIn(ranks, "venom");
}

/** Runden von Gift, Feuer und Bluten, die der Held verursacht – Pyromant: Feuer länger. */
export function ownDotRounds(ranks: SkillRanks | undefined, kind: SkillDotKind, rounds: number): number {
  return kind === "burn" && rankIn(ranks, "pyromancer") > 0 ? rounds + SKILL.pyromancer.rounds : rounds;
}

/** Wie oft sich das Gift des Helden stapelt – 1: nur erneuern. */
export function poisonStackLimit(ranks: SkillRanks | undefined): number {
  return rankIn(ranks, "creepingPoison") > 0 || rankIn(ranks, "rot") > 0 ? SKILL.poisonStacks : 1;
}

/** Was ein Gegner gerade hat – für Krit- und Schadensboni. */
export interface FoeState {
  hp: number;
  maxHp: number;
  bleeding: boolean;
  burning: boolean;
  /** Vom Helden betäubt oder eingefroren – in der Runde danach (Erschütterung) */
  dazed: boolean;
  /** Eingefroren – in der Runde danach (Kryomant, Schmelzen) */
  chilled: boolean;
}

/** Zusätzliche Krit-Chance gegen diesen Gegner (Blutgeruch). */
export function skillCritBonus(ranks: SkillRanks | undefined, foe: FoeState): number {
  return foe.bleeding ? SKILL.bloodScent * rankIn(ranks, "bloodScent") : 0;
}

/** Zählt diese Aktion als Mehrfachtreffer-Fähigkeit (Wirbelnde Klingen, Klingentanz, Tausend Schnitte)? */
export const isMultiHit = (hits: number): boolean => hits >= SKILL.multiHit;

/**
 * Faktor auf den Schaden eines Treffers des Helden: Hinrichter, Erschütterung, Pyromant, Kryomant,
 * Schmelzen und Wirbelnde Klingen (`multiHit`: Fähigkeit mit mindestens 2 Treffern).
 */
export function skillDamageFactor(ranks: SkillRanks | undefined, foe: FoeState, fireAbility: boolean, multiHit = false): number {
  let factor = 1;
  if (foe.hp < foe.maxHp * SKILL.executioner.threshold) factor *= 1 + SKILL.executioner.bonus * rankIn(ranks, "executioner");
  if (foe.dazed) factor *= 1 + SKILL.concussion * rankIn(ranks, "concussion");
  if (foe.burning && rankIn(ranks, "pyromancer") > 0) factor *= 1 + SKILL.pyromancer.taken;
  if (foe.chilled && rankIn(ranks, "cryomancer") > 0) factor *= 1 + SKILL.cryomancer.taken;
  if (foe.chilled && rankIn(ranks, "melt") > 0) factor *= fireAbility ? SKILL.melt.fire : SKILL.melt.other;
  if (multiHit) factor *= 1 + SKILL.whirlingBlades * rankIn(ranks, "whirlingBlades");
  return factor;
}

/** Schmilzt diese Fähigkeit das Eis (Schmelzen)? Nur Feuer taut auf. */
export function melts(ranks: SkillRanks | undefined, chilled: boolean, fireAbility: boolean): boolean {
  return chilled && fireAbility && rankIn(ranks, "melt") > 0;
}

/** Klingentanz: Faktor für den nächsten normalen Angriff nach einer Mehrfachtreffer-Fähigkeit – 0 ohne den Knoten. */
export function bladeDanceFactor(ranks: SkillRanks | undefined): number {
  const rank = rankIn(ranks, "bladeDance");
  return rank > 0 ? 1 + SKILL.bladeDance * rank : 0;
}

/** Mana für einen kritischen Treffer (Adrenalin). */
export function critMana(ranks: SkillRanks | undefined): number {
  return SKILL.adrenaline * rankIn(ranks, "adrenaline");
}

/** Mana für das Abwehren – mit Gefasst mehr. */
export function defendMana(ranks: SkillRanks | undefined, base: number): number {
  return base + SKILL.composure * rankIn(ranks, "composure");
}

/** So viel Schaden kommt beim Abwehren durch – mit Fels weniger. */
export function defendTaken(ranks: SkillRanks | undefined, base: number): number {
  return rankIn(ranks, "rock") > 0 ? SKILL.rock : base;
}

/** Stachelwehr: Anteil des Schadens, den ein Angreifer beim Abwehren zurückbekommt. */
export function defendThorns(ranks: SkillRanks | undefined): number {
  return rankIn(ranks, "spikes") > 0 ? SKILL.spikes : 0;
}

/** Wächterschwur: Abwehren heilt diesen Anteil der max. LP – 0 ohne den Knoten. */
export function guardOathHeal(ranks: SkillRanks | undefined): number {
  return rankIn(ranks, "guardOath") > 0 ? SKILL.guardOath.heal : 0;
}

/** Gegenschlag: Faktor auf die Aktion nach dem Abwehren – 1 ohne den Knoten. */
export function riposteFactor(ranks: SkillRanks | undefined): number {
  return 1 + SKILL.riposte * rankIn(ranks, "riposte");
}

/** Chance einer Fähigkeit, die nur manchmal betäubt oder einfriert – mit Wuchtschlag und Kryomant höher. */
export function skillStunChance(ranks: SkillRanks | undefined, chance: number, freeze: boolean): number {
  const bonus = SKILL.heavyBlow * rankIn(ranks, "heavyBlow") + (freeze && rankIn(ranks, "cryomancer") > 0 ? SKILL.cryomancer.chance : 0);
  return Math.min(1, chance + bonus);
}

/**
 * Wird der Gegner nach einer gelungenen Betäubung als eingefroren markiert (Kryomant +25 %, Schmelzen)?
 * Einfrieren mit Kryomant oder Schmelzen – und mit Kryomant zählt jede Betäubung als Einfrieren.
 */
export function chillsOnStun(ranks: SkillRanks | undefined, frozen: boolean): boolean {
  if (rankIn(ranks, "cryomancer") > 0) return true;
  return frozen && rankIn(ranks, "melt") > 0;
}

/** Unterbrecher: Mana, wenn der Held betäubt, ein Ritual unterbricht oder den Boss ins Taumeln bringt. */
export function interruptMana(ranks: SkillRanks | undefined): number {
  return rankIn(ranks, "interrupter") > 0 ? SKILL.interrupter : 0;
}

/** Zorn des Bollwerks: Faktor auf den Schaden bei so vielen Stapeln. */
export function wrathFactor(stacks: number | undefined): number {
  return 1 + SKILL.wrath.bonus * Math.min(SKILL.wrath.max, stacks ?? 0);
}

/**
 * Manaregeneration pro Runde – mit Manafluss mehr, mit Konzentration noch mehr in einer Runde ohne
 * Fähigkeit (`idle`: normaler Angriff oder Abwehren).
 */
export function manaRegen(ranks: SkillRanks | undefined, base: number, idle = false): number {
  return base + SKILL.manaFlow * rankIn(ranks, "manaFlow") + (idle ? SKILL.concentration * rankIn(ranks, "concentration") : 0);
}

/** Faktor auf die Manakosten: Eröffnung in den ersten Runden, Echo bei jeder dritten Fähigkeit (dann 0). */
export function skillCostFactor(ranks: SkillRanks | undefined, round: number, casts: number | undefined): number {
  if (echoDue(ranks, casts)) return 0;
  return round >= 1 && round <= SKILL.opening.rounds ? Math.max(0, 1 - SKILL.opening.share * rankIn(ranks, "opening")) : 1;
}

/** Wehrt diese Fähigkeit ab oder blockt (Parade, Vergeltung, Bollwerk, Schildwall …)? – für Deckung. */
export function guardsOrBlocks(ability: { guard?: unknown; bulwark?: boolean; damageTaken?: { percent: number } }): boolean {
  return !!ability.guard || !!ability.bulwark || (ability.damageTaken?.percent ?? 0) < 0;
}

/**
 * Deckung: Manakosten einer Fähigkeit, die abwehrt oder blockt – `cost` nach Klasse (halbes Bollwerk des
 * Paladins). Nie unter SKILL.cover.floor, sonst wäre das halbe Bollwerk gratis; was schon billiger ist, bleibt.
 */
export function coverCost(ranks: SkillRanks | undefined, cost: number, defensive: boolean): number {
  const rank = rankIn(ranks, "cover");
  if (!defensive || rank === 0) return cost;
  return Math.max(Math.min(cost, SKILL.cover.floor), cost - SKILL.cover.mana * rank);
}

/** Ist die nächste Fähigkeit ein Echo? `casts`: bisher eingesetzte Fähigkeiten im Kampf. */
export function echoDue(ranks: SkillRanks | undefined, casts: number | undefined): boolean {
  return rankIn(ranks, "echo") > 0 && ((casts ?? 0) + 1) % SKILL.echo.every === 0;
}

/** Nachhall: Chance, dass eine Fähigkeit kein Mana kostet. */
export function freeCastChance(ranks: SkillRanks | undefined): number {
  return SKILL.afterglow * rankIn(ranks, "afterglow");
}

/**
 * Blutmagie: Wie viele LP kostet eine Fähigkeit, wenn das Mana nicht reicht? 0: Das Mana reicht.
 * null: Es geht nicht – ohne den Knoten oder weil der Held danach unter SKILL.bloodMagic.floor seiner LP wäre.
 */
export function bloodPrice(ranks: SkillRanks | undefined, mana: number, cost: number, hp: number, maxHp: number): number | null {
  if (mana >= cost) return 0;
  if (rankIn(ranks, "bloodMagic") === 0) return null;
  const price = (cost - Math.max(0, mana)) * SKILL.bloodMagic.hpPerMana;
  return hp - price >= maxHp * SKILL.bloodMagic.floor ? price : null;
}

/** Faktor auf Heiltränke (Kräuterkunde). */
export function potionSkillFactor(ranks: SkillRanks | undefined): number {
  return 1 + SKILL.herbalism * rankIn(ranks, "herbalism");
}

/** Faktor auf Gift, Feuer und Bluten am Helden (Gegengift). */
export function dotTakenFactor(ranks: SkillRanks | undefined): number {
  return Math.max(0, 1 - SKILL.antidote * rankIn(ranks, "antidote"));
}

/** Lebensraub durch Blutsauger. */
export function skillLifesteal(ranks: SkillRanks | undefined): number {
  return rankIn(ranks, "leech") > 0 ? SKILL.leech : 0;
}

/** Schemen: Chance, einem Angriff auszuweichen. */
export function dodgeChance(ranks: SkillRanks | undefined): number {
  return rankIn(ranks, "phantom") > 0 ? SKILL.phantom : 0;
}

/** Vergiftete Waffen: Chance eines normalen Angriffs, zu vergiften. */
export function poisonedWeaponsChance(ranks: SkillRanks | undefined): number {
  return SKILL.poisonedWeapons.chance * rankIn(ranks, "poisonedWeapons");
}

/** Lebensband: Wird Heilung über das Maximum zum Schild? */
export function hasLifebond(ranks: SkillRanks | undefined): boolean {
  return rankIn(ranks, "lifebond") > 0;
}

/** Notverband: Heilung (Anteil der max. LP), wenn er jetzt greift – sonst 0. */
export function bandageHeal(ranks: SkillRanks | undefined, hp: number, maxHp: number, used: boolean | undefined): number {
  const rank = rankIn(ranks, "bandage");
  if (rank === 0 || used || hp <= 0 || hp >= maxHp * SKILL.bandage.threshold) return 0;
  return SKILL.bandage.heal * rank;
}

/** Gift oder Bluten mit Stapeln (Schleichendes Gift, Fäulnis, Tausend Schnitte). */
export interface StackedDot {
  damage: number;
  roundsLeft: number;
  /** So viele Stapel (fehlt: 1) */
  stacks?: number;
}

/**
 * Ein Stapel mehr auf eine liegende Wirkung, bis `limit`: Jeder Stapel bringt den Schaden der neuen dazu
 * (pro Stapel zählt der stärkere), die Dauer frischt auf. Ohne liegende Wirkung oder mit `limit` 1 beginnt sie neu.
 */
export function stackDot(limit: number, current: StackedDot | undefined, damage: number, rounds: number): StackedDot {
  if (!current || limit <= 1) return { damage, roundsLeft: rounds };
  const stacks = Math.min(limit, (current.stacks ?? 1) + 1);
  const perStack = Math.max(damage, current.damage / (current.stacks ?? 1));
  return { damage: Math.round(perStack * stacks), roundsLeft: Math.max(rounds, current.roundsLeft), stacks };
}

/** Gift auf ein Ziel legen – mit Schleichendem Gift bzw. Fäulnis stapelt es sich. */
export function stackPoison(ranks: SkillRanks | undefined, current: StackedDot | undefined, damage: number, rounds: number): StackedDot {
  return stackDot(poisonStackLimit(ranks), current, damage, rounds);
}

/** Fäulnis: Platzt das Gift jetzt? Dann der ganze restliche Schaden. */
export function rotBurst(ranks: SkillRanks | undefined, poison: StackedDot | undefined): number {
  if (!poison || rankIn(ranks, "rot") === 0 || (poison.stacks ?? 1) < SKILL.poisonStacks) return 0;
  return poison.damage * poison.roundsLeft;
}

/** Blutsturz: Schaden, wenn ein Bluten ausläuft. */
export function bloodburstDamage(ranks: SkillRanks | undefined, bleedDamage: number): number {
  return rankIn(ranks, "bloodburst") > 0 ? bleedDamage * SKILL.bloodburst : 0;
}
