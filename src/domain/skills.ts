// Skilltree: vier Pfade, die verändern, wie die Kampf-Mechaniken wirken – Krit und
// Bluten (Klinge), Abwehren und Betäubung (Wehr), Mana und Elemente (Arkan), Gift
// und Überleben (Plage). Die Pfade hängen an keiner Waffe; die Fähigkeiten liegen
// weiterhin auf den Waffen selbst (abilities.ts).
//
// Regeln (docs/skilltree.md):
// - Alle 2 Level gibt es einen Skillpunkt (Level 60: 30 Punkte).
// - Eine Stufe öffnet sich erst mit genug Punkten im selben Pfad (TIER_POINTS).
// - Viele Knoten brauchen einen Knoten darüber (`requires`, einer davon genügt).
// - Gabelungen (`fork`): pro Pfad nur einer der beiden Knoten.
// - Meisterschaft: ganz unten, nur eine im ganzen Baum.
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
  | "serratedEdge"
  | "adrenaline"
  | "bloodScent"
  | "reaper"
  | "piercing"
  | "openWound"
  | "executioner"
  | "bloodburst"
  // Wehr
  | "ironSkin"
  | "composure"
  | "concussion"
  | "riposte"
  | "rock"
  | "spikes"
  | "heavyBlow"
  | "interrupter"
  | "wrath"
  // Arkan
  | "deepWell"
  | "kindling"
  | "manaFlow"
  | "opening"
  | "pyromancer"
  | "cryomancer"
  | "melt"
  | "afterglow"
  | "echo"
  // Plage
  | "toughness"
  | "venom"
  | "herbalism"
  | "antidote"
  | "creepingPoison"
  | "leech"
  | "phantom"
  | "bandage"
  | "plague"
  | "rot";

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
  /** Gabelung: nur einer der Knoten mit derselben Gabel */
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

/** Punkte im selben Pfad, ab denen eine Stufe offen ist – Index = Stufe. */
export const TIER_POINTS: Readonly<Record<SkillTier, number>> = { 1: 0, 2: 3, 3: 6, 4: 9, 5: 15 };

/** Alle Werte der Knoten an einer Stelle – pro Rang, wo der Knoten mehrere hat. */
export const SKILL = {
  keenEdge: 0.03,
  serratedEdge: 0.2,
  adrenaline: 2,
  bloodScent: 0.05,
  /** Anteil des Heldenschadens pro Runde */
  reaper: { percent: 0.15, rounds: 2 },
  executioner: { threshold: 0.3, bonus: 0.06 },
  /** So viele Runden Blutschaden auf einmal */
  bloodburst: 3,
  ironSkin: 0.03,
  composure: 5,
  concussion: 0.08,
  riposte: 0.15,
  /** Abwehren mit Fels: so viel Schaden kommt noch durch */
  rock: 0.25,
  spikes: 0.5,
  heavyBlow: 0.06,
  interrupter: 15,
  wrath: { bonus: 0.08, max: 5 },
  deepWell: 5,
  kindling: 0.15,
  manaFlow: 1,
  opening: 0.25,
  pyromancer: { rounds: 1, taken: 0.15 },
  cryomancer: { chance: 0.2, taken: 0.25 },
  melt: 1.6,
  afterglow: 0.05,
  echo: { every: 3, share: 0.3 },
  toughness: 0.02,
  venom: 0.2,
  herbalism: 0.05,
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
  { id: "serratedEdge", path: "blade", tier: 1, col: 2, name: "Gezahnte Klingen", icon: "🩸", maxRank: 3,
    text: (r) => `Bluten, das du verursachst, macht ${pct(SKILL.serratedEdge * r)} mehr Schaden.` },
  { id: "adrenaline", path: "blade", tier: 2, col: 0, name: "Adrenalin", icon: "⚡", maxRank: 3, requires: ["keenEdge"],
    text: (r) => `Jeder kritische Treffer gibt dir ${SKILL.adrenaline * r} Mana.` },
  { id: "bloodScent", path: "blade", tier: 2, col: 2, name: "Blutgeruch", icon: "🐺", maxRank: 3, requires: ["serratedEdge"],
    text: (r) => `+${pct(SKILL.bloodScent * r)} Krit-Chance gegen blutende Gegner.` },
  { id: "reaper", path: "blade", tier: 3, col: 0, name: "Schnitter", icon: "🌾", maxRank: 1, fork: "blade", requires: ["adrenaline", "bloodScent"],
    text: () => `Deine kritischen Treffer lassen den Gegner ${SKILL.reaper.rounds} Runden bluten – mit jeder Waffe.` },
  { id: "piercing", path: "blade", tier: 3, col: 2, name: "Durchschlag", icon: "🎯", maxRank: 1, fork: "blade", requires: ["adrenaline", "bloodScent"],
    text: () => "Deine kritischen Treffer ignorieren die Rüstung." },
  { id: "openWound", path: "blade", tier: 4, col: 0, name: "Offene Wunde", icon: "🩹", maxRank: 1, requires: ["reaper", "piercing"],
    text: () => "Ein kritischer Treffer auf einen blutenden Gegner lässt ihn 1 Runde länger bluten." },
  { id: "executioner", path: "blade", tier: 4, col: 2, name: "Hinrichter", icon: "🪓", maxRank: 3, requires: ["reaper", "piercing"],
    text: (r) => `+${pct(SKILL.executioner.bonus * r)} Schaden gegen Gegner unter ${pct(SKILL.executioner.threshold)} ihrer Lebenspunkte.` },
  { id: "bloodburst", path: "blade", tier: 5, col: 1, name: "Blutsturz", icon: "💥", maxRank: 1, requires: ["openWound", "executioner"],
    text: () => `Läuft Bluten aus, platzt die Wunde: Der Gegner erleidet sofort den Blutschaden von ${SKILL.bloodburst} Runden.` },

  /* ───────────── Wehr ───────────── */
  { id: "ironSkin", path: "guard", tier: 1, col: 0, name: "Eiserne Haut", icon: "🛡️", maxRank: 3,
    text: (r) => `+${pct(SKILL.ironSkin * r)} Rüstung.` },
  { id: "composure", path: "guard", tier: 1, col: 2, name: "Gefasst", icon: "🧘", maxRank: 2,
    text: (r) => `Abwehren gibt ${SKILL.composure * r} Mana mehr.` },
  { id: "concussion", path: "guard", tier: 2, col: 0, name: "Erschütterung", icon: "💫", maxRank: 3, requires: ["ironSkin"],
    text: (r) => `Wen du betäubst oder einfrierst, der erleidet in der Runde danach ${pct(SKILL.concussion * r)} mehr Schaden von dir.` },
  { id: "riposte", path: "guard", tier: 2, col: 2, name: "Gegenschlag", icon: "⚔️", maxRank: 3, requires: ["composure"],
    text: (r) => `Nach dem Abwehren macht deine nächste Aktion ${pct(SKILL.riposte * r)} mehr Schaden.` },
  { id: "rock", path: "guard", tier: 3, col: 0, name: "Fels", icon: "🪨", maxRank: 1, fork: "guard", requires: ["concussion", "riposte"],
    text: () => `Beim Abwehren erleidest du nur noch ${pct(SKILL.rock)} statt 50 % des Schadens.` },
  { id: "spikes", path: "guard", tier: 3, col: 2, name: "Stachelwehr", icon: "🌵", maxRank: 1, fork: "guard", requires: ["concussion", "riposte"],
    text: () => `Wer dich trifft, während du abwehrst, erleidet ${pct(SKILL.spikes)} seines Schadens selbst.` },
  { id: "heavyBlow", path: "guard", tier: 4, col: 0, name: "Wuchtschlag", icon: "🔨", maxRank: 3, requires: ["rock", "spikes"],
    text: (r) => `Fähigkeiten, die nur mit einer Chance betäuben oder einfrieren, gelingen ${pct(SKILL.heavyBlow * r)} öfter.` },
  { id: "interrupter", path: "guard", tier: 4, col: 2, name: "Unterbrecher", icon: "✋", maxRank: 1, requires: ["rock", "spikes"],
    text: () => `Betäubst du einen Gegner, unterbrichst ein Ritual oder bringst einen Boss ins Taumeln, bekommst du ${SKILL.interrupter} Mana.` },
  { id: "wrath", path: "guard", tier: 5, col: 1, name: "Zorn des Bollwerks", icon: "🔥", maxRank: 1, requires: ["heavyBlow", "interrupter"],
    text: () =>
      `Jede Runde, in der du einen Angriff abwehrst, blockst oder parierst, gibt dir einen Zorn-Stapel: +${pct(SKILL.wrath.bonus)} Schaden, höchstens ${SKILL.wrath.max}.` },

  /* ───────────── Arkan ───────────── */
  { id: "deepWell", path: "arcane", tier: 1, col: 0, name: "Tiefer Brunnen", icon: "💧", maxRank: 3,
    text: (r) => `+${SKILL.deepWell * r} Mana.` },
  { id: "kindling", path: "arcane", tier: 1, col: 2, name: "Funkenflug", icon: "🔥", maxRank: 3,
    text: (r) => `Feuer, das du legst, macht ${pct(SKILL.kindling * r)} mehr Schaden.` },
  { id: "manaFlow", path: "arcane", tier: 2, col: 0, name: "Manafluss", icon: "🌊", maxRank: 3, requires: ["deepWell"],
    text: (r) => `+${SKILL.manaFlow * r} Mana pro Runde.` },
  { id: "opening", path: "arcane", tier: 2, col: 2, name: "Eröffnung", icon: "✨", maxRank: 2, requires: ["kindling"],
    text: (r) => `In der ersten Runde eines Kampfes kosten Fähigkeiten ${pct(SKILL.opening * r)} weniger Mana.` },
  { id: "pyromancer", path: "arcane", tier: 3, col: 0, name: "Pyromant", icon: "🌋", maxRank: 1, fork: "arcane", requires: ["manaFlow", "opening"],
    text: () => `Dein Feuer brennt ${SKILL.pyromancer.rounds} Runde länger, brennende Gegner erleiden ${pct(SKILL.pyromancer.taken)} mehr Schaden von dir.` },
  { id: "cryomancer", path: "arcane", tier: 3, col: 2, name: "Kryomant", icon: "❄️", maxRank: 1, fork: "arcane", requires: ["manaFlow", "opening"],
    text: () => `Einfrieren gelingt ${pct(SKILL.cryomancer.chance)} öfter, eingefrorene Gegner erleiden in der Runde danach ${pct(SKILL.cryomancer.taken)} mehr Schaden von dir.` },
  { id: "melt", path: "arcane", tier: 4, col: 0, name: "Schmelzen", icon: "💦", maxRank: 1, requires: ["pyromancer", "cryomancer"],
    text: () => `Fähigkeiten mit Feuer machen gegen eingefrorene Gegner ${pct(SKILL.melt - 1)} mehr Schaden – das Eis schmilzt dabei.` },
  { id: "afterglow", path: "arcane", tier: 4, col: 2, name: "Nachhall", icon: "🔁", maxRank: 3, requires: ["pyromancer", "cryomancer"],
    text: (r) => `Mit ${pct(SKILL.afterglow * r)} Chance löst eine Fähigkeit keine Abklingzeit aus.` },
  { id: "echo", path: "arcane", tier: 5, col: 1, name: "Echo", icon: "🔮", maxRank: 1, requires: ["melt", "afterglow"],
    text: () => `Jede ${SKILL.echo.every}. Fähigkeit in einem Kampf kostet kein Mana und trifft ein zweites Mal mit ${pct(SKILL.echo.share)} Schaden.` },

  /* ───────────── Plage ───────────── */
  { id: "toughness", path: "plague", tier: 1, col: 0, name: "Zähigkeit", icon: "💪", maxRank: 3,
    text: (r) => `+${pct(SKILL.toughness * r)} Lebenspunkte.` },
  { id: "venom", path: "plague", tier: 1, col: 2, name: "Giftmischer", icon: "🧪", maxRank: 3,
    text: (r) => `Gift, das du verursachst, macht ${pct(SKILL.venom * r)} mehr Schaden.` },
  { id: "herbalism", path: "plague", tier: 2, col: 0, name: "Kräuterkunde", icon: "🌱", maxRank: 2, requires: ["toughness"],
    text: (r) => `Heiltränke heilen ${pct(SKILL.herbalism * r)} mehr.` },
  { id: "antidote", path: "plague", tier: 2, col: 1, name: "Gegengift", icon: "🌿", maxRank: 2, requires: ["toughness", "venom"],
    text: (r) => `Gift, Feuer und Bluten schaden dir ${pct(SKILL.antidote * r)} weniger.` },
  { id: "creepingPoison", path: "plague", tier: 2, col: 2, name: "Schleichendes Gift", icon: "🐍", maxRank: 1, requires: ["venom"],
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
  { id: "rot", path: "plague", tier: 5, col: 1, name: "Fäulnis", icon: "☠️", maxRank: 1, requires: ["bandage", "plague"],
    text: () => `Dein Gift stapelt sich. Erreicht es ${SKILL.poisonStacks} Stapel, platzt es: Der Gegner erleidet sofort den ganzen restlichen Giftschaden.` },
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

/**
 * Nur gültige Ränge: unbekannte Knoten (z. B. die Waffen-Ränge des alten
 * Skilltrees) fallen weg, zu hohe werden gekappt – die Punkte sind wieder frei.
 */
export function sanitizeSkills(skills: Record<string, number | undefined> | undefined): SkillRanks {
  const clean: SkillRanks = {};
  for (const node of SKILL_TREE) {
    const rank = Math.min(node.maxRank, Math.floor(skills?.[node.id] ?? 0));
    if (rank > 0) clean[node.id] = rank;
  }
  return clean;
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

/** Was die Knoten an den Grundwerten ändern – Krit, Rüstung (Faktor), LP (Faktor), Mana. */
export function skillStatBonus(ranks: SkillRanks | undefined): { crit: number; armor: number; hp: number; mana: number } {
  return {
    crit: SKILL.keenEdge * rankIn(ranks, "keenEdge"),
    armor: SKILL.ironSkin * rankIn(ranks, "ironSkin"),
    hp: SKILL.toughness * rankIn(ranks, "toughness"),
    mana: SKILL.deepWell * rankIn(ranks, "deepWell"),
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

/** Faktor auf den Schaden eines Treffers des Helden: Hinrichter, Erschütterung, Pyromant, Kryomant, Schmelzen. */
export function skillDamageFactor(ranks: SkillRanks | undefined, foe: FoeState, fireAbility: boolean): number {
  let factor = 1;
  if (foe.hp < foe.maxHp * SKILL.executioner.threshold) factor *= 1 + SKILL.executioner.bonus * rankIn(ranks, "executioner");
  if (foe.dazed) factor *= 1 + SKILL.concussion * rankIn(ranks, "concussion");
  if (foe.burning && rankIn(ranks, "pyromancer") > 0) factor *= 1 + SKILL.pyromancer.taken;
  if (foe.chilled && rankIn(ranks, "cryomancer") > 0) factor *= 1 + SKILL.cryomancer.taken;
  if (foe.chilled && fireAbility && rankIn(ranks, "melt") > 0) factor *= SKILL.melt;
  return factor;
}

/** Schmilzt diese Fähigkeit das Eis (Schmelzen)? */
export function melts(ranks: SkillRanks | undefined, chilled: boolean, fireAbility: boolean): boolean {
  return chilled && fireAbility && rankIn(ranks, "melt") > 0;
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

/** Gegenschlag: Faktor auf die Aktion nach dem Abwehren – 1 ohne den Knoten. */
export function riposteFactor(ranks: SkillRanks | undefined): number {
  return 1 + SKILL.riposte * rankIn(ranks, "riposte");
}

/** Chance einer Fähigkeit, die nur manchmal betäubt oder einfriert – mit Wuchtschlag und Kryomant höher. */
export function skillStunChance(ranks: SkillRanks | undefined, chance: number, freeze: boolean): number {
  const bonus = SKILL.heavyBlow * rankIn(ranks, "heavyBlow") + (freeze && rankIn(ranks, "cryomancer") > 0 ? SKILL.cryomancer.chance : 0);
  return Math.min(1, chance + bonus);
}

/** Unterbrecher: Mana, wenn der Held betäubt, ein Ritual unterbricht oder den Boss ins Taumeln bringt. */
export function interruptMana(ranks: SkillRanks | undefined): number {
  return rankIn(ranks, "interrupter") > 0 ? SKILL.interrupter : 0;
}

/** Zorn des Bollwerks: Faktor auf den Schaden bei so vielen Stapeln. */
export function wrathFactor(stacks: number | undefined): number {
  return 1 + SKILL.wrath.bonus * Math.min(SKILL.wrath.max, stacks ?? 0);
}

/** Manaregeneration pro Runde – mit Manafluss mehr. */
export function manaRegen(ranks: SkillRanks | undefined, base: number): number {
  return base + SKILL.manaFlow * rankIn(ranks, "manaFlow");
}

/** Faktor auf die Manakosten: Eröffnung in Runde 1, Echo bei jeder dritten Fähigkeit (dann 0). */
export function skillCostFactor(ranks: SkillRanks | undefined, round: number, casts: number | undefined): number {
  if (echoDue(ranks, casts)) return 0;
  return round === 1 ? Math.max(0, 1 - SKILL.opening * rankIn(ranks, "opening")) : 1;
}

/** Ist die nächste Fähigkeit ein Echo? `casts`: bisher eingesetzte Fähigkeiten im Kampf. */
export function echoDue(ranks: SkillRanks | undefined, casts: number | undefined): boolean {
  return rankIn(ranks, "echo") > 0 && ((casts ?? 0) + 1) % SKILL.echo.every === 0;
}

/** Nachhall: Chance, dass eine Fähigkeit keine Abklingzeit auslöst. */
export function cooldownSkipChance(ranks: SkillRanks | undefined): number {
  return SKILL.afterglow * rankIn(ranks, "afterglow");
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

/** Notverband: Heilung (Anteil der max. LP), wenn er jetzt greift – sonst 0. */
export function bandageHeal(ranks: SkillRanks | undefined, hp: number, maxHp: number, used: boolean | undefined): number {
  const rank = rankIn(ranks, "bandage");
  if (rank === 0 || used || hp <= 0 || hp >= maxHp * SKILL.bandage.threshold) return 0;
  return SKILL.bandage.heal * rank;
}

/** Gift auf ein Ziel legen – mit Schleichendem Gift bzw. Fäulnis stapelt es sich. */
export function stackPoison(
  ranks: SkillRanks | undefined,
  current: { damage: number; roundsLeft: number; stacks?: number } | undefined,
  damage: number,
  rounds: number,
): { damage: number; roundsLeft: number; stacks?: number } {
  const limit = poisonStackLimit(ranks);
  if (!current || limit <= 1) return { damage, roundsLeft: rounds };
  const stacks = Math.min(limit, (current.stacks ?? 1) + 1);
  // Jeder Stapel bringt den Schaden der neuen Vergiftung dazu – bis zum Limit
  const perStack = Math.max(damage, current.damage / (current.stacks ?? 1));
  return { damage: Math.round(perStack * stacks), roundsLeft: Math.max(rounds, current.roundsLeft), stacks };
}

/** Fäulnis: Platzt das Gift jetzt? Dann der ganze restliche Schaden. */
export function rotBurst(ranks: SkillRanks | undefined, poison: { damage: number; roundsLeft: number; stacks?: number } | undefined): number {
  if (!poison || rankIn(ranks, "rot") === 0 || (poison.stacks ?? 1) < SKILL.poisonStacks) return 0;
  return poison.damage * poison.roundsLeft;
}

/** Blutsturz: Schaden, wenn ein Bluten ausläuft. */
export function bloodburstDamage(ranks: SkillRanks | undefined, bleedDamage: number): number {
  return rankIn(ranks, "bloodburst") > 0 ? bleedDamage * SKILL.bloodburst : 0;
}
